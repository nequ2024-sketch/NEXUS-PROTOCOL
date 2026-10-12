# NEXUS Protocol — BSC Mainnet readiness checklist

## Scope and current status

This document prepares the requirements for a possible BSC Mainnet release. It is not approval to deploy, does not configure Mainnet, and does not claim that the project is ready for real funds.

| Gate | Current status |
| --- | --- |
| Local subscription contract tests | 13 pass in the current workspace |
| BSC Testnet deployment | Not done. The secure secrets request was dismissed; no transaction was sent |
| Deployed end-to-end subscription tests | Not done |
| Independent security review | Not done |
| Load testing | Not done |
| Legal, KYC/AML, and licensing review | Not done |
| BSC Mainnet configuration and deployment | Not implemented or authorized |

The supplied address `0xDcc63967f27B67c7e6bcfc3bA0c23Ba5f69d6705` was identified by the user as the NEXUS ERC-20 token, not a subscription manager. This document does not independently verify that address or its code.

## Blocking technical work

- [ ] **Keep Mainnet disabled until a separate Mainnet implementation is reviewed.** The current application and backend are configured for BSC Testnet (chain ID 97), and the public deployment record is Testnet-only. Add an explicit, separately tested BSC Mainnet configuration (chain ID 56, RPC, explorer verification, transaction verification, and UI network checks). Do not simply replace a token address or change a chain ID.
- [ ] **Complete and document a BSC Testnet rehearsal first.** Deploy with test-only wallets and a mock 18-decimal payment token; verify addresses and source; test subscription purchase with both payment tokens, entitlement gates, renewal opt-in/keeper flow, cancellation, expiry, upgrades, failed payments, duplicate transaction hashes, and backend access checks.
- [ ] **Reconcile the Mainnet token behavior.** Independently verify the NEXUS token address, bytecode/source, owner, decimals, transfer behavior, and fee rules. `SubscriptionManager` requires exact 18-decimal token transfers and rejects fee-on-transfer payments. Confirm that the deployed manager can receive NEXUS without a transfer fee, or that the actual token supports the required exemption.
- [ ] **Select and verify the Mainnet payment token.** Confirm the intended BSC stablecoin contract address and its on-chain decimals from authoritative sources. The subscription contract requires 18 decimals; do not assume a token named “USDT” has the correct address or behavior.
- [ ] **Resolve subscription upgrade pricing before deployment.** The current proration formula compares each plan's price per unit of its own duration while preserving the old expiration. For PRO ($199/30 days) → ENTERPRISE ($999/365 days) with 15 days remaining, the old-plan credit is $99.50 and the new-plan prorated cost is about $41.10, so the current contract charges zero and grants Enterprise access until the existing expiry. Decide whether this is intended; update terms, contract, UI, and tests together.
- [ ] **Decide emergency controls.** Review whether plan deactivation alone is sufficient to stop new subscriptions/renewals, or whether the contract needs an audited pause/recovery mechanism and clear user-access behavior.
- [ ] **Prove role and treasury controls.** The current Testnet deployment script defaults several roles to the deployer if separate addresses are absent. For Mainnet, assign owner/treasury to reviewed, independently controlled addresses—preferably a multisig—and use a dedicated, limited keeper. Verify role grant, revocation, withdrawal, and recovery procedures.
- [ ] **Run an independent security review.** Cover Solidity contracts, constructor arguments, token compatibility, keeper authorization, payment/renewal consent, upgrade math, backend transaction verification, rate limits, authentication, and deployment scripts. Fix findings and rerun tests; re-review material changes.
- [ ] **Add deployed-chain and failure-path tests.** Test underpayment, unsupported/fee-on-transfer tokens, expired subscriptions, insufficient renewal allowance/balance, keeper failure, duplicate/replayed transaction hashes, RPC/BscScan outages, unauthorized plan changes, and recovery behavior.

## Mainnet operations and release controls

- [ ] Keep all secrets in Replit Secrets or an approved custody/signing system. Never place keys in source code, deployment records, chat, or browser storage. Do not reuse a Testnet wallet key for Mainnet.
- [ ] Prefer multisig or hardware-backed approvals for owner/treasury actions. Establish who can deploy, change plans, authorize/revoke keepers, and withdraw funds.
- [ ] Configure and test Mainnet RPC, BSC PoA middleware, BscScan verification, transaction receipt/event checks, duplicate-hash storage, alerting, backups, and incident response.
- [ ] Publish verified source and constructor arguments for every deployed contract. Record chain ID, addresses, role holders, token decimals, plan values, transaction hashes, and verification links in a reviewed release record.
- [ ] Run realistic load and failure testing against the backend; publish no unsupported response-time, user-count, profitability, or AI-accuracy claims.
- [ ] Obtain qualified legal advice on jurisdictions, licensing, KYC/AML, sanctions screening, consumer disclosures, auto-renewal consent, privacy, terms, and refund/cancellation rules.
- [ ] Require a separate explicit user approval for each live Mainnet deployment or other irreversible transaction. A successful Testnet rehearsal does not authorize Mainnet deployment.

## Product values to re-confirm for Mainnet

These are the currently recorded product decisions, not an authorization to deploy them on Mainnet:

- STARTER: 49 USDT for 30 days; signals.
- PRO: 199 USDT for 30 days; signals and bot access.
- ENTERPRISE: 999 USDT total for 365 days; all features and API access.
- NEXUS subscription pricing: fixed at 80 NEXUS per 1 USDT.
- Auto-renew is off by default and requires explicit opt-in plus a separate token allowance.
- Any live trading order requires explicit user confirmation; unattended trading remains off.

Reconfirm payment token, prices, entitlements, upgrade behavior, keeper policy, treasury, and legal disclosures before any Mainnet release.
