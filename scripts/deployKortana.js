const hre = require("hardhat");

async function main() {
    console.log("Deploying to Kortana Testnet...");
    const [deployer] = await hre.ethers.getSigners();
    console.log("Account:", deployer.address);

    // Using mock DNR address. In reality, pass the deployed DNR token address here.
    const DNR_ADDRESS = "0x0000000000000000000000000000000000000001"; 
    
    const KortanaBridge = await hre.ethers.getContractFactory("KortanaBridge");
    const bridge = await KortanaBridge.deploy(DNR_ADDRESS, deployer.address);
    await bridge.waitForDeployment();
    
    console.log("✅ KortanaBridge deployed to:", await bridge.getAddress());
    console.log("\n-> Please copy this address into relayer/.env (KORTANA_BRIDGE_ADDRESS)");
    console.log("-> Please copy this address into frontend/config/contracts.ts (KORTANA_BRIDGE_TESTNET)");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
