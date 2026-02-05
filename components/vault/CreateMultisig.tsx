'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { useCreateMultisig } from '@/hooks/useMultisig';
import { isValidAddress, formatAddress } from '@/lib/aptos';

export function CreateMultisig() {
  const { account, connected } = useWallet();
  const createMultisig = useCreateMultisig();
  const router = useRouter();

  const [vaultName, setVaultName] = useState('');
  const [owners, setOwners] = useState<string[]>(['']);
  const [threshold, setThreshold] = useState(1);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState('');
  const [ownerErrors, setOwnerErrors] = useState<{ [key: number]: string }>({});

  // Get the actual address string from the account object
  const getAccountAddress = (): string => {
    if (!account) return '';
    // Handle different possible account structures
    if (typeof account === 'string') return account;
    if (typeof account.address === 'string') return account.address;
    if (account.address?.toString) return account.address.toString();
    if (account.toString) return account.toString();
    return '';
  };

  const addOwner = () => {
    setOwners([...owners, '']);
  };

  const removeOwner = (index: number) => {
    setOwners(owners.filter((_, i) => i !== index));
  };

  const updateOwner = (index: number, value: string) => {
    const updated = [...owners];
    updated[index] = value;
    setOwners(updated);

    // Validate the address inline
    if (value.trim()) {
      if (!isValidAddress(value)) {
        setOwnerErrors({ ...ownerErrors, [index]: 'Invalid address format' });
      } else {
        const newErrors = { ...ownerErrors };
        delete newErrors[index];
        setOwnerErrors(newErrors);
      }
    } else {
      const newErrors = { ...ownerErrors };
      delete newErrors[index];
      setOwnerErrors(newErrors);
    }
  };

  const validateAndCreate = async () => {
    setError('');

    // Get the connected wallet address
    const accountAddress = getAccountAddress();
    if (!accountAddress) {
      setError('Wallet not connected');
      return;
    }

    // Filter out empty owner inputs
    let additionalOwners = [...owners].filter(o => o.trim() !== '');

    // IMPORTANT: The Movement blockchain automatically adds the signer (connected wallet)
    // as the first owner, so we should NOT include it in the owners array to avoid duplicates

    // For a 1/1 multisig, we pass an empty owners array (blockchain adds the signer)
    // For multi-owner multisig, we only pass the additional owners
    let finalOwners = additionalOwners.map(o => o.toLowerCase());

    // Remove any duplicates from additional owners
    finalOwners = [...new Set(finalOwners)];

    console.log('Connected wallet (will be auto-added by blockchain):', accountAddress);
    console.log('Additional owners to pass:', finalOwners);
    console.log('Total owners will be:', finalOwners.length + 1, '(including auto-added signer)');

    // Validate all additional addresses
    for (const owner of finalOwners) {
      if (!isValidAddress(owner)) {
        // Don't prepend 0x if it's not a valid hex string
        const displayAddr = owner.startsWith('0x') ? owner :
                           /^[0-9a-fA-F]+$/.test(owner) ? `0x${owner}` :
                           owner;
        setError(`Invalid address: ${formatAddress(displayAddr)}`);
        return;
      }
    }

    // Total owners = additional owners + signer (auto-added by blockchain)
    const totalOwners = finalOwners.length + 1;

    // Validate threshold
    if (threshold < 1 || threshold > totalOwners) {
      setError(`Threshold must be between 1 and ${totalOwners}`);
      return;
    }

    // Allow 1/1 multisig (empty owners array, blockchain adds signer)
    if (finalOwners.length === 0 && threshold === 1) {
      console.log('Creating 1/1 multisig with only signer as owner');
    }

    try {
      console.log('Submitting multisig creation with:');
      console.log('Owners:', finalOwners);
      console.log('Threshold:', threshold);
      console.log('Name:', vaultName);

      const result = await createMultisig.mutateAsync({
        owners: finalOwners,
        threshold,
        name: vaultName.trim() || undefined,
      });

      console.log('Multisig created successfully!', result);
      setShowSuccess(true);

      // If we got the multisig address, navigate to it
      if (result.multisigAddress) {
        setTimeout(() => {
          router.push(`/vault/${result.multisigAddress}`);
        }, 1500);
      } else {
        // If no address found, just go to the main vault page
        setTimeout(() => {
          router.push('/');
        }, 1500);
      }

      // Reset form
      setTimeout(() => {
        setVaultName('');
        setOwners(['']);
        setThreshold(1);
        setShowSuccess(false);
      }, 3000);
    } catch (err: any) {
      console.error('Failed to create multisig:', err);

      // Parse the error message for user-friendly display
      const errorMessage = err?.message || String(err);

      if (errorMessage.toLowerCase().includes('rejected') ||
          errorMessage.toLowerCase().includes('denied') ||
          errorMessage.toLowerCase().includes('cancelled') ||
          errorMessage.toLowerCase().includes('canceled')) {
        setError('Transaction cancelled - you rejected the request in your wallet');
      } else if (errorMessage.toLowerCase().includes('insufficient')) {
        setError('Insufficient balance to pay for gas fees');
      } else if (errorMessage.toLowerCase().includes('not connected')) {
        setError('Wallet disconnected. Please reconnect and try again.');
      } else {
        setError(errorMessage);
      }
    }
  };

  if (!connected) {
    return (
      <div className="max-w-2xl mx-auto p-6 bg-amber-50 border border-amber-200 rounded-xl">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0" />
          <p className="text-amber-800">
            Please connect your wallet to create a multisig account
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-xl shadow-lg">
      <h2 className="text-2xl font-bold mb-6">Create New Multisig</h2>

      {/* Vault Name */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Vault Name
        </label>
        <input
          type="text"
          value={vaultName}
          onChange={(e) => setVaultName(e.target.value)}
          placeholder="e.g., Treasury, Team Fund, Operations..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500">
          Give your vault a memorable name to easily identify it
        </p>
      </div>

      {/* Current Account Notice */}
      {account && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <span className="font-semibold">Your wallet address will be added as an owner:</span>
            <br />
            <code className="mt-1 block font-mono text-xs">{getAccountAddress()}</code>
          </p>
        </div>
      )}

      {/* Owners Section */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Additional Owners (Optional)
          <span className="text-xs text-gray-500 ml-2">Your wallet is automatically included</span>
        </label>

        <div className="space-y-3">
          {owners.map((owner, index) => (
            <div key={index}>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={owner}
                  onChange={(e) => updateOwner(index, e.target.value)}
                  placeholder="0x... (owner address)"
                  className={`flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm ${
                    ownerErrors[index] ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {owners.length > 1 && (
                  <button
                    onClick={() => removeOwner(index)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
              </div>
              {ownerErrors[index] && (
                <p className="mt-1 text-xs text-red-600">{ownerErrors[index]}</p>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={addOwner}
          className="mt-3 flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Owner
        </button>
      </div>

      {/* Threshold Section */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Approval Threshold
        </label>
        <p className="text-xs text-gray-500 mb-3">
          Number of approvals required to execute transactions
        </p>

        <div className="flex items-center gap-4">
          <input
            type="number"
            min="1"
            max={owners.filter(o => o.trim() !== '').length + 1}
            value={threshold}
            onChange={(e) => {
              const value = parseInt(e.target.value) || 1;
              const maxOwners = owners.filter(o => o.trim() !== '').length + 1;
              // Clamp the value to valid range
              if (value > maxOwners) {
                setThreshold(maxOwners);
              } else if (value < 1) {
                setThreshold(1);
              } else {
                setThreshold(value);
              }
            }}
            className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="text-gray-600">
            out of {Math.max(1, owners.filter(o => o.trim() !== '').length + 1)} owners (including you)
          </span>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      )}

      {/* Success Message */}
      {showSuccess && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-800">
              Multisig created successfully!
            </p>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={validateAndCreate}
          disabled={createMultisig.isPending}
          className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {createMultisig.isPending ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Creating...
            </span>
          ) : (
            'Create Multisig'
          )}
        </button>
      </div>

      {/* Info Box */}
      <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <h3 className="font-semibold text-sm text-gray-900 mb-2">Important Notes:</h3>
        <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
          <li>The creator pays the gas fees for creating the multisig</li>
          <li>All owners will have equal rights in the multisig</li>
          <li>Threshold can be updated later with owner approval</li>
          <li>Make sure all owner addresses are correct before creating</li>
        </ul>
      </div>
    </div>
  );
}