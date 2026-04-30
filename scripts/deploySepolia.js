const hre = require("hardhat");

async function main() {
    console.log("Deploying to Ethereum Sepolia...");
    const [deployer] = await hre.ethers.getSigners();
    console.log("Account:", deployer.address);

    const kortanaChainId = process.env.KORTANA_CHAIN_ID || 72511;

    // 1. Deploy wDNR
    const WrappedDNR = await hre.ethers.getContractFactory("WrappedDNR");
    const wDNR = await WrappedDNR.deploy(deployer.address);
    await wDNR.waitForDeployment();
    console.log("✅ WrappedDNR deployed to:", await wDNR.getAddress());

    // 2. Deploy Mock Swap Adapter
    const MockSwapAdapter = await hre.ethers.getContractFactory("MockSwapAdapter");
    const swapAdapter = await MockSwapAdapter.deploy();
    await swapAdapter.waitForDeployment();
    console.log("✅ MockSwapAdapter deployed to:", await swapAdapter.getAddress());

    // 3. Deploy Executor
    const SepoliaBridgeExecutor = await hre.ethers.getContractFactory("SepoliaBridgeExecutor");
    const executor = await SepoliaBridgeExecutor.deploy(
        await wDNR.getAddress(),
        await swapAdapter.getAddress(),
        deployer.address,
        kortanaChainId
    );
    await executor.waitForDeployment();
    console.log("✅ SepoliaBridgeExecutor deployed to:", await executor.getAddress());

    // 4. Setup Roles
    console.log("Configuring Roles...");
    const MINTER_ROLE = await wDNR.MINTER_ROLE();
    await wDNR.grantRole(MINTER_ROLE, await executor.getAddress());
    console.log("Granted MINTER_ROLE on wDNR to SepoliaBridgeExecutor");

    console.log("\n-> Please copy WrappedDNR address into relayer/.env (WDNR_SEPOLIA_ADDRESS)");
    console.log("-> Please copy SepoliaBridgeExecutor address into relayer/.env (SEPOLIA_EXECUTOR_ADDRESS)");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
