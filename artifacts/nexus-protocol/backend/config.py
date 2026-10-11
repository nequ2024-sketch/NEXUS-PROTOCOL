# إعدادات خادم NEXUS؛ لا توجد مفاتيح أو بيانات اعتماد افتراضية.
import os

from dotenv import load_dotenv

load_dotenv()

BASE_PATH = os.getenv("BASE_PATH", "").rstrip("/")
API_PREFIX = f"{BASE_PATH}/api"
DB_NAME = os.getenv("DB_NAME", "nexus.db")
SECRET_KEY = os.getenv("SECRET_KEY") or os.getenv("SESSION_SECRET")
TG_TOKEN = os.getenv("TG_TOKEN")
TG_CHAT_ID = os.getenv("TG_CHAT_ID")
BSCSCAN_KEY = os.getenv("BSCSCAN_KEY")
BSC_TESTNET_RPC = os.getenv(
    "BSC_TESTNET_RPC", "https://data-seed-prebsc-1-s1.binance.org:8545/"
)
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "").split(",")
    if origin.strip()
]
ENABLE_TESTNET_TRADING = os.getenv("ENABLE_TESTNET_TRADING", "").lower() == "true"
ENABLE_AUTO_TRADE = os.getenv("ENABLE_AUTO_TRADE", "").lower() == "true"
BINANCE_TESTNET = os.getenv("BINANCE_TESTNET", "").lower() == "true"
BINANCE_API_KEY = os.getenv("BINANCE_API_KEY")
BINANCE_API_SECRET = os.getenv("BINANCE_API_SECRET")
TESTNET_TRADING_READY = (
    ENABLE_TESTNET_TRADING
    and BINANCE_TESTNET
    and bool(BINANCE_API_KEY)
    and bool(BINANCE_API_SECRET)
)
AUTO_TRADING_READY = ENABLE_AUTO_TRADE and TESTNET_TRADING_READY


def required(name: str, value: str | None) -> str:
    """إرجاع إعداد إلزامي برسالة صريحة عند غيابه."""
    if not value:
        raise RuntimeError(f"Missing required environment setting: {name}")
    return value
