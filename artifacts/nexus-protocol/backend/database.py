# تخزين SQLite محلي بمفاتيح فريدة لمقاومة إعادة استخدام المعاملات والـ nonce.
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from .config import DB_NAME

DB_PATH = Path(DB_NAME)
if not DB_PATH.is_absolute():
    DB_PATH = Path(__file__).resolve().parent.parent / DB_PATH


def connect() -> sqlite3.Connection:
    """فتح اتصال مستقل مع تحويل الصفوف إلى sqlite3.Row."""
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


@contextmanager
def connection() -> Iterator[sqlite3.Connection]:
    """اتصال قصير بمعاملة تُعتمد تلقائياً أو تُلغى عند الخطأ."""
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def initialize() -> None:
    """إنشاء جداول المستخدمين والمعاملات والحجوزات مرة واحدة."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connection() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                wallet TEXT PRIMARY KEY,
                balance TEXT,
                plan TEXT,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS transactions (
                tx_hash TEXT PRIMARY KEY,
                wallet TEXT NOT NULL,
                amount TEXT,
                type TEXT NOT NULL,
                verified_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS auth_nonces (
                wallet TEXT PRIMARY KEY,
                nonce TEXT NOT NULL,
                message TEXT NOT NULL,
                expires_at INTEGER NOT NULL,
                used INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS reservations (
                wallet TEXT PRIMARY KEY,
                created_at INTEGER NOT NULL,
                telegram_sent INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS positions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                wallet TEXT NOT NULL,
                symbol TEXT NOT NULL,
                side TEXT NOT NULL,
                entry REAL NOT NULL,
                quantity REAL NOT NULL,
                size_usd REAL NOT NULL,
                tp REAL,
                sl REAL,
                exchange_order_id TEXT,
                status TEXT NOT NULL DEFAULT 'open',
                opened_at INTEGER NOT NULL,
                closed_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS trade_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                wallet TEXT NOT NULL,
                symbol TEXT NOT NULL,
                side TEXT NOT NULL,
                entry REAL NOT NULL,
                exit REAL NOT NULL,
                quantity REAL NOT NULL,
                pnl REAL NOT NULL,
                opened_at INTEGER NOT NULL,
                closed_at INTEGER NOT NULL,
                onchain_tx TEXT
            );
            CREATE TABLE IF NOT EXISTS trade_quotes (
                quote_id TEXT PRIMARY KEY,
                wallet TEXT NOT NULL,
                symbol TEXT NOT NULL,
                side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
                amount TEXT NOT NULL,
                reference_price TEXT NOT NULL,
                estimated_base_qty TEXT NOT NULL,
                estimated_quote_qty TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                used INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS trade_quotes_wallet_created
                ON trade_quotes(wallet, created_at);
            CREATE TABLE IF NOT EXISTS trade_orders (
                quote_id TEXT PRIMARY KEY,
                wallet TEXT NOT NULL,
                client_order_id TEXT NOT NULL UNIQUE,
                exchange_order_id TEXT,
                symbol TEXT NOT NULL,
                side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
                amount TEXT NOT NULL,
                status TEXT NOT NULL,
                executed_base_qty TEXT,
                executed_quote_qty TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS trade_orders_wallet_created
                ON trade_orders(wallet, created_at DESC);
            """
        )
