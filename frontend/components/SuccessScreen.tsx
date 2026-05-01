import React from 'react';
import { motion } from 'framer-motion';

interface SuccessScreenProps {
  amountReceived: string;
  targetNetwork: any;
  originTxHash?: string;
  destinationTxHash?: string;
  onReset: () => void;
}

// Kortana Testnet Block Explorer (official)
const KORTANA_EXPLORER = 'https://explorer.testnet.kortana.xyz/tx/';

// Destination chain explorer URLs
const DESTINATION_EXPLORERS: Record<number, { name: string; url: string }> = {
  11155111: { name: 'Etherscan Sepolia', url: 'https://sepolia.etherscan.io/tx/' },
  80002:    { name: 'PolygonScan Amoy', url: 'https://amoy.polygonscan.com/tx/' },
  97:       { name: 'BscScan Testnet',  url: 'https://testnet.bscscan.com/tx/' },
};

const ExternalLinkIcon = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
  </svg>
);

const ClockIcon = () => (
  <svg className="w-4 h-4 text-orange-400 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

export const SuccessScreen: React.FC<SuccessScreenProps> = ({
  amountReceived,
  targetNetwork,
  originTxHash,
  destinationTxHash,
  onReset,
}) => {
  const destExplorer = DESTINATION_EXPLORERS[targetNetwork?.id];

  return (
    <div className="card-modal text-center py-8 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[var(--pp-green)]/5 to-transparent pointer-events-none"></div>

      {/* Success Icon */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        className="w-24 h-24 bg-gradient-to-br from-[var(--pp-green)] to-[#057A38] text-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_8px_30px_rgba(10,158,72,0.3)] border-4 border-white"
      >
        <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </motion.div>

      <h2 className="text-3xl font-black text-[var(--pp-navy)] mb-3 tracking-tight">Transfer Complete!</h2>
      <div className="text-[var(--pp-gray-600)] mb-6 font-medium">
        Your funds are now safely in your {targetNetwork?.name} wallet.
      </div>

      {/* Amount Received */}
      <div className="bg-[var(--pp-gray-100)] p-6 rounded-[var(--pp-radius)] mb-6 inline-block w-full border border-[var(--pp-gray-200)] shadow-inner">
        <div className="text-sm text-[var(--pp-gray-600)] mb-2 font-semibold uppercase tracking-wider">Final Received Amount</div>
        <div className="text-5xl font-black text-[var(--pp-blue)] tracking-tight">
          {amountReceived} <span className="text-2xl font-bold text-[var(--pp-navy)]">{targetNetwork?.symbol}</span>
        </div>
      </div>

      {/* Transaction Receipt — Both Chains */}
      <div className="mb-6 bg-[var(--pp-gray-100)] rounded-[var(--pp-radius)] border border-[var(--pp-gray-200)] overflow-hidden text-left">
        <div className="px-4 py-2 border-b border-[var(--pp-gray-200)] bg-white/60 text-xs font-semibold text-[var(--pp-gray-600)] uppercase tracking-wider">
          Transaction Receipts
        </div>
        <div className="divide-y divide-[var(--pp-gray-200)]">

          {/* Origin — Kortana Testnet */}
          <div className="px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 min-w-0">
              <CheckIcon />
              <div>
                <div className="text-xs font-semibold text-[var(--pp-navy)]">Origin — Kortana Testnet</div>
                <div className="text-xs text-[var(--pp-gray-600)]">Transaction confirmed on-chain</div>
              </div>
            </div>
            {originTxHash ? (
              <a
                href={`${KORTANA_EXPLORER}${originTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-mono text-[var(--pp-blue)] hover:underline bg-white border border-[var(--pp-gray-200)] px-2 py-1 rounded-md shadow-sm whitespace-nowrap"
              >
                {originTxHash.slice(0, 8)}…{originTxHash.slice(-6)}
                <ExternalLinkIcon />
              </a>
            ) : (
              <span className="text-xs text-[var(--pp-gray-600)]">N/A</span>
            )}
          </div>

          {/* Destination Chain */}
          <div className="px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 min-w-0">
              {destinationTxHash ? <CheckIcon /> : <ClockIcon />}
              <div>
                <div className="text-xs font-semibold text-[var(--pp-navy)]">
                  Destination — {targetNetwork?.name}
                </div>
                <div className="text-xs text-[var(--pp-gray-600)]">
                  {destinationTxHash ? 'Funds delivered to wallet' : 'Finalizing on destination chain…'}
                </div>
              </div>
            </div>
            {destinationTxHash && destExplorer ? (
              <a
                href={`${destExplorer.url}${destinationTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-mono text-[var(--pp-blue)] hover:underline bg-white border border-[var(--pp-gray-200)] px-2 py-1 rounded-md shadow-sm whitespace-nowrap"
              >
                {destinationTxHash.slice(0, 8)}…{destinationTxHash.slice(-6)}
                <ExternalLinkIcon />
              </a>
            ) : (
              <span className="text-xs text-[var(--pp-gray-600)] italic">Pending…</span>
            )}
          </div>

        </div>
      </div>

      <button onClick={onReset} className="btn-primary shadow-lg shadow-[var(--pp-blue)]/20 py-4">
        Bridge Another Asset
      </button>
    </div>
  );
};
