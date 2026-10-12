"""Build wallet-scoped positions and realized PnL from actual Binance fills."""
from __future__ import annotations

import json
from decimal import Decimal, InvalidOperation
from typing import Any


ZERO = Decimal("0")


def _decimal(value: Any) -> Decimal:
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return ZERO
    return result if result.is_finite() else ZERO


def _read_fills(value: Any) -> list[dict[str, Any]]:
    if not value:
        return []
    try:
        parsed = json.loads(value) if isinstance(value, str) else value
    except (json.JSONDecodeError, TypeError):
        return []
    return [fill for fill in parsed if isinstance(fill, dict)] if isinstance(parsed, list) else []


def build_wallet_ledger(orders: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Calculate average-cost open positions and closed-order PnL.

    Fees paid in the base or USDT quote asset are included. Fees paid in a
    different asset are retained in the history but make that close's PnL
    incomplete instead of silently pretending the fee was zero.
    """
    inventory: dict[str, dict[str, Any]] = {}
    history: list[dict[str, Any]] = []

    for order in sorted(
        orders,
        key=lambda row: (
            int(row.get("created_at") or 0),
            int(row.get("ledger_sequence") or 0),
            str(row.get("quote_id") or ""),
        ),
    ):
        symbol = str(order.get("symbol") or "")
        if not symbol.endswith("USDT") or len(symbol) <= 4:
            continue
        base_asset = symbol[:-4]
        side = str(order.get("side") or "").upper()
        fills = _read_fills(order.get("fills_json"))
        order_time = int(order.get("updated_at") or order.get("created_at") or 0)
        row = {
            "quote_id": order.get("quote_id"),
            "exchange_order_id": order.get("exchange_order_id"),
            "symbol": symbol,
            "side": side,
            "status": str(order.get("status") or "UNKNOWN"),
            "quantity": 0.0,
            "entry": None,
            "exit": None,
            "pnl": None,
            "pnl_known": False,
            "fees": [],
            "created_at": int(order.get("created_at") or 0),
            "closed_at": order_time,
            "reason": "Actual fill details are unavailable.",
        }
        if not fills:
            history.append(row)
            continue

        gross_quantity = ZERO
        gross_quote = ZERO
        base_fee = ZERO
        quote_fee = ZERO
        other_fees: dict[str, Decimal] = {}
        valid_fills = 0
        for fill in fills:
            price = _decimal(fill.get("price"))
            quantity = _decimal(fill.get("qty"))
            commission = _decimal(fill.get("commission"))
            commission_asset = str(fill.get("commissionAsset") or "").upper()
            if price <= ZERO or quantity <= ZERO or commission < ZERO or not commission_asset:
                continue
            valid_fills += 1
            gross_quantity += quantity
            gross_quote += _decimal(fill.get("quoteQty")) or (price * quantity)
            if commission_asset == base_asset:
                base_fee += commission
            elif commission_asset == "USDT":
                quote_fee += commission
            elif commission:
                other_fees[commission_asset] = other_fees.get(commission_asset, ZERO) + commission
        if not valid_fills or gross_quantity <= ZERO:
            row["reason"] = "No complete, valid execution fills were available."
            history.append(row)
            continue
        fills_complete = valid_fills == len(fills)

        row["quantity"] = float(gross_quantity)
        row["fees"] = [
            {"asset": asset, "amount": float(amount)}
            for asset, amount in sorted(
                {**other_fees, base_asset: base_fee, "USDT": quote_fee}.items()
            )
            if amount > ZERO
        ]
        state = inventory.setdefault(
            symbol,
            {
                "quantity": ZERO,
                "cost_usdt": ZERO,
                "cost_complete": True,
                "opened_at": order_time,
            },
        )

        if side == "BUY":
            net_quantity = gross_quantity - base_fee
            cost = gross_quote + quote_fee
            if net_quantity <= ZERO:
                row["reason"] = "Buy fills did not produce a positive net base quantity."
                history.append(row)
                continue
            if state["quantity"] <= ZERO:
                state["opened_at"] = order_time
                state["cost_complete"] = True
                state["cost_usdt"] = ZERO
            state["quantity"] += net_quantity
            state["cost_usdt"] += cost
            if other_fees or not fills_complete:
                state["cost_complete"] = False
            row["entry"] = float(cost / net_quantity)
            row["reason"] = (
                "Buy fill recorded; realized PnL is not applicable."
                if fills_complete
                else "Some execution fills were invalid; position cost is incomplete."
            )
            history.append(row)
            continue

        if side != "SELL":
            row["reason"] = "Unsupported side in execution history."
            history.append(row)
            continue

        quantity_debited = gross_quantity + base_fee
        proceeds = gross_quote - quote_fee
        available_quantity = state["quantity"]
        average_entry = state["cost_usdt"] / available_quantity if available_quantity > ZERO else ZERO
        row["entry"] = float(average_entry) if average_entry > ZERO else None
        row["exit"] = float(gross_quote / gross_quantity)
        row["created_at"] = int(state["opened_at"] or order_time)
        row["quantity"] = float(quantity_debited)
        if available_quantity <= ZERO or quantity_debited > available_quantity:
            row["reason"] = "Sell exceeds this wallet's tracked Testnet fills; PnL cannot be verified."
            state["quantity"] = ZERO
            state["cost_usdt"] = ZERO
            state["cost_complete"] = False
            history.append(row)
            continue

        allocated_cost = state["cost_usdt"] * quantity_debited / available_quantity
        remaining_quantity = available_quantity - quantity_debited
        state["quantity"] = remaining_quantity
        state["cost_usdt"] -= allocated_cost
        if remaining_quantity == ZERO:
            state["cost_usdt"] = ZERO

        if state["cost_complete"] and not other_fees and fills_complete:
            realized = proceeds - allocated_cost
            row["pnl"] = float(realized)
            row["pnl_known"] = True
            row["reason"] = "Realized PnL includes base-asset and USDT commissions."
        else:
            row["reason"] = (
                "PnL is incomplete because one or more fills could not be fully valued."
                if not fills_complete
                else "PnL is incomplete because a commission was paid in another asset."
            )
        history.append(row)

    positions: list[dict[str, Any]] = []
    for symbol, state in inventory.items():
        quantity = state["quantity"]
        if quantity <= ZERO:
            continue
        positions.append(
            {
                "symbol": symbol,
                "side": "LONG",
                "entry": float(state["cost_usdt"] / quantity) if quantity else None,
                "quantity": float(quantity),
                "size_usd": float(state["cost_usdt"]),
                "pnl_known": bool(state["cost_complete"]),
                "opened_at": int(state["opened_at"]),
                "status": "open",
            }
        )
    return {
        "positions": sorted(positions, key=lambda position: position["opened_at"], reverse=True),
        "history": list(reversed(history)),
    }


def performance_summary(history: list[dict[str, Any]], since: int = 0) -> dict[str, Any]:
    recent = [
        row for row in history
        if row.get("side") == "SELL" and int(row.get("closed_at") or 0) >= since
    ]
    verified = [row for row in recent if row.get("pnl_known") and row.get("pnl") is not None]
    if not verified:
        return {
            "available": False,
            "reason": "No closed Testnet trades with fully valued fees are available.",
            "trades": 0,
            "incompleteTrades": len(recent),
            "netPnl": None,
            "winRate": None,
        }
    values = [float(row["pnl"]) for row in verified]
    return {
        "available": True,
        "trades": len(values),
        "incompleteTrades": len(recent) - len(verified),
        "netPnl": sum(values),
        "winRate": sum(value > 0 for value in values) / len(values) * 100,
        "averagePnl": sum(values) / len(values),
    }
