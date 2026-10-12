# NEXUS trading rollout — Testnet gates

This plan describes the current controlled Binance Spot Testnet scope. It is not a claim that a public launch, automated strategy, or Mainnet trading is ready.

## Currently implemented

- Public Binance Spot market prices and technical-rule previews are informational only.
- Order previews use Binance Spot Testnet. An individual, fresh preview must be explicitly confirmed before each order.
- The service is hard-wired to Spot Testnet, supports USDT-quoted Spot pairs, limits an order to 50 USDT equivalent, and applies per-wallet/global daily order-count limits.
- The server records sanitized Binance `FULL` fill details and builds a wallet-scoped average-cost ledger from fills submitted through this app.
- Realized PnL includes base-asset and USDT commissions. PnL is marked incomplete when any fill is invalid, tracked inventory is insufficient, or a fee is paid in another asset whose USDT value is unavailable.
- Auto-trading stays off. An RSI/EMA preview never submits an order.

## Limits that remain explicit

- The shared exchange account's full balance, trades placed outside NEXUS, unrealized PnL, equity drawdown, and current inventory are not represented by the app's wallet-scoped ledger.
- The 2% per-position equity limit and 5% daily loss stop are not active. They require reliable, fresh account equity and a defined reset/valuation policy; applying fabricated or incomplete balances would create a false safety signal.
- Stop-loss/take-profit and OCO orders are not active. Before implementation, confirm the exact Spot Testnet endpoint and order-list behavior from authoritative Binance documentation, then add a review/approval experience that makes every submitted leg and cancellation explicit.
- NEXUS is not assumed to be a Binance quote asset, and the Testnet order panel does not route through BSC or trade using NEXUS.
- Testnet credentials are server-side only. Without them, order execution remains unavailable; never move them into browser code.

## Gates before expanding scope

1. **Fill and accounting verification:** Test partial fills, rejections, unknown responses, duplicate callbacks, several orders in one second, each commission asset, and wallet/account mismatch. Reconcile recorded fills against Binance Testnet order queries.
2. **Risk controls:** Define balance source, freshness, valuation currency, shared-account ownership, daily boundary, and fail-closed behavior. Add tests that prove stale/missing balances reject every order. Keep the order preview and separate confirmation even after risk checks are added.
3. **Conditional exits:** Verify Binance Spot Testnet support for each proposed order type. Test placement, partial execution, cancellation, restart/recovery, and duplicate submission. Require a distinct explicit review before placement; do not let a bot submit exits on the user's behalf.
4. **Operational review:** Complete independent security review, load testing, legal/KYC/AML review, terms/privacy and incident procedures before any real-funds deployment discussion.
5. **Production release:** Treat Mainnet, autonomous execution, subscription/billing, NEXUS-denominated trades, and performance claims as separate gated projects. None is enabled by this Testnet ledger work.

## Verification and data semantics

The ledger is an audit view of fills known to NEXUS for the signed-in wallet, not a Binance account statement. Cost basis uses average cost, not tax-lot accounting. The UI must preserve unknown values as unknown, and must not present incomplete PnL as zero.
