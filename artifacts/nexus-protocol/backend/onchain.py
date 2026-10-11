# قراءات BSC Testnet فقط؛ لا يُرجع بيانات مصطنعة عند غياب العقد.
from __future__ import annotations

import os
from typing import Any

from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware

from .config import BSC_TESTNET_RPC

SIGNAL_ABI = [
    {
        "type": "function",
        "name": "signalCount",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "", "type": "uint256"}],
    },
    {
        "type": "function",
        "name": "getSignal",
        "stateMutability": "view",
        "inputs": [{"name": "", "type": "uint256"}],
        "outputs": [
            {"name": "signalId", "type": "uint256"},
            {"name": "signalHash", "type": "bytes32"},
            {"name": "symbol", "type": "string"},
            {"name": "action", "type": "string"},
            {"name": "entryPrice", "type": "uint256"},
            {"name": "timestamp", "type": "uint256"},
            {"name": "publisher", "type": "address"},
            {"name": "executed", "type": "bool"},
            {"name": "pnlBps", "type": "int256"},
        ],
    },
    {
        "type": "event",
        "name": "SignalPublished",
        "anonymous": False,
        "inputs": [
            {"name": "signalId", "type": "uint256", "indexed": True},
            {"name": "signalHash", "type": "bytes32", "indexed": True},
            {"name": "symbol", "type": "string", "indexed": False},
            {"name": "action", "type": "string", "indexed": False},
            {"name": "entryPrice", "type": "uint256", "indexed": False},
            {"name": "publisher", "type": "address", "indexed": True},
        ],
    },
]


def testnet_web3() -> Web3:
    """اتصال RPC بشبكة BSC الاختبارية مع توافق PoA."""
    web3 = Web3(Web3.HTTPProvider(BSC_TESTNET_RPC, request_kwargs={"timeout": 10}))
    web3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
    if not web3.is_connected():
        raise RuntimeError("BSC Testnet RPC is unavailable.")
    if web3.eth.chain_id != 97:
        raise RuntimeError("Configured RPC is not BSC Testnet (chain ID 97).")
    return web3


def read_signals(address: str | None, limit: int = 100) -> dict[str, Any]:
    """قراءة أحدث السجلات مباشرة من سجل الإشارات المنشور."""
    if not address or not Web3.is_address(address):
        return {"available": False, "reason": "Signal registry address is not configured.", "items": []}
    web3 = testnet_web3()
    registry = web3.eth.contract(
        address=Web3.to_checksum_address(address), abi=SIGNAL_ABI
    )
    count = registry.functions.signalCount().call()
    transaction_hashes: dict[int, str] = {}
    deployment_block = os.getenv("SIGNAL_REGISTRY_DEPLOY_BLOCK")
    if deployment_block and count:
        published = registry.events.SignalPublished().get_logs(
            from_block=int(deployment_block),
            to_block="latest",
            argument_filters={},
        )
        transaction_hashes = {
            int(log["args"]["signalId"]): Web3.to_hex(log["transactionHash"])
            for log in published
        }
    start = max(0, count - max(1, min(limit, 500)))
    items = []
    for signal_id in range(start + 1, count + 1):
        value = registry.functions.getSignal(signal_id).call()
        items.append(
            {
                "id": int(value[0]),
                "hash": Web3.to_hex(value[1]),
                "symbol": value[2],
                "action": value[3],
                "entryPrice": str(value[4]),
                "timestamp": int(value[5]),
                "publisher": value[6],
                "executed": bool(value[7]),
                "pnlBps": int(value[8]),
                "transactionHash": transaction_hashes.get(signal_id),
            }
        )
    return {"available": True, "count": count, "items": list(reversed(items))}
