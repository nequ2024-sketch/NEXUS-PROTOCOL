// إعداد Hardhat: الشبكة الخارجية الوحيدة المسموحة هي BSC Testnet.
require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("@nomicfoundation/hardhat-verify");
require("dotenv").config();

const privateKey = process.env.PRIVATE_KEY;

module.exports = {
  solidity: {
    version: "0.8.26",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {},
    bscTestnet: {
      url:
        process.env.BSC_TESTNET_RPC ||
        "https://data-seed-prebsc-1-s1.binance.org:8545/",
      chainId: 97,
      gasPrice: 3_000_000_000,
      accounts: privateKey ? [privateKey] : [],
    },
  },
  etherscan: {
    apiKey: {
      bscTestnet: process.env.BSCSCAN_KEY || "",
    },
    customChains: [
      {
        network: "bscTestnet",
        chainId: 97,
        urls: {
          apiURL: "https://api-testnet.bscscan.com/api",
          browserURL: "https://testnet.bscscan.com",
        },
      },
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./.hardhat-artifacts",
  },
};
