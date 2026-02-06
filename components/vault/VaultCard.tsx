'use client';

import { Users, Shield, Coins, ExternalLink } from 'lucide-react';
import { formatAddress } from '@/lib/aptos';
import { formatMoveAmount } from '@/lib/utils';
import type { Vault } from '@/types/multisig';

interface VaultCardProps {
  vault: Vault;
  onClick: () => void;
}

export function VaultCard({ vault, onClick }: VaultCardProps) {
  return (
    <div
      onClick={onClick}
      className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-all cursor-pointer group"
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
            {vault.name}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {formatAddress(vault.address)}
          </p>
        </div>
        <ExternalLink className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-gray-500">
            <Users className="w-4 h-4" />
            <span className="text-xs">Owners</span>
          </div>
          <p className="text-lg font-semibold">{vault.owners?.length ?? 0}</p>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-gray-500">
            <Shield className="w-4 h-4" />
            <span className="text-xs">Threshold</span>
          </div>
          <p className="text-lg font-semibold">
            {vault.threshold ?? 0}/{vault.owners?.length ?? 0}
          </p>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-gray-500">
            <Coins className="w-4 h-4" />
            <span className="text-xs">Balance</span>
          </div>
          <p className="text-lg font-semibold">
            {formatMoveAmount(vault.balance ?? 0)} MOVE
          </p>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex -space-x-2">
            {(vault.owners ?? []).slice(0, 3).map((owner, i) => (
              <div
                key={owner}
                className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 border-2 border-white flex items-center justify-center"
                title={owner}
              >
                <span className="text-xs text-white font-medium">
                  {owner.slice(2, 4).toUpperCase()}
                </span>
              </div>
            ))}
            {(vault.owners ?? []).length > 3 && (
              <div className="w-8 h-8 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center">
                <span className="text-xs text-gray-600 font-medium">
                  +{(vault.owners ?? []).length - 3}
                </span>
              </div>
            )}
          </div>

          <span className="text-xs text-gray-500">
            Click to manage
          </span>
        </div>
      </div>
    </div>
  );
}