import type { AppProps } from 'next/app';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { injected } from 'wagmi/connectors';
import '../styles/tokens.css';
import '../styles/globals.css';

// Define Kortana Testnet
const kortanaTestnet = {
  id: 72511,
  name: 'Kortana Testnet',
  nativeCurrency: { name: 'Dinar', symbol: 'DNR', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://poseidon-rpc.testnet.kortana.xyz/'] },
    public: { http: ['https://poseidon-rpc.testnet.kortana.xyz/'] },
  },
  blockExplorers: {
    default: { name: 'Kortana Explorer', url: 'https://explorer.testnet.kortana.xyz' },
  },
};

// Define Kortana Mainnet
const kortanaMainnet = {
  id: 9002,
  name: 'Kortana Mainnet',
  nativeCurrency: { name: 'Dinar', symbol: 'DNR', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://zeus-rpc.mainnet.kortana.xyz'] },
    public: { http: ['https://zeus-rpc.mainnet.kortana.xyz'] },
  },
  blockExplorers: {
    default: { name: 'Kortana Explorer', url: 'https://explorer.mainnet.kortana.xyz' },
  },
};

const config = createConfig({
  chains: [kortanaTestnet, kortanaMainnet, sepolia],
  connectors: [injected()],
  transports: {
    [kortanaTestnet.id]: http(),
    [kortanaMainnet.id]: http(),
    [sepolia.id]: http(),
  },
});

const queryClient = new QueryClient();

export default function App({ Component, pageProps }: AppProps) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <Component {...pageProps} />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
