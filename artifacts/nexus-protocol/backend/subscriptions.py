"""BSC Testnet entitlement reads and opt-in recurring renewal keeper."""
from __future__ import annotations

import logging
import os
import threading
import time
from functools import wraps
from typing import Any, Callable

from eth_account import Account
from flask import g, jsonify
from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware

from . import database
from .config import BSC_TESTNET_RPC

logger = logging.getLogger("nexus.subscriptions")

FEATURES_BY_PLAN = {
    0: (),
    1: ("signals",),
    2: ("signals", "bots"),
    3: ("signals", "bots", "api"),
}
PLAN_BY_FEATURE = {"signals": 1, "bots": 2, "api": 3}

MANAGER_ABI = [
    {
        "type": "function",
        "name": "getSubscription",
        "stateMutability": "view",
        "inputs": [{"name": "user", "type": "address"}],
        "outputs": [
            {"name": "planId", "type": "uint256"},
            {"name": "expiresAt", "type": "uint256"},
            {"name": "autoRenew", "type": "bool"},
        ],
    },
    {
        "type": "function",
        "name": "subscriptions",
        "stateMutability": "view",
        "inputs": [{"name": "user", "type": "address"}],
        "outputs": [
            {"name": "planId", "type": "uint256"},
            {"name": "expiresAt", "type": "uint256"},
            {"name": "lastCharged", "type": "uint256"},
            {"name": "autoRenew", "type": "bool"},
            {"name": "paymentToken", "type": "address"},
        ],
    },
    {
        "type": "function",
        "name": "renew",
        "stateMutability": "nonpayable",
        "inputs": [{"name": "user", "type": "address"}],
        "outputs": [],
    },
    {
        "type": "function",
        "name": "keepers",
        "stateMutability": "view",
        "inputs": [{"name": "keeper", "type": "address"}],
        "outputs": [{"name": "authorized", "type": "bool"}],
    },
]


def _web3() -> Web3:
    provider = Web3(
        Web3.HTTPProvider(BSC_TESTNET_RPC, request_kwargs={"timeout": 12})
    )
    provider.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
    if provider.eth.chain_id != 97:
        raise RuntimeError("Subscription services are restricted to BSC Testnet (chain ID 97).")
    return provider


def _manager(w3: Web3):
    address = os.getenv("SUBSCRIPTION_MANAGER_ADDRESS", "")
    if not Web3.is_address(address):
        raise RuntimeError("A verified BSC Testnet SubscriptionManager address is not configured.")
    return w3.eth.contract(address=Web3.to_checksum_address(address), abi=MANAGER_ABI)


def read_subscription_state(wallet: str) -> dict[str, Any]:
    """Read the authoritative access state directly from the Testnet contract."""
    if not Web3.is_address(wallet):
        raise ValueError("A valid wallet address is required.")
    w3 = _web3()
    manager = _manager(w3)
    plan_id, expires_at, auto_renew = manager.functions.getSubscription(
        Web3.to_checksum_address(wallet)
    ).call()
    chain_time = int(w3.eth.get_block("latest")["timestamp"])
    plan_id = int(plan_id)
    expires_at = int(expires_at)
    active = plan_id == 0 or expires_at > chain_time
    return {
        "wallet": Web3.to_checksum_address(wallet),
        "planId": plan_id,
        "expiresAt": expires_at or None,
        "autoRenew": bool(auto_renew),
        "active": active,
        "features": list(FEATURES_BY_PLAN.get(plan_id, ())) if active else [],
        "chainId": 97,
    }


def require_plan(feature: str):
    """Protect a paid feature using the live subscription state, never a client claim."""
    required_plan = PLAN_BY_FEATURE[feature]

    def decorate(function: Callable[..., Any]):
        @wraps(function)
        def wrapped(*args: Any, **kwargs: Any):
            try:
                state = read_subscription_state(g.wallet)
            except (RuntimeError, ValueError, OSError) as error:
                logger.warning("Subscription access check unavailable: %s", error)
                return jsonify({"error": "Subscription access could not be verified on BSC Testnet."}), 503
            if not state["active"] or state["planId"] < required_plan:
                return jsonify(
                    {
                        "error": "An active subscription with the required plan is needed.",
                        "requiredPlanId": required_plan,
                        "subscription": state,
                    }
                ), 403
            return function(*args, **kwargs)

        return wrapped

    return decorate


def keeper_configured() -> bool:
    return (
        os.getenv("SUBSCRIPTION_KEEPER_ENABLED", "").lower() == "true"
        and bool(os.getenv("SUBSCRIPTION_KEEPER_PRIVATE_KEY"))
        and Web3.is_address(os.getenv("SUBSCRIPTION_MANAGER_ADDRESS", ""))
    )


def _keeper_loop(w3: Web3, manager: Any, account: Any, stop_event: threading.Event) -> None:
    while not stop_event.is_set():
        try:
            block_time = int(w3.eth.get_block("latest")["timestamp"])
            with database.connection() as conn:
                wallets = [
                    row["wallet"]
                    for row in conn.execute("SELECT wallet FROM subscription_watchers").fetchall()
                ]
            for wallet in wallets:
                if stop_event.is_set():
                    break
                try:
                    plan_id, expires_at, _, auto_renew, _ = manager.functions.subscriptions(
                        Web3.to_checksum_address(wallet)
                    ).call()
                    if not plan_id or not auto_renew or int(expires_at) > block_time:
                        continue
                    function = manager.functions.renew(Web3.to_checksum_address(wallet))
                    transaction = function.build_transaction(
                        {
                            "from": account.address,
                            "nonce": w3.eth.get_transaction_count(account.address, "pending"),
                            "chainId": 97,
                            "gasPrice": w3.eth.gas_price,
                        }
                    )
                    transaction["gas"] = min(
                        int(w3.eth.estimate_gas(transaction) * 1.2), 300_000
                    )
                    signed = account.sign_transaction(transaction)
                    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
                    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
                    if receipt["status"] != 1:
                        logger.error("Subscription renewal reverted for wallet %s.", wallet)
                    else:
                        logger.info(
                            "Subscription renewal confirmed for %s in transaction %s.",
                            wallet,
                            tx_hash.hex(),
                        )
                except Exception as error:
                    logger.warning(
                        "Skipped a due renewal for %s; check allowance, BNB, and keeper authorization: %s",
                        wallet,
                        error,
                    )
        except Exception as error:
            logger.error("Subscription keeper poll failed: %s", error)
        stop_event.wait(60)


def start_subscription_keeper() -> bool:
    """Start only after explicit enablement and a valid, authorized Testnet keeper key."""
    if os.getenv("SUBSCRIPTION_KEEPER_ENABLED", "").lower() != "true":
        logger.info("Subscription keeper is disabled; renewals remain user-controlled.")
        return False
    private_key = os.getenv("SUBSCRIPTION_KEEPER_PRIVATE_KEY")
    if not private_key:
        logger.error("Subscription keeper enabled without its private key; worker was not started.")
        return False
    try:
        w3 = _web3()
        manager = _manager(w3)
        account = Account.from_key(private_key)
        if not manager.functions.keepers(account.address).call():
            logger.error("Configured Testnet keeper address is not authorized by the contract.")
            return False
        if w3.eth.get_code(manager.address) in (b"", b"\x00"):
            logger.error("Configured subscription manager has no Testnet contract code.")
            return False
    except Exception as error:
        logger.error("Subscription keeper could not start: %s", error)
        return False

    stop_event = threading.Event()
    thread = threading.Thread(
        target=_keeper_loop,
        args=(w3, manager, account, stop_event),
        name="nexus-testnet-subscription-keeper",
        daemon=True,
    )
    thread.start()
    logger.info("Opt-in BSC Testnet subscription renewal keeper started.")
    return True
