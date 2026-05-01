const hre = require("hardhat");
require("dotenv").config();

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying KortanaSendBridge with:", deployer.address);

    const Bridge = await hre.ethers.getContractFactory("KortanaSendBridge");
    const bridge = await Bridge.deploy(deployer.address);
    await bridge.waitForDeployment();

    const addr = await bridge.getAddress();
    console.log("✅ KortanaSendBridge deployed to:", addr);
    console.log("👉 Update KORTANA_BRIDGE_TESTNET in frontend/config/contracts.ts");
    console.log("👉 Update KORTANA_BRIDGE_ADDRESS in relayer/.env");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
