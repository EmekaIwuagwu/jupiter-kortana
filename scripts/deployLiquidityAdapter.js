const hre = require("hardhat");
require("dotenv").config({ path: "./.env" });
require("dotenv").config({ path: "./relayer/.env" });

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const executorAddress = process.env.SEPOLIA_EXECUTOR_ADDRESS;

  if (!executorAddress) {
      throw new Error("Please ensure SEPOLIA_EXECUTOR_ADDRESS is set in relayer/.env");
  }

  // 1 wDNR = 0.000001 ETH (so 10,000 wDNR swapped = 0.01 ETH)
  const exchangeRate = hre.ethers.parseEther("0.000001"); 

  console.log("Deploying Bridge-Owned Liquidity Network...");
  const Adapter = await hre.ethers.getContractFactory("BridgeLiquidityAdapter");
  const adapter = await Adapter.deploy(exchangeRate);
  await adapter.waitForDeployment();
  const adapterAddress = await adapter.getAddress();
  console.log("✅ BridgeLiquidityAdapter deployed to:", adapterAddress);

  // Fund the pool with 0.02 ETH of the user's testnet tokens
  console.log("Funding Bridge Liquidity Pool with 0.02 ETH...");
  const txFund = await deployer.sendTransaction({
      to: adapterAddress,
      value: hre.ethers.parseEther("0.02")
  });
  await txFund.wait();
  console.log("✅ Native ETH Pool Funded!");

  // Link to Executor
  console.log("Linking Executor to the new Bridge Liquidity Adapter...");
  const executor = await hre.ethers.getContractAt("SepoliaBridgeExecutor", executorAddress);
  const txLink = await executor.setSwapAdapter(adapterAddress);
  await txLink.wait();
  console.log("🚀 BOOM! Bridge is fully decentralized and funded with your testnet ETH.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
