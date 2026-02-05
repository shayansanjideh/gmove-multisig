'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { Plus, Search, AlertCircle, Loader2, AlertTriangle, X } from 'lucide-react';
import { useWatchedVaults } from '@/hooks/useMultisig';
import { VaultCard } from './VaultCard';
import { WalletConnect } from '@/components/wallet/WalletConnect';

export function VaultDashboard() {
  const router = useRouter();
  const { connected, account } = useWallet();
  const { data: vaults, isLoading } = useWatchedVaults();
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Get connected wallet address
  const connectedAddress = account?.address?.toString().toLowerCase();

  const handleCreateVault = () => {
    if (!connected) {
      setShowWalletModal(true);
      setPendingNavigation(true);
    } else {
      router.push('/create-multisig');
    }
  };

  // Auto-navigate after wallet connection
  useEffect(() => {
    if (connected && pendingNavigation) {
      setShowWalletModal(false);
      setPendingNavigation(false);
      router.push('/create-multisig');
    }
  }, [connected, pendingNavigation, router]);

  // Filter vaults based on ownership and search query
  const filteredVaults = vaults?.filter((vault) => {
    // If no wallet connected, don't show any vaults
    if (!connectedAddress) return false;

    // Check if connected wallet is an owner of this vault
    if (vault.owners && vault.owners.length > 0) {
      const isOwner = vault.owners.some(
        (owner) => owner.toLowerCase() === connectedAddress
      );
      if (!isOwner) return false;
    } else {
      // If owners list is not loaded yet, don't show the vault
      return false;
    }

    // Then apply search filter
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      vault.name?.toLowerCase().includes(query) ||
      vault.address.toLowerCase().includes(query)
    );
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Vaults</h1>
        <p className="text-gray-600">
          {connected
            ? "Multisig accounts where you are an owner"
            : "Connect your wallet to see your multisig accounts"}
        </p>
      </div>

      {/* Actions Bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search vaults by name or address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          onClick={handleCreateVault}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl"
        >
          <Plus className="w-5 h-5" />
          Create Vault
        </button>
      </div>

      {/* Vault Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : filteredVaults && filteredVaults.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredVaults.map((vault) => (
            <VaultCard
              key={vault.address}
              vault={vault}
              onClick={() => {
                // Navigate to vault detail page
                router.push(`/vault/${vault.address}`);
              }}
            />
          ))}
        </div>
      ) : searchQuery && (!filteredVaults || filteredVaults.length === 0) ? (
        <div className="bg-gray-50 rounded-xl p-12 text-center">
          <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No vaults found
          </h3>
          <p className="text-gray-600">
            No vaults match your search "{searchQuery}"
          </p>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-xl p-12 text-center">
          <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No vaults found
          </h3>
          <p className="text-gray-600 mb-6">
            {connected
              ? "You're not a member of any multisig vaults yet. Create one or get added as an owner to an existing vault."
              : "Connect your wallet to see your multisig vaults"}
          </p>
          {connected && (
            <button
              onClick={handleCreateVault}
              className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-purple-700 transition-all"
            >
              Create Your First Vault
            </button>
          )}
        </div>
      )}

      {/* Wallet Connection Modal */}
      {showWalletModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <AlertTriangle className="w-6 h-6 text-amber-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900">
                  Wallet Required
                </h3>
              </div>
              <button
                onClick={() => setShowWalletModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <p className="text-gray-600 mb-6">
              Please connect your wallet to create a multisig vault. You'll need a wallet to deploy and manage your multisig accounts on the Movement blockchain.
            </p>

            <div className="flex flex-col gap-3">
              <div className="flex justify-center">
                <WalletConnect />
              </div>
              <button
                onClick={() => setShowWalletModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}