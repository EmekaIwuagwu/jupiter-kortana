const hre = require("hardhat");
require("dotenv").config({ path: "./.env" });
require("dotenv").config({ path: "./relayer/.env" });

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying and seeding with account:", deployer.address);

  // Standard Uniswap V2 Router on Sepolia
  const UNISWAP_V2_ROUTER = "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008"; 

  const wDNRAddress = process.env.WDNR_SEPOLIA_ADDRESS;
  const executorAddress = process.env.SEPOLIA_EXECUTOR_ADDRESS;

  if (!wDNRAddress || !executorAddress) {
      throw new Error("Please ensure WDNR_SEPOLIA_ADDRESS and SEPOLIA_EXECUTOR_ADDRESS are set in relayer/.env");
  }

  const wDNR = await hre.ethers.getContractAt("WrappedDNR", wDNRAddress);

  // 1. Deploy the Adapter
  console.log("Deploying UniswapV2SwapAdapter...");
  const Adapter = await hre.ethers.getContractFactory("UniswapV2SwapAdapter");
  const adapter = await Adapter.deploy(UNISWAP_V2_ROUTER);
  await adapter.waitForDeployment();
  const adapterAddress = await adapter.getAddress();
  console.log("✅ UniswapV2SwapAdapter deployed to:", adapterAddress);

  // 2. Link Executor to new Adapter
  console.log("Linking Executor to the new Adapter...");
  const executor = await hre.ethers.getContractAt("SepoliaBridgeExecutor", executorAddress);
  const tx1 = await executor.setSwapAdapter(adapterAddress);
  await tx1.wait();
  console.log("✅ SepoliaBridgeExecutor updated to use new Uniswap Adapter!");

  // 3. Seed Liquidity!
  console.log("Adding liquidity to Uniswap V2...");
  const routerAbi = [
      "function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external payable returns (uint amountToken, uint amountETH, uint liquidity)"
  ];
  const router = new hre.ethers.Contract(UNISWAP_V2_ROUTER, routerAbi, deployer);

  // Let's seed 10,000 wDNR and 0.05 ETH
  const wDnrAmount = hre.ethers.parseEther("10000");
  const ethAmount = hre.ethers.parseEther("0.05");

  // First, we need to make sure the deployer has enough wDNR. We'll mint it.
  console.log("Granting MINTER_ROLE to deployer...");
  const MINTER_ROLE = await wDNR.MINTER_ROLE();
  const txRole = await wDNR.grantRole(MINTER_ROLE, deployer.address);
  await txRole.wait();

  console.log("Minting 10,000 wDNR to deployer for liquidity seeding...");
  const txMint = await wDNR.mint(deployer.address, wDnrAmount);
  await txMint.wait();

  // Approve router
  console.log("Approving Uniswap Router...");
  const txApprove = await wDNR.approve(UNISWAP_V2_ROUTER, wDnrAmount);
  await txApprove.wait();

  // Add liquidity
  console.log("Seeding pool with 10,000 wDNR and 0.05 ETH...");
  const txAddLiq = await router.addLiquidityETH(
      wDNRAddress,
      wDnrAmount,
      0,
      0,
      deployer.address,
      Math.floor(Date.now() / 1000) + 60 * 10, // 10 minutes
      { value: ethAmount }
  );
  await txAddLiq.wait();
  console.log("🚀 BOOM! Liquidity successfully added! wDNR is now live on Uniswap Sepolia.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
