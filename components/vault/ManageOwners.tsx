'use client';

import { useState } from 'react';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { useCreateProposalFixed } from '@/hooks/useMultisig-fixed';
import { useNetwork } from '@/contexts/NetworkContext';
import { isValidAddress, expandAddress, formatAddress } from '@/lib/aptos';
import { UserPlus, UserMinus, AlertCircle, Loader2, Info, Users, AlertTriangle } from 'lucide-react';
import { MODULES, MULTISIG_FUNCTIONS } from '@/constants/modules';
import { useToast } from '@/components/ui/toast';

interface ManageOwnersProps {
  vaultAddress: string;
  currentOwners: string[];
  threshold: number;
  onSuccess?: () => void;
}

export function ManageOwners({ vaultAddress, currentOwners, threshold, onSuccess }: ManageOwnersProps) {
  const { connected, network: walletNetwork } = useWallet();
  const { network: appNetwork } = useNetwork();
  const createProposal = useCreateProposalFixed(vaultAddress);
  const { showSuccessToast, showErrorToast } = useToast();

  // Detect network mismatch
  // Note: Movement wallets often report network as "custom" since it's a custom network
  // So we check if the wallet URL contains indicators of the wrong network
  const isNetworkMismatch = walletNetwork && (() => {
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

  const [activeAction, setActiveAction] = useState<'add' | 'remove'>('add');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [expandedAddress, setExpandedAddress] = useState('');

  const handleAddressChange = (value: string) => {
    setAddress(value);
    setError('');

    if (value) {
      if (isValidAddress(value)) {
        const expanded = expandAddress(value);
        setExpandedAddress(expanded);

        // Check if address is already an owner
        if (activeAction === 'add') {
          const isOwner = currentOwners.some(
            (owner) => owner.toLowerCase() === expanded.toLowerCase()
          );
          if (isOwner) {
            setError('This address is already an owner');
          }
        }

        // Check if trying to remove a non-owner
        if (activeAction === 'remove') {
          const isOwner = currentOwners.some(
            (owner) => owner.toLowerCase() === expanded.toLowerCase()
          );
          if (!isOwner) {
            setError('This address is not currently an owner');
          }
        }
      } else {
        setExpandedAddress('');
        setError('Invalid address format');
      }
    } else {
      setExpandedAddress('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!connected) {
      setError('Please connect your wallet');
      return;
    }

    if (!isValidAddress(address)) {
      setError('Invalid address');
      return;
    }

    const fullAddress = expandAddress(address);

    // Validation
    if (activeAction === 'add') {
      const isOwner = currentOwners.some(
        (owner) => owner.toLowerCase() === fullAddress.toLowerCase()
      );
      if (isOwner) {
        setError('This address is already an owner');
        return;
      }
    }

    if (activeAction === 'remove') {
      const isOwner = currentOwners.some(
        (owner) => owner.toLowerCase() === fullAddress.toLowerCase()
      );
      if (!isOwner) {
        setError('This address is not an owner');
        return;
      }

      // Can't remove if it would leave fewer owners than threshold
      if (currentOwners.length <= threshold) {
        setError(`Cannot remove owner: would leave fewer owners (${currentOwners.length - 1}) than threshold (${threshold})`);
        return;
      }
    }

    try {
      const functionName = activeAction === 'add'
        ? MULTISIG_FUNCTIONS.ADD_OWNER
        : MULTISIG_FUNCTIONS.REMOVE_OWNER;

      const payload = {
        function: `${MODULES.MULTISIG}::${functionName}` as `${string}::${string}::${string}`,
        typeArguments: [],
        functionArguments: [fullAddress],
      };

      const result = await createProposal.mutateAsync(payload);

      // Show success toast
      const actionText = activeAction === 'add' ? 'Add Owner' : 'Remove Owner';
      showSuccessToast(`${actionText} Proposal Created!`, result?.hash);

      // Reset form
      setAddress('');
      setExpandedAddress('');

      // Switch to Signing Room after a short delay
      if (onSuccess) {
        setTimeout(() => {
          onSuccess();
        }, 500);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create proposal';
      setError(errorMessage);
      showErrorToast('Failed to Create Proposal', errorMessage);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-card border border-neutral-200 p-6">
      <div className="flex items-center gap-2 mb-6">
        <Users className="w-5 h-5 text-movement-600" />
        <h2 className="text-lg font-semibold text-neutral-800">Manage Vault Owners</h2>
      </div>

      {/* Network Mismatch Warning */}
      {isNetworkMismatch && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-red-800">Network Mismatch Detected</h3>
              <p className="text-sm text-red-700 mt-1">
                Your wallet is connected to <strong>{walletNetwork?.name || 'unknown'}</strong>, but this app is set to <strong>{appNetwork}</strong>.
              </p>
              <p className="text-sm text-red-700 mt-1">
                Please switch your wallet to {appNetwork} or change the app network to match your wallet.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Current Owners */}
      <div className="mb-6 p-4 bg-neutral-50 rounded-lg">
        <h3 className="text-sm font-medium text-neutral-700 mb-3">
          Current Owners ({currentOwners.length})
        </h3>
        <div className="space-y-2">
          {currentOwners.map((owner, i) => (
            <div
              key={owner}
              className="flex items-center gap-2 text-sm font-mono text-neutral-600"
            >
              <div className="w-6 h-6 rounded-full bg-movement-400 flex items-center justify-center text-xs text-neutral-900">
                {i + 1}
              </div>
              <span>{formatAddress(owner, 8)}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          Threshold: {threshold} of {currentOwners.length} required to approve transactions
        </p>
      </div>

      {/* Action Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => {
            setActiveAction('add');
            setAddress('');
            setError('');
            setExpandedAddress('');
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            activeAction === 'add'
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
          }`}
        >
          <UserPlus className="w-4 h-4" />
          Add Owner
        </button>
        <button
          onClick={() => {
            setActiveAction('remove');
            setAddress('');
            setError('');
            setExpandedAddress('');
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            activeAction === 'remove'
              ? 'bg-red-100 text-red-700'
              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
          }`}
        >
          <UserMinus className="w-4 h-4" />
          Remove Owner
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            {activeAction === 'add' ? 'New Owner Address' : 'Owner Address to Remove'}
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => handleAddressChange(e.target.value)}
            placeholder="0x..."
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-movement-300 font-mono text-sm ${
              error ? 'border-red-500' : 'border-neutral-200'
            }`}
          />
          {expandedAddress && address !== expandedAddress && !error && (
            <div className="mt-2 p-2 bg-movement-50 border border-movement-200 rounded-lg">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-movement-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs">
                  <p className="text-movement-800 font-medium">Expanded address:</p>
                  <p className="text-movement-700 break-all font-mono mt-1">{expandedAddress}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        )}

        {/* Info Box */}
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-800">
              {activeAction === 'add'
                ? 'Adding a new owner requires approval from the current owners. A proposal will be created that needs to be approved.'
                : 'Removing an owner requires approval from the current owners. A proposal will be created that needs to be approved.'}
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={createProposal.isPending || !address || !!error}
          className={`w-full px-4 py-2 rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
            activeAction === 'add'
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'bg-red-600 text-white hover:bg-red-700'
          }`}
        >
          {createProposal.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Creating Proposal...
            </>
          ) : activeAction === 'add' ? (
            <>
              <UserPlus className="w-4 h-4" />
              Propose Adding Owner
            </>
          ) : (
            <>
              <UserMinus className="w-4 h-4" />
              Propose Removing Owner
            </>
          )}
        </button>
      </form>
    </div>
  );
}
