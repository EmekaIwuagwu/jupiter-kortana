import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAccount, useBalance } from 'wagmi';
import { useLiveDnrPrice } from '../hooks/useLiveDnrPrice';

interface BridgeFormProps {
  onContinue: (amount: string, destination: string, deadline: number, targetNetwork: any) => void;
  balance?: string;
}

// Native token exchange rates vs USD (approximate testnet rates)
// Real rate = price_dnr_usd / native_token_price_usd
// We compute this dynamically from the live DNR price
const NETWORKS = [
  { id: 11155111, name: "Ethereum Sepolia", symbol: "ETH", color: "#627EEA", nativePriceUsd: 1800 },
  { id: 80002,    name: "Polygon Amoy",     symbol: "POL", color: "#8247E5", nativePriceUsd: 0.58 },
  { id: 97,       name: "BNB Testnet",      symbol: "BNB", color: "#F3BA2F", nativePriceUsd: 620 },
];

export const BridgeForm: React.FC<BridgeFormProps> = ({ onContinue }) => {
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [deadline] = useState('30');
  const [targetNetwork, setTargetNetwork] = useState(NETWORKS[0]);

  const { address, isConnected } = useAccount();
  const { price_dnr_usd, loading: priceLoading, error: priceError } = useLiveDnrPrice();

  // Auto-fill destination with connected address
  useEffect(() => {
    if (isConnected && address && !destination) {
      setDestination(address);
    }
  }, [isConnected, address, destination]);

  // Fetch real DNR balance from Kortana (Chain ID: 72511)
  const { data: balanceData } = useBalance({
    address: address,
    chainId: 72511,
  });

  const displayBalance = balanceData ? parseFloat(balanceData.formatted).toFixed(4) : '0.0000';

  // Live rate: how many native tokens 1 DNR buys
  const liveRate = price_dnr_usd / targetNetwork.nativePriceUsd;

  // Estimated receive amount in native token
  const estimatedReceive = amount ? (parseFloat(amount) * liveRate).toFixed(6) : '0.000000';

  // USD value of amount being sent
  const usdValue = amount ? (parseFloat(amount) * price_dnr_usd).toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0.00';

  const isFormValid = parseFloat(amount) > 0 && destination.length > 0;

  // Build a network object enriched with the live rate for downstream usage
  const enrichedNetwork = { ...targetNetwork, rate: liveRate };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="card max-w-[480px] w-full mx-auto mt-8"
    >
      <div className="flex justify-between items-center mb-6">
        <div className="text-[var(--pp-gray-600)] text-sm font-semibold uppercase tracking-wider">
          Step 1 of 3 — Enter Details
        </div>
        <div className="flex items-center gap-1.5 bg-green-50 text-green-600 px-2 py-0.5 rounded-full text-xs font-bold border border-green-100">
          <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
          OPERATIONAL
        </div>
      </div>

      {/* You Send */}
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
            <span className="flex items-center gap-1">
              ≈ ${usdValue} USD
              {priceLoading && <span className="text-xs opacity-60">(loading…)</span>}
              {priceError && <span className="text-xs text-orange-400">(cached)</span>}
            </span>
            <button
              onClick={() => setAmount(balanceData ? balanceData.formatted : '0')}
              className="text-[var(--pp-blue)] font-medium hover:underline flex items-center gap-1"
            >
              <span>MAX:</span> <span className="mono-text">{displayBalance}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Live DNR Price Badge */}
      <div className="flex justify-center mb-2">
        <div className="flex items-center gap-2 text-xs bg-white border border-[var(--pp-gray-200)] rounded-full px-3 py-1 shadow-sm text-[var(--pp-gray-600)]">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block"></span>
          <span>Live DNR: <strong className="text-[var(--pp-navy)]">${price_dnr_usd.toLocaleString('en-US', { maximumFractionDigits: 2 })}</strong></span>
        </div>
      </div>

      {/* Arrow */}
      <div className="flex justify-center -my-2 relative z-10">
        <motion.div
          whileHover={{ rotate: 180 }}
          transition={{ duration: 0.3 }}
          className="bg-white p-2 w-10 h-10 flex items-center justify-center rounded-full shadow-md border border-[var(--pp-gray-200)] text-[var(--pp-blue)] z-10"
        >
          ↓
        </motion.div>
      </div>

      {/* Destination Network */}
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
            <div>
              <div className="text-3xl font-bold text-[var(--pp-navy)]">{estimatedReceive}</div>
              <div className="text-xs text-[var(--pp-gray-600)] mt-1">
                Rate: 1 DNR = {liveRate.toFixed(6)} {targetNetwork.symbol}
              </div>
            </div>
            <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-full shadow-sm border border-[var(--pp-gray-200)]">
              <span className="font-bold text-[var(--pp-navy)]">{targetNetwork.symbol}</span>
              <span className="text-xs text-white px-2 py-0.5 rounded-full shadow-sm" style={{ backgroundColor: targetNetwork.color }}>{targetNetwork.name.split(' ')[0]}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Destination Address */}
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
        onClick={() => onContinue(amount, destination, parseInt(deadline), enrichedNetwork)}
      >
        {isConnected ? 'Continue' : 'Connect Wallet to Continue'}
      </button>
    </motion.div>
  );
};
