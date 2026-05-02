const { ethers } = require("ethers");
const pk = "0x6c0e1fc6ea28fec8b9d43678a13b4e291658c07d10770d409d474972797b358e";
const wallet = new ethers.Wallet(pk);
console.log("Relayer Wallet Address:", wallet.address);
