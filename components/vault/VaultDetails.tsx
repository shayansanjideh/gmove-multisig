'use client';

import { Vault } from '@/types/multisig';
import { formatAddress } from '@/lib/aptos';
import { Copy, Users, Shield, Coins } from 'lucide-react';
import { useState } from 'react';

interface VaultDetailsProps {
  vault: Vault;
}

export function VaultDetails({ vault }: VaultDetailsProps) {
  const [copied, setCopied] = useState(false);
  const [copiedOwner, setCopiedOwner] = useState<number | null>(null);

  const copyAddress = () => {
    navigator.clipboard.writeText(vault.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyOwnerAddress = (owner: string, index: number) => {
    navigator.clipboard.writeText(owner);
    setCopiedOwner(index);
    setTimeout(() => setCopiedOwner(null), 2000);
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {vault.name || 'Unnamed Vault'}
          </h1>
          <div className="flex items-center gap-2">
            <code className="text-sm text-gray-600">{formatAddress(vault.address, 8)}</code>
            <button
              onClick={copyAddress}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
              title="Copy full address"
            >
              <Copy className="w-4 h-4 text-gray-500" />
            </button>
            {copied && (
              <span className="text-xs text-green-600">Copied!</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2 text-gray-600 mb-2">
            <Users className="w-5 h-5" />
            <span className="text-sm font-medium">Owners</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {vault.owners?.length || 0}
          </p>
        </div>

        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2 text-gray-600 mb-2">
            <Shield className="w-5 h-5" />
            <span className="text-sm font-medium">Threshold</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {vault.threshold || 1} / {vault.owners?.length || 0}
          </p>
        </div>

        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2 text-gray-600 mb-2">
            <Coins className="w-5 h-5" />
            <span className="text-sm font-medium">Balance</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {vault.balance ? (vault.balance / 1e8).toFixed(4) : '0.0000'} MOVE
          </p>
        </div>
      </div>

      {vault.owners && vault.owners.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Vault Owners</h3>
          <div className="space-y-2">
            {vault.owners.map((owner, index) => (
              <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <code className="text-sm text-gray-600">{formatAddress(owner, 12)}</code>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyOwnerAddress(owner, index)}
                    className="p-1 hover:bg-gray-200 rounded transition-colors"
                    title="Copy full address"
                  >
                    <Copy className="w-3 h-3 text-gray-500" />
                  </button>
                  {copiedOwner === index && (
                    <span className="text-xs text-green-600">Copied!</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}