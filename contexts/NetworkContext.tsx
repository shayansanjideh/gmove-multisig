'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import { NETWORK_CONFIG, STORAGE_KEYS } from '@/constants/modules';

export type NetworkType = 'mainnet' | 'testnet';

interface NetworkContextType {
  network: NetworkType;
  setNetwork: (network: NetworkType) => void;
  aptosClient: Aptos;
  networkConfig: typeof NETWORK_CONFIG['mainnet'];
}

const NetworkContext = createContext<NetworkContextType | null>(null);

// Create clients for each network
const createClient = (network: NetworkType) => {
  const config = new AptosConfig({
    network: Network.CUSTOM,
    fullnode: NETWORK_CONFIG[network].rpc,
  });
  return new Aptos(config);
};

export function NetworkProvider({ children }: { children: ReactNode }) {
  // Initialize from localStorage or default to mainnet
  const [network, setNetworkState] = useState<NetworkType>('mainnet');
  const [aptosClient, setAptosClient] = useState(() => createClient('mainnet'));

  // Load saved network on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.NETWORK) as NetworkType;
    if (saved && (saved === 'mainnet' || saved === 'testnet')) {
      setNetworkState(saved);
      setAptosClient(createClient(saved));
    }
  }, []);

  const setNetwork = (newNetwork: NetworkType) => {
    setNetworkState(newNetwork);
    setAptosClient(createClient(newNetwork));
    localStorage.setItem(STORAGE_KEYS.NETWORK, newNetwork);
    // Reload the page to ensure all queries use the new network
    window.location.reload();
  };

  const value = {
    network,
    setNetwork,
    aptosClient,
    networkConfig: NETWORK_CONFIG[network],
  };

  return (
    <NetworkContext.Provider value={value}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  return context;
}
