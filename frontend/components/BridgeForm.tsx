import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAccount, useBalance } from 'wagmi';

interface BridgeFormProps {
  onContinue: (amount: string, destination: string, deadline: number, targetNetwork: any) => void;
  balance?: string; // Kept for backwards compatibility
}

const NETWORKS = [
  { id: 11155111, name: "Ethereum Sepolia", symbol: "ETH", color: "#627EEA", rate: 0.84732 },
  { id: 80002, name: "Polygon Amoy", symbol: "POL", color: "#8247E5", rate: 2.14 },
  { id: 97, name: "BNB Testnet", symbol: "BNB", color: "#F3BA2F", rate: 0.04 }
];

export const BridgeForm: React.FC<BridgeFormProps> = ({ onContinue }) => {
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [deadline, setDeadline] = useState('30');
  const [targetNetwork, setTargetNetwork] = useState(NETWORKS[0]);
  
  const { address, isConnected } = useAccount();
  
  // Auto-fill destination with connected address
  useEffect(() => {
    if (isConnected && address && !destination) {
      setDestination(address);
    }
  }, [isConnected, address, destination]);

  // Fetch real DNR balance from Kortana (defaults to Testnet Chain ID: 72511)
  const { data: balanceData } = useBalance({
    address: address,
    chainId: 72511, 
  });

  const displayBalance = balanceData ? parseFloat(balanceData.formatted).toFixed(4) : '0.0000';
  
  const DNR_USD_PRICE = 1.05;

  const estimatedReceive = amount ? (parseFloat(amount) * targetNetwork.rate).toFixed(2) : '0.00';
  const isFormValid = parseFloat(amount) > 0 && destination.length > 0;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="card max-w-[480px] w-full mx-auto mt-8"
    >
      <div className="text-[var(--pp-gray-600)] text-sm font-semibold mb-6">
        Step 1 of 3 — Enter Details
      </div>

      <div className="mb-6">
        <label className="block text-[var(--pp-gray-900)] font-medium mb-2">You Send</label>
        <div className="bg-[var(--pp-gray-100)] p-4 rounded-[var(--pp-radius-sm)] border border-[var(--pp-gray-200)] focus-within:border-[var(--pp-blue)] transition-colors">
          <div className="flex justify-between items-center">
            <input 
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="bg-transparent text-3xl font-bold outline-none w-full text-[var(--pp-gray-900)]"
            />
            <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-full shadow-sm border border-[var(--pp-gray-200)]">
              <span className="font-bold text-[var(--pp-navy)]">DNR</span>
              <span className="text-xs bg-[var(--pp-gold)] text-white px-2 py-0.5 rounded-full shadow-sm">Kortana</span>
            </div>
          </div>
          <div className="flex justify-between mt-2 text-sm text-[var(--pp-gray-600)]">
            <span>≈ ${(parseFloat(amount || '0') * DNR_USD_PRICE).toFixed(2)} USD</span>
            <button 
              onClick={() => setAmount(balanceData ? balanceData.formatted : '0')} 
              className="text-[var(--pp-blue)] font-medium hover:underline flex items-center gap-1"
            >
              <span>MAX:</span> <span className="mono-text">{displayBalance}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-center -my-4 relative z-10">
        <motion.div 
          whileHover={{ rotate: 180 }}
          transition={{ duration: 0.3 }}
          className="bg-white p-2 w-10 h-10 flex items-center justify-center rounded-full shadow-md border border-[var(--pp-gray-200)] text-[var(--pp-blue)] z-10"
        >
          ↓
        </motion.div>
      </div>

      <div className="mb-6 mt-2">
        <label className="block text-[var(--pp-gray-900)] font-medium mb-2">Destination Network</label>
        <select 
          className="w-full p-3 rounded-[var(--pp-radius-sm)] border border-[var(--pp-gray-200)] focus:border-[var(--pp-blue)] outline-none bg-[var(--pp-gray-100)] text-[var(--pp-gray-900)] font-medium mb-4"
          value={targetNetwork.id}
          onChange={(e) => setTargetNetwork(NETWORKS.find(n => n.id === parseInt(e.target.value)) || NETWORKS[0])}
        >
          {NETWORKS.map(net => (
            <option key={net.id} value={net.id}>{net.name}</option>
          ))}
        </select>

        <label className="block text-[var(--pp-gray-900)] font-medium mb-2">You Receive (estimated)</label>
        <div className="bg-[var(--pp-blue-light)] p-4 rounded-[var(--pp-radius-sm)] border border-transparent">
          <div className="flex justify-between items-center">
            <div className="text-3xl font-bold text-[var(--pp-navy)]">{estimatedReceive}</div>
            <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-full shadow-sm border border-[var(--pp-gray-200)]">
              <span className="font-bold text-[var(--pp-navy)]">{targetNetwork.symbol}</span>
              <span className="text-xs text-white px-2 py-0.5 rounded-full shadow-sm" style={{ backgroundColor: targetNetwork.color }}>{targetNetwork.name.split(' ')[0]}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-[var(--pp-gray-900)] font-medium mb-2">Destination Address</label>
        <input 
          type="text"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="0x..."
          className="w-full p-3 rounded-[var(--pp-radius-sm)] border border-[var(--pp-gray-200)] focus:border-[var(--pp-blue)] outline-none mono-text text-sm"
        />
      </div>

      <button 
        className="btn-primary mt-4 text-lg py-3"
        disabled={!isFormValid || !isConnected}
        onClick={() => onContinue(amount, destination, parseInt(deadline), targetNetwork)}
      >
        {isConnected ? 'Continue' : 'Connect Wallet to Continue'}
      </button>
    </motion.div>
  );
};
