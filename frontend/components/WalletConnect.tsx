import React, { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';

export const WalletConnect: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  useEffect(() => setMounted(true), []);

  const truncateAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  // Wait for client mounting to prevent hydration mismatch with wagmi's isConnected
  if (!mounted) {
    return <div className="w-[140px] h-10 bg-[var(--pp-gray-200)] animate-pulse rounded-full"></div>;
  }

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 bg-[var(--pp-blue-light)] text-[var(--pp-navy)] px-5 py-2.5 rounded-full font-bold text-sm shadow-sm border border-[var(--pp-blue)]/20 transition-all hover:shadow-md cursor-default">
          <div className="w-2.5 h-2.5 rounded-full bg-[var(--pp-green)] shadow-[0_0_8px_rgba(10,158,72,0.8)]"></div>
          {truncateAddress(address)}
        </div>
        <button 
          onClick={() => disconnect()}
          className="text-[var(--pp-gray-600)] hover:text-[var(--pp-red)] text-sm font-bold transition-colors uppercase tracking-wider text-xs"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button 
      onClick={() => connect({ connector: connectors[0] })}
      className="bg-gradient-to-r from-[var(--pp-navy)] to-[var(--pp-blue)] text-white px-7 py-2.5 rounded-full font-bold text-sm hover:opacity-90 transition-all shadow-[0_4px_14px_0_rgba(10,88,202,0.39)] hover:shadow-[0_6px_20px_rgba(10,88,202,0.23)] hover:-translate-y-0.5 active:translate-y-0"
    >
      Connect Wallet
    </button>
  );
};
