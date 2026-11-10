---
name: NEXUS launch readiness
description: Project-specific release gates and truthful marketing constraints.
---

Do not describe NEXUS as ready for a public launch, secure, performance-tested, legally cleared, or profitable based on appearance or a single response-time observation. Before public sales or real funds, verify the code and contracts, run functional and realistic load tests, obtain an independent security review, and clarify KYC/AML, licensing, and terms with qualified counsel.

The existing NEXUS token at `0xDcc63967f27B67c7e6bcfc3bA0c23Ba5f69d6705` is source-verified on BscScan with an exact-match result using Solidity 0.8.34 and optimization disabled. **Why:** BscScan verification confirms a compiler/source match, not an independent security audit. **How to apply:** Report it as source-verified only; keep security, legal, and operational launch gates separate.

The user wants BSC Mainnet as the eventual destination. Their current choice is to prepare Mainnet requirements only, not to deploy. Testnet verification, release gates, exact configuration review, and explicit approval for each live transaction remain required.

For Mainnet, the user requires the Treasury to be a plain no-code EOA with a verified successful prior inbound transaction. Do not treat an EIP-7702 delegated account as satisfying that plain-EOA requirement unless the user explicitly changes it.

Do not deploy using the selected Treasury until the user confirms they disabled its EIP-7702 delegation and a fresh on-chain check returns empty code.

**Why:** The user shared a project review that identified these items as unfinished release prerequisites and warned against exaggerated profit or performance claims; they later stated that Mainnet is the desired destination, specified the Treasury checks, and explicitly required confirmation before deployment after removing delegation.

**How to apply:** Keep prototype UI clearly labeled as a preview. Do not show invented statistics, returns, audit status, or live-data claims; track the release gates separately from UI work. Check the Treasury's bytecode and inbound history on-chain before Mainnet use. Wait for the user's confirmation after a delegation change, then recheck before any deployment. Treat Mainnet as a gated destination, never as permission to deploy automatically.
