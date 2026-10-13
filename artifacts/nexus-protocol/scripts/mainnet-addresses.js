import hre from "hardhat";

const { ethers } = hre;

export const MAINNET_ADDRESSES = Object.freeze({
  usdt: "0x55d398326f99059fF775485246999027B3197955",
  nexus: "0xDcc63967f27B67c7e6bcfc3bA0c23Ba5f69d6705",
  treasury: "0x03884d36AE674bFa3B2b54b3bff92E13405389AF",
});

const TOKEN_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

async function readToken(address, expected) {
  const code = await ethers.provider.getCode(address);
  if (code === "0x") {
    return {
      address,
      codeBytes: 0,
      name: null,
      symbol: null,
      decimals: null,
      valid: false,
    };
  }

  try {
    const token = new ethers.Contract(address, TOKEN_ABI, ethers.provider);
    const [name, symbol, decimals] = await Promise.all([
      token.name(),
      token.symbol(),
      token.decimals(),
    ]);
    const result = {
      address,
      codeBytes: (code.length - 2) / 2,
      name,
      symbol,
      decimals: Number(decimals),
    };
    return {
      ...result,
      valid:
        result.name === expected.name &&
        result.symbol === expected.symbol &&
        result.decimals === expected.decimals,
    };
  } catch {
    return {
      address,
      codeBytes: (code.length - 2) / 2,
      name: null,
      symbol: null,
      decimals: null,
      valid: false,
    };
  }
}

async function verifyInboundHistory(address) {
  const apiKey = process.env.BSCSCAN_MAINNET_API_KEY?.trim();
  if (!apiKey) {
    return { status: "not_verified", reason: "BSCSCAN_MAINNET_API_KEY is not configured." };
  }

  try {
    const url = new URL("https://api.bscscan.com/api");
    url.search = new URLSearchParams({
      module: "account",
      action: "txlist",
      address,
      startblock: "0",
      endblock: "99999999",
      page: "1",
      offset: "1000",
      sort: "asc",
      apikey: apiKey,
    }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!response.ok) {
      return { status: "unavailable", reason: `BscScan returned HTTP ${response.status}.` };
    }
    const payload = await response.json();
    if (payload.status !== "1" || !Array.isArray(payload.result)) {
      return {
        status: "unavailable",
        reason: typeof payload.result === "string" ? payload.result : "BscScan did not return a transaction list.",
      };
    }

    const inbound = payload.result.find(
      (tx) =>
        typeof tx.to === "string" &&
        tx.to.toLowerCase() === address.toLowerCase() &&
        tx.isError === "0" &&
        tx.hash,
    );
    if (!inbound) return { status: "not_found" };

    const receipt = await ethers.provider.getTransactionReceipt(inbound.hash);
    if (!receipt || receipt.status !== 1) return { status: "not_verified" };
    return {
      status: "verified",
      transactionHash: inbound.hash,
      blockNumber: Number(receipt.blockNumber),
    };
  } catch {
    return { status: "unavailable", reason: "Could not verify transaction history through BscScan." };
  }
}

export async function inspectMainnetAddresses() {
  const provider = ethers.provider;
  const network = await provider.getNetwork();
  const block = await provider.getBlock("latest");
  const addresses = {
    usdt: ethers.getAddress(MAINNET_ADDRESSES.usdt.toLowerCase()),
    nexus: ethers.getAddress(MAINNET_ADDRESSES.nexus.toLowerCase()),
    treasury: ethers.getAddress(MAINNET_ADDRESSES.treasury.toLowerCase()),
  };
  const [usdt, nexus] = await Promise.all([
    readToken(addresses.usdt, { name: "Tether USD", symbol: "USDT", decimals: 18 }),
    readToken(addresses.nexus, { name: "Nexus Protocol", symbol: "NEXUS", decimals: 18 }),
  ]);
  const treasuryAddress = addresses.treasury;
  const [treasuryCode, treasuryNonce, treasuryBalance, inboundHistory] = await Promise.all([
    provider.getCode(treasuryAddress),
    provider.getTransactionCount(treasuryAddress),
    provider.getBalance(treasuryAddress),
    verifyInboundHistory(treasuryAddress),
  ]);

  const delegationDesignator =
    treasuryCode.toLowerCase().startsWith("0xef0100") && treasuryCode.length === 48;
  const delegationTarget = delegationDesignator
    ? ethers.getAddress(`0x${treasuryCode.slice(8)}`)
    : null;
  const treasuryIsPlainEoa = treasuryCode === "0x";
  const chainId = Number(network.chainId);
  const blockers = [];
  if (chainId !== 56) blockers.push(`Connected to chain ${chainId}; expected BSC Mainnet (56).`);
  if (!usdt.valid) blockers.push("USDT address metadata did not match Tether USD / USDT / 18 decimals.");
  if (!nexus.valid) blockers.push("NEXUS address metadata did not match Nexus Protocol / NEXUS / 18 decimals.");
  if (!treasuryIsPlainEoa) {
    blockers.push(
      delegationDesignator
        ? "Treasury has EIP-7702 delegation. Please disable Smart Account in MetaMask."
        : "Treasury has on-chain bytecode; it is not a plain no-code EOA.",
    );
  }
  if (inboundHistory.status !== "verified") {
    blockers.push("A successful prior inbound transaction to the treasury was not verified.");
  }

  return {
    network: network.name,
    chainId,
    checkedAtBlock: block ? Number(block.number) : null,
    checkedAt: block ? new Date(Number(block.timestamp) * 1000).toISOString() : null,
    usdt,
    nexus,
    treasury: {
      address: treasuryAddress,
      codeBytes: (treasuryCode.length - 2) / 2,
      code: treasuryCode,
      isPlainEoa: treasuryIsPlainEoa,
      isEip7702DelegatedAccount: delegationDesignator,
      delegationTarget,
      transactionCount: treasuryNonce,
      nativeBalanceWei: treasuryBalance.toString(),
      nativeBalanceBnb: ethers.formatEther(treasuryBalance),
      inboundHistory,
    },
    deploymentReady: blockers.length === 0,
    blockers,
  };
}
