'use client';

import { useState } from 'react';
import { useCreateProposalFixed } from '@/hooks/useMultisig-fixed';
import { AlertCircle, Loader2, Plus, Trash2, Code, Wallet, X, Terminal } from 'lucide-react';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { useToast } from '@/components/ui/toast';

interface DeveloperModeFormProps {
  vaultAddress: string;
  onSuccess?: () => void;
}

type ArgType = 'address' | 'u64' | 'u128' | 'u256' | 'bool' | 'string' | 'vector<u8>';

interface FunctionArg {
  id: number;
  type: ArgType;
  value: string;
}

const ARG_TYPES: { value: ArgType; label: string; placeholder: string }[] = [
  { value: 'address', label: 'Address', placeholder: '0x1234...' },
  { value: 'u64', label: 'u64', placeholder: '1000000' },
  { value: 'u128', label: 'u128', placeholder: '0' },
  { value: 'u256', label: 'u256', placeholder: '0' },
  { value: 'bool', label: 'Bool', placeholder: 'true or false' },
  { value: 'string', label: 'String', placeholder: 'hello' },
  { value: 'vector<u8>', label: 'vector<u8>', placeholder: '0x deadbeef (hex bytes)' },
];

export function DeveloperModeForm({ vaultAddress, onSuccess }: DeveloperModeFormProps) {
  const createProposal = useCreateProposalFixed(vaultAddress);
  const { connected, connect, wallets } = useWallet();
  const { showSuccessToast, showErrorToast } = useToast();

  const [functionPath, setFunctionPath] = useState('');
  const [typeArgs, setTypeArgs] = useState<string[]>([]);
  const [funcArgs, setFuncArgs] = useState<FunctionArg[]>([]);
  const [error, setError] = useState('');
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  let nextArgId = 0;
  const getNextId = () => {
    nextArgId = Math.max(nextArgId, ...funcArgs.map(a => a.id), 0) + 1;
    return nextArgId;
  };

  const validateFunctionPath = (path: string): boolean => {
    return /^0x[0-9a-fA-F]+::\w+::\w+$/.test(path);
  };

  const parseArgValue = (arg: FunctionArg): any => {
    switch (arg.type) {
      case 'bool':
        return arg.value === 'true' || arg.value === '1';
      case 'u64':
      case 'u128':
      case 'u256':
        return arg.value;
      case 'vector<u8>': {
        const hex = arg.value.replace(/^0x/, '').replace(/\s/g, '');
        const bytes: number[] = [];
        for (let i = 0; i < hex.length; i += 2) {
          bytes.push(parseInt(hex.substring(i, i + 2), 16));
        }
        return bytes;
      }
      default:
        return arg.value;
    }
  };

  const handleWalletConnect = async (walletName: string) => {
    setIsConnecting(true);
    setError('');
    try {
      await connect(walletName);
      setShowWalletModal(false);
    } catch (err) {
      console.error('Failed to connect wallet:', err);
      setError('Failed to connect wallet. Please try again.');
    } finally {
      setIsConnecting(false);
    }
  };

  // Type Arguments
  const addTypeArg = () => setTypeArgs([...typeArgs, '']);
  const updateTypeArg = (index: number, value: string) => {
    const updated = [...typeArgs];
    updated[index] = value;
    setTypeArgs(updated);
  };
  const removeTypeArg = (index: number) => setTypeArgs(typeArgs.filter((_, i) => i !== index));

  // Function Arguments
  const addFuncArg = () => setFuncArgs([...funcArgs, { id: getNextId(), type: 'address', value: '' }]);
  const updateFuncArg = (id: number, field: 'type' | 'value', val: string) => {
    setFuncArgs(funcArgs.map(a => a.id === id ? { ...a, [field]: val } : a));
  };
  const removeFuncArg = (id: number) => setFuncArgs(funcArgs.filter(a => a.id !== id));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!connected) {
      setShowWalletModal(true);
      return;
    }

    if (!validateFunctionPath(functionPath)) {
      setError('Invalid function path. Use format: 0xADDRESS::module::function');
      return;
    }

    for (let i = 0; i < typeArgs.length; i++) {
      if (!typeArgs[i].trim()) {
        setError(`Type argument ${i + 1} is empty`);
        return;
      }
    }

    for (let i = 0; i < funcArgs.length; i++) {
      if (!funcArgs[i].value.trim()) {
        setError(`Argument ${i + 1} value is empty`);
        return;
      }
    }

    try {
      const payload = {
        function: functionPath as `${string}::${string}::${string}`,
        typeArguments: typeArgs,
        functionArguments: funcArgs.map(parseArgValue),
      };

      const result = await createProposal.mutateAsync(payload);

      showSuccessToast('Developer Proposal Created!', result?.hash);

      setFunctionPath('');
      setTypeArgs([]);
      setFuncArgs([]);

      if (onSuccess) {
        setTimeout(() => onSuccess(), 500);
      }
    } catch (err) {
      if (err instanceof Error && err.message.toLowerCase().includes('wallet')) {
        setShowWalletModal(true);
      } else {
        const errorMessage = err instanceof Error ? err.message : 'Failed to create proposal';
        setError(errorMessage);
        showErrorToast('Failed to Create Proposal', errorMessage);
      }
    }
  };

  return (
    <>
      <div className="bg-white rounded-xl shadow-card border border-neutral-200 p-6">
        <div className="flex items-center gap-2 mb-1">
          <Terminal className="w-5 h-5 text-violet-600" />
          <h2 className="text-lg font-semibold text-neutral-800">Developer Mode</h2>
        </div>
        <p className="text-sm text-neutral-500 mb-4">
          Execute any Move entry function through your multisig.
        </p>

        {!connected && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-amber-600" />
              <p className="text-sm text-amber-800">Please connect your wallet to create proposals</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Function Path */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Function Path
            </label>
            <input
              type="text"
              value={functionPath}
              onChange={(e) => { setFunctionPath(e.target.value); setError(''); }}
              placeholder="0x1::coin::transfer"
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 font-mono text-sm"
            />
            <p className="mt-1 text-xs text-neutral-500">
              Format: 0xADDRESS::module::function_name
            </p>
          </div>

          {/* Type Arguments */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-neutral-700">
                Type Arguments {typeArgs.length > 0 && <span className="text-neutral-400">({typeArgs.length})</span>}
              </label>
              <button
                type="button"
                onClick={addTypeArg}
                className="text-xs text-violet-600 hover:text-violet-800 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            {typeArgs.length === 0 ? (
              <p className="text-xs text-neutral-400 italic">No type arguments. Click &quot;Add&quot; for generic functions.</p>
            ) : (
              <div className="space-y-2">
                {typeArgs.map((arg, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-xs text-neutral-400 w-6 text-right shrink-0">T{index}</span>
                    <input
                      type="text"
                      value={arg}
                      onChange={(e) => updateTypeArg(index, e.target.value)}
                      placeholder="0x1::aptos_coin::AptosCoin"
                      className="flex-1 px-3 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => removeTypeArg(index)}
                      className="text-neutral-400 hover:text-red-500 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Function Arguments */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-neutral-700">
                Function Arguments {funcArgs.length > 0 && <span className="text-neutral-400">({funcArgs.length})</span>}
              </label>
              <button
                type="button"
                onClick={addFuncArg}
                className="text-xs text-violet-600 hover:text-violet-800 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            {funcArgs.length === 0 ? (
              <p className="text-xs text-neutral-400 italic">No arguments. Click &quot;Add&quot; to include function arguments.</p>
            ) : (
              <div className="space-y-2">
                {funcArgs.map((arg, index) => (
                  <div key={arg.id} className="flex items-center gap-2">
                    <span className="text-xs text-neutral-400 w-6 text-right shrink-0">#{index}</span>
                    <select
                      value={arg.type}
                      onChange={(e) => updateFuncArg(arg.id, 'type', e.target.value)}
                      className="px-2 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 text-sm bg-white"
                    >
                      {ARG_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={arg.value}
                      onChange={(e) => updateFuncArg(arg.id, 'value', e.target.value)}
                      placeholder={ARG_TYPES.find(t => t.value === arg.type)?.placeholder}
                      className="flex-1 px-3 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => removeFuncArg(arg.id)}
                      className="text-neutral-400 hover:text-red-500 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Payload Preview */}
          {functionPath && validateFunctionPath(functionPath) && (
            <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Code className="w-3.5 h-3.5 text-neutral-500" />
                <span className="text-xs font-medium text-neutral-600">Payload Preview</span>
              </div>
              <pre className="text-xs text-neutral-700 font-mono overflow-x-auto whitespace-pre-wrap">
{JSON.stringify({
  function: functionPath,
  typeArguments: typeArgs.filter(a => a.trim()),
  functionArguments: funcArgs.map(a => `(${a.type}) ${a.value || '...'}`),
}, null, 2)}
              </pre>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={createProposal.isPending || !functionPath}
            className="w-full px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
          >
            {createProposal.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating Proposal...
              </>
            ) : (
              <>
                <Terminal className="w-4 h-4" />
                Create Proposal
              </>
            )}
          </button>
        </form>
      </div>

      {/* Wallet Connection Modal */}
      {showWalletModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-dropdown">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-lg font-semibold text-neutral-800">Connect Wallet</h3>
              <button
                onClick={() => setShowWalletModal(false)}
                className="text-neutral-400 hover:text-neutral-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              {wallets.length > 0 ? (
                wallets.map((wallet) => (
                  <button
                    key={wallet.name}
                    onClick={() => handleWalletConnect(wallet.name)}
                    disabled={isConnecting}
                    className="w-full flex items-center gap-3 p-3 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors disabled:opacity-50"
                  >
                    <img src={wallet.icon} alt={wallet.name} className="w-8 h-8 rounded" />
                    <span className="font-medium">{wallet.name}</span>
                    {isConnecting && <Loader2 className="w-4 h-4 animate-spin ml-auto" />}
                  </button>
                ))
              ) : (
                <p className="text-neutral-500 text-center py-4">
                  No wallets detected. Please install a Movement-compatible wallet like Nightly.
                </p>
              )}
            </div>
            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600" />
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
