import React, { useState } from 'react';
import Head from 'next/head';
import { WalletConnect } from '../components/WalletConnect';
import { BridgeForm } from '../components/BridgeForm';
import { ConfirmationCard } from '../components/ConfirmationCard';
import { TransactionProgress } from '../components/TransactionProgress';
import { SuccessScreen } from '../components/SuccessScreen';
import { Logo } from '../components/Logo';
import { Modal } from '../components/Modal';
import { useWriteContract, useAccount, usePublicClient } from 'wagmi';
import { parseEther } from 'viem';
import { KortanaBridgeABI, KORTANA_BRIDGE_TESTNET } from '../config/contracts';

export default function Home() {
  // steps: 1 = Form, 2 = Confirm, 3 = Progress, 4 = Success
  const [step, setStep] = useState(1);
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [progressStage, setProgressStage] = useState(0);
  const [targetNetwork, setTargetNetwork] = useState<any>(null);

  const { writeContractAsync } = useWriteContract();
  const { isConnected, address } = useAccount();
  const publicClient = usePublicClient();

  const handleContinue = (amt: string, dest: string, deadline: number, net: any) => {
    setAmount(amt);
    setDestination(dest);
    setTargetNetwork(net);
    setStep(2); // Opens Modal
  };

  const handleConfirm = async () => {
    if (!isConnected) return;
    
    try {
      setStep(3); // Progress Modal
      setProgressStage(0); // Stage 0: Waiting for user to sign tx
      
      const deadline = Math.floor(Date.now() / 1000) + (30 * 60); // 30 mins
      const estimatedOut = parseFloat(amount) * targetNetwork.rate;
      const minOutNative = parseEther((estimatedOut * 0.995).toFixed(18)); // 0.5% slippage
      const amountWei = parseEther(amount);

      // 1. Send transaction to Kortana Testnet
      console.log(`Triggering MetaMask for transaction to ${targetNetwork.name}...`);
      
      if (!publicClient) throw new Error("Public client not found");

      // Auto-Approve Flow
      const dnrAddress = await publicClient.readContract({
        address: KORTANA_BRIDGE_TESTNET as `0x${string}`,
        abi: [{ "inputs": [], "name": "dnrToken", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" }],
        functionName: 'dnrToken'
      }) as `0x${string}`;

      const allowance = await publicClient.readContract({
        address: dnrAddress,
        abi: [{ "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }, { "internalType": "address", "name": "spender", "type": "address" }], "name": "allowance", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" }],
        functionName: 'allowance',
        args: [address as `0x${string}`, KORTANA_BRIDGE_TESTNET as `0x${string}`]
      }) as bigint;

      if (allowance < amountWei) {
        console.log("Insufficient allowance. Prompting approval...");
        // Use generic stage or just console log
        const approveTx = await writeContractAsync({
          address: dnrAddress,
          abi: KortanaBridgeABI, // Contains approve
          functionName: 'approve',
          args: [KORTANA_BRIDGE_TESTNET as `0x${string}`, amountWei]
        });
        console.log("Approval TX submitted. Waiting for confirmation...");
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
        console.log("Approval confirmed!");
      }

      console.log("Prompting Bridge Transaction...");
      const txHash = await writeContractAsync({
        abi: KortanaBridgeABI,
        address: KORTANA_BRIDGE_TESTNET as `0x${string}`,
        functionName: 'bridgeAndSwap',
        args: [BigInt(targetNetwork.id), amountWei, destination as `0x${string}`, minOutNative, BigInt(deadline)],
      });

      console.log("Tx Submitted:", txHash);
      setProgressStage(1); // DNR Locked

      // 2. Poll the Relayer Backend API for cross-chain status
      // In production, we would decode the tx receipt to get the exact transferId.
      // Here we simulate the frontend asking the backend every 3 seconds.
      const mockTransferId = "0x" + "0".repeat(64); // Placeholder for actual bytes32 transferId
      
      const pollInterval = setInterval(async () => {
        try {
          const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://jupiter-project-2isy.onrender.com";
          const res = await fetch(`${BACKEND_URL}/api/status/${mockTransferId}`);
          const data = await res.json();
          
          if (data.stage > progressStage) {
            setProgressStage(data.stage);
          }

          // If stage 5 is reached, transition to success screen
          if (data.stage === 5) {
            clearInterval(pollInterval);
            setTimeout(() => setStep(4), 1000);
          }
        } catch (err) {
          console.error("Backend not reachable. Ensure relayer is running.");
          // For demo purposes, auto-advance if backend is offline
          setProgressStage(prev => {
            if (prev >= 4) {
              clearInterval(pollInterval);
              setTimeout(() => setStep(4), 1000);
              return 5;
            }
            return prev + 1;
          });
        }
      }, 3000);

    } catch (error) {
      console.error("Transaction failed or rejected:", error);
      setStep(1); // Revert to form on failure
    }
  };

  const closeModals = () => {
    setStep(1);
    setAmount('');
    setDestination('');
    setProgressStage(0);
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

        {/* The Form is always present in the background when modals open */}
        <BridgeForm onContinue={handleContinue} />
        
        {/* Modals Layer */}
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
            <TransactionProgress stage={progressStage} targetNetwork={targetNetwork} />
          )}

          {step === 4 && targetNetwork && (
            <SuccessScreen 
              amountReceived={(parseFloat(amount) * targetNetwork.rate).toFixed(2)} 
              targetNetwork={targetNetwork}
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
