const hre = require("hardhat");
require("dotenv").config();

async function main() {
    console.log("Deploying Real-Deal Uniswap Infrastructure to Ethereum Sepolia...");
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deployer Address:", deployer.address);

    const kortanaChainId = 72511;
    const relayerAddress = "0xe0b2986830E3Db1dDA24De312E99F5e67C38dfE5";
    
    // Uniswap V2 Router on Sepolia
    const UNI_ROUTER = "0xc532a74256d3db42d0bf7a0400fefdbad7694008";

    // 1. Deploy wDNR
    console.log("\n1. Deploying WrappedDNR...");
    const WrappedDNR = await hre.ethers.getContractFactory("WrappedDNR");
    const wDNR = await WrappedDNR.deploy(deployer.address);
    await wDNR.waitForDeployment();
    const wDNRAddress = await wDNR.getAddress();
    console.log("✅ WrappedDNR deployed to:", wDNRAddress);

    // 2. Deploy Uniswap V2 Swap Adapter
    console.log("\n2. Deploying UniswapV2SwapAdapter...");
    const UniswapV2SwapAdapter = await hre.ethers.getContractFactory("UniswapV2SwapAdapter");
    const swapAdapter = await UniswapV2SwapAdapter.deploy(UNI_ROUTER);
    await swapAdapter.waitForDeployment();
    const swapAdapterAddress = await swapAdapter.getAddress();
    console.log("✅ UniswapV2SwapAdapter deployed to:", swapAdapterAddress);

    // 3. Deploy Executor
    console.log("\n3. Deploying SepoliaBridgeExecutor...");
    const SepoliaBridgeExecutor = await hre.ethers.getContractFactory("SepoliaBridgeExecutor");
    const executor = await SepoliaBridgeExecutor.deploy(
        wDNRAddress,
        swapAdapterAddress,
        deployer.address,
        kortanaChainId
    );
    await executor.waitForDeployment();
    const executorAddress = await executor.getAddress();
    console.log("✅ SepoliaBridgeExecutor deployed to:", executorAddress);

    // Allow Executor and Deployer to mint wDNR (Deployer needs it to seed liquidity)
    const MINTER_ROLE = await wDNR.MINTER_ROLE();
    await wDNR.grantRole(MINTER_ROLE, executorAddress);
    await wDNR.grantRole(MINTER_ROLE, deployer.address);
    
    await executor.setRelayer(relayerAddress, true);
    console.log("✅ Roles configured and Relayer authorized.");

    console.log("\n--- DEPLOYMENT COMPLETE ---");
    console.log(`SEPOLIA_EXECUTOR_ADDRESS=${executorAddress}`);
    console.log(`WDNR_SEPOLIA_ADDRESS=${wDNRAddress}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
