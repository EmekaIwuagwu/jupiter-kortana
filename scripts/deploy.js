const hre = require("hardhat");

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    // Defaulting to Testnet for initial deployment
    const kortanaChainId = process.env.KORTANA_CHAIN_ID || 72511;

    // --- Kortana Network Deployment (Source) ---
    // Example: DNR token would already be deployed. Using mock address for demonstration.
    const DNR_ADDRESS = "0x0000000000000000000000000000000000000001"; 
    
    const KortanaBridge = await hre.ethers.getContractFactory("KortanaBridge");
    const bridge = await KortanaBridge.deploy(DNR_ADDRESS, deployer.address);
    await bridge.waitForDeployment();
    console.log("KortanaBridge deployed to:", await bridge.getAddress());

    // --- Polygon Network Deployment (Destination) ---
    const WrappedDNR = await hre.ethers.getContractFactory("WrappedDNR");
    const wDNR = await WrappedDNR.deploy(deployer.address);
    await wDNR.waitForDeployment();
    console.log("WrappedDNR deployed to:", await wDNR.getAddress());

    // Alternatively, deploy the OneInchSwapAdapter
    // const OneInchSwapAdapter = await hre.ethers.getContractFactory("OneInchSwapAdapter");
    // const swapAdapter = await OneInchSwapAdapter.deploy(ROUTER_ADDRESS, WPOL_ADDRESS, deployer.address);
    const MockSwapAdapter = await hre.ethers.getContractFactory("MockSwapAdapter");
    const swapAdapter = await MockSwapAdapter.deploy();
    await swapAdapter.waitForDeployment();
    console.log("MockSwapAdapter deployed to:", await swapAdapter.getAddress());

    const PolygonBridgeExecutor = await hre.ethers.getContractFactory("PolygonBridgeExecutor");
    const executor = await PolygonBridgeExecutor.deploy(
        await wDNR.getAddress(),
        await swapAdapter.getAddress(),
        deployer.address,
        kortanaChainId
    );
    await executor.waitForDeployment();
    console.log("PolygonBridgeExecutor deployed to:", await executor.getAddress());

    // Setup Roles
    const MINTER_ROLE = await wDNR.MINTER_ROLE();
    await wDNR.grantRole(MINTER_ROLE, await executor.getAddress());
    console.log("Granted MINTER_ROLE on wDNR to PolygonBridgeExecutor");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
