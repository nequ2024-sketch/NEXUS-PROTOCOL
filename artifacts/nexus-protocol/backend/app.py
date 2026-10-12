# خادم Flask: واجهات API وWebSocket للمشروع مع تعطيل التداول افتراضياً.
from __future__ import annotations

import logging
import json
import os
import re
import secrets
import threading
import time
from typing import Any

import requests
from flask import Flask, g, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO
from web3 import Web3

from . import database
from .auth import issue_nonce, require_auth, verify_signature
from .config import (
    API_PREFIX,
    BSCSCAN_KEY,
    CORS_ORIGINS,
    AUTO_TRADING_READY,
    TESTNET_TRADING_READY,
)
from .notifier import send_telegram
from .onchain import read_signals
from . import trading
from .ledger import build_wallet_ledger, performance_summary
from .subscriptions import (
    FEATURES_BY_PLAN,
    keeper_configured,
    read_subscription_state,
    require_plan,
    start_subscription_keeper,
)

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("nexus.api")

app = Flask(__name__)
CORS(app, origins=CORS_ORIGINS)
socket_path = f"{os.getenv('BASE_PATH', '').strip('/')}/socket.io".lstrip("/")
socketio = SocketIO(app, cors_allowed_origins=CORS_ORIGINS, path=socket_path)
database.initialize()

TX_HASH_PATTERN = re.compile(r"^0x[a-fA-F0-9]{64}$")
RATE_LIMITS: dict[tuple[str, str], tuple[int, int]] = {}
RATE_LIMIT_LOCK = threading.Lock()
RATE_LIMITS_BY_ENDPOINT = {
    "auth_nonce": 10,
    "auth_verify": 10,
    "verify_transaction": 8,
    "verify_subscription_transaction": 8,
    "trade_execute": 10,
}
CONTRACT_ENV = {
    "presale": "PRESALE_ADDRESS",
    "subscription": "SUBSCRIPTION_MANAGER_ADDRESS",
    "signal": "SIGNAL_REGISTRY_ADDRESS",
}


@app.before_request
def enforce_api_rate_limit():
    """Apply per-route IP throttling to every API endpoint."""
    if not request.path.startswith(f"{API_PREFIX}/"):
        return None
    now = int(time.time())
    endpoint = request.endpoint or request.path
    limit = RATE_LIMITS_BY_ENDPOINT.get(endpoint, 60)
    key = (request.remote_addr or "unknown", endpoint)
    window = now // 60
    with RATE_LIMIT_LOCK:
        start, count = RATE_LIMITS.get(key, (window, 0))
        if start != window:
            count = 0
            start = window
        if count >= limit:
            retry_after = max(1, 60 - now % 60)
            response = jsonify({"error": "Rate limit exceeded; retry shortly."})
            response.headers["Retry-After"] = str(retry_after)
            return response, 429
        RATE_LIMITS[key] = (start, count + 1)
        if len(RATE_LIMITS) > 10_000:
            for cached_key, (cached_window, _) in list(RATE_LIMITS.items()):
                if cached_window < window:
                    RATE_LIMITS.pop(cached_key, None)
    return None


def _json_body() -> dict[str, Any]:
    body = request.get_json(silent=True)
    return body if isinstance(body, dict) else {}


@app.get(f"{API_PREFIX}/health")
def health():
    """إظهار حالة خدمة عامة بلا كشف أسرار أو محتواها."""
    return jsonify(
        {
            "status": "ok",
            "chainId": 97,
            "testnetTradingReady": TESTNET_TRADING_READY,
            "autoTradingReady": AUTO_TRADING_READY,
            "subscriptionKeeperConfigured": keeper_configured(),
            "websocket": "available",
        }
    )


@app.post(f"{API_PREFIX}/auth/nonce")
def auth_nonce():
    wallet = _json_body().get("wallet", "")
    try:
        return jsonify(issue_nonce(wallet)), 200
    except ValueError as error:
        return jsonify({"error": str(error)}), 400


@app.post(f"{API_PREFIX}/auth/verify")
def auth_verify():
    body = _json_body()
    try:
        token = verify_signature(body.get("wallet", ""), body.get("signature", ""))
        response = jsonify(
            {
                "authenticated": True,
                "wallet": Web3.to_checksum_address(body.get("wallet", "")),
                "expiresIn": 86400,
            }
        )
        forwarded_proto = request.headers.get("X-Forwarded-Proto", "").split(",")[0].strip()
        response.set_cookie(
            "nexus_session",
            token,
            max_age=86400,
            httponly=True,
            secure=request.is_secure or forwarded_proto == "https",
            samesite="Strict",
            path=API_PREFIX or "/",
        )
        return response, 200
    except ValueError as error:
        return jsonify({"error": str(error)}), 401
    except RuntimeError as error:
        return jsonify({"error": str(error)}), 503


@app.get(f"{API_PREFIX}/user")
@require_auth
def get_user():
    with database.connection() as conn:
        row = conn.execute(
            "SELECT wallet, balance, plan, created_at FROM users WHERE wallet = ?",
            (g.wallet,),
        ).fetchone()
    if row is None:
        return jsonify({"error": "Wallet user was not found."}), 404
    return jsonify(dict(row))


@app.get(f"{API_PREFIX}/auth/session")
@require_auth
def auth_session():
    return jsonify({"authenticated": True, "wallet": Web3.to_checksum_address(g.wallet)})


@app.get(f"{API_PREFIX}/subscriptions/access")
@require_auth
def subscription_access():
    feature = request.args.get("feature", "")
    if feature not in {"signals", "bots", "api"}:
        return jsonify({"error": "feature must be signals, bots, or api."}), 400
    try:
        state = read_subscription_state(g.wallet)
    except (RuntimeError, ValueError, OSError) as error:
        return jsonify({"error": str(error)}), 503
    required_plan = {"signals": 1, "bots": 2, "api": 3}[feature]
    return jsonify(
        {
            **state,
            "feature": feature,
            "requiredPlanId": required_plan,
            "allowed": state["active"] and state["planId"] >= required_plan,
        }
    )


@app.post(f"{API_PREFIX}/reserve")
@require_auth
def reserve_wallet():
    wallet = Web3.to_checksum_address(g.wallet)
    with database.connection() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO reservations (wallet, created_at) VALUES (?, ?)",
            (wallet.lower(), int(time.time())),
        )
    try:
        delivered = send_telegram(f"NEXUS Testnet reservation request\nWallet: {wallet}")
    except RuntimeError as error:
        logger.warning("Reservation was recorded, but notification configuration is missing.")
        return jsonify({"saved": True, "notified": False, "error": str(error)}), 503
    return jsonify({"saved": True, "notified": delivered}), 200 if delivered else 502


@app.get(f"{API_PREFIX}/signals")
@require_auth
@require_plan("signals")
def signals():
    address = os.getenv("SIGNAL_REGISTRY_ADDRESS")
    try:
        result = read_signals(address, request.args.get("limit", default=100, type=int) or 100)
        return jsonify(result), 200 if result["available"] else 503
    except (RuntimeError, ValueError, requests.RequestException) as error:
        logger.warning("Signal registry read failed: %s", error)
        return jsonify({"available": False, "reason": str(error), "items": []}), 503


@app.get(f"{API_PREFIX}/v1/signals")
@require_auth
@require_plan("api")
def enterprise_signals_api():
    """Enterprise API access to the same verified on-chain signal feed."""
    address = os.getenv("SIGNAL_REGISTRY_ADDRESS")
    try:
        result = read_signals(address, request.args.get("limit", default=100, type=int) or 100)
        return jsonify(result), 200 if result["available"] else 503
    except (RuntimeError, ValueError, requests.RequestException) as error:
        logger.warning("Enterprise signal API read failed: %s", error)
        return jsonify({"available": False, "reason": str(error), "items": []}), 503


@app.get(f"{API_PREFIX}/subscriptions")
@require_auth
def subscription_details():
    try:
        state = read_subscription_state(g.wallet)
    except (RuntimeError, ValueError, OSError) as error:
        return jsonify({"error": str(error)}), 503
    return jsonify(
        {
            **state,
            "planFeatures": {
                str(plan_id): list(features)
                for plan_id, features in FEATURES_BY_PLAN.items()
            },
        }
    )


@app.get(f"{API_PREFIX}/positions")
@require_auth
def positions():
    with database.connection() as conn:
        rows = conn.execute(
            """
            SELECT rowid AS ledger_sequence, * FROM trade_orders
            WHERE wallet = ? AND fills_json IS NOT NULL AND fills_json != '[]'
            ORDER BY created_at ASC
            """,
            (g.wallet.lower(),),
        ).fetchall()
    ledger = build_wallet_ledger([dict(row) for row in rows])
    return jsonify({"available": True, "items": ledger["positions"]})


@app.get(f"{API_PREFIX}/history")
@require_auth
def history():
    with database.connection() as conn:
        rows = conn.execute(
            """
            SELECT rowid AS ledger_sequence, * FROM trade_orders
            WHERE wallet = ?
            ORDER BY created_at ASC
            LIMIT 500
            """,
            (g.wallet.lower(),),
        ).fetchall()
    ledger = build_wallet_ledger([dict(row) for row in rows])
    return jsonify({"available": True, "items": ledger["history"]})


@app.get(f"{API_PREFIX}/performance")
@require_auth
def performance():
    period = request.args.get("period", "30d")
    if period not in {"7d", "30d", "90d", "all"}:
        return jsonify({"error": "period must be one of: 7d, 30d, 90d, all."}), 400
    if period == "all":
        since = 0
    else:
        since = int(time.time()) - int(period[:-1]) * 86400
    with database.connection() as conn:
        rows = conn.execute(
            "SELECT rowid AS ledger_sequence, * FROM trade_orders WHERE wallet = ? ORDER BY created_at ASC, rowid ASC LIMIT 5000",
            (g.wallet.lower(),),
        ).fetchall()
    ledger = build_wallet_ledger([dict(row) for row in rows])
    return jsonify(performance_summary(ledger["history"], since))


@app.post(f"{API_PREFIX}/verify")
@require_auth
def verify_transaction():
    body = _json_body()
    tx_hash = body.get("tx_hash", "")
    tx_type = body.get("type", "")
    if not isinstance(tx_hash, str) or not TX_HASH_PATTERN.fullmatch(tx_hash):
        return jsonify({"error": "A valid transaction hash is required."}), 400
    env_name = CONTRACT_ENV.get(tx_type)
    expected_to = os.getenv(env_name) if env_name else None
    if not expected_to:
        return jsonify({"error": "The corresponding verified Testnet contract is not configured."}), 503
    if not BSCSCAN_KEY:
        return jsonify({"error": "BSCSCAN_KEY is not configured; transaction verification is unavailable."}), 503

    try:
        response = requests.get(
            "https://api-testnet.bscscan.com/api",
            params={
                "module": "proxy",
                "action": "eth_getTransactionReceipt",
                "txhash": tx_hash,
                "apikey": BSCSCAN_KEY,
            },
            timeout=15,
        )
        response.raise_for_status()
        receipt = response.json().get("result")
        if not isinstance(receipt, dict):
            return jsonify({"error": "BscScan did not return a confirmed transaction receipt."}), 404
        if receipt.get("status") != "0x1":
            return jsonify({"error": "Transaction was not successful on BSC Testnet."}), 422
        transaction_response = requests.get(
            "https://api-testnet.bscscan.com/api",
            params={
                "module": "proxy",
                "action": "eth_getTransactionByHash",
                "txhash": tx_hash,
                "apikey": BSCSCAN_KEY,
            },
            timeout=15,
        )
        transaction_response.raise_for_status()
        transaction = transaction_response.json().get("result")
        if not isinstance(transaction, dict):
            return jsonify({"error": "BscScan did not return the submitted transaction."}), 404
        if (transaction.get("from") or "").lower() != g.wallet:
            return jsonify({"error": "Transaction signer does not match the authenticated wallet."}), 403
        if (transaction.get("to") or "").lower() != expected_to.lower():
            return jsonify({"error": "Transaction was sent to a different contract."}), 422
        with database.connection() as conn:
            conn.execute(
                """
                INSERT INTO transactions (tx_hash, wallet, type, verified_at)
                VALUES (?, ?, ?, ?)
                """,
                (tx_hash.lower(), g.wallet, tx_type, int(time.time())),
            )
    except requests.RequestException as error:
        logger.error("BscScan transaction lookup failed: %s", error)
        return jsonify({"error": "Unable to verify the transaction with BscScan."}), 502
    except Exception as error:
        if "UNIQUE constraint failed" in str(error):
            return jsonify(
                {
                    "error": "Transaction was already verified.",
                    "code": "ALREADY_VERIFIED",
                }
            ), 409
        raise
    return jsonify({"verified": True, "tx_hash": tx_hash, "type": tx_type}), 200


@app.post(f"{API_PREFIX}/subscriptions/verify")
def verify_subscription_transaction():
    """Verify a user's purchase or upgrade event against a BscScan Testnet receipt."""
    body = _json_body()
    tx_hash = body.get("tx_hash", "")
    if not isinstance(tx_hash, str) or not TX_HASH_PATTERN.fullmatch(tx_hash):
        return jsonify({"error": "A valid transaction hash is required."}), 400
    manager_address = os.getenv("SUBSCRIPTION_MANAGER_ADDRESS", "")
    if not Web3.is_address(manager_address):
        return jsonify({"error": "The verified BSC Testnet SubscriptionManager is not configured."}), 503
    if not BSCSCAN_KEY:
        return jsonify({"error": "BSCSCAN_KEY is not configured; BscScan verification is unavailable."}), 503

    expected_to = Web3.to_checksum_address(manager_address).lower()
    try:
        response = requests.get(
            "https://api-testnet.bscscan.com/api",
            params={
                "module": "proxy",
                "action": "eth_getTransactionReceipt",
                "txhash": tx_hash,
                "apikey": BSCSCAN_KEY,
            },
            timeout=15,
        )
        response.raise_for_status()
        receipt = response.json().get("result")
        if not isinstance(receipt, dict):
            return jsonify({"error": "BscScan did not return a transaction receipt."}), 404
        if receipt.get("status") != "0x1":
            return jsonify({"error": "Transaction was not successful on BSC Testnet."}), 422

        tx_response = requests.get(
            "https://api-testnet.bscscan.com/api",
            params={
                "module": "proxy",
                "action": "eth_getTransactionByHash",
                "txhash": tx_hash,
                "apikey": BSCSCAN_KEY,
            },
            timeout=15,
        )
        tx_response.raise_for_status()
        transaction = tx_response.json().get("result")
        if not isinstance(transaction, dict):
            return jsonify({"error": "BscScan did not return the submitted transaction."}), 404
        wallet = (transaction.get("from") or "").lower()
        if not Web3.is_address(wallet):
            return jsonify({"error": "Transaction signer is not a valid wallet address."}), 422
        if (transaction.get("to") or "").lower() != expected_to:
            return jsonify({"error": "Transaction was sent to a different contract."}), 422

        expected_topic = Web3.keccak(
            text="SubscriptionPayment(address,uint256,address,uint256,uint8,uint256)"
        ).hex().lower()
        verified_event = None
        for log in receipt.get("logs", []):
            topics = log.get("topics", [])
            if (
                (log.get("address") or "").lower() != expected_to
                or len(topics) != 4
                or str(topics[0]).lower() != expected_topic
            ):
                continue
            event_wallet = "0x" + str(topics[1])[-40:]
            plan_id = int(str(topics[2]), 16)
            payment_token = Web3.to_checksum_address("0x" + str(topics[3])[-40:])
            event_data = bytes.fromhex(str(log.get("data", "0x"))[2:])
            if len(event_data) != 96:
                continue
            amount = int.from_bytes(event_data[0:32], "big")
            action = int.from_bytes(event_data[32:64], "big")
            expires_at = int.from_bytes(event_data[64:96], "big")
            if (
                event_wallet.lower() == wallet
                and plan_id in {1, 2, 3}
                and action in {1, 3}
                and (amount > 0 or action == 3)
                and expires_at > 0
            ):
                verified_event = {
                    "wallet": wallet,
                    "planId": plan_id,
                    "paymentToken": payment_token,
                    "amount": amount,
                    "action": action,
                    "expiresAt": expires_at,
                }
                break
        if verified_event is None:
            return jsonify({"error": "No valid subscription purchase or upgrade event was found in this receipt."}), 422

        now = int(time.time())
        with database.connection() as conn:
            conn.execute(
                """
                INSERT INTO transactions (tx_hash, wallet, amount, type, verified_at)
                VALUES (?, ?, ?, 'subscription', ?)
                """,
                (tx_hash.lower(), wallet, str(verified_event["amount"]), now),
            )
            conn.execute(
                """
                INSERT INTO subscription_watchers (wallet, first_verified_at, last_verified_at)
                VALUES (?, ?, ?)
                ON CONFLICT(wallet) DO UPDATE SET last_verified_at=excluded.last_verified_at
                """,
                (wallet, now, now),
            )
    except requests.RequestException as error:
        logger.error("BscScan subscription lookup failed: %s", error)
        return jsonify({"error": "Unable to verify the subscription with BscScan."}), 502
    except Exception as error:
        if "UNIQUE constraint failed" in str(error):
            return jsonify(
                {
                    "error": "Transaction was already verified.",
                    "code": "ALREADY_VERIFIED",
                }
            ), 409
        raise

    return jsonify(
        {
            "verified": True,
            "tx_hash": tx_hash,
            "type": "subscription",
            **verified_event,
        }
    ), 200


@app.post(f"{API_PREFIX}/trade")
@require_auth
def trade():
    """الطريق القديم لا ينفذ أمراً؛ استخدم المعاينة ثم التأكيد الأحادي."""
    return jsonify(
        {
            "error": "Direct order submission is disabled. Create and explicitly confirm a single-use Testnet quote.",
            "testnetTradingReady": TESTNET_TRADING_READY,
        }
    ), 410


@app.post(f"{API_PREFIX}/trade/quote")
@require_auth
@require_plan("bots")
def trade_quote():
    """إنشاء معاينة قصيرة العمر لأمر Spot Testnet، من دون إرساله."""
    body = _json_body()
    now = int(time.time())
    wallet = g.wallet.lower()

    with database.connection() as conn:
        recent_quotes = conn.execute(
            "SELECT COUNT(*) AS total FROM trade_quotes WHERE wallet = ? AND created_at >= ?",
            (wallet, now - 60),
        ).fetchone()["total"]
    if recent_quotes >= 10:
        return jsonify({"error": "Quote limit reached. Wait before requesting another preview."}), 429

    try:
        details = trading.build_order_quote(
            body.get("symbol"), body.get("side"), body.get("amount")
        )
    except trading.TradingError as error:
        return jsonify({"error": str(error)}), error.status_code

    quote_id = secrets.token_urlsafe(32)
    expires_at = now + trading.QUOTE_TTL_SECONDS
    with database.connection() as conn:
        conn.execute("DELETE FROM trade_quotes WHERE expires_at < ?", (now - 86_400,))
        conn.execute(
            """
            INSERT INTO trade_quotes (
                quote_id, wallet, symbol, side, amount, reference_price,
                estimated_base_qty, estimated_quote_qty, created_at, expires_at, used
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                quote_id,
                wallet,
                details["symbol"],
                details["side"],
                details["amount"],
                details["referencePrice"],
                details["estimatedBaseQty"],
                details["estimatedQuoteQty"],
                now,
                expires_at,
            ),
        )

    return jsonify(
        {
            "quoteId": quote_id,
            "symbol": details["symbol"],
            "side": details["side"],
            "amount": details["amount"],
            "amountUnit": details["amountUnit"],
            "baseAsset": details["baseAsset"],
            "quoteAsset": details["quoteAsset"],
            "referencePrice": details["referencePrice"],
            "estimatedBaseQty": details["estimatedBaseQty"],
            "estimatedQuoteQty": details["estimatedQuoteQty"],
            "createdAt": now,
            "expiresAt": expires_at,
            "validForSeconds": trading.QUOTE_TTL_SECONDS,
        }
    ), 201


@app.post(f"{API_PREFIX}/trade/execute")
@require_auth
@require_plan("bots")
def trade_execute():
    """استهلاك معاينة لمحفظتها مرة واحدة بعد موافقة صريحة على كل أمر."""
    body = _json_body()
    quote_id = body.get("quoteId")
    if not isinstance(quote_id, str) or not 24 <= len(quote_id) <= 128:
        return jsonify({"error": "A valid order preview is required."}), 400
    if body.get("confirmed") is not True:
        return jsonify({"error": "Explicit confirmation is required for each order."}), 400
    if not TESTNET_TRADING_READY:
        return jsonify({"error": "Binance Spot Testnet is not configured."}), 503

    now = int(time.time())
    wallet = g.wallet.lower()
    client_order_id = f"NEXUS{secrets.token_hex(12)}"
    with database.connection() as conn:
        quote = conn.execute(
            """
            SELECT * FROM trade_quotes
            WHERE quote_id = ? AND wallet = ?
            """,
            (quote_id, wallet),
        ).fetchone()
        if quote is None:
            return jsonify({"error": "Order preview was not found for this wallet."}), 404
        if quote["expires_at"] < now:
            return jsonify({"error": "Order preview expired. Request a new preview."}), 410
        if quote["used"]:
            return jsonify({"error": "This order preview has already been used."}), 409

        today_start = now - 86_400
        wallet_orders = conn.execute(
            "SELECT COUNT(*) AS total FROM trade_orders WHERE wallet = ? AND created_at >= ?",
            (wallet, today_start),
        ).fetchone()["total"]
        all_orders = conn.execute(
            "SELECT COUNT(*) AS total FROM trade_orders WHERE created_at >= ?",
            (today_start,),
        ).fetchone()["total"]
        if wallet_orders >= 20 or all_orders >= 100:
            return jsonify({"error": "Shared Testnet order limit reached."}), 429

        consumed = conn.execute(
            "UPDATE trade_quotes SET used = 1 WHERE quote_id = ? AND wallet = ? AND used = 0",
            (quote_id, wallet),
        )
        if consumed.rowcount != 1:
            return jsonify({"error": "This order preview has already been used."}), 409
        conn.execute(
            """
            INSERT INTO trade_orders (
                quote_id, wallet, client_order_id, symbol, side, amount,
                status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'SUBMITTING', ?, ?)
            """,
            (
                quote_id,
                wallet,
                client_order_id,
                quote["symbol"],
                quote["side"],
                quote["amount"],
                now,
                now,
            ),
        )
        order = dict(quote)

    try:
        result = trading.submit_confirmed_market_order(order, client_order_id)
    except trading.TradingError as error:
        final_status = "UNKNOWN" if error.status_code == 502 else "REJECTED"
        with database.connection() as conn:
            conn.execute(
                "UPDATE trade_orders SET status = ?, updated_at = ? WHERE quote_id = ?",
                (final_status, int(time.time()), quote_id),
            )
        if final_status == "UNKNOWN":
            logger.warning("Testnet order response uncertain; manual account check required.")
        return jsonify(
            {
                "error": str(error),
                "status": final_status,
                "quoteId": quote_id,
                "clientOrderId": client_order_id,
            }
        ), error.status_code

    with database.connection() as conn:
        conn.execute(
            """
            UPDATE trade_orders
            SET exchange_order_id = ?, status = ?, executed_base_qty = ?,
                executed_quote_qty = ?, fills_json = ?, updated_at = ?
            WHERE quote_id = ?
            """,
            (
                result["exchangeOrderId"],
                result["status"],
                result["executedBaseQty"],
                result["executedQuoteQty"],
                json.dumps(result.get("fills", []), separators=(",", ":")),
                int(time.time()),
                quote_id,
            ),
        )
    return jsonify(
        {
            "quoteId": quote_id,
            "symbol": order["symbol"],
            "side": order["side"],
            **result,
            "testnet": True,
        }
    ), 200


@app.get(f"{API_PREFIX}/trade/orders")
@require_auth
def trade_orders():
    """سجل أوامر Testnet التي أكدها عنوان المحفظة الحالي فقط."""
    with database.connection() as conn:
        rows = conn.execute(
            """
            SELECT quote_id, symbol, side, amount, status, exchange_order_id,
                   executed_base_qty, executed_quote_qty, created_at, updated_at
            FROM trade_orders
            WHERE wallet = ?
            ORDER BY created_at DESC
            LIMIT 20
            """,
            (g.wallet.lower(),),
        ).fetchall()
    return jsonify({"available": True, "items": [dict(row) for row in rows]})


if __name__ == "__main__":
    start_subscription_keeper()
    socketio.run(
        app,
        host="0.0.0.0",
        port=int(os.getenv("PORT", "5000")),
        allow_unsafe_werkzeug=True,
    )
