---
name: NEXUS launch readiness
description: Project-specific release gates and truthful marketing constraints.
---

Do not describe NEXUS as ready for a public launch, secure, performance-tested, legally cleared, or profitable based on appearance or a single response-time observation. Before public sales or real funds, verify the code and contracts, run functional and realistic load tests, obtain an independent security review, and clarify KYC/AML, licensing, and terms with qualified counsel.

The user wants BSC Mainnet as the eventual destination. Their current choice is to prepare Mainnet requirements only, not to deploy. Testnet verification, release gates, exact configuration review, and explicit approval for each live transaction remain required.

For Mainnet, the user requires the Treasury to be a plain no-code EOA with a verified successful prior inbound transaction. Do not treat an EIP-7702 delegated account as satisfying that plain-EOA requirement unless the user explicitly changes it.

**Why:** The user shared a project review that identified these items as unfinished release prerequisites and warned against exaggerated profit or performance claims; they later stated that Mainnet is the desired destination and specified the Treasury checks.

**How to apply:** Keep prototype UI clearly labeled as a preview. Do not show invented statistics, returns, audit status, or live-data claims; track the release gates separately from UI work. Check the Treasury's bytecode and inbound history on-chain before Mainnet use. Treat Mainnet as a gated destination, never as permission to deploy automatically.
