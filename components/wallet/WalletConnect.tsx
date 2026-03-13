'use client';

import { useState, useRef, useEffect } from 'react';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { Wallet, CheckCircle, Copy, LogOut, ChevronDown, Check } from 'lucide-react';
import { formatAddress } from '@/lib/aptos';
import { AddressDisplay } from '@/components/ui/AddressDisplay';
import { cn } from '@/lib/utils';

export function WalletConnect() {
  const { account, connected, connect, disconnect, wallets } = useWallet();
  const [isConnecting, setIsConnecting] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get the actual address string from the account object
  const getAccountAddress = () => {
    if (!account) return '';
    // Handle different possible account structures
    if (typeof account === 'string') return account;
    if (typeof account.address === 'string') return account.address;
    if (account.address?.toString) return account.address.toString();
    if (account.toString) return account.toString();
    return '';
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleConnect = async () => {
    if (connected) {
      setShowDropdown(!showDropdown);
      return;
    }

    setIsConnecting(true);
    try {
      // Prioritize Nightly wallet
      const nightlyWallet = wallets.find(w => w.name === 'Nightly');
      if (nightlyWallet) {
        await connect(nightlyWallet.name);
      } else {
        // Fallback to first available wallet
        const firstWallet = wallets[0];
        if (firstWallet) {
          await connect(firstWallet.name);
        }
      }
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleCopyAddress = async () => {
    const address = getAccountAddress();
    if (address) {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDisconnect = async () => {
    setShowDropdown(false);
    await disconnect();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Wallet Connect Button */}
      <button
        onClick={handleConnect}
        disabled={isConnecting}
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all',
          connected
            ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700'
            : 'bg-movement-400 hover:bg-movement-500 text-neutral-900 shadow-card hover:shadow-card-hover',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        {isConnecting ? (
          <>
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            <span>Connecting...</span>
          </>
        ) : connected && account ? (
          <>
            <CheckCircle className="w-4 h-4" />
            <AddressDisplay address={getAccountAddress()} truncateLength={6} copyOnClick={false} />
            <ChevronDown className={cn('w-4 h-4 transition-transform', showDropdown && 'rotate-180')} />
          </>
        ) : (
          <>
            <Wallet className="w-4 h-4" />
            <span>Connect Nightly</span>
          </>
        )}
      </button>

      {/* Dropdown Menu */}
      {showDropdown && connected && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-dropdown border border-neutral-200 py-2 z-50">
          {/* Full Address */}
          <div className="px-4 py-2 border-b border-neutral-100">
            <p className="text-xs text-neutral-500 mb-1">Connected Wallet</p>
            <p className="text-sm font-mono text-neutral-800 break-all">
              {getAccountAddress()}
            </p>
          </div>

          {/* Copy Address */}
          <button
            onClick={handleCopyAddress}
            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-600" />
                <span className="text-emerald-600">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copy Address</span>
              </>
            )}
          </button>

          {/* Disconnect */}
          <button
            onClick={handleDisconnect}
            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Disconnect</span>
          </button>
        </div>
      )}
    </div>
  );
}
