require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000000";

module.exports = {
  solidity: "0.8.20",
  networks: {
    kortanaTestnet: {
      url: "https://poseidon-rpc.testnet.kortana.xyz/",
      accounts: [PRIVATE_KEY],
      chainId: 72511
    },
    ethereumSepolia: {
      url: "https://ethereum-sepolia-rpc.publicnode.com",
      accounts: [PRIVATE_KEY],
      chainId: 11155111
    }
  }
};
