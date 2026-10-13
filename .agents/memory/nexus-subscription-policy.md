---
name: NEXUS subscription policy
description: User-approved NEXUS plan pricing, entitlements, conversion rate, upgrade behavior, and renewal consent rules.
---

- FREE has no paid features.
- STARTER costs 49 USDT for 30 days and includes signals.
- PRO costs 199 USDT for 30 days and includes signals and bot access.
- ENTERPRISE costs 999 USDT total for 365 days and includes all features and API access.
- NEXUS payments use a fixed rate of 80 NEXUS per 1 USDT; USDT and NEXUS use 18 decimals.
- Upgrades keep the existing expiry timestamp and charge the greater of the prorated price difference or 25% of the new plan's full USDT price (converted at 80 NEXUS per USDT).
- Auto-renew is off by default. Enabling it requires explicit opt-in and a separate unlimited-token-allowance approval. Cancellation disables future renewal without removing paid access before expiry.
- Build and verify the subscription system on BSC Testnet before any Mainnet use.

**Why:** The user explicitly chose these plan prices, entitlements, conversion rate, a 25% upgrade minimum to prevent zero-cost tier upgrades, and renewal safety controls.

**How to apply:** Keep contract initialization, entitlement gates, subscription UI, and renewal operations consistent with these terms; do not present Testnet deployment as Mainnet-ready.
