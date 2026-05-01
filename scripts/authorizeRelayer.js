const hre = require("hardhat");
require("dotenv").config();

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    const relayerAddress = "0xe0b2986830E3Db1dDA24De312E99F5e67C38dfE5";
    const executorAddress = process.env.SEPOLIA_EXECUTOR_ADDRESS || "0xa509C6b006d7174e479385Fedf9Ae5462D7747A3";
    
    console.log("Using deployer:", deployer.address);
    console.log("Target Executor:", executorAddress);

    // Human-readable ABI for role management
    const abi = [
        "function setRelayer(address relayer, bool authorized) external",
        "function hasRole(bytes32 role, address account) public view returns (bool)",
        "function RELAYER_ROLE() public view returns (bytes32)"
    ];

    const Executor = await hre.ethers.getContractAt(abi, executorAddress);
    
    const RELAYER_ROLE = await Executor.RELAYER_ROLE();
    const isAuthorized = await Executor.hasRole(RELAYER_ROLE, relayerAddress);

    if (isAuthorized) {
        console.log("✅ Relayer is already authorized.");
        return;
    }

    console.log("⏳ Authorizing relayer on Sepolia Executor...");
    const tx = await Executor.setRelayer(relayerAddress, true);
    console.log("Transaction hash:", tx.hash);
    await tx.wait();
    console.log("🚀 Relayer authorized successfully!");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
