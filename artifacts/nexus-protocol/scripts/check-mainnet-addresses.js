import { inspectMainnetAddresses } from "./mainnet-addresses.js";

async function main() {
  const report = await inspectMainnetAddresses();
  console.log(JSON.stringify(report, null, 2));
  if (!report.deploymentReady) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Mainnet address check failed.");
  process.exitCode = 1;
});
