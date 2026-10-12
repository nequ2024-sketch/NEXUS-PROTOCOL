// نشر العقود على BSC Testnet فقط، مع التحقق الصريح من الشبكة والإعدادات.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import hre from "hardhat";
const { ethers, network } = hre;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function address(value, name) {
  if (!ethers.isAddress(value)) throw new Error(`${name} is not a valid address`);
  if (value === ethers.ZeroAddress) throw new Error(`${name} cannot be the zero address`);
  return value;
}

async function main() {
  if (network.name !== "bscTestnet") {
    throw new Error("Deployment is restricted to BSC Testnet (chain ID 97).");
  }
  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== 97n) throw new Error(`Expected chain ID 97; received ${chainId}.`);

  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("PRIVATE_KEY is required to deploy to BSC Testnet.");

  const treasury = address(
    process.env.TREASURY_ADDRESS || deployer.address,
    "TREASURY_ADDRESS",
  );
  const publisher = address(
    process.env.PUBLISHER_ADDRESS || deployer.address,
    "PUBLISHER_ADDRESS",
  );
  const deployMockPaymentToken =
    process.env.DEPLOY_TEST_MOCK_PAYMENT_TOKEN === "true";
  const configuredPaymentToken =
    process.env.BSC_TESTNET_PAYMENT_TOKEN_ADDRESS?.trim() || "";
  if (deployMockPaymentToken && configuredPaymentToken) {
    throw new Error(
      "Choose either DEPLOY_TEST_MOCK_PAYMENT_TOKEN or BSC_TESTNET_PAYMENT_TOKEN_ADDRESS, not both.",
    );
  }
  if (!deployMockPaymentToken && !configuredPaymentToken) {
    throw new Error(
      "Choose a Testnet payment token or set DEPLOY_TEST_MOCK_PAYMENT_TOKEN=true.",
    );
  }
  let paymentToken;
  if (deployMockPaymentToken) {
    const mock = await (
      await ethers.getContractFactory("MockPaymentToken")
    ).deploy();
    await mock.waitForDeployment();
    paymentToken = await mock.getAddress();
  } else {
    paymentToken = address(
      configuredPaymentToken,
      "BSC_TESTNET_PAYMENT_TOKEN_ADDRESS",
    );
  }
  const paymentTokenMetadata = await ethers.getContractAt(
    ["function decimals() view returns (uint8)", "function symbol() view returns (string)"],
    paymentToken,
  );
  const paymentTokenDecimals = await paymentTokenMetadata.decimals();
  if (paymentTokenDecimals !== 18n) {
    throw new Error("The configured payment token must use 18 decimals.");
  }
  const tokensPerUsdt = ethers.parseUnits(required("NEXUS_PER_USDT"), 18);
  const hardCap = ethers.parseUnits(
    required("PRESALE_HARD_CAP_NEXUS"),
    18,
  );
  const minPurchase = ethers.parseUnits(
    required("PRESALE_MIN_PURCHASE_USDT"),
    18,
  );
  const startSetting = required("PRESALE_START_TIMESTAMP");
  const start = startSetting.toLowerCase() === "now"
    ? BigInt(Math.floor(Date.now() / 1000))
    : BigInt(startSetting);
  const durationDays = BigInt(required("PRESALE_DURATION_DAYS"));
  if (durationDays <= 0n) throw new Error("PRESALE_DURATION_DAYS must be positive.");
  if (startSetting.toLowerCase() !== "now" && start < BigInt(Math.floor(Date.now() / 1000))) {
    throw new Error("PRESALE_START_TIMESTAMP must be in the future.");
  }
  if (hardCap > ethers.parseUnits("300000000", 18)) {
    throw new Error("Presale cap cannot exceed the 300,000,000 NEXUS inventory.");
  }

  const token = await (await ethers.getContractFactory("NexusToken")).deploy(treasury);
  await token.waitForDeployment();

  const presale = await (
    await ethers.getContractFactory("Presale")
  ).deploy(
    await token.getAddress(),
    paymentToken,
    tokensPerUsdt,
    hardCap,
    minPurchase,
    start,
    durationDays * 86_400n,
  );
  await presale.waitForDeployment();

  const registry = await (
    await ethers.getContractFactory("SignalRegistry")
  ).deploy();
  await registry.waitForDeployment();
  const registryReceipt = await registry.deploymentTransaction().wait();

  const subscriptions = await (
    await ethers.getContractFactory("SubscriptionManager")
  ).deploy(paymentToken, await token.getAddress());
  await subscriptions.waitForDeployment();

  const tokenInventory = ethers.parseUnits("300000000", 18);
  await (await token.transfer(await presale.getAddress(), tokenInventory)).wait();
  await (await token.excludeFromFee(await subscriptions.getAddress(), true)).wait();
  await (await registry.authorizePublisher(publisher, true)).wait();
  const subscriptionKeeper = address(
    process.env.SUBSCRIPTION_KEEPER_ADDRESS || publisher,
    "SUBSCRIPTION_KEEPER_ADDRESS",
  );
  await (await subscriptions.setKeeper(subscriptionKeeper, true)).wait();

  await subscriptions.createPlan(
    "STARTER",
    ethers.parseUnits("49", 18),
    ethers.parseUnits("3920", 18),
    30n * 86_400n,
  );
  await subscriptions.createPlan(
    "PRO",
    ethers.parseUnits("199", 18),
    ethers.parseUnits("15920", 18),
    30n * 86_400n,
  );
  await subscriptions.createPlan(
    "ENTERPRISE",
    ethers.parseUnits("999", 18),
    ethers.parseUnits("79920", 18),
    365n * 86_400n,
  );

  const presaleSettings = {
    rate: tokensPerUsdt.toString(),
    hardCap: hardCap.toString(),
    minPurchase: minPurchase.toString(),
    start: start.toString(),
    duration: (durationDays * 86_400n).toString(),
  };
  const deployment = {
    network: "bscTestnet",
    chainId: 97,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    treasury,
    publisher,
    paymentToken,
    paymentTokenSymbol: await paymentTokenMetadata.symbol(),
    paymentTokenDecimals: Number(paymentTokenDecimals),
    paymentTokenIsMock: deployMockPaymentToken,
    mockPaymentToken: deployMockPaymentToken ? paymentToken : null,
    nexusToken: await token.getAddress(),
    presale: await presale.getAddress(),
    signalRegistry: await registry.getAddress(),
    signalRegistryDeploymentBlock: Number(registryReceipt.blockNumber),
    subscriptionManager: await subscriptions.getAddress(),
    subscriptionPlans: [
      { planId: 0, label: "FREE", priceUSDT: "0", priceNEXUS: "0", durationDays: null },
      { planId: 1, label: "STARTER", priceUSDT: "49", priceNEXUS: "3920", durationDays: 30 },
      { planId: 2, label: "PRO", priceUSDT: "199", priceNEXUS: "15920", durationDays: 30 },
      { planId: 3, label: "ENTERPRISE", priceUSDT: "999", priceNEXUS: "79920", durationDays: 365 },
    ],
    subscriptionKeeper,
    presaleSettings,
  };
  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const deploymentJson = `${JSON.stringify(deployment, null, 2)}\n`;
  fs.writeFileSync(path.join(outDir, "bsc-testnet.json"), deploymentJson);
  const publicDir = path.join(__dirname, "..", "public", "deployments");
  fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(path.join(publicDir, "bsc-testnet.json"), deploymentJson);

  const envAddresses = {
    NEXUS_TOKEN: deployment.nexusToken,
    PRESALE: deployment.presale,
    SIGNAL_REGISTRY: deployment.signalRegistry,
    SUBSCRIPTION_MANAGER: deployment.subscriptionManager,
  };
  for (const [name, value] of Object.entries(envAddresses)) {
    console.log(`${name}=${value}`);
  }
  console.log(`Deployment record written to ${path.relative(process.cwd(), path.join(outDir, "bsc-testnet.json"))}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
