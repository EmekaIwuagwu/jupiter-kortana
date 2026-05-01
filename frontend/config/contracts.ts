export const KORTANA_BRIDGE_TESTNET = "0xD1d753A28e063c5DD7ea4d42A75616aA20Dc0fC0";
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
    "stateMutability": "payable",
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
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "bytes32", "name": "transferId", "type": "bytes32" },
      { "indexed": true, "internalType": "address", "name": "sender", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "dstUser", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "dstChainId", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "minOutNative", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "deadline", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }
    ],
    "name": "BridgeInitiated",
    "type": "event"
  }
] as const;
