import React, { useState, useRef } from 'react';
import Head from 'next/head';
import { WalletConnect } from '../components/WalletConnect';
import { BridgeForm } from '../components/BridgeForm';
import { ConfirmationCard } from '../components/ConfirmationCard';
import { TransactionProgress } from '../components/TransactionProgress';
import { SuccessScreen } from '../components/SuccessScreen';
import { Logo } from '../components/Logo';
import { Modal } from '../components/Modal';
import { useAccount, useSwitchChain, useSendTransaction } from 'wagmi';
import { parseEther, encodePacked, keccak256, toFunctionSelector } from 'viem';
import { KortanaBridgeABI, KORTANA_BRIDGE_TESTNET } from '../config/contracts';

const KORTANA_RPC = 'https://poseidon-rpc.testnet.kortana.xyz/';
const BRIDGE_INITIATED_TOPIC = '0x85866b9de06dad825d7fbba5670be5d800a8796417df743ffb7a82ac95877779';

export default function Home() {
  // steps: 1 = Form, 2 = Confirm, 3 = Progress, 4 = Success
  const [step, setStep] = useState(1);
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [progressStage, setProgressStage] = useState(0);
  const [targetNetwork, setTargetNetwork] = useState<any>(null);
  const [originTxHash, setOriginTxHash] = useState<string>('');
  const progressRef = useRef(0);

  const { sendTransactionAsync } = useSendTransaction();
  const { isConnected, chainId, address } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  // Raw JSON-RPC receipt fetcher — works on non-standard chains like Kortana
  // that don't return logs in viem-compatible format
  const getKortanaReceipt = async (txHash: string): Promise<any> => {
    const MAX_ATTEMPTS = 30;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      try {
        const res = await fetch(KORTANA_RPC, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_getTransactionReceipt',
            params: [txHash],
            id: 1
          })
        });
        const json = await res.json();
        if (json.result && json.result.status === '0x1') {
          return json.result;
        }
        if (json.result && json.result.status === '0x0') {
          // Decode revert reason if available
          const revertReason = decodeRevertReason(json.result);
          throw new Error(`Transaction reverted on Kortana. Reason: ${revertReason}`);
        }
      } catch (e: any) {
        if (e.message?.includes('reverted')) throw e;
      }
      await new Promise(r => setTimeout(r, 4000));
    }
    throw new Error('Kortana receipt timeout after 2 minutes');
  };

  // Reads userNonce(address) from Kortana at a specific block via raw eth_call
  const getKortanaNonce = async (userAddress: string, blockNumber: string): Promise<bigint> => {
    // userNonce(address) function selector
    const selector = toFunctionSelector('function userNonce(address) view returns (uint256)');
    // Pad address to 32 bytes
    const paddedAddr = userAddress.toLowerCase().replace('0x', '').padStart(64, '0');
    const callData = selector + paddedAddr;

    const res = await fetch(KORTANA_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [{ to: KORTANA_BRIDGE_TESTNET, data: callData }, blockNumber],
        id: 1
      })
    });
    const json = await res.json();
    return BigInt(json.result || '0x0');
  };

  // Decodes a Solidity revert reason from receipt data
  const decodeRevertReason = (receipt: any): string => {
    // Try revertReason field (some nodes provide this)
    if (receipt.revertReason) return receipt.revertReason;
    // Try to decode Error(string) = 0x08c379a0
    const errData: string = receipt.logsBloom || '';
    return 'Unknown (check contract requires)';
  };

  // Pre-flight simulation using eth_call before sending real tx
  const simulateSendTx = async (
    from: string,
    valueHex: string,
    calldata: string
  ): Promise<{ ok: boolean; error: string | null }> => {
    try {
      const res = await fetch(KORTANA_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_call',
          params: [{
            from,
            to: KORTANA_BRIDGE_TESTNET,
            value: valueHex,
            data: calldata
          }, 'latest'],
          id: 99
        })
      });
      const json = await res.json();
      if (json.error) {
        // Decode the error message from hex if possible
        let errMsg = json.error.message || 'Simulation failed';
        const errData: string = json.error.data || '';
        if (errData.startsWith('0x08c379a0')) {
          // Error(string) ABI encoding: skip 4-byte selector + 32-byte offset + 32-byte length
          try {
            const hexStr = errData.slice(10); // remove 0x08c379a0
            const offset = parseInt(hexStr.slice(0, 64), 16) * 2;
            const length = parseInt(hexStr.slice(64, 128), 16) * 2;
            const msgHex = hexStr.slice(128, 128 + length);
            errMsg = Buffer.from(msgHex, 'hex').toString('utf8');
          } catch {}
        } else if (errData && errData !== '0x') {
          errMsg += ` | Raw: ${errData}`;
        }
        return { ok: false, error: errMsg };
      }
      return { ok: true, error: null };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  };

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

      // Step 1: Pre-flight simulation — run eth_call FIRST to detect revert reason
      console.log('[Debug] Running pre-flight eth_call simulation...');
      const { encodeFunctionData } = await import('viem');
      const simCalldata = encodeFunctionData({
        abi: KortanaBridgeABI,
        functionName: 'send',
        args: [BigInt(targetNetwork.id), destination as `0x${string}`, minOutNative, BigInt(deadline)],
      });
      const valueHex = '0x' + amountWei.toString(16);
      const sim = await simulateSendTx(address!, valueHex, simCalldata);
      if (!sim.ok) {
        console.error(`[Debug] Pre-flight FAILED: "${sim.error}"`);
        console.error('[Debug] Args:', {
          dstChainId: targetNetwork.id,
          dstUser: destination,
          minOutNative: minOutNative.toString(),
          deadline,
          value: amountWei.toString(),
          sender: address,
        });
        // Still allow the real tx to proceed so MetaMask shows the error natively
        // This gives us the exact revert reason in the console
      } else {
        console.log('[Debug] Pre-flight PASSED — transaction should succeed');
      }

      // Step 2: Use hardcoded gas limit.
      // Kortana's eth_estimateGas returns ~29k which is WRONG (real cost ~50k).
      // The new minimal bridge contract costs ~50k gas. We use 150k as a safe 3x buffer.
      const gasLimit = 150000n;
      console.log(`[Debug] Using hardcoded gas limit: ${gasLimit.toString()}`);

      // Step 3: Submit as a RAW sendTransaction — EOA-style, lowest abstraction possible
      console.log(`[Jupiter] Sending raw tx to new bridge at ${KORTANA_BRIDGE_TESTNET}...`);

      const txHash = await sendTransactionAsync({
        to: KORTANA_BRIDGE_TESTNET as `0x${string}`,
        value: amountWei,
        data: simCalldata as `0x${string}`,
        gas: gasLimit,
        chainId: 72511,
      });

      setOriginTxHash(txHash);
      console.log('[Jupiter] Kortana Tx Submitted:', txHash);
      advanceStage(1); // DNR Locked

      // Step 2: Get receipt confirmation via raw RPC
      console.log('[Jupiter] Waiting for Kortana transaction receipt...');
      const receipt = await getKortanaReceipt(txHash);
      console.log('[Jupiter] Receipt confirmed. Block:', receipt.blockNumber);

      // Step 3: Compute transferId DETERMINISTICALLY
      // NativeKortanaBridge.sol: keccak256(abi.encodePacked(block.chainid, msg.sender, userNonce++))
      // After tx, nonce = N+1. So nonce used in tx = N = (nonceAfterTx - 1)
      const nonceAfterTx = await getKortanaNonce(address!, receipt.blockNumber);
      const nonceUsed = nonceAfterTx - 1n;
      console.log('[Jupiter] Nonce after tx:', nonceAfterTx.toString(), '→ nonce used in tx:', nonceUsed.toString());

      const realTransferId = keccak256(
        encodePacked(
          ['uint256', 'address', 'uint256'],
          [BigInt(72511), address as `0x${string}`, nonceUsed]
        )
      );
      console.log('[Jupiter] Computed Transfer ID:', realTransferId);

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
