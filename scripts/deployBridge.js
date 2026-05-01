const hre = require("hardhat");
require("dotenv").config();

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying minimal KortanaBridge with:", deployer.address);

    const Bridge = await hre.ethers.getContractFactory("KortanaBridge");
    const bridge = await Bridge.deploy();
    await bridge.waitForDeployment();

    const addr = await bridge.getAddress();
    console.log("✅ KortanaBridge deployed to:", addr);
    console.log("Update frontend/config/contracts.ts → KORTANA_BRIDGE_TESTNET");
    console.log("Update relayer/.env → KORTANA_BRIDGE_ADDRESS");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
