const hre = require("hardhat");

async function main() {
    const wDNRAddress = "0xD016Cf88c679D500Ae0847Fb00191F544eE6630D";
    const executorAddress = "0x2c0c4D55597F63C474b62dD25c9F7C4b634A65CE";
    const relayerAddress = "0xe0b2986830E3Db1dDA24De312E99F5e67C38dfE5";

    console.log("Configuring Roles on Sepolia...");
    
    // 1. Grant Minter Role
    const wDNR = await hre.ethers.getContractAt("WrappedDNR", wDNRAddress);
    const MINTER_ROLE = await wDNR.MINTER_ROLE();
    const grantTx = await wDNR.grantRole(MINTER_ROLE, executorAddress);
    await grantTx.wait();
    console.log("✅ Granted MINTER_ROLE to Executor");

    // 2. Set Relayer
    const executor = await hre.ethers.getContractAt("SepoliaBridgeExecutor", executorAddress);
    const relayerTx = await executor.setRelayer(relayerAddress, true);
    await relayerTx.wait();
    console.log("✅ Authorized Relayer on Sepolia Executor:", relayerAddress);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
