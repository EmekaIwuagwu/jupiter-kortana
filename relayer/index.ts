import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';

dotenv.config();

/**
 * @title Project Jupiter Relayer v2
 * @notice Dual-mode event listener: WebSocket `on` listener + periodic `getLogs` polling fallback.
 *         This prevents missed events on unstable RPC connections.
 */

// === Configuration ===
const KORTANA_RPC = process.env.KORTANA_RPC || 'https://poseidon-rpc.testnet.kortana.xyz/';
const SEPOLIA_RPC = process.env.SEPOLIA_RPC || 'https://ethereum-sepolia-rpc.publicnode.com';
const AMOY_RPC = process.env.AMOY_RPC || 'https://rpc-amoy.polygon.technology';
const BNB_RPC = process.env.BNB_RPC || 'https://bsc-testnet-rpc.publicnode.com';

const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY || '';
const KORTANA_BRIDGE_ADDRESS = process.env.KORTANA_BRIDGE_ADDRESS || '0xa509C6b006d7174e479385Fedf9Ae5462D7747A3';
const SEPOLIA_EXECUTOR_ADDRESS = process.env.SEPOLIA_EXECUTOR_ADDRESS || '';
const AMOY_EXECUTOR_ADDRESS = process.env.AMOY_EXECUTOR_ADDRESS || '';
const BNB_EXECUTOR_ADDRESS = process.env.BNB_EXECUTOR_ADDRESS || '';

const CONFIRMATION_BLOCKS = 2;
const SEPOLIA_CONFIRMATIONS = 2;
const MAX_RETRIES = 3;
const KORTANA_CHAIN_ID = process.env.KORTANA_CHAIN_ID ? parseInt(process.env.KORTANA_CHAIN_ID) : 72511;

// Polling interval for getLogs fallback (every 30 seconds)
const POLLING_INTERVAL_MS = 30_000;

// === Providers ===
const kortanaProvider = new ethers.JsonRpcProvider(KORTANA_RPC);
const sepoliaProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
const relayerWallet = new ethers.Wallet(RELAYER_PRIVATE_KEY, sepoliaProvider);

// === ABIs ===
const kortanaBridgeAbi = [
    "event BridgeInitiated(bytes32 indexed transferId, address indexed sender, address indexed dstUser, uint256 dstChainId, uint256 amount, uint256 minOutNative, uint256 deadline, uint256 timestamp)"
];

const sepoliaExecutorAbi = [
    "function executeBridgeAndSwap(uint256 sourceChainId, bytes32 transferId, address dstUser, uint256 amount, uint256 minOutETH, uint256 deadline, bytes calldata extraData) external",
    "function processedTransfers(bytes32) external view returns (bool)"
];

const kortanaBridge = new ethers.Contract(KORTANA_BRIDGE_ADDRESS, kortanaBridgeAbi, kortanaProvider);
const sepoliaExecutor = new ethers.Contract(SEPOLIA_EXECUTOR_ADDRESS, sepoliaExecutorAbi, relayerWallet);
const bridgeIface = new ethers.Interface(kortanaBridgeAbi);

// === In-Memory State ===
// transferId -> stage: 1=Locked, 2=Relayer, 3=Minting, 4=Swapping, 5=Complete
const processedEvents = new Map<string, number>();
// transferId -> already dispatched (prevents double-processing)
const dispatchedTransfers = new Set<string>();

let lastScannedBlock = 0;

// === Express API ===
const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/status/:transferId', (req, res) => {
    const { transferId } = req.params;
    const normalized = transferId.toLowerCase();
    const found = [...processedEvents.keys()].find(k => k.toLowerCase() === normalized);
    if (found) {
        res.json({ status: 'FOUND', stage: processedEvents.get(found) });
    } else {
        res.json({ status: 'NOT_FOUND', stage: 1 });
    }
});

// Debug endpoint - list all known transfers
app.get('/api/debug', (req, res) => {
    res.json({
        knownTransfers: [...processedEvents.entries()],
        dispatchedCount: dispatchedTransfers.size,
        lastScannedBlock
    });
});

app.get('/api/ping', (req, res) => res.status(200).send('pong'));

// Anti-sleep
const PORT = process.env.PORT || 3001;
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

setInterval(async () => {
    try {
        await fetch(`${RENDER_EXTERNAL_URL}/api/ping`);
        console.log(`[Anti-Sleep] Ping OK`);
    } catch (error) {
        console.error("[Anti-Sleep] Ping failed:", error);
    }
}, 10 * 60 * 1000);

// === Start ===
app.listen(PORT, () => {
    console.log(`[Relayer] API on port ${PORT}`);
    startRelayer();
});

async function startRelayer() {
    console.log(`[Relayer] Starting... Bridge: ${KORTANA_BRIDGE_ADDRESS}`);

    // Initialize last scanned block
    try {
        lastScannedBlock = (await kortanaProvider.getBlockNumber()) - 100;
        console.log(`[Relayer] Starting scan from block ${lastScannedBlock}`);
    } catch (e) {
        lastScannedBlock = 0;
    }

    // === Mode 1: WebSocket-style event listener ===
    kortanaBridge.on("BridgeInitiated", async (transferId, sender, dstUser, dstChainId, amount, minOutNative, deadline, timestamp, event) => {
        const addr = (event as any).log?.address || (event as any).address || '';
        if (addr.toLowerCase() !== KORTANA_BRIDGE_ADDRESS.toLowerCase()) {
            console.log(`[Relayer] Ignoring event from wrong address: ${addr}`);
            return;
        }
        console.log(`[Relayer][Listener] BridgeInitiated: ${transferId}`);
        await handleBridgeEvent(transferId, sender, dstUser, dstChainId, amount, minOutNative, deadline, (event as any).log?.blockNumber || 0);
    });

    console.log(`[Relayer] Event listener active`);

    // === Mode 2: Periodic getLogs polling fallback ===
    setInterval(async () => {
        try {
            const currentBlock = await kortanaProvider.getBlockNumber();
            if (currentBlock <= lastScannedBlock) return;

            const fromBlock = lastScannedBlock + 1;
            const toBlock = Math.min(currentBlock, fromBlock + 500); // Cap range to avoid timeout

            console.log(`[Relayer][Poll] Scanning blocks ${fromBlock} - ${toBlock}`);

            const logs = await kortanaProvider.getLogs({
                address: KORTANA_BRIDGE_ADDRESS,
                fromBlock,
                toBlock,
                topics: [bridgeIface.getEvent('BridgeInitiated')!.topicHash]
            });

            if (logs.length > 0) {
                console.log(`[Relayer][Poll] Found ${logs.length} event(s)`);
                for (const log of logs) {
                    const parsed = bridgeIface.parseLog(log)!;
                    await handleBridgeEvent(
                        parsed.args.transferId,
                        parsed.args.sender,
                        parsed.args.dstUser,
                        parsed.args.dstChainId,
                        parsed.args.amount,
                        parsed.args.minOutNative,
                        parsed.args.deadline,
                        log.blockNumber
                    );
                }
            }

            lastScannedBlock = toBlock;
        } catch (err) {
            console.error(`[Relayer][Poll] Error scanning logs:`, err);
        }
    }, POLLING_INTERVAL_MS);
}

async function handleBridgeEvent(
    transferId: string,
    sender: string,
    dstUser: string,
    dstChainId: bigint,
    amount: bigint,
    minOutNative: bigint,
    deadline: bigint,
    blockNumber: number
) {
    const key = transferId.toLowerCase();

    if (dispatchedTransfers.has(key)) {
        console.log(`[Relayer] Transfer ${transferId} already dispatched. Skipping.`);
        return;
    }

    dispatchedTransfers.add(key);
    processedEvents.set(transferId, 2); // Stage 2: Relayer Processing

    console.log(`[Relayer] Processing ${transferId} -> chain ${dstChainId.toString()} for ${ethers.formatEther(amount)} DNR`);

    try {
        await processTransfer(transferId, dstUser, dstChainId, amount, minOutNative, deadline, blockNumber);
    } catch (error) {
        console.error(`[Relayer] Failed to process ${transferId}:`, error);
        dispatchedTransfers.delete(key); // Allow retry on next poll
    }
}

async function processTransfer(
    transferId: string,
    dstUser: string,
    dstChainId: bigint,
    amount: bigint,
    originalMinOutNative: bigint,
    deadline: bigint,
    blockNumber: number
) {
    // === Route to correct chain ===
    let targetExecutor: ethers.Contract;

    if (dstChainId === BigInt(11155111)) {
        targetExecutor = sepoliaExecutor;
    } else if (dstChainId === BigInt(80002)) {
        const amoyProvider = new ethers.JsonRpcProvider(AMOY_RPC);
        const amoyWallet = new ethers.Wallet(RELAYER_PRIVATE_KEY, amoyProvider);
        targetExecutor = new ethers.Contract(AMOY_EXECUTOR_ADDRESS, sepoliaExecutorAbi, amoyWallet);
    } else if (dstChainId === BigInt(97)) {
        const bnbProvider = new ethers.JsonRpcProvider(BNB_RPC);
        const bnbWallet = new ethers.Wallet(RELAYER_PRIVATE_KEY, bnbProvider);
        targetExecutor = new ethers.Contract(BNB_EXECUTOR_ADDRESS, sepoliaExecutorAbi, bnbWallet);
    } else {
        console.error(`[Relayer] Unsupported chain: ${dstChainId.toString()}`);
        return;
    }

    // === Wait for Kortana confirmations ===
    let currentBlock = await kortanaProvider.getBlockNumber();
    while (currentBlock < blockNumber + CONFIRMATION_BLOCKS) {
        console.log(`[Relayer] Waiting for confirmations: ${currentBlock} / ${blockNumber + CONFIRMATION_BLOCKS}`);
        await new Promise(r => setTimeout(r, 8000));
        currentBlock = await kortanaProvider.getBlockNumber();
    }

    // === On-chain replay guard ===
    const isProcessed = await targetExecutor.processedTransfers(transferId);
    if (isProcessed) {
        console.log(`[Relayer] ${transferId} already processed on-chain. Marking complete.`);
        processedEvents.set(transferId, 5);
        return;
    }

    // === Submit to destination chain ===
    let retries = 0;
    while (retries < MAX_RETRIES) {
        try {
            console.log(`[Relayer] Submitting executeBridgeAndSwap for ${transferId}... (attempt ${retries + 1})`);
            processedEvents.set(transferId, 3); // Minting

            const tx = await targetExecutor.executeBridgeAndSwap(
                KORTANA_CHAIN_ID,
                transferId,
                dstUser,
                amount,
                originalMinOutNative,
                deadline,
                "0x"
            );

            console.log(`[Relayer] TX sent: ${tx.hash}`);
            processedEvents.set(transferId, 4); // Swapping

            await tx.wait(SEPOLIA_CONFIRMATIONS);
            console.log(`[Relayer] Bridge complete for ${transferId}!`);
            processedEvents.set(transferId, 5); // Complete
            break;

        } catch (error: any) {
            console.error(`[Relayer] TX failed attempt ${retries + 1}:`, error?.shortMessage || error);
            retries++;
            if (retries >= MAX_RETRIES) {
                console.error(`[Relayer] Max retries reached for ${transferId}.`);
                processedEvents.set(transferId, 2); // Reset to processing so UI can see it's still pending
            } else {
                await new Promise(r => setTimeout(r, 5000 * retries));
            }
        }
    }
}
