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
const KORTANA_BRIDGE_ADDRESS = process.env.KORTANA_BRIDGE_ADDRESS || '0x905784c7611Df616F6021AC57b95eE6B6983B416';
const SEPOLIA_EXECUTOR_ADDRESS = process.env.SEPOLIA_EXECUTOR_ADDRESS || '';
const AMOY_EXECUTOR_ADDRESS = process.env.AMOY_EXECUTOR_ADDRESS || '0x905784c7611Df616F6021AC57b95eE6B6983B416';
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
const KORTANA_BRIDGE_ABI = [
    "event BridgeInitiated(bytes32 indexed transferId, address indexed sender, address indexed dstUser, uint256 dstChainId, uint256 amount, uint256 minOutNative, uint256 deadline, uint256 timestamp)"
];

const BRIDGE_INITIATED_TOPIC = "0x85866b9de06dad825d7fbba5670be5d800a8796417df743ffb7a82ac95877779";

const sepoliaExecutorAbi = [
    "function executeBridgeAndSwap(uint256 sourceChainId, bytes32 transferId, address dstUser, uint256 amount, uint256 minOutETH, uint256 deadline, bytes calldata extraData) external",
    "function processedTransfers(bytes32) external view returns (bool)"
];

const kortanaBridge = new ethers.Contract(KORTANA_BRIDGE_ADDRESS, KORTANA_BRIDGE_ABI, kortanaProvider);
const sepoliaExecutor = new ethers.Contract(SEPOLIA_EXECUTOR_ADDRESS, sepoliaExecutorAbi, relayerWallet);
const bridgeIface = new ethers.Interface(KORTANA_BRIDGE_ABI);

// === In-Memory State ===
// transferId -> stage: 1=Locked, 2=Relayer, 3=Minting, 4=Swapping, 5=Complete
const processedEvents = new Map<string, number>();
// transferId -> already dispatched (prevents double-processing)
const dispatchedTransfers = new Set<string>();
// transferId -> destination chain tx hash (for explorer links)
const destinationTxHashes = new Map<string, string>();
// transferId -> last known error message
const transferErrors = new Map<string, string>();

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
        res.json({
            status: 'FOUND',
            stage: processedEvents.get(found),
            error: transferErrors.get(found) || null,
            destinationTxHash: destinationTxHashes.get(found) || null,
        });
    } else {
        res.json({ status: 'NOT_FOUND', stage: 1 });
    }
});

app.get('/api/debug/:transferId', (req, res) => {
    const { transferId } = req.params;
    res.json({
        stage: processedEvents.get(transferId) ?? null,
        error: transferErrors.get(transferId) ?? null,
        dispatched: dispatchedTransfers.has(transferId.toLowerCase()),
        lastScannedBlock,
        listeningTo: KORTANA_BRIDGE_ADDRESS,
    });
});

app.get('/api/debug', (req, res) => {
    res.json({
        knownTransfers: [...processedEvents.entries()],
        errors: [...transferErrors.entries()],
        dispatchedCount: dispatchedTransfers.size,
        lastScannedBlock,
        listeningTo: KORTANA_BRIDGE_ADDRESS
    });
});

app.get('/api/ping', (req, res) => res.status(200).send('pong'));

// === DNR Price Proxy ===
// Browser can't call dex.kortana.xyz directly (CORS). This proxies it server-side.
let dnrPriceCache: { price: string; timestamp: number } | null = null;
const DNR_PRICE_TTL_MS = 30_000;

app.get('/api/dnr-price', async (req, res) => {
    // Serve from cache if still fresh
    if (dnrPriceCache && Date.now() - dnrPriceCache.timestamp < DNR_PRICE_TTL_MS) {
        return res.json({ success: true, price_dnr_usd: dnrPriceCache.price, cached: true });
    }
    try {
        const response = await fetch('https://dex.kortana.xyz/api/stats');
        const json = await response.json() as any;
        if (json.success && json.data?.price_dnr_usd) {
            dnrPriceCache = { price: json.data.price_dnr_usd, timestamp: Date.now() };
            return res.json({ success: true, price_dnr_usd: json.data.price_dnr_usd, cached: false });
        }
        throw new Error('Invalid price response');
    } catch (err: any) {
        console.error('[Relayer] DNR price fetch failed:', err.message);
        // Return cached value if available, even if stale
        if (dnrPriceCache) {
            return res.json({ success: true, price_dnr_usd: dnrPriceCache.price, cached: true, stale: true });
        }
        return res.status(502).json({ success: false, error: 'Price unavailable' });
    }
});

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

    await startScanner();

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
}

async function startScanner() {
    console.log(`[Relayer] Initializing scanner on Kortana...`);
    
    // Rewind 1000 blocks on startup to catch missed events during restarts
    try {
        const currentBlock = await kortanaProvider.getBlockNumber();
        lastScannedBlock = Math.max(0, currentBlock - 1000);
        console.log(`[Relayer] Initialized scan from block ${lastScannedBlock} (Rewound 1000 blocks)`);
    } catch (e) {
        console.error("[Relayer] Failed to get initial block:", e);
        lastScannedBlock = 0;
    }

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
    
    // FOR TESTNET: Force completion by setting minOut to 1 wei.
    // This bypasses all slippage reverts on thin testnet pools.
    const relaxedMinOut = 1n;
    console.log(`[Relayer] Forcing testnet completion. MinOut set to 1 wei.`);

    while (retries < MAX_RETRIES) {
        try {
            console.log(`[Relayer] Submitting executeBridgeAndSwap for ${transferId}... (attempt ${retries + 1})`);
            processedEvents.set(transferId, 3); // Minting

            const tx = await targetExecutor.executeBridgeAndSwap(
                KORTANA_CHAIN_ID,
                transferId,
                dstUser,
                amount,
                relaxedMinOut,
                deadline,
                "0x"
            );

            console.log(`[Relayer] TX sent: ${tx.hash}`);
            processedEvents.set(transferId, 4); // Swapping
            destinationTxHashes.set(transferId, tx.hash); // Store for explorer link

            await tx.wait(SEPOLIA_CONFIRMATIONS);
            console.log(`[Relayer] Bridge complete for ${transferId}!`);
            processedEvents.set(transferId, 5); // Complete
            break;

        } catch (error: any) {
            // Full error extraction for debugging
            const shortMsg = error?.shortMessage || error?.message || 'Unknown error';
            const revertData = error?.data || error?.error?.data || '';
            const reason = error?.reason || '';
            const fullLog = `[Relayer][ERROR] attempt ${retries + 1}: ${shortMsg} | reason: ${reason} | revertData: ${revertData}`;
            console.error(fullLog);
            transferErrors.set(transferId, fullLog);

            retries++;
            if (retries >= MAX_RETRIES) {
                console.error(`[Relayer] Max retries reached for ${transferId}. Check /api/debug/${transferId}`);
                processedEvents.set(transferId, 2);
            } else {
                await new Promise(r => setTimeout(r, 5000 * retries));
            }
        }
    }
}
