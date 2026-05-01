const hre = require("hardhat");
require("dotenv").config();

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying NativeKortanaBridge with the account:", deployer.address);

    const NativeBridge = await hre.ethers.getContractFactory("NativeKortanaBridge");
    const bridge = await NativeBridge.deploy(deployer.address);
    await bridge.waitForDeployment();
    
    console.log("✅ NativeKortanaBridge deployed to:", await bridge.getAddress());
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
