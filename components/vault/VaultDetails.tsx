'use client';

import { Vault } from '@/types/multisig';
import { getCurrentNetwork } from '@/lib/aptos';
import { Users, Shield, Coins, ExternalLink } from 'lucide-react';
import { formatCompactBalance } from '@/lib/utils';
import { AddressDisplay } from '@/components/ui/AddressDisplay';

interface VaultDetailsProps {
  vault: Vault;
}

export function VaultDetails({ vault }: VaultDetailsProps) {
  return (
    <div className="bg-white rounded-xl shadow-card border border-neutral-200 p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-800 tracking-heading mb-2">
            {vault.name || 'Unnamed Vault'}
          </h1>
          <div className="flex items-center gap-2">
            <AddressDisplay address={vault.address} truncateLength={20} showCopyIcon className="text-sm text-neutral-500" />
            <a
              href={`https://explorer.movementnetwork.xyz/account/${vault.address}?network=${getCurrentNetwork().explorerNetwork}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 hover:bg-neutral-100 rounded transition-colors"
              title="View on Explorer"
            >
              <ExternalLink className="w-4 h-4 text-neutral-400" />
            </a>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-100">
          <div className="flex items-center gap-2 text-neutral-500 mb-2">
            <Users className="w-5 h-5" />
            <span className="text-sm font-medium">Owners</span>
          </div>
          <p className="text-2xl font-bold text-neutral-800">
            {vault.owners?.length || 0}
          </p>
        </div>

        <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-100">
          <div className="flex items-center gap-2 text-neutral-500 mb-2">
            <Shield className="w-5 h-5" />
            <span className="text-sm font-medium">Threshold</span>
          </div>
          <p className="text-2xl font-bold text-neutral-800">
            {vault.threshold || 1} / {vault.owners?.length || 0}
          </p>
        </div>

        <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-100">
          <div className="flex items-center gap-2 text-neutral-500 mb-2">
            <Coins className="w-5 h-5" />
            <span className="text-sm font-medium">Balance</span>
          </div>
          <p className="text-2xl font-bold text-neutral-800">
            {formatCompactBalance(vault.balance ?? 0)} MOVE
          </p>
        </div>
      </div>

      {vault.owners && vault.owners.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-neutral-700 mb-2">Vault Owners</h3>
          <div className="space-y-2">
            {vault.owners.map((owner, index) => (
              <div key={index} className="flex items-center p-2 bg-neutral-50 rounded-lg border border-neutral-100">
                <AddressDisplay address={owner} truncateLength={20} showCopyIcon className="text-xs text-neutral-600" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
