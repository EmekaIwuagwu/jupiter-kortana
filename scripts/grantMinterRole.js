const hre = require("hardhat");

async function main() {
    const addresses = {
        polygonAmoy: {
            wDNR: "0x97F1428cc9711448700115aF6823d96b074C8B45"
        },
        ethereumSepolia: {
            wDNR: "0xD016Cf88c679D500Ae0847Fb00191F544eE6630D"
        }
    };

    const network = hre.network.name;
    const config = addresses[network];
    if (!config) return;

    const [deployer] = await hre.ethers.getSigners();
    console.log(`Granting MINTER_ROLE to ${deployer.address} on ${network}...`);

    const wDNR = await hre.ethers.getContractAt("WrappedDNR", config.wDNR);
    const MINTER_ROLE = await wDNR.MINTER_ROLE();
    const tx = await wDNR.grantRole(MINTER_ROLE, deployer.address);
    await tx.wait();

    console.log("✅ Done!");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
