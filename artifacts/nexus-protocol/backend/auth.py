# مصادقة محفظة بتوقيع nonce أحادي الاستخدام ورمز JWT قصير الأجل.
from __future__ import annotations

import secrets
import time
from functools import wraps
from typing import Any, Callable

import jwt
from eth_account import Account
from eth_account.messages import encode_defunct
from flask import current_app, g, jsonify, request
from web3 import Web3

from . import database
from .config import SECRET_KEY

NONCE_TTL_SECONDS = 300
JWT_TTL_SECONDS = 24 * 60 * 60


def issue_nonce(wallet: str) -> dict[str, Any]:
    """إنشاء رسالة توقيع قصيرة العمر لمحفظة BSC."""
    if not Web3.is_address(wallet):
        raise ValueError("Invalid wallet address.")
    normalized = Web3.to_checksum_address(wallet)
    nonce = secrets.token_urlsafe(32)
    expires_at = int(time.time()) + NONCE_TTL_SECONDS
    message = (
        "NEXUS PROTOCOL wallet sign-in\n"
        "This signature does not authorize a blockchain transaction.\n"
        f"Wallet: {normalized}\n"
        "Chain ID: 97\n"
        f"Nonce: {nonce}\n"
        f"Expires: {expires_at}"
    )
    with database.connection() as conn:
        conn.execute(
            """
            INSERT INTO auth_nonces (wallet, nonce, message, expires_at, used)
            VALUES (?, ?, ?, ?, 0)
            ON CONFLICT(wallet) DO UPDATE SET
                nonce=excluded.nonce,
                message=excluded.message,
                expires_at=excluded.expires_at,
                used=0
            """,
            (normalized.lower(), nonce, message, expires_at),
        )
    return {"wallet": normalized, "message": message, "expires_at": expires_at}


def verify_signature(wallet: str, signature: str) -> str:
    """التحقق من توقيع nonce ثم استهلاكه مرة واحدة فقط."""
    if not SECRET_KEY:
        raise RuntimeError("Wallet sign-in is unavailable: SECRET_KEY is not configured.")
    if not Web3.is_address(wallet) or not signature:
        raise ValueError("Wallet and signature are required.")
    normalized = Web3.to_checksum_address(wallet)
    now = int(time.time())

    with database.connection() as conn:
        nonce = conn.execute(
            "SELECT message, expires_at, used FROM auth_nonces WHERE wallet = ?",
            (normalized.lower(),),
        ).fetchone()
        if nonce is None or nonce["used"] or nonce["expires_at"] < now:
            raise ValueError("Sign-in request expired or already used; request a new nonce.")

        recovered = Account.recover_message(
            encode_defunct(text=nonce["message"]), signature=signature
        )
        if recovered.lower() != normalized.lower():
            raise ValueError("Signature does not match the requested wallet.")

        updated = conn.execute(
            """
            UPDATE auth_nonces SET used = 1
            WHERE wallet = ? AND used = 0 AND expires_at >= ?
            """,
            (normalized.lower(), now),
        )
        if updated.rowcount != 1:
            raise ValueError("Sign-in request has already been used.")

        conn.execute(
            """
            INSERT INTO users (wallet, balance, plan, created_at)
            VALUES (?, NULL, NULL, ?)
            ON CONFLICT(wallet) DO NOTHING
            """,
            (normalized.lower(), now),
        )

    token = jwt.encode(
        {"sub": normalized.lower(), "iat": now, "exp": now + JWT_TTL_SECONDS},
        SECRET_KEY,
        algorithm="HS256",
    )
    return token


def require_auth(function: Callable[..., Any]) -> Callable[..., Any]:
    """التحقق من جلسة المحفظة في cookie آمنة أو من عميل Bearer قديم."""
    @wraps(function)
    def wrapped(*args: Any, **kwargs: Any) -> Any:
        token = request.cookies.get("nexus_session", "")
        if not token:
            authorization = request.headers.get("Authorization", "")
            scheme, _, bearer = authorization.partition(" ")
            token = bearer if scheme.lower() == "bearer" else ""
        if not token:
            return jsonify({"error": "A wallet session is required."}), 401
        if not SECRET_KEY:
            return jsonify({"error": "Wallet sign-in is not configured."}), 503
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            g.wallet = payload["sub"]
        except (jwt.InvalidTokenError, KeyError):
            return jsonify({"error": "Invalid or expired session."}), 401
        return current_app.ensure_sync(function)(*args, **kwargs)

    return wrapped
