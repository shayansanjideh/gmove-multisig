'use client';

import { Shield, Plus, HelpCircle, AlertTriangle } from 'lucide-react';
import { WalletConnect } from '@/components/wallet/WalletConnect';
import { NetworkSelector } from '@/components/wallet/NetworkSelector';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { useNetwork } from '@/contexts/NetworkContext';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Header() {
  const pathname = usePathname();
  const { network: walletNetwork, connected } = useWallet();
  const { network: appNetwork } = useNetwork();

  // Detect network mismatch (only when wallet is connected)
  // Note: Movement wallets often report network as "custom" since it's a custom network
  // So we check if the wallet URL contains indicators of the wrong network
  const isNetworkMismatch = connected && walletNetwork && (() => {
    const walletUrl = walletNetwork.url?.toLowerCase() || '';
    const walletName = walletNetwork.name?.toLowerCase() || '';

    // If wallet reports "custom", check the URL for network indicators
    if (walletName === 'custom') {
      if (appNetwork === 'testnet' && walletUrl.includes('mainnet')) return true;
      if (appNetwork === 'mainnet' && walletUrl.includes('testnet')) return true;
      return false; // Can't determine mismatch, assume OK
    }

    // Otherwise do direct name comparison
    return walletName !== appNetwork;
  })();

  return (
    <header className="bg-neutral-900 border-b border-neutral-800">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <Shield className="w-8 h-8 text-movement-400" />
          <h1 className="text-xl font-bold text-white tracking-heading">Movement Multisig</h1>
        </Link>

        <div className="flex items-center gap-3">
          <NetworkSelector />
          <WalletConnect />
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="max-w-7xl mx-auto px-4">
        <nav className="flex gap-6">
          <Link
            href="/"
            className={`flex items-center gap-2 px-1 py-3 text-sm font-medium border-b-2 transition-colors ${
              pathname === '/'
                ? 'border-movement-400 text-movement-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Shield className="w-4 h-4" />
            Vaults
          </Link>
          <Link
            href="/create-multisig"
            className={`flex items-center gap-2 px-1 py-3 text-sm font-medium border-b-2 transition-colors ${
              pathname === '/create-multisig'
                ? 'border-movement-400 text-movement-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Plus className="w-4 h-4" />
            Create Multisig
          </Link>
          <Link
            href="/faq"
            className={`flex items-center gap-2 px-1 py-3 text-sm font-medium border-b-2 transition-colors ${
              pathname === '/faq'
                ? 'border-movement-400 text-movement-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            FAQ
          </Link>
        </nav>
      </div>

      {/* Network Mismatch Warning Banner */}
      {isNetworkMismatch && (
        <div className="bg-red-500/90 text-white px-4 py-2">
          <div className="max-w-7xl mx-auto flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">
              <strong>Network Mismatch:</strong> Your wallet is connected to <strong>{walletNetwork?.name}</strong>, but this app is set to <strong>{appNetwork}</strong>.
              Transactions may fail. Please switch your wallet or app network.
            </p>
          </div>
        </div>
      )}
    </header>
  );
}
