'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import { AptosWalletAdapterProvider, useWallet } from '@aptos-labs/wallet-adapter-react';

const LAST_WALLET_KEY = 'movement_last_wallet';

interface WalletProviderProps {
  children: ReactNode;
}

export function WalletProvider({ children }: WalletProviderProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <AptosWalletAdapterProvider
      autoConnect={true}
      onError={(error) => {
        console.error('Wallet adapter error:', error);
      }}
    >
      <WalletAutoReconnect>
        {children}
      </WalletAutoReconnect>
    </AptosWalletAdapterProvider>
  );
}

function WalletAutoReconnect({ children }: { children: ReactNode }) {
  const { connected, wallet, connect, wallets } = useWallet();
  const reconnectAttempted = useRef(false);

  // Save wallet name when connected
  useEffect(() => {
    if (connected && wallet) {
      localStorage.setItem(LAST_WALLET_KEY, wallet.name);
    }
  }, [connected, wallet]);

  // Retry connection if autoConnect didn't fire in time
  useEffect(() => {
    if (connected || reconnectAttempted.current) return;

    const savedWallet = localStorage.getItem(LAST_WALLET_KEY);
    if (!savedWallet) return;

    const isAvailable = wallets.some((w) => w.name === savedWallet);
    if (!isAvailable) return;

    reconnectAttempted.current = true;
    const timer = setTimeout(() => {
      try {
        connect(savedWallet);
      } catch (err) {
        console.warn('Auto-reconnect failed:', err);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [connected, wallets, connect]);

  return <>{children}</>;
}