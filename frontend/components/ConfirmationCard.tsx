import React from 'react';

interface ConfirmationCardProps {
  amount: string;
  destination: string;
  estimatedOut: string;
  minOut: string;
  targetNetwork: any;
  onConfirm: () => void;
  onBack: () => void;
}

export const ConfirmationCard: React.FC<ConfirmationCardProps> = ({ 
  amount, destination, estimatedOut, minOut, targetNetwork, onConfirm, onBack 
}) => {
  return (
    <div className="card-modal relative overflow-hidden">
      {/* Decorative top bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--pp-navy)] to-[var(--pp-blue)]"></div>
      
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-[var(--pp-navy)]">Confirm Transfer</h3>
        <button onClick={onBack} className="text-[var(--pp-gray-600)] hover:text-[var(--pp-navy)] transition-colors">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="bg-gradient-to-b from-[var(--pp-gray-100)] to-white rounded-[var(--pp-radius)] p-6 mb-8 border border-[var(--pp-gray-200)] text-center shadow-sm">
        <div className="text-[var(--pp-gray-600)] mb-1 font-medium text-sm">You are sending</div>
        <div className="text-3xl font-black text-[var(--pp-navy)] tracking-tight">{amount} DNR</div>
        <div className="text-sm text-[var(--pp-gray-600)] mt-1">on Kortana Network</div>
        
        <div className="flex justify-center my-4">
          <div className="bg-white p-2 rounded-full shadow-sm border border-[var(--pp-gray-200)] text-[var(--pp-blue)]">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </div>
        </div>
        
        <div className="text-[var(--pp-gray-600)] mb-1 font-medium text-sm">You will receive</div>
        <div className="text-3xl font-black text-[var(--pp-blue)] tracking-tight">≈ {estimatedOut} {targetNetwork.symbol}</div>
        <div className="text-sm text-[var(--pp-gray-600)] mt-1">on {targetNetwork.name}</div>
      </div>

      <div className="bg-[var(--pp-gray-100)] rounded-[var(--pp-radius-sm)] p-4 mb-6 border border-[var(--pp-gray-200)]/50">
        <div className="space-y-3 text-sm">
          <div className="flex justify-between items-center border-b border-[var(--pp-gray-200)] pb-3">
            <span className="text-[var(--pp-gray-600)] font-medium">Minimum guaranteed</span>
            <span className="font-bold text-[var(--pp-navy)]">{minOut} {targetNetwork.symbol}</span>
          </div>
          <div className="flex justify-between items-center border-b border-[var(--pp-gray-200)] pb-3">
            <span className="text-[var(--pp-gray-600)] font-medium">Destination</span>
            <span className="mono-text bg-white px-2 py-1 rounded text-[var(--pp-navy)] font-semibold shadow-sm border border-[var(--pp-gray-200)]">{destination.slice(0,6)}...{destination.slice(-4)}</span>
          </div>
          <div className="flex justify-between items-center pb-1">
            <span className="text-[var(--pp-gray-600)] font-medium">Quote Expires</span>
            <span className="font-bold text-[var(--pp-red)]">30:00</span>
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        <button onClick={onBack} className="btn-ghost flex-1">Cancel</button>
        <button onClick={onConfirm} className="btn-primary flex-[2] flex items-center justify-center gap-2">
          <span>Confirm & Send</span>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </button>
      </div>
    </div>
  );
};
