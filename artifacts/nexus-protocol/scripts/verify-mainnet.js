import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import hre from "hardhat";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  if (hre.network.name !== "bscMainnet") {
    throw new Error("Source verification is restricted to BSC Mainnet.");
  }
  if ((await hre.ethers.provider.getNetwork()).chainId !== 56n) {
    throw new Error("Expected BSC Mainnet chain ID 56.");
  }
  if (!process.env.BSCSCAN_MAINNET_API_KEY) {
    throw new Error("BSCSCAN_MAINNET_API_KEY is required. Add it through Replit Secrets.");
  }

  const deploymentPath = path.join(__dirname, "..", "deployments", "bsc-mainnet.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("Missing deployments/bsc-mainnet.json; no Mainnet deployment is recorded.");
  }
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  if (
    deployment.status !== "deployed" ||
    deployment.network !== "bscMainnet" ||
    deployment.chainId !== 56
  ) {
    throw new Error("Deployment record is incomplete or not for BSC Mainnet.");
  }

  await hre.run("verify:verify", {
    address: deployment.subscriptionManager,
    constructorArguments: [
      deployment.paymentToken,
      deployment.nexusToken,
      deployment.treasury,
    ],
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "BSC Mainnet source verification failed.");
  process.exitCode = 1;
});
