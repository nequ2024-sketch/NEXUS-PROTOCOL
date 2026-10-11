# إشعارات Telegram اختيارية؛ لا يُخزن الرمز في المصدر ولا يُتجاوز غيابه.
import logging
from urllib.parse import quote

import requests

from .config import TG_CHAT_ID, TG_TOKEN, required

logger = logging.getLogger(__name__)


def send_telegram(text: str) -> bool:
    """إرسال تنبيه Telegram، مع نتيجة صريحة عند الإخفاق."""
    token = required("TG_TOKEN", TG_TOKEN)
    chat_id = required("TG_CHAT_ID", TG_CHAT_ID)
    url = f"https://api.telegram.org/bot{quote(token, safe='')}/sendMessage"
    try:
        response = requests.post(
            url,
            json={"chat_id": chat_id, "text": text, "disable_web_page_preview": True},
            timeout=10,
        )
        response.raise_for_status()
        result = response.json()
        if not result.get("ok"):
            logger.error("Telegram API rejected the notification.")
            return False
        return True
    except requests.RequestException as error:
        logger.error("Telegram notification failed: %s", error)
        return False
