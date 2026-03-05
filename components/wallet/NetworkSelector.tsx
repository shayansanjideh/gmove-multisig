'use client';

import { useState, useRef, useEffect } from 'react';
import { Globe, ChevronDown, Check } from 'lucide-react';
import { useNetwork, NetworkType } from '@/contexts/NetworkContext';
import { cn } from '@/lib/utils';

const networks: { id: NetworkType; name: string; color: string }[] = [
  { id: 'mainnet', name: 'Mainnet', color: 'bg-emerald-500' },
  { id: 'testnet', name: 'Testnet', color: 'bg-movement-400' },
];

export function NetworkSelector() {
  const { network, setNetwork } = useNetwork();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentNetwork = networks.find(n => n.id === network) || networks[0];

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

  const handleNetworkChange = (newNetwork: NetworkType) => {
    if (newNetwork !== network) {
      setNetwork(newNetwork);
    }
    setShowDropdown(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-all',
          'bg-neutral-800 hover:bg-neutral-700 text-neutral-300',
          'border border-neutral-700'
        )}
      >
        <div className={cn('w-2 h-2 rounded-full', currentNetwork.color)} />
        <span className="text-sm">{currentNetwork.name}</span>
        <ChevronDown className={cn('w-4 h-4 transition-transform', showDropdown && 'rotate-180')} />
      </button>

      {/* Dropdown Menu */}
      {showDropdown && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-dropdown border border-neutral-200 py-2 z-50">
          <div className="px-3 py-2 border-b border-neutral-100">
            <p className="text-xs text-neutral-500 font-medium">Select Network</p>
          </div>

          {networks.map((net) => (
            <button
              key={net.id}
              onClick={() => handleNetworkChange(net.id)}
              className={cn(
                'w-full flex items-center justify-between px-3 py-2 text-sm transition-colors',
                network === net.id ? 'bg-movement-50 text-movement-800' : 'text-neutral-700 hover:bg-neutral-50'
              )}
            >
              <div className="flex items-center gap-2">
                <div className={cn('w-2 h-2 rounded-full', net.color)} />
                <span>{net.name}</span>
              </div>
              {network === net.id && <Check className="w-4 h-4" />}
            </button>
          ))}

          <div className="px-3 py-2 border-t border-neutral-100 mt-1">
            <p className="text-xs text-neutral-400">
              Switching networks will reload the page
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
