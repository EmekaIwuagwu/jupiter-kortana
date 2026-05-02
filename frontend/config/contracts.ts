export const KORTANA_BRIDGE_TESTNET = "0x905784c7611Df616F6021AC57b95eE6B6983B416";
export const POLYGON_EXECUTOR_TESTNET = "0x13BF51Fb0e6Ce7c274fB4F6055aC1698fC82C513";

// Minimal KortanaBridge ABI — send() uses msg.value, emits event only (no struct storage)
export const KortanaBridgeABI = [
  {
    "inputs": [
      { "internalType": "uint256", "name": "dstChainId", "type": "uint256" },
      { "internalType": "address", "name": "dstUser", "type": "address" },
      { "internalType": "uint256", "name": "minOutNative", "type": "uint256" },
      { "internalType": "uint256", "name": "deadline", "type": "uint256" }
    ],
    "name": "send",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "name": "userNonce",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
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
