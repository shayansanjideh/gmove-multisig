'use client';

import { useState, useRef, useEffect } from 'react';
import { Users, Shield, Coins, ExternalLink, Pencil, Check, X } from 'lucide-react';
import { formatAddress } from '@/lib/aptos';
import { formatCompactBalance } from '@/lib/utils';
import type { Vault } from '@/types/multisig';

interface VaultCardProps {
  vault: Vault;
  onClick: () => void;
  onRename?: (address: string, name: string) => void;
}

export function VaultCard({ vault, onClick, onRename }: VaultCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(vault.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== vault.name && onRename) {
      onRename(vault.address, trimmed);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditName(vault.name);
    setIsEditing(false);
  };

  return (
    <div
      onClick={isEditing ? undefined : onClick}
      className="bg-white border border-neutral-200 rounded-xl p-6 shadow-card hover:shadow-card-hover transition-all duration-200 cursor-pointer group"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <input
                ref={inputRef}
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                  if (e.key === 'Escape') handleCancel();
                }}
                className="text-lg font-semibold text-neutral-800 bg-neutral-50 border border-neutral-300 rounded px-2 py-0.5 w-full focus:outline-none focus:ring-2 focus:ring-movement-300"
              />
              <button
                onClick={handleSave}
                className="p-1 hover:bg-emerald-50 rounded transition-colors"
              >
                <Check className="w-4 h-4 text-emerald-600" />
              </button>
              <button
                onClick={handleCancel}
                className="p-1 hover:bg-red-50 rounded transition-colors"
              >
                <X className="w-4 h-4 text-red-500" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <h3 className="text-lg font-semibold text-neutral-800 group-hover:text-movement-600 transition-colors truncate">
                {vault.name}
              </h3>
              {onRename && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditName(vault.name);
                    setIsEditing(true);
                  }}
                  className="p-1 opacity-0 group-hover:opacity-100 hover:bg-neutral-100 rounded transition-all"
                  title="Rename vault"
                >
                  <Pencil className="w-3.5 h-3.5 text-neutral-400" />
                </button>
              )}
            </div>
          )}
          <p className="text-sm text-neutral-400 font-mono mt-1">
            {formatAddress(vault.address)}
          </p>
        </div>
        <ExternalLink className="w-5 h-5 text-neutral-400 group-hover:text-movement-500 transition-colors shrink-0 ml-2" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-neutral-400">
            <Users className="w-4 h-4" />
            <span className="text-xs">Owners</span>
          </div>
          <p className="text-lg font-semibold text-neutral-800">{vault.owners?.length ?? 0}</p>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-neutral-400">
            <Shield className="w-4 h-4" />
            <span className="text-xs">Threshold</span>
          </div>
          <p className="text-lg font-semibold text-neutral-800">
            {vault.threshold ?? 0}/{vault.owners?.length ?? 0}
          </p>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-neutral-400">
            <Coins className="w-4 h-4" />
            <span className="text-xs">Balance</span>
          </div>
          <p className="text-lg font-semibold text-neutral-800">
            {formatCompactBalance(vault.balance ?? 0)} MOVE
          </p>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-neutral-100">
        <div className="flex items-center justify-between">
          <div className="flex -space-x-2">
            {(vault.owners ?? []).slice(0, 3).map((owner) => (
              <div
                key={owner}
                className="w-8 h-8 rounded-full bg-movement-400 border-2 border-white flex items-center justify-center"
                title={owner}
              >
                <span className="text-xs text-neutral-900 font-medium">
                  {owner.slice(2, 4).toUpperCase()}
                </span>
              </div>
            ))}
            {(vault.owners ?? []).length > 3 && (
              <div className="w-8 h-8 rounded-full bg-neutral-200 border-2 border-white flex items-center justify-center">
                <span className="text-xs text-neutral-600 font-medium">
                  +{(vault.owners ?? []).length - 3}
                </span>
              </div>
            )}
          </div>

          <span className="text-xs text-neutral-400">
            Click to manage
          </span>
        </div>
      </div>
    </div>
  );
}
