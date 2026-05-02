const hre = require("hardhat");
require("dotenv").config();

async function main() {
    const network = hre.network.name;
    console.log(`Seeding Liquidity on ${network}...`);

    const [deployer] = await hre.ethers.getSigners();
    
    // Configs (Update these from your latest deployment)
    const configs = {
        polygonAmoy: {
            router:  "0x86d86959a8c29371e9f62f6e59da897c5f52224e",
            wDNR:   "0x97F1428cc9711448700115aF6823d96b074C8B45",
            amountPOL: "0.1",
            amountDNR: "1000"
        },
        ethereumSepolia: {
            router:  "0xc532a74256d3db42d0bf7a0400fefdbad7694008",
            wDNR:   "0xD016Cf88c679D500Ae0847Fb00191F544eE6630D",
            amountETH: "0.001",
            amountDNR: "1000"
        }
    };

    const config = configs[network];
    if (!config) throw new Error("Unsupported network");

    const wDNR = await hre.ethers.getContractAt("WrappedDNR", config.wDNR);
    const router = await hre.ethers.getContractAt([
        "function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external payable returns (uint amountToken, uint amountETH, uint liquidity)"
    ], config.router);

    // 1. Mint wDNR to deployer so we have some to seed
    console.log("Minting wDNR for seeding...");
    const mintTx = await wDNR.mint(deployer.address, hre.ethers.parseEther(config.amountDNR));
    await mintTx.wait();

    // 2. Approve Router
    console.log("Approving Router...");
    const approveTx = await wDNR.approve(config.router, hre.ethers.parseEther(config.amountDNR));
    await approveTx.wait();

    // 3. Add Liquidity
    console.log("Adding Liquidity to DEX...");
    const amountNative = hre.ethers.parseEther(config.amountPOL || config.amountETH);
    const addTx = await router.addLiquidityETH(
        config.wDNR,
        hre.ethers.parseEther(config.amountDNR),
        0, // amountTokenMin
        0, // amountETHMin
        deployer.address,
        Math.floor(Date.now() / 1000) + 600,
        { value: amountNative }
    );
    await addTx.wait();

    console.log(`✅ Success! Pool created on ${network}.`);
    console.log(`Pool contains: ${config.amountDNR} wDNR and ${config.amountPOL || config.amountETH} Native.`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
