export const KORTANA_BRIDGE_TESTNET = "0x78371532be8DA2d9e9eAaC274A50FBf555123eE5";
export const POLYGON_EXECUTOR_TESTNET = "0xa509C6b006d7174e479385Fedf9Ae5462D7747A3";

export const KortanaBridgeABI = [
  {
    "inputs": [
      { "internalType": "uint256", "name": "dstChainId", "type": "uint256" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" },
      { "internalType": "address", "name": "dstUser", "type": "address" },
      { "internalType": "uint256", "name": "minOutNative", "type": "uint256" },
      { "internalType": "uint256", "name": "deadline", "type": "uint256" }
    ],
    "name": "bridgeAndSwap",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "account", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "approve",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;
