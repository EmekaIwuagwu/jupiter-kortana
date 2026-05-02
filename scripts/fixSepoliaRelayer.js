const hre = require("hardhat");

async function main() {
    const executorAddress = "0x7C6ed53c357E5295201C2AF4AAE5F6E0544CBD26";
    const relayerAddress = "0xe0b2986830E3Db1dDA24De312E99F5e67C38dfE5";

    console.log("Setting relayer on Sepolia executor...");
    const executor = await hre.ethers.getContractAt("SepoliaBridgeExecutor", executorAddress);
    const tx = await executor.setRelayer(relayerAddress, true);
    await tx.wait();
    console.log("✅ Authorized Relayer on Sepolia Executor:", relayerAddress);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
