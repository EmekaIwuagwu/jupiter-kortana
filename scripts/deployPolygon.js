const hre = require("hardhat");
require("dotenv").config();

async function main() {
    console.log("Deploying Project Jupiter Infrastructure to Polygon Amoy...");
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deployer Address:", deployer.address);
    console.log("Balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

    const kortanaChainId = 72511;
    const relayerAddress = "0xe0b2986830E3Db1dDA24De312E99F5e67C38dfE5";

    // 1. Deploy wDNR (Polygon version)
    console.log("\n1. Deploying WrappedDNR...");
    const WrappedDNR = await hre.ethers.getContractFactory("WrappedDNR");
    const wDNR = await WrappedDNR.deploy(deployer.address);
    await wDNR.waitForDeployment();
    const wDNRAddress = await wDNR.getAddress();
    console.log("✅ WrappedDNR deployed to:", wDNRAddress);

    // 2. Deploy Mock Swap Adapter
    console.log("\n2. Deploying MockSwapAdapter...");
    const MockSwapAdapter = await hre.ethers.getContractFactory("MockSwapAdapter");
    const swapAdapter = await MockSwapAdapter.deploy();
    await swapAdapter.waitForDeployment();
    const swapAdapterAddress = await swapAdapter.getAddress();
    console.log("✅ MockSwapAdapter deployed to:", swapAdapterAddress);

    // 3. Fund Swap Adapter with liquidity (0.5 POL)
    console.log("\n3. Funding Swap Adapter with native POL liquidity...");
    const fundTx = await deployer.sendTransaction({
        to: swapAdapterAddress,
        value: hre.ethers.parseEther("0.5")
    });
    await fundTx.wait();
    console.log("✅ Funded adapter with 0.5 POL");

    // 4. Deploy Executor
    console.log("\n4. Deploying SepoliaBridgeExecutor (as Polygon Executor)...");
    const SepoliaBridgeExecutor = await hre.ethers.getContractFactory("SepoliaBridgeExecutor");
    const executor = await SepoliaBridgeExecutor.deploy(
        wDNRAddress,
        swapAdapterAddress,
        deployer.address,
        kortanaChainId
    );
    await executor.waitForDeployment();
    const executorAddress = await executor.getAddress();
    console.log("✅ PolygonBridgeExecutor deployed to:", executorAddress);

    // 5. Setup Roles
    console.log("\n5. Configuring Roles...");
    
    // Allow Executor to mint wDNR
    const MINTER_ROLE = await wDNR.MINTER_ROLE();
    await wDNR.grantRole(MINTER_ROLE, executorAddress);
    console.log("✅ Granted MINTER_ROLE on wDNR to Executor");

    // Authorize Relayer on Executor
    await executor.setRelayer(relayerAddress, true);
    console.log("✅ Authorized Relayer on Executor:", relayerAddress);

    console.log("\n--- DEPLOYMENT COMPLETE ---");
    console.log("Update relayer/.env:");
    console.log(`AMOY_EXECUTOR_ADDRESS=${executorAddress}`);
    console.log(`WDNR_AMOY_ADDRESS=${wDNRAddress}`);
    console.log("\nUpdate frontend/config/contracts.ts:");
    console.log(`export const POLYGON_EXECUTOR_TESTNET = "${executorAddress}";`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
