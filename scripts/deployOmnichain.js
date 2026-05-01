const hre = require("hardhat");
require("dotenv").config({ path: "./.env" });
require("dotenv").config({ path: "./relayer/.env" });

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  console.log(`Deploying to ${network} with account: ${deployer.address}`);

  const kortanaChainId = process.env.KORTANA_CHAIN_ID || 72511;

  // 1. Deploy wDNR
  console.log("Deploying WrappedDNR...");
  const WrappedDNR = await hre.ethers.getContractFactory("WrappedDNR");
  const wDNR = await WrappedDNR.deploy(deployer.address);
  await wDNR.waitForDeployment();
  const wDNRAddress = await wDNR.getAddress();
  console.log(`✅ WrappedDNR deployed to: ${wDNRAddress}`);

  // 2. Deploy Liquidity Adapter
  // 1 wDNR = 0.000001 Native Token
  const exchangeRate = hre.ethers.parseEther("0.000001"); 
  console.log("Deploying BridgeLiquidityAdapter...");
  const Adapter = await hre.ethers.getContractFactory("BridgeLiquidityAdapter");
  const adapter = await Adapter.deploy(exchangeRate);
  await adapter.waitForDeployment();
  const adapterAddress = await adapter.getAddress();
  console.log(`✅ BridgeLiquidityAdapter deployed to: ${adapterAddress}`);

  // 3. Deploy Executor
  console.log("Deploying Destination Bridge Executor...");
  const Executor = await hre.ethers.getContractFactory("SepoliaBridgeExecutor"); // using the generic bytecode
  const executor = await Executor.deploy(
      wDNRAddress,
      adapterAddress,
      deployer.address,
      kortanaChainId
  );
  await executor.waitForDeployment();
  const executorAddress = await executor.getAddress();
  console.log(`✅ Bridge Executor deployed to: ${executorAddress}`);

  // 4. Setup Roles
  console.log("Configuring Roles...");
  const MINTER_ROLE = await wDNR.MINTER_ROLE();
  let tx1 = await wDNR.grantRole(MINTER_ROLE, executorAddress);
  await tx1.wait();
  console.log(`✅ Granted MINTER_ROLE on wDNR to Executor`);

  // 5. Fund the pool with 0.02 Native Token
  console.log("Funding Bridge Liquidity Pool with 0.02 Native Token...");
  const txFund = await deployer.sendTransaction({
      to: adapterAddress,
      value: hre.ethers.parseEther("0.02")
  });
  await txFund.wait();
  console.log("✅ Native Token Pool Funded!");

  console.log("\n=============================================");
  console.log(`SUCCESS ON ${network.toUpperCase()}`);
  console.log(`Add these to relayer/.env:`);
  if (network === "polygonAmoy") {
      console.log(`WDNR_AMOY_ADDRESS=${wDNRAddress}`);
      console.log(`AMOY_EXECUTOR_ADDRESS=${executorAddress}`);
  } else if (network === "bnbTestnet") {
      console.log(`WDNR_BNB_ADDRESS=${wDNRAddress}`);
      console.log(`BNB_EXECUTOR_ADDRESS=${executorAddress}`);
  }
  console.log("=============================================\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
