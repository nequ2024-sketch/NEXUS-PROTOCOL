import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import hre from "hardhat";
import { inspectMainnetAddresses, MAINNET_ADDRESSES } from "./mainnet-addresses.js";

const { ethers, network } = hre;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXPECTED_CHAIN_ID = 56n;
const MIN_DEPLOYER_BALANCE = ethers.parseEther("0.02");
const DEPLOYMENT_CONFIRMATION = "DEPLOY_SUBSCRIPTION_MANAGER_ON_BSC_MAINNET";
const PLAN_CONFIG = [
  { id: 1, name: "STARTER", priceUSDT: "49", priceNEXUS: "3920", durationDays: 30 },
  { id: 2, name: "PRO", priceUSDT: "199", priceNEXUS: "15920", durationDays: 30 },
  { id: 3, name: "ENTERPRISE", priceUSDT: "999", priceNEXUS: "79920", durationDays: 365 },
];

function requiredAddress(name) {
  const raw = process.env[name]?.trim();
  if (!raw || !ethers.isAddress(raw)) throw new Error(`${name} must be configured with a valid address.`);
  const normalized = ethers.getAddress(raw.toLowerCase());
  if (normalized === ethers.ZeroAddress) throw new Error(`${name} cannot be the zero address.`);
  return normalized;
}

async function waitForConfirmed(label, txPromise) {
  const tx = await txPromise;
  const receipt = await tx.wait(2);
  if (!receipt || receipt.status !== 1) throw new Error(`${label} did not confirm successfully.`);
  console.log(`${label}: ${receipt.hash}`);
  return receipt;
}

function saveRecord(filePath, record) {
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(record, null, 2)}\n`);
  fs.renameSync(tempPath, filePath);
}

async function main() {
  if (network.name !== "bscMainnet") {
    throw new Error("Mainnet deployment is restricted to the bscMainnet Hardhat network.");
  }
  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(`Expected BSC Mainnet chain ID 56; received ${chainId}.`);
  }

  if (!process.env.BSC_MAINNET_PRIVATE_KEY) {
    throw new Error("BSC_MAINNET_PRIVATE_KEY must be configured through Replit Secrets.");
  }
  if (!process.env.BSCSCAN_MAINNET_API_KEY) {
    throw new Error("BSCSCAN_MAINNET_API_KEY is required for explorer history checks and source verification.");
  }
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No Mainnet signer is configured.");

  const balance = await ethers.provider.getBalance(deployer.address);
  if (balance < MIN_DEPLOYER_BALANCE) {
    throw new Error("Mainnet deployer needs at least 0.02 BNB for deployment and setup transactions.");
  }
  const ownerAddress = requiredAddress("BSC_MAINNET_OWNER_ADDRESS");
  const keeperAddress = requiredAddress("BSC_MAINNET_KEEPER_ADDRESS");
  if (ownerAddress.toLowerCase() === deployer.address.toLowerCase()) {
    throw new Error("Use a separately reviewed Mainnet owner address; do not leave ownership with the deployer.");
  }

  const recordPath = path.join(__dirname, "..", "deployments", "bsc-mainnet.json");
  if (fs.existsSync(recordPath)) {
    throw new Error("deployments/bsc-mainnet.json already exists; refusing to create a second manager automatically.");
  }

  const addressReport = await inspectMainnetAddresses();
  console.log(JSON.stringify(addressReport, null, 2));
  if (!addressReport.deploymentReady) {
    throw new Error("Mainnet address preflight failed. Resolve every blocker before deployment.");
  }
  if (process.env.MAINNET_DEPLOYMENT_CONFIRMATION !== DEPLOYMENT_CONFIRMATION) {
    throw new Error(
      `Set MAINNET_DEPLOYMENT_CONFIRMATION=${DEPLOYMENT_CONFIRMATION} only after reviewing the final release.`,
    );
  }

  const usdtAddress = ethers.getAddress(MAINNET_ADDRESSES.usdt.toLowerCase());
  const nexusAddress = ethers.getAddress(MAINNET_ADDRESSES.nexus.toLowerCase());
  const treasuryAddress = ethers.getAddress(MAINNET_ADDRESSES.treasury.toLowerCase());
  const manager = await (
    await ethers.getContractFactory("SubscriptionManager")
  ).deploy(usdtAddress, nexusAddress, treasuryAddress);
  const managerAddress = await manager.getAddress();
  const deployReceipt = await manager.deploymentTransaction().wait(2);
  if (!deployReceipt || deployReceipt.status !== 1) {
    throw new Error("SubscriptionManager deployment did not confirm successfully.");
  }

  const record = {
    status: "deployed_setup_pending",
    network: "bscMainnet",
    chainId: 56,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    owner: deployer.address,
    intendedOwner: ownerAddress,
    keeper: keeperAddress,
    treasury: treasuryAddress,
    paymentToken: usdtAddress,
    paymentTokenSymbol: "USDT",
    paymentTokenDecimals: 18,
    nexusToken: nexusAddress,
    subscriptionManager: managerAddress,
    deploymentTransactionHash: deployReceipt.hash,
    setupTransactions: {},
    subscriptionPlans: PLAN_CONFIG.map((plan) => ({ ...plan })),
  };
  fs.mkdirSync(path.dirname(recordPath), { recursive: true });
  saveRecord(recordPath, record);

  for (const plan of PLAN_CONFIG) {
    const receipt = await waitForConfirmed(
      `Create ${plan.name} plan`,
      manager.createPlan(
        plan.name,
        ethers.parseUnits(plan.priceUSDT, 18),
        ethers.parseUnits(plan.priceNEXUS, 18),
        BigInt(plan.durationDays) * 86_400n,
      ),
    );
    record.setupTransactions[`plan${plan.id}`] = receipt.hash;
    saveRecord(recordPath, record);
  }

  const keeperReceipt = await waitForConfirmed(
    "Authorize subscription keeper",
    manager.setKeeper(keeperAddress, true),
  );
  record.setupTransactions.setKeeper = keeperReceipt.hash;
  saveRecord(recordPath, record);

  const ownershipReceipt = await waitForConfirmed(
    "Transfer manager ownership",
    manager.transferOwnership(ownerAddress),
  );
  record.setupTransactions.transferOwnership = ownershipReceipt.hash;
  record.owner = ownerAddress;
  record.status = "deployed";
  saveRecord(recordPath, record);

  console.log(`SubscriptionManager deployed at ${managerAddress}`);
  console.log(`Deployment record: ${path.relative(process.cwd(), recordPath)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "BSC Mainnet deployment failed.");
  process.exitCode = 1;
});
