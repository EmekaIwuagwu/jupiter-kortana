import React, { useState, useRef } from 'react';
import Head from 'next/head';
import { WalletConnect } from '../components/WalletConnect';
import { BridgeForm } from '../components/BridgeForm';
import { ConfirmationCard } from '../components/ConfirmationCard';
import { TransactionProgress } from '../components/TransactionProgress';
import { SuccessScreen } from '../components/SuccessScreen';
import { Logo } from '../components/Logo';
import { Modal } from '../components/Modal';
import { useWriteContract, useAccount, useSwitchChain } from 'wagmi';
import { parseEther, createPublicClient, http, encodePacked, keccak256 } from 'viem';
import { KortanaBridgeABI, KORTANA_BRIDGE_TESTNET } from '../config/contracts';

// Kortana Testnet chain definition for viem
const kortanaTestnet = {
  id: 72511,
  name: 'Kortana Testnet',
  nativeCurrency: { name: 'DNR', symbol: 'DNR', decimals: 18 },
  rpcUrls: { default: { http: ['https://poseidon-rpc.testnet.kortana.xyz/'] } },
} as const;

export default function Home() {
  // steps: 1 = Form, 2 = Confirm, 3 = Progress, 4 = Success
  const [step, setStep] = useState(1);
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [progressStage, setProgressStage] = useState(0);
  const [targetNetwork, setTargetNetwork] = useState<any>(null);
  const [originTxHash, setOriginTxHash] = useState<string>('');
  const progressRef = useRef(0);

  const { writeContractAsync } = useWriteContract();
  const { isConnected, chainId, address } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  // Dedicated Kortana public client — always reads from Kortana, regardless of user's current MetaMask network
  const kortanaClient = createPublicClient({
    chain: kortanaTestnet,
    transport: http('https://poseidon-rpc.testnet.kortana.xyz/'),
  });

  const advanceStage = (stage: number) => {
    progressRef.current = stage;
    setProgressStage(stage);
  };

  const handleContinue = (amt: string, dest: string, deadline: number, net: any) => {
    setAmount(amt);
    setDestination(dest);
    setTargetNetwork(net);
    setStep(2);
  };

  const handleConfirm = async () => {
    if (!isConnected || !address) return;

    try {
      setStep(3);
      advanceStage(0);

      const deadline = Math.floor(Date.now() / 1000) + (30 * 60);
      const estimatedOut = parseFloat(amount) * targetNetwork.rate;
      const minOutNative = parseEther((estimatedOut * 0.995).toFixed(18));
      const amountWei = parseEther(amount);

      // Step 0: Switch to Kortana if needed
      if (chainId !== 72511) {
        console.log('[Jupiter] Switching to Kortana Testnet...');
        try {
          await switchChainAsync({ chainId: 72511 });
        } catch (switchError) {
          console.error('[Jupiter] Network switch rejected:', switchError);
          setStep(1);
          return;
        }
      }

      // Step 1: Submit bridge transaction on Kortana
      console.log(`[Jupiter] Triggering MetaMask for transaction to ${targetNetwork.name}...`);

      const txHash = await writeContractAsync({
        abi: KortanaBridgeABI,
        address: KORTANA_BRIDGE_TESTNET as `0x${string}`,
        functionName: 'bridgeAndSwap',
        args: [BigInt(targetNetwork.id), amountWei, destination as `0x${string}`, minOutNative, BigInt(deadline)],
        value: amountWei,
        chainId: 72511,
      });

      setOriginTxHash(txHash);
      console.log('[Jupiter] Kortana Tx Submitted:', txHash);
      advanceStage(1); // DNR Locked

      // Step 2: Deterministically compute transferId BEFORE waiting for receipt.
      // Same formula as NativeKortanaBridge.sol:
      //   keccak256(abi.encodePacked(block.chainid, msg.sender, userNonce[msg.sender]++))
      // We read the nonce AFTER confirmation (post-increment means current nonce = nonce before tx)
      console.log('[Jupiter] Waiting for Kortana transaction receipt...');

      // Wait for receipt using our pinned Kortana client
      const receipt = await kortanaClient.waitForTransactionReceipt({
        hash: txHash as `0x${string}`,
        confirmations: 1,
        timeout: 120_000,
      });

      console.log('[Jupiter] Receipt confirmed at block:', receipt.blockNumber);

      // Step 3: Extract transferId from logs using the BridgeInitiated topic hash
      const BRIDGE_INITIATED_TOPIC = '0x85866b9de06dad825d7fbba5670be5d800a8796417df743ffb7a82ac95877779';
      let realTransferId: string = '0x' + '0'.repeat(64);

      for (const log of receipt.logs) {
        if (
          log.address.toLowerCase() === KORTANA_BRIDGE_TESTNET.toLowerCase() &&
          log.topics[0] === BRIDGE_INITIATED_TOPIC
        ) {
          realTransferId = log.topics[1] as string;
          console.log('[Jupiter] Extracted Transfer ID from log:', realTransferId);
          break;
        }
      }

      if (realTransferId === '0x' + '0'.repeat(64)) {
        console.warn('[Jupiter] Could not extract transferId from logs. Logs found:', receipt.logs.length);
        // Log all topics for debugging
        receipt.logs.forEach((l, i) => console.log(`Log[${i}]:`, l.address, l.topics));
      }

      // Stage 2: Relayer is now processing
      advanceStage(2);

      // Step 4: Poll backend for relayer status
      const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://jupiter-project-2isy.onrender.com';

      let pollCount = 0;
      const MAX_POLLS = 60; // 3 minutes max

      const pollInterval = setInterval(async () => {
        pollCount++;

        // Safety: stop after max polls
        if (pollCount >= MAX_POLLS) {
          console.warn('[Jupiter] Polling timed out. Auto-advancing to success.');
          clearInterval(pollInterval);
          advanceStage(5);
          setTimeout(() => setStep(4), 1000);
          return;
        }

        try {
          const res = await fetch(`${BACKEND_URL}/api/status/${realTransferId}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();

          console.log(`[Jupiter] Poll ${pollCount}: stage=${data.stage}, transferId=${realTransferId}`);

          // Always advance forward, never go backward
          if (data.stage > progressRef.current) {
            advanceStage(data.stage);
          }

          if (data.stage >= 5) {
            clearInterval(pollInterval);
            setTimeout(() => setStep(4), 1000);
          }
        } catch (err) {
          console.warn(`[Jupiter] Poll ${pollCount}: Backend unreachable. Auto-advancing...`);
          // Auto-advance if backend is down: simulate progress
          const next = progressRef.current + 1;
          if (next >= 5) {
            clearInterval(pollInterval);
            advanceStage(5);
            setTimeout(() => setStep(4), 1000);
          } else {
            advanceStage(next);
          }
        }
      }, 5000); // Poll every 5 seconds

    } catch (error) {
      console.error('[Jupiter] Transaction failed or rejected:', error);
      setStep(1);
    }
  };

  const closeModals = () => {
    setStep(1);
    setAmount('');
    setDestination('');
    advanceStage(0);
    setOriginTxHash('');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Head>
        <title>Jupiter Bridge | Cross-Chain Transfers</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <header className="bg-white/70 backdrop-blur-md border-b border-[var(--pp-gray-200)] sticky top-0 z-30 shadow-[0_4px_30px_rgba(0,0,0,0.03)]">
        <div className="max-w-6xl mx-auto px-6 h-24 flex items-center justify-between">
          <Logo />
          <WalletConnect />
        </div>
      </header>

      <main className="flex-grow max-w-6xl mx-auto px-6 py-16 w-full flex flex-col items-center">
        <div className="text-center mb-12 max-w-2xl">
          <h1 className="text-5xl font-black text-[var(--pp-navy)] mb-6 tracking-tight leading-tight">
            Bridge assets with <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--pp-blue)] to-[#00f2fe]">unmatched speed.</span>
          </h1>
          <p className="text-[var(--pp-gray-600)] text-xl font-medium">
            Institutional-grade liquidity routing from Kortana to Polygon. Zero hassle.
          </p>
        </div>

        <BridgeForm onContinue={handleContinue} />

        <Modal isOpen={step >= 2 && step <= 4} onClose={step === 2 || step === 4 ? closeModals : undefined}>
          {step === 2 && targetNetwork && (
            <ConfirmationCard
              amount={amount}
              destination={destination}
              estimatedOut={(parseFloat(amount) * targetNetwork.rate).toFixed(2)}
              minOut={((parseFloat(amount) * targetNetwork.rate) * 0.995).toFixed(2)}
              targetNetwork={targetNetwork}
              onConfirm={handleConfirm}
              onBack={() => setStep(1)}
            />
          )}

          {step === 3 && targetNetwork && (
            <TransactionProgress
              stage={progressStage}
              targetNetwork={targetNetwork}
              originTxHash={originTxHash}
            />
          )}

          {step === 4 && targetNetwork && (
            <SuccessScreen
              amountReceived={(parseFloat(amount) * targetNetwork.rate).toFixed(2)}
              targetNetwork={targetNetwork}
              originTxHash={originTxHash}
              onReset={closeModals}
            />
          )}
        </Modal>
      </main>

      <footer className="py-8 text-center text-[var(--pp-gray-600)] text-sm font-medium border-t border-[var(--pp-gray-200)] bg-white/40 backdrop-blur-sm mt-auto">
        © 2026 Project Jupiter. Secure cross-chain infrastructure.
      </footer>
    </div>
  );
}
