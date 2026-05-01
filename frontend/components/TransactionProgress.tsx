import React from 'react';
import { motion } from 'framer-motion';

interface ProgressProps {
  stage: number;
  targetNetwork: any;
  originTxHash?: string;
}

const KORTANA_EXPLORER = 'https://poseidon-blockscout.testnet.kortana.xyz/tx/';

export const TransactionProgress: React.FC<ProgressProps> = ({ stage, targetNetwork, originTxHash }) => {
  const steps = [
    { title: "DNR Locked on Kortana", desc: "Confirmed on source chain" },
    { title: "Relayer Processing", desc: "Fetching DEX quote and verifying" },
    { title: `Minting wDNR on ${targetNetwork.name}`, desc: "Executing cross-chain payload" },
    { title: `Swapping wDNR → ${targetNetwork.symbol}`, desc: "Interacting with DEX Aggregator" },
    { title: `${targetNetwork.symbol} Delivered to Wallet`, desc: "Transaction complete" }
  ];

  return (
    <div className="card-modal relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--pp-navy)] to-[var(--pp-blue)] animate-pulse"></div>

      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-[var(--pp-blue-light)] rounded-full mb-4 shadow-inner border border-[var(--pp-blue)]/10">
          <div className="w-8 h-8 border-4 border-[var(--pp-blue)] border-t-transparent rounded-full animate-spin"></div>
        </div>
        <h3 className="text-xl font-bold text-[var(--pp-navy)]">Processing Transfer</h3>
        <p className="text-sm text-[var(--pp-gray-600)] mt-2">Please do not close this window</p>

        {originTxHash && (
          <a
            href={`${KORTANA_EXPLORER}${originTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mt-3 text-xs text-[var(--pp-blue)] font-mono bg-[var(--pp-blue-light)] px-3 py-1.5 rounded-full hover:underline"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
            {originTxHash.slice(0, 10)}...{originTxHash.slice(-8)} ↗
          </a>
        )}
      </div>

      <div className="space-y-6 pl-4 border-l-2 border-[var(--pp-gray-200)] ml-4 relative pb-4">
        {steps.map((step, idx) => {
          const isCompleted = stage > idx;
          const isActive = stage === idx;
          const isPending = stage < idx;

          return (
            <motion.div
              key={idx}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
              className={`relative ${isPending ? 'opacity-40' : 'opacity-100'}`}
            >
              <div className={`absolute -left-[25px] w-6 h-6 rounded-full border-2 flex items-center justify-center bg-white shadow-sm
                ${isCompleted ? 'border-[var(--pp-green)] bg-[var(--pp-green)] text-white' :
                  isActive ? 'border-[var(--pp-blue)] text-[var(--pp-blue)]' :
                  'border-[var(--pp-gray-200)]'}`}
              >
                {isCompleted ? <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg> :
                 isActive ? <span className="animate-pulse w-2.5 h-2.5 bg-[var(--pp-blue)] rounded-full"></span> : ''}
              </div>

              <div className="pl-4">
                <div className={`font-bold ${isActive ? 'text-[var(--pp-blue)]' : isCompleted ? 'text-[var(--pp-navy)]' : 'text-[var(--pp-gray-600)]'}`}>
                  {step.title}
                </div>
                <div className="text-sm text-[var(--pp-gray-600)] mt-0.5">{step.desc}</div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
