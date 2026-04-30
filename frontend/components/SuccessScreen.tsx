import React from 'react';
import { motion } from 'framer-motion';

interface SuccessScreenProps {
  amountReceived: string;
  targetNetwork: any;
  onReset: () => void;
}

export const SuccessScreen: React.FC<SuccessScreenProps> = ({ amountReceived, targetNetwork, onReset }) => {
  return (
    <div className="card-modal text-center py-8 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[var(--pp-green)]/5 to-transparent pointer-events-none"></div>
      
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
      <div className="text-[var(--pp-gray-600)] mb-8 font-medium">Your funds are now safely in your {targetNetwork.name} wallet.</div>
      
      <div className="bg-[var(--pp-gray-100)] p-6 rounded-[var(--pp-radius)] mb-8 inline-block w-full border border-[var(--pp-gray-200)] shadow-inner">
        <div className="text-sm text-[var(--pp-gray-600)] mb-2 font-semibold uppercase tracking-wider">Final Received Amount</div>
        <div className="text-5xl font-black text-[var(--pp-blue)] tracking-tight">{amountReceived} <span className="text-2xl font-bold text-[var(--pp-navy)]">{targetNetwork.symbol}</span></div>
      </div>
      
      <div className="flex gap-4">
        <button onClick={onReset} className="btn-primary shadow-lg shadow-[var(--pp-blue)]/20 py-4">Bridge Another Asset</button>
      </div>
    </div>
  );
};
