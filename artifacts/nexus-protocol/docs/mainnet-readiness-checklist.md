# NEXUS Protocol — BSC Mainnet readiness checklist

## Scope and current status

This document prepares the requirements for a possible BSC Mainnet release. It is not approval to deploy, does not configure Mainnet, and does not claim that the project is ready for real funds.

| Gate | Current status |
| --- | --- |
| Local subscription contract tests | 16 pass in the current workspace |
| BSC Testnet deployment | Not done; the current request is to prepare a direct Mainnet path, and no chain transaction was sent |
| Deployed end-to-end subscription tests | Not done |
| Independent security review | Not done |
| Load testing | Not done |
| Legal, KYC/AML, and licensing review | Not done |
| BSC Mainnet configuration | Separate chain config, address preflight, gated deploy, and verify scripts prepared |
| BSC Mainnet deployment | Not authorized or sent; preflight is blocked by the Treasury address checks below |

The supplied address `0xDcc63967f27B67c7e6bcfc3bA0c23Ba5f69d6705` was identified by the user as the NEXUS ERC-20 token, not a subscription manager. This document does not independently verify that address or its code.

## Read-only address check

Queried a public BSC Mainnet RPC at block `127402971` (`2026-10-13T12:30:02Z`). This is a point-in-time observation, not an explorer source-verification or security audit.

| Address | On-chain result | Status |
| --- | --- | --- |
| NEXUS `0xDcc63967f27B67c7e6bcfc3bA0c23Ba5f69d6705` | Contract code present (10,605 bytes); `name()` = `Nexus Protocol`, `symbol()` = `NEXUS`, `decimals()` = 18 | Requested metadata matches |
| USDT `0x55d398326f99059fF775485246999027B3197955` | Contract code present (4,413 bytes); `name()` = `Tether USD`, `symbol()` = `USDT`, `decimals()` = 18 | Requested metadata matches |
| Treasury `0x03884d36AE674bFa3B2b54b3bff92E13405389AF` | Code is `0xef010063c0c19a282a1b52b07dd5a65b58948a07dae32b` (23 bytes), matching an EIP-7702 delegation designator to `0x63c0c19a282a1b52b07dd5a65b58948a07dae32b`; transaction count 17; current native balance approximately 0.0063132173 BNB | **Not a plain no-code EOA.** Prior inbound transaction history could not be verified from an explorer in this session. |

The Treasury fails the requested EOA-only check. Its nonzero nonce and balance indicate an active address but do not, by themselves, prove a successful prior inbound transaction. The explorer history check therefore remains unverified; the read-only checker and deploy script require a BscScan API key for that check. Do not deploy with this Treasury address unless the owner explicitly changes the EOA requirement or supplies a plain EOA address that passes preflight.

## Blocking technical work

- [ ] **Review the separate Mainnet implementation.** The Hardhat Mainnet network, metadata preflight, deploy guard, and source-verification script are separate from Testnet. The web app and backend remain Testnet-only; do not change only the chain ID or point the existing UI at Mainnet.
- [ ] **Record the requested Testnet skip accurately.** The user requested a direct Mainnet path; no Testnet deployment was performed. Contract tests here are local-only and do not count as a deployed-chain rehearsal.
- [ ] **Reconcile the Mainnet token behavior.** Independently verify the NEXUS token address, bytecode/source, owner, decimals, transfer behavior, and fee rules. `SubscriptionManager` requires exact 18-decimal transfers to the treasury and rejects fee-on-transfer payments. Confirm the treasury receives the full NEXUS payment under the deployed token's fee configuration.
- [ ] **Select and verify the Mainnet payment token.** Confirm the intended BSC stablecoin contract address and its on-chain decimals from authoritative sources. The subscription contract requires 18 decimals; do not assume a token named “USDT” has the correct address or behavior.
- [ ] **Verify the selected upgrade floor and direct treasury routing.** The source now charges the greater of the prorated price difference and 15% of the new plan's full USDT price (149.85 USDT / 11,988 NEXUS for ENTERPRISE), preserves expiry, and routes payments directly to the constructor-fixed treasury. Local contract tests cover both payment tokens, renewal, accidental-balance recovery, and zero retained payment balances; verify the treasury address and token fee behavior before any live deployment.
- [ ] **Decide emergency controls.** Review whether plan deactivation alone is sufficient to stop new subscriptions/renewals, or whether the contract needs an audited pause/recovery mechanism and clear user-access behavior.
- [ ] **Prove role and treasury controls.** The current Testnet deployment script defaults several roles to the deployer if separate addresses are absent. For Mainnet, assign owner/treasury to reviewed, independently controlled addresses—preferably a multisig—and use a dedicated, limited keeper. Verify role grant, revocation, withdrawal, and recovery procedures.
- [ ] **Run an independent security review.** Cover Solidity contracts, constructor arguments, token compatibility, keeper authorization, payment/renewal consent, upgrade math, backend transaction verification, rate limits, authentication, and deployment scripts. Fix findings and rerun tests; re-review material changes.
- [ ] **Add deployed-chain and failure-path tests.** Test underpayment, unsupported/fee-on-transfer tokens, expired subscriptions, insufficient renewal allowance/balance, keeper failure, duplicate/replayed transaction hashes, RPC/BscScan outages, unauthorized plan changes, and recovery behavior.

## Mainnet operations and release controls

- [ ] Keep all secrets in Replit Secrets or an approved custody/signing system. Never place keys in source code, deployment records, chat, or browser storage. Do not reuse a Testnet wallet key for Mainnet.
- [ ] Run `pnpm --filter @workspace/nexus-protocol run check:mainnet-addresses` for a read-only address report. `deploy:mainnet` also requires a separate Mainnet key, owner and keeper addresses, successful prior-inbound history verification, the 0.02 BNB balance threshold, and an explicit deployment confirmation.
- [ ] Keep the Mainnet deployment record private to the workspace until the Mainnet web application and backend have their own reviewed chain-56 support.
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
