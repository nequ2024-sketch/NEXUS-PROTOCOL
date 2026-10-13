// التحقق من مصادر العقود المنشورة على BSC Testnet فقط.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import hre from "hardhat";
const { network } = hre;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  if (network.name !== "bscTestnet") {
    throw new Error("Verification is restricted to BSC Testnet.");
  }
  if (!process.env.BSCSCAN_KEY) {
    throw new Error("BSCSCAN_KEY is required. Add it to Replit Secrets; never commit it.");
  }

  const deploymentPath = path.join(__dirname, "..", "deployments", "bsc-testnet.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("Missing deployments/bsc-testnet.json. Deploy to Testnet first.");
  }
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  if (deployment.chainId !== 97 || deployment.network !== "bscTestnet") {
    throw new Error("Deployment record is not for BSC Testnet.");
  }

  const contracts = [
    ...(deployment.paymentTokenIsMock
      ? [{ address: deployment.mockPaymentToken, constructorArguments: [] }]
      : []),
    {
      address: deployment.nexusToken,
      constructorArguments: [deployment.treasury],
    },
    {
      address: deployment.presale,
      constructorArguments: [
        deployment.nexusToken,
        deployment.paymentToken,
        BigInt(deployment.presaleSettings.rate),
        BigInt(deployment.presaleSettings.hardCap),
        BigInt(deployment.presaleSettings.minPurchase),
        BigInt(deployment.presaleSettings.start),
        BigInt(deployment.presaleSettings.duration),
      ],
    },
    { address: deployment.signalRegistry, constructorArguments: [] },
    {
      address: deployment.subscriptionManager,
      constructorArguments: [
        deployment.paymentToken,
        deployment.nexusToken,
        deployment.treasury,
      ],
    },
  ];

  for (const contract of contracts) {
    await hre.run("verify:verify", {
      address: contract.address,
      constructorArguments: contract.constructorArguments,
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
