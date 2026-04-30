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
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY || '';
const KORTANA_BRIDGE_ADDRESS = process.env.KORTANA_BRIDGE_ADDRESS || '';
const SEPOLIA_EXECUTOR_ADDRESS = process.env.SEPOLIA_EXECUTOR_ADDRESS || '';
const WDNR_SEPOLIA_ADDRESS = process.env.WDNR_SEPOLIA_ADDRESS || '';
const ETH_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'; // Standard for native asset in 1inch
const API_KEY = process.env.DEX_API_KEY || '';

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
    if (dstChainId !== BigInt(11155111)) {
        console.error(`Chain ${dstChainId.toString()} not currently supported by this relayer instance`);
        // We would mark this as FAILED in a database here, as this relayer node doesn't support the requested chain
        return;
    }

    // Step 1: Wait for block confirmations
    let currentBlock = await kortanaProvider.getBlockNumber();
    while (currentBlock < blockNumber + CONFIRMATION_BLOCKS) {
        await new Promise(r => setTimeout(r, 10000));
        currentBlock = await kortanaProvider.getBlockNumber();
    }

    // Double-processing guard
    const isProcessed = await sepoliaExecutor.processedTransfers(transferId);
    if (isProcessed) {
        console.log(`Transfer ${transferId} already processed on-chain. Skipping.`);
        return;
    }

    // Step 2: DEX Aggregator REST Quote
    // Example: 1inch-style GET /swap
    const quoteUrl = `https://api.1inch.dev/swap/v5.2/11155111/swap?src=${WDNR_SEPOLIA_ADDRESS}&dst=${ETH_ADDRESS}&amount=${amount.toString()}&from=${SEPOLIA_EXECUTOR_ADDRESS}&slippage=1&disableEstimate=true`;
    
    let txData, toAmountStr;
    try {
        const response = await fetch(quoteUrl, {
            headers: { 'Authorization': `Bearer ${API_KEY}`, 'Accept': 'application/json' }
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.description || 'Quote fetch failed');
        txData = data.tx;
        toAmountStr = data.toAmount;
    } catch (error) {
        console.error(`REST API failure for ${transferId}:`, error);
        // Error Handling: REST API failure -> log, mark transfer as PENDING_RETRY, skip submission
        return;
    }

    // Step 3: Compute minOutNative
    const toAmount = BigInt(toAmountStr);
    const minOutNative = toAmount * BigInt(10000 - SAFETY_MARGIN_BPS) / 10000n;

    // Use the higher of the user's requested minimum and the safely calculated slippage minimum
    const finalMinOutNative = minOutNative > originalMinOutNative ? minOutNative : originalMinOutNative;

    // Step 4: Encode extraData
    const extraData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'bytes'],
        [txData.to, txData.data]
    );

    /// TODO: integrate multi-sig or threshold validator signatures before step 5

    // Step 5: Submit to Sepolia
    let retries = 0;
    while (retries < MAX_RETRIES) {
        try {
            console.log(`Submitting TX to Sepolia for ${transferId}...`);
            // Stage 3: Minting wDNR on Sepolia
            processedEvents.set(transferId, 3);
            
            const sepoliaTx = await sepoliaExecutor.executeBridgeAndSwap(
                KORTANA_CHAIN_ID,
                transferId,
                dstUser,
                amount,
                finalMinOutNative,
                deadline,
                extraData
            );
            
            console.log(`TX sent: ${sepoliaTx.hash}. Waiting for confirmations...`);
            // Stage 4: Swapping
            processedEvents.set(transferId, 4);
            
            await sepoliaTx.wait(SEPOLIA_CONFIRMATIONS);
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

main().catch(console.error);
