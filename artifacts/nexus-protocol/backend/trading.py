"""Binance Spot Testnet-only market quotes and explicitly confirmed orders."""
from __future__ import annotations

import hashlib
import hmac
import re
import time
from decimal import Decimal, InvalidOperation, ROUND_DOWN
from typing import Any
from urllib.parse import urlencode

import requests

from . import config

BINANCE_TESTNET_API = "https://testnet.binance.vision"
MAX_ORDER_USDT = Decimal("50")
QUOTE_TTL_SECONDS = 60
SYMBOL_PATTERN = re.compile(r"^[A-Z0-9]{3,20}$")


class TradingError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


class BinanceError(TradingError):
    pass


def _require_ready() -> tuple[str, str]:
    if not config.TESTNET_TRADING_READY:
        raise TradingError(
            "Binance Spot Testnet is not configured. Orders remain disabled.",
            503,
        )
    if not config.BINANCE_API_KEY or not config.BINANCE_API_SECRET:
        raise TradingError("Binance Testnet credentials are unavailable.", 503)
    return config.BINANCE_API_KEY, config.BINANCE_API_SECRET


def _decimal(value: Any, label: str) -> Decimal:
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise TradingError(f"{label} must be a valid decimal number.") from None
    if not result.is_finite() or result <= 0:
        raise TradingError(f"{label} must be greater than zero.")
    return result


def _get_testnet_json(path: str, params: dict[str, str]) -> Any:
    try:
        response = requests.get(
            f"{BINANCE_TESTNET_API}{path}", params=params, timeout=10
        )
    except requests.RequestException:
        raise TradingError("Binance Testnet did not respond to the quote request.", 502) from None
    try:
        body = response.json()
    except ValueError:
        raise TradingError("Binance Testnet returned an unreadable response.", 502) from None
    if not response.ok:
        message = body.get("msg") if isinstance(body, dict) else None
        safe_message = str(message or "Market data request failed.")[:180]
        raise TradingError(f"Binance Testnet: {safe_message}", 502)
    return body


def build_order_quote(symbol: Any, side: Any, raw_amount: Any) -> dict[str, str]:
    """Validate a Testnet-listed USDT Spot market and create a conservative preview."""
    _require_ready()
    if not isinstance(symbol, str) or not SYMBOL_PATTERN.fullmatch(symbol):
        raise TradingError("Choose a valid Binance Testnet symbol.")
    if not isinstance(side, str) or side not in {"BUY", "SELL"}:
        raise TradingError("Order side must be BUY or SELL.")
    if isinstance(raw_amount, bool) or len(str(raw_amount)) > 64:
        raise TradingError("Order amount is invalid.")
    amount = _decimal(raw_amount, "Order amount")

    info = _get_testnet_json("/api/v3/exchangeInfo", {"symbol": symbol})
    rows = info.get("symbols") if isinstance(info, dict) else None
    if not isinstance(rows, list) or not rows:
        raise TradingError(f"{symbol} is not listed on Binance Spot Testnet.", 422)
    market = rows[0]
    if (
        market.get("symbol") != symbol
        or market.get("status") != "TRADING"
        or market.get("isSpotTradingAllowed") is not True
    ):
        raise TradingError(f"{symbol} is not currently enabled for Spot trading on Testnet.", 422)
    if market.get("quoteAsset") != "USDT":
        raise TradingError(
            "Testnet orders currently support USDT-quoted Spot pairs only.", 422
        )
    if side == "BUY" and market.get("quoteOrderQtyMarketAllowed") is not True:
        raise TradingError(
            f"{symbol} does not support a fixed-USDT market buy on Testnet.", 422
        )

    filters = {
        str(item.get("filterType")): item
        for item in market.get("filters", [])
        if isinstance(item, dict)
    }
    lot_filter = filters.get("MARKET_LOT_SIZE")
    if not lot_filter or Decimal(str(lot_filter.get("stepSize", "0"))) <= 0:
        lot_filter = filters.get("LOT_SIZE")
    if not lot_filter:
        raise TradingError("Testnet did not provide a valid market quantity filter.", 502)
    try:
        step = Decimal(str(lot_filter.get("stepSize")))
        min_quantity = Decimal(str(lot_filter.get("minQty")))
        max_quantity = Decimal(str(lot_filter.get("maxQty", "0")))
    except InvalidOperation:
        raise TradingError("Testnet returned an invalid market quantity filter.", 502) from None
    if (
        not step.is_finite()
        or not min_quantity.is_finite()
        or not max_quantity.is_finite()
        or step <= 0
        or min_quantity < 0
        or max_quantity < 0
    ):
        raise TradingError("Testnet returned an invalid market quantity filter.", 502)

    book = _get_testnet_json("/api/v3/ticker/bookTicker", {"symbol": symbol})
    if not isinstance(book, dict) or book.get("symbol") != symbol:
        raise TradingError("Testnet did not return a current order-book quote.", 502)
    reference_price = _decimal(
        book.get("askPrice") if side == "BUY" else book.get("bidPrice"),
        "Testnet reference price",
    )

    if side == "BUY":
        quote_quantity = amount
        estimated_base = (quote_quantity / reference_price / step).to_integral_value(
            rounding=ROUND_DOWN
        ) * step
        if quote_quantity > MAX_ORDER_USDT:
            raise TradingError(
                f"Each shared-account Testnet order is limited to {MAX_ORDER_USDT} USDT."
            )
    else:
        estimated_base = amount
        if estimated_base % step != 0:
            raise TradingError(f"Sell quantity must be a multiple of {step}.")
        quote_quantity = estimated_base * reference_price
        if quote_quantity > MAX_ORDER_USDT:
            raise TradingError(
                f"Each shared-account Testnet order is limited to {MAX_ORDER_USDT} USDT equivalent."
            )

    if estimated_base < min_quantity or (max_quantity > 0 and estimated_base > max_quantity):
        raise TradingError(
            f"Order size is outside Testnet market limits ({min_quantity}–{max_quantity} {market.get('baseAsset', '')})."
        )
    for filter_name in ("MIN_NOTIONAL", "NOTIONAL"):
        notional_filter = filters.get(filter_name)
        if notional_filter:
            applies_min = notional_filter.get(
                "applyMinToMarket",
                notional_filter.get("applyToMarket", True),
            )
            applies_max = notional_filter.get("applyMaxToMarket", True)
            if str(applies_min).lower() == "true":
                min_notional = Decimal(str(notional_filter.get("minNotional", "0")))
                if quote_quantity < min_notional:
                    raise TradingError(
                        f"Order is below the Testnet minimum notional of {min_notional} USDT."
                    )
            max_notional = Decimal(str(notional_filter.get("maxNotional", "0")))
            if (
                max_notional > 0
                and str(applies_max).lower() == "true"
                and quote_quantity > max_notional
            ):
                raise TradingError(
                    f"Order is above the Testnet maximum notional of {max_notional} USDT."
                )

    return {
        "symbol": symbol,
        "side": side,
        "amount": format(amount, "f"),
        "baseAsset": str(market.get("baseAsset", "")),
        "quoteAsset": "USDT",
        "referencePrice": format(reference_price, "f"),
        "estimatedBaseQty": format(estimated_base, "f"),
        "estimatedQuoteQty": format(quote_quantity, "f"),
        "amountUnit": "USDT" if side == "BUY" else str(market.get("baseAsset", "")),
    }


def submit_confirmed_market_order(
    quote: dict[str, Any], client_order_id: str
) -> dict[str, Any]:
    """Submit one MARKET order to the hard-coded Spot Testnet endpoint."""
    api_key, api_secret = _require_ready()
    params: list[tuple[str, str]] = [
        ("symbol", str(quote["symbol"])),
        ("side", str(quote["side"])),
        ("type", "MARKET"),
    ]
    if quote["side"] == "BUY":
        params.append(("quoteOrderQty", str(quote["amount"])))
    else:
        params.append(("quantity", str(quote["amount"])))
    params.extend(
        [
            ("newClientOrderId", client_order_id),
            ("newOrderRespType", "FULL"),
            ("recvWindow", "5000"),
            ("timestamp", str(int(time.time() * 1000))),
        ]
    )
    signature = hmac.new(
        api_secret.encode("utf-8"),
        urlencode(params).encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    signed_params = [*params, ("signature", signature)]

    try:
        response = requests.post(
            f"{BINANCE_TESTNET_API}/api/v3/order",
            params=signed_params,
            headers={"X-MBX-APIKEY": api_key},
            timeout=10,
        )
    except requests.RequestException:
        raise TradingError(
            "Testnet response is uncertain. Do not retry this order; check the shared Binance Testnet account.",
            502,
        ) from None

    try:
        body = response.json()
    except ValueError:
        raise TradingError(
            "Testnet response is uncertain. Do not retry this order; check the shared Binance Testnet account.",
            502,
        ) from None
    if not response.ok:
        message = body.get("msg") if isinstance(body, dict) else None
        safe_message = str(message or "Testnet rejected the order.")[:180]
        if response.status_code >= 500:
            raise TradingError(
                "Testnet response is uncertain. Do not retry this order; check the shared Binance Testnet account.",
                502,
            )
        raise TradingError(f"Binance Testnet rejected the order: {safe_message}", 422)
    if not isinstance(body, dict) or body.get("symbol") != quote["symbol"]:
        raise TradingError(
            "Testnet response could not be verified. Check the shared account before retrying.",
            502,
        )

    raw_fills = body.get("fills")
    fills = [
        {
            "price": str(fill.get("price", "")),
            "qty": str(fill.get("qty", "")),
            "commission": str(fill.get("commission", "")),
            "commissionAsset": str(fill.get("commissionAsset", "")),
        }
        for fill in raw_fills
        if isinstance(fill, dict)
    ] if isinstance(raw_fills, list) else []

    return {
        "exchangeOrderId": str(body.get("orderId", "")),
        "clientOrderId": str(body.get("clientOrderId", client_order_id)),
        "status": str(body.get("status", "UNKNOWN")),
        "executedBaseQty": str(body.get("executedQty", "0")),
        "executedQuoteQty": str(body.get("cummulativeQuoteQty", "0")),
        "fills": fills,
    }
