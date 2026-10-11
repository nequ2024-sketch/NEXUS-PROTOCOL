# خادم Flask: واجهات API وWebSocket للمشروع مع تعطيل التداول افتراضياً.
from __future__ import annotations

import logging
import os
import re
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

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("nexus.api")

app = Flask(__name__)
CORS(app, origins=CORS_ORIGINS)
socket_path = f"{os.getenv('BASE_PATH', '').strip('/')}/socket.io".lstrip("/")
socketio = SocketIO(app, cors_allowed_origins=CORS_ORIGINS, path=socket_path)
database.initialize()

TX_HASH_PATTERN = re.compile(r"^0x[a-fA-F0-9]{64}$")
CONTRACT_ENV = {
    "presale": "PRESALE_ADDRESS",
    "subscription": "SUBSCRIPTION_MANAGER_ADDRESS",
    "signal": "SIGNAL_REGISTRY_ADDRESS",
}


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
        return jsonify({"token": token, "tokenType": "Bearer", "expiresIn": 86400}), 200
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
def signals():
    address = os.getenv("SIGNAL_REGISTRY_ADDRESS")
    try:
        result = read_signals(address, request.args.get("limit", default=100, type=int) or 100)
        return jsonify(result), 200 if result["available"] else 503
    except (RuntimeError, ValueError, requests.RequestException) as error:
        logger.warning("Signal registry read failed: %s", error)
        return jsonify({"available": False, "reason": str(error), "items": []}), 503


@app.get(f"{API_PREFIX}/positions")
@require_auth
def positions():
    with database.connection() as conn:
        rows = conn.execute(
            "SELECT * FROM positions WHERE wallet = ? AND status = 'open' ORDER BY opened_at DESC",
            (g.wallet,),
        ).fetchall()
    return jsonify({"available": True, "items": [dict(row) for row in rows]})


@app.get(f"{API_PREFIX}/history")
@require_auth
def history():
    with database.connection() as conn:
        rows = conn.execute(
            "SELECT * FROM trade_history WHERE wallet = ? ORDER BY closed_at DESC LIMIT 500",
            (g.wallet,),
        ).fetchall()
    return jsonify({"available": True, "items": [dict(row) for row in rows]})


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
            """
            SELECT pnl FROM trade_history
            WHERE wallet = ? AND closed_at >= ?
            """,
            (g.wallet, since),
        ).fetchall()
    if not rows:
        return jsonify({"available": False, "reason": "No verified closed trades in this period.", "trades": 0, "netPnl": None, "winRate": None})
    values = [float(row["pnl"]) for row in rows]
    return jsonify(
        {
            "available": True,
            "trades": len(values),
            "netPnl": sum(values),
            "winRate": sum(value > 0 for value in values) / len(values) * 100,
        }
    )


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
            return jsonify({"error": "Transaction was already verified."}), 409
        raise
    return jsonify({"verified": True, "tx_hash": tx_hash, "type": tx_type}), 200


@app.post(f"{API_PREFIX}/trade")
@require_auth
def trade():
    """لا يرسل أوامر حتى يُفعّل مالك المشروع تداول Testnet صراحة."""
    return jsonify(
        {
            "error": "Exchange execution is disabled.",
            "testnetTradingReady": TESTNET_TRADING_READY,
            "autoTradingReady": AUTO_TRADING_READY,
        }
    ), 503


if __name__ == "__main__":
    socketio.run(
        app,
        host="0.0.0.0",
        port=int(os.getenv("PORT", "5000")),
        allow_unsafe_werkzeug=True,
    )
