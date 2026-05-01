import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';

dotenv.config();

/**
 * @title Project Jupiter Relayer
 * @author Project Jupiter Team
 * @notice Off-chain TypeScript service that bridges Kortana to Polygon.
 * 
 * LIFECYCLE:
 * 1. Listens for `BridgeInitiated` events on the Kortana network.
 * 2. Fetches swap route from DEX Aggregator (e.g., 1inch) for wDNR -> POL.
 * 3. Applies safety margins to the minimum output.
 * 4. Formats calldata and submits transaction to `PolygonBridgeExecutor`.
 * 
 * SECURITY ASSUMPTIONS:
 * - Relayer's private key must be secured.
 * - DEX Aggregator responses must be sanitized (in the adapter).
 * - Multi-sig / threshold validators should be added before transaction submission.
 */

// Configuration
const KORTANA_RPC = process.env.KORTANA_RPC || 'https://poseidon-rpc.testnet.kortana.xyz/';
const SEPOLIA_RPC = process.env.SEPOLIA_RPC || 'https://ethereum-sepolia-rpc.publicnode.com';
const AMOY_RPC = process.env.AMOY_RPC || 'https://rpc-amoy.polygon.technology';
const BNB_RPC = process.env.BNB_RPC || 'https://bsc-testnet-rpc.publicnode.com';

const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY || '';
const KORTANA_BRIDGE_ADDRESS = process.env.KORTANA_BRIDGE_ADDRESS || '';

const SEPOLIA_EXECUTOR_ADDRESS = process.env.SEPOLIA_EXECUTOR_ADDRESS || '';
const AMOY_EXECUTOR_ADDRESS = process.env.AMOY_EXECUTOR_ADDRESS || '';
const BNB_EXECUTOR_ADDRESS = process.env.BNB_EXECUTOR_ADDRESS || '';

const CONFIRMATION_BLOCKS = 12;
const SEPOLIA_CONFIRMATIONS = 2;
const MAX_RETRIES = 3;
const SAFETY_MARGIN_BPS = 50; // 0.5%
const KORTANA_CHAIN_ID = process.env.KORTANA_CHAIN_ID ? parseInt(process.env.KORTANA_CHAIN_ID) : 72511;

const kortanaProvider = new ethers.JsonRpcProvider(KORTANA_RPC);
const sepoliaProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
const relayerWallet = new ethers.Wallet(RELAYER_PRIVATE_KEY, sepoliaProvider);

// ABIs
const kortanaBridgeAbi = [
    "event BridgeInitiated(bytes32 indexed transferId, address indexed sender, address indexed dstUser, uint256 dstChainId, uint256 amount, uint256 minOutNative, uint256 deadline, uint256 timestamp)"
];

const sepoliaExecutorAbi = [
    "function executeBridgeAndSwap(uint256 sourceChainId, bytes32 transferId, address dstUser, uint256 amount, uint256 minOutETH, uint256 deadline, bytes calldata extraData) external",
    "function processedTransfers(bytes32) external view returns (bool)"
];

const kortanaBridge = new ethers.Contract(KORTANA_BRIDGE_ADDRESS, kortanaBridgeAbi, kortanaProvider);
const sepoliaExecutor = new ethers.Contract(SEPOLIA_EXECUTOR_ADDRESS, sepoliaExecutorAbi, relayerWallet);

const processedEvents = new Map<string, number>(); // transferId -> stage (2: Relayer picked up, 3: Minting, 4: Swapping, 5: Complete)

// --- Express Backend API Setup ---
const app = express();
app.use(cors());

app.get('/api/status/:transferId', (req, res) => {
    const { transferId } = req.params;
    if (processedEvents.has(transferId)) {
        res.json({ status: 'FOUND', stage: processedEvents.get(transferId) });
    } else {
        res.json({ status: 'NOT_FOUND', stage: 1 }); // Stage 1 implies still locked on Kortana, relayer hasn't picked up yet
    }
});

const PORT = process.env.PORT || 3001;

// --- ANTI-SLEEP MECHANISM FOR RENDER ---
app.get('/api/ping', (req, res) => {
    res.status(200).send('pong');
});

// Ping our own endpoint every 10 minutes to prevent Render free tier from sleeping
const PING_INTERVAL = 10 * 60 * 1000; // 10 minutes
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

setInterval(async () => {
    try {
        await fetch(`${RENDER_EXTERNAL_URL}/api/ping`);
        console.log(`[Anti-Sleep] Pinged ${RENDER_EXTERNAL_URL}/api/ping successfully.`);
    } catch (error) {
        console.error("[Anti-Sleep] Ping failed:", error);
    }
}, PING_INTERVAL);

// --- START SERVER & LISTENERS ---
app.listen(PORT, () => {
    console.log(`Relayer API listening on port ${PORT}`);
    startRelayer();
});
// ---------------------------------

async function startRelayer() {
    console.log("Starting Project Jupiter Relayer...");
    console.log(`Listening to KortanaBridge at ${KORTANA_BRIDGE_ADDRESS}`);

    kortanaBridge.on("BridgeInitiated", async (transferId, sender, dstUser, dstChainId, amount, minOutNative, deadline, timestamp, event) => {
        if (event.address.toLowerCase() !== KORTANA_BRIDGE_ADDRESS.toLowerCase()) return;

        if (processedEvents.has(transferId)) {
            console.log(`Transfer ${transferId} already processed in cache. Skipping.`);
            return;
        }

        console.log(`Detected new bridge event: ${transferId} targeting chain ${dstChainId.toString()}`);
        // Stage 2: Relayer Processing
        processedEvents.set(transferId, 2);

        try {
            await processTransfer(transferId, dstUser, dstChainId, amount, minOutNative, deadline, event.log.blockNumber);
        } catch (error) {
            console.error(`Failed to process transfer ${transferId}:`, error);
        }
    });
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
    console.log(`Processing ${transferId} to ${dstUser} on chain ${dstChainId.toString()} for ${ethers.formatEther(amount)} DNR`);

    // Multi-chain routing logic
    let targetProvider, targetExecutor;
    
    if (dstChainId === BigInt(11155111)) {
        targetProvider = sepoliaProvider;
        targetExecutor = sepoliaExecutor;
    } else if (dstChainId === BigInt(80002)) {
        const amoyProvider = new ethers.JsonRpcProvider(AMOY_RPC);
        const amoyWallet = new ethers.Wallet(RELAYER_PRIVATE_KEY, amoyProvider);
        targetExecutor = new ethers.Contract(AMOY_EXECUTOR_ADDRESS, sepoliaExecutorAbi, amoyWallet);
        targetProvider = amoyProvider;
    } else if (dstChainId === BigInt(97)) {
        const bnbProvider = new ethers.JsonRpcProvider(BNB_RPC);
        const bnbWallet = new ethers.Wallet(RELAYER_PRIVATE_KEY, bnbProvider);
        targetExecutor = new ethers.Contract(BNB_EXECUTOR_ADDRESS, sepoliaExecutorAbi, bnbWallet);
        targetProvider = bnbProvider;
    } else {
        console.error(`Chain ${dstChainId.toString()} not currently supported by this relayer instance`);
        return;
    }

    // Step 1: Wait for block confirmations
    let currentBlock = await kortanaProvider.getBlockNumber();
    while (currentBlock < blockNumber + CONFIRMATION_BLOCKS) {
        await new Promise(r => setTimeout(r, 10000));
        currentBlock = await kortanaProvider.getBlockNumber();
    }

    // Double-processing guard
    const isProcessed = await targetExecutor.processedTransfers(transferId);
    if (isProcessed) {
        console.log(`Transfer ${transferId} already processed on-chain. Skipping.`);
        return;
    }

    // Step 2: Direct On-Chain Uniswap Routing (No APIs!)
    // We completely bypass off-chain REST aggregators. 
    // The UniswapSwapAdapter handles the routing entirely on the blockchain.

    // Step 3: Compute minOutNative
    const finalMinOutNative = originalMinOutNative;

    // Step 4: Encode extraData
    // We send empty bytes since the UniswapAdapter computes the path on-chain!
    const extraData = "0x";

    /// TODO: integrate multi-sig or threshold validator signatures before step 5

    // Step 5: Submit to Sepolia
    let retries = 0;
    while (retries < MAX_RETRIES) {
        try {
            console.log(`Submitting TX to target chain ${dstChainId.toString()} for ${transferId}...`);
            // Stage 3: Minting wDNR on target chain
            processedEvents.set(transferId, 3);

            const tx = await targetExecutor.executeBridgeAndSwap(
                KORTANA_CHAIN_ID,
                transferId,
                dstUser,
                amount,
                finalMinOutNative,
                deadline,
                extraData
            );

            console.log(`TX sent: ${tx.hash}. Waiting for confirmations...`);
            // Stage 4: Swapping
            processedEvents.set(transferId, 4);

            await tx.wait(SEPOLIA_CONFIRMATIONS);
            console.log(`Bridge completed successfully for ${transferId}!`);

            // Stage 5: Complete
            processedEvents.set(transferId, 5);
            break;
        } catch (error) {
            console.error(`Sepolia TX failed on attempt ${retries + 1}:`, error);
            retries++;
            if (retries >= MAX_RETRIES) {
                console.error(`Max retries reached for ${transferId}. Escalating to manual queue.`);
                // Escalate to manual queue (e.g. pagerduty, db flag)
            } else {
                await new Promise(r => setTimeout(r, 5000 * retries)); // Exponential backoff
            }
        }
    }
}

