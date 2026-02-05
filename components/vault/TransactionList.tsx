'use client';

import { useState } from 'react';
import { useMultisigTransactions, useApproveTransaction, useExecuteTransaction, useRejectTransaction, useMultisigAccount } from '@/hooks/useMultisig';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { FileText, Clock, CheckCircle, XCircle, Plus, Loader2, RefreshCw, Coins, ArrowRight } from 'lucide-react';
import { formatMoveAmount } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';

interface TransactionListProps {
  vaultAddress: string;
  onCreateProposal?: () => void;
}

interface ParsedTransactionDetails {
  type: 'transfer' | 'add_owner' | 'remove_owner' | 'update_threshold' | 'custom';
  functionName: string;
  moduleName?: string;
  recipient?: string;
  amount?: string;
  coinType?: string;
  args?: any[];
}

// Manual BCS decoder for EntryFunction
// Format: [Optional variant byte] + AccountAddress (32 bytes) + ModuleName (ULEB128 len + bytes) + FunctionName (ULEB128 len + bytes) + TypeArgs (vector) + Args (vector of bytes)
function manualDecodeEntryFunction(bytes: Uint8Array): { moduleAddress: string, moduleName: string, functionName: string, typeArgsRaw: string[], args: Uint8Array[] } | null {
  try {
    let offset = 0;

    // Debug: Log first few bytes to understand the structure
    console.log('BCS decode - First bytes:', {
      byte0: bytes[0],
      byte31: bytes[31],
      byte32: bytes[32],
      byte33: bytes[33],
      totalLen: bytes.length,
    });

    // Check if there's a variant byte at the start (enum type indicator)
    // If byte[32] is a valid module name length (3-20 chars like "coin", "aptos_account"),
    // then there's no variant byte. If byte[32] < 3, it's too small for a module name,
    // meaning there's a variant byte at the start that we need to skip.
    if (bytes[32] < 3 || bytes[32] > 50) {
      // Skip variant/enum byte
      console.log('BCS decode - Skipping variant byte, offset=1');
      offset = 1;
    } else {
      console.log('BCS decode - No variant byte, offset=0');
    }

    // Read module address (32 bytes)
    const addressBytes = bytes.slice(offset, offset + 32);
    offset += 32;
    const moduleAddress = '0x' + Array.from(addressBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    // Read module name (ULEB128 length + string bytes)
    const moduleNameLen = bytes[offset];
    offset += 1;
    const moduleNameBytes = bytes.slice(offset, offset + moduleNameLen);
    offset += moduleNameLen;
    const moduleName = new TextDecoder().decode(moduleNameBytes);

    // Read function name (ULEB128 length + string bytes)
    const functionNameLen = bytes[offset];
    offset += 1;
    const functionNameBytes = bytes.slice(offset, offset + functionNameLen);
    offset += functionNameLen;
    const functionName = new TextDecoder().decode(functionNameBytes);

    // Read type args vector length
    const typeArgsLen = bytes[offset];
    offset += 1;

    const typeArgsRaw: string[] = [];
    for (let i = 0; i < typeArgsLen; i++) {
      // Type tags are complex - for now just skip and mark as present
      // First byte is the tag type (7 = struct)
      const tagType = bytes[offset];
      offset += 1;

      if (tagType === 7) { // Struct type
        // Read struct address (32 bytes)
        offset += 32;
        // Read module name
        const modLen = bytes[offset];
        offset += 1;
        const modBytes = bytes.slice(offset, offset + modLen);
        offset += modLen;
        const modName = new TextDecoder().decode(modBytes);
        // Read type name
        const typeLen = bytes[offset];
        offset += 1;
        const typeBytes = bytes.slice(offset, offset + typeLen);
        offset += typeLen;
        const typeName = new TextDecoder().decode(typeBytes);
        // Read generic type args count
        const genericCount = bytes[offset];
        offset += 1;
        // Skip generics for now
        typeArgsRaw.push(`${modName}::${typeName}`);
      }
    }

    // Read function args vector length
    const argsLen = bytes[offset];
    offset += 1;

    const args: Uint8Array[] = [];
    for (let i = 0; i < argsLen; i++) {
      // Each arg is prefixed with its length (ULEB128)
      const argLen = bytes[offset];
      offset += 1;
      const argBytes = bytes.slice(offset, offset + argLen);
      offset += argLen;
      args.push(argBytes);
    }

    return { moduleAddress, moduleName, functionName, typeArgsRaw, args };
  } catch (error) {
    console.warn('Manual BCS decode failed:', error);
    return null;
  }
}

// Decode BCS payload
function decodeBCSPayload(payload: Uint8Array | number[]): ParsedTransactionDetails | null {
  try {
    const bytes = payload instanceof Uint8Array ? payload : new Uint8Array(payload);

    // Use manual decoder
    const decoded = manualDecodeEntryFunction(bytes);
    if (!decoded) return null;

    const { moduleAddress, moduleName, functionName, typeArgsRaw, args } = decoded;

    console.log('Decoded EntryFunction:', {
      moduleAddress,
      moduleName,
      functionName,
      typeArgsRaw,
      argsCount: args.length,
    });

    // Parse coin::transfer
    if (moduleName === 'coin' && functionName === 'transfer') {
      let recipient = '';
      let amount = '0';

      // Parse arguments
      if (args.length >= 2) {
        // First arg is recipient address (32 bytes)
        try {
          const recipientBytes = args[0];
          recipient = '0x' + Array.from(recipientBytes).map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) {
          console.warn('Failed to parse recipient:', e);
        }

        // Second arg is amount (u64 - 8 bytes little endian)
        try {
          const amountBytes = args[1];
          if (amountBytes.length === 8) {
            const view = new DataView(amountBytes.buffer, amountBytes.byteOffset, amountBytes.byteLength);
            const amountValue = view.getBigUint64(0, true); // little endian
            amount = amountValue.toString();
          }
        } catch (e) {
          console.warn('Failed to parse amount:', e);
        }
      }

      // Get coin type from type arguments
      let coinType = 'MOVE';
      if (typeArgsRaw.length > 0) {
        const typeArg = typeArgsRaw[0];
        if (typeArg.includes('AptosCoin') || typeArg.includes('aptos_coin')) {
          coinType = 'MOVE';
        } else {
          // Extract coin name from type
          const parts = typeArg.split('::');
          coinType = parts[parts.length - 1] || 'Token';
        }
      }

      return {
        type: 'transfer',
        functionName: 'transfer',
        moduleName: 'coin',
        recipient,
        amount,
        coinType,
      };
    }

    // Parse aptos_account::transfer_coins
    if ((moduleName === 'aptos_account' && functionName === 'transfer_coins') ||
        (moduleName === 'aptos_account' && functionName === 'transfer')) {
      let recipient = '';
      let amount = '0';

      if (args.length >= 2) {
        try {
          const recipientBytes = args[0];
          recipient = '0x' + Array.from(recipientBytes).map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) {
          console.warn('Failed to parse recipient:', e);
        }

        try {
          const amountBytes = args[1];
          if (amountBytes.length === 8) {
            const view = new DataView(amountBytes.buffer, amountBytes.byteOffset, amountBytes.byteLength);
            const amountValue = view.getBigUint64(0, true);
            amount = amountValue.toString();
          }
        } catch (e) {
          console.warn('Failed to parse amount:', e);
        }
      }

      let coinType = 'MOVE';
      if (typeArgsRaw.length > 0) {
        const typeArg = typeArgsRaw[0];
        if (typeArg.includes('AptosCoin') || typeArg.includes('aptos_coin')) {
          coinType = 'MOVE';
        } else {
          const parts = typeArg.split('::');
          coinType = parts[parts.length - 1] || 'Token';
        }
      }

      return {
        type: 'transfer',
        functionName: 'transfer_coins',
        moduleName: 'aptos_account',
        recipient,
        amount,
        coinType,
      };
    }

    // Parse multisig_account operations
    if (moduleName === 'multisig_account') {
      if (functionName === 'add_owner' || functionName === 'add_owners') {
        return {
          type: 'add_owner',
          functionName,
          moduleName,
        };
      }
      if (functionName === 'remove_owner' || functionName === 'remove_owners') {
        return {
          type: 'remove_owner',
          functionName,
          moduleName,
        };
      }
      if (functionName === 'update_signatures_required') {
        return {
          type: 'update_threshold',
          functionName,
          moduleName,
        };
      }
    }

    // Custom transaction
    return {
      type: 'custom',
      functionName,
      moduleName,
      args: args.map(a => Array.from(a)),
    };
  } catch (error) {
    console.debug('Failed to decode BCS:', error);

    // Fallback: try text-based detection
    try {
      const bytes = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
      const decoder = new TextDecoder('utf-8', { fatal: false });
      const text = decoder.decode(bytes);

      if (text.includes('coin') && text.includes('transfer')) {
        return { type: 'transfer', functionName: 'transfer', coinType: 'MOVE' };
      }
      if (text.includes('add_owner')) {
        return { type: 'add_owner', functionName: 'add_owner' };
      }
      if (text.includes('remove_owner')) {
        return { type: 'remove_owner', functionName: 'remove_owner' };
      }
    } catch {}
  }

  return null;
}

// Convert hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
  }
  return bytes;
}

// Parse transaction to get details
function parseTransactionDetails(tx: any): ParsedTransactionDetails | null {
  if (!tx.payload) return null;

  try {
    // Handle payload.vec format from Movement blockchain
    // The payload is stored as { vec: ["0x...hex..."] }
    if (tx.payload && typeof tx.payload === 'object' && tx.payload.vec) {
      const hexPayload = tx.payload.vec[0];
      if (typeof hexPayload === 'string' && hexPayload.startsWith('0x')) {
        console.log('Found hex payload in vec:', hexPayload.slice(0, 50) + '...');
        const bytes = hexToBytes(hexPayload);
        return decodeBCSPayload(bytes);
      }
    }

    // Handle direct Uint8Array or number array
    if (tx.payload instanceof Uint8Array || Array.isArray(tx.payload)) {
      return decodeBCSPayload(tx.payload);
    }

    // Handle hex string directly
    if (typeof tx.payload === 'string' && tx.payload.startsWith('0x')) {
      const bytes = hexToBytes(tx.payload);
      return decodeBCSPayload(bytes);
    }

    // Handle JSON payload
    if (typeof tx.payload === 'object' && tx.payload.function) {
      const func = tx.payload.function;
      if (func.includes('coin::transfer') || func.includes('aptos_account::transfer')) {
        return {
          type: 'transfer',
          functionName: 'transfer',
          recipient: tx.payload.functionArguments?.[0] || tx.payload.arguments?.[0],
          amount: tx.payload.functionArguments?.[1] || tx.payload.arguments?.[1],
          coinType: 'MOVE',
        };
      }
    }
  } catch (error) {
    console.warn('Failed to parse transaction details:', error);
  }

  return null;
}

export function TransactionList({ vaultAddress, onCreateProposal }: TransactionListProps) {
  const { data: transactions = [], isLoading, refetch } = useMultisigTransactions(vaultAddress);
  const { data: multisigAccount } = useMultisigAccount(vaultAddress);
  const { account } = useWallet();
  const approveTransaction = useApproveTransaction(vaultAddress);
  const rejectTransaction = useRejectTransaction(vaultAddress);
  const executeTransaction = useExecuteTransaction(vaultAddress);
  const queryClient = useQueryClient();
  const { showSuccessToast, showErrorToast } = useToast();
  const [processingTxId, setProcessingTxId] = useState<number | null>(null);
  const [processingAction, setProcessingAction] = useState<'approve' | 'reject' | 'execute' | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Get threshold from multisig account
  const threshold = multisigAccount ? parseInt(multisigAccount.num_signatures_required || '1') : 1;

  const handleApprove = async (txId: number) => {
    console.log('handleApprove called with txId:', txId);
    setProcessingTxId(txId);
    setProcessingAction('approve');
    try {
      console.log('Calling approveTransaction.mutateAsync...');
      const result = await approveTransaction.mutateAsync(txId);
      console.log('Approve transaction succeeded!');
      showSuccessToast('Transaction Approved', result?.hash);
    } catch (error: any) {
      console.error('Failed to approve transaction:', error);
      showErrorToast('Failed to Approve', error?.message || 'Unknown error');
    } finally {
      setProcessingTxId(null);
      setProcessingAction(null);
    }
  };

  const handleReject = async (txId: number) => {
    console.log('handleReject called with txId:', txId);
    setProcessingTxId(txId);
    setProcessingAction('reject');
    try {
      const result = await rejectTransaction.mutateAsync(txId);
      console.log('Reject transaction succeeded!');
      showSuccessToast('Transaction Rejected', result?.hash);
    } catch (error: any) {
      console.error('Failed to reject transaction:', error);
      showErrorToast('Failed to Reject', error?.message || 'Unknown error');
    } finally {
      setProcessingTxId(null);
      setProcessingAction(null);
    }
  };

  const handleExecute = async (txId: number) => {
    console.log('handleExecute called with txId:', txId);
    setProcessingTxId(txId);
    setProcessingAction('execute');
    try {
      const result = await executeTransaction.mutateAsync(txId);
      console.log('Execute transaction succeeded!');
      showSuccessToast('Transaction Executed Successfully!', result?.hash);
    } catch (error: any) {
      console.error('Failed to execute transaction:', error);
      showErrorToast('Failed to Execute', error?.message || 'Unknown error');
    } finally {
      setProcessingTxId(null);
      setProcessingAction(null);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
      // Also refresh vault data
      queryClient.invalidateQueries({ queryKey: ['watched-vaults'] });
    } finally {
      setIsRefreshing(false);
    }
  };

  if (isLoading && !isRefreshing) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="text-center py-8 text-gray-500">
          Loading transactions...
        </div>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="text-center py-12">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Transactions Yet</h3>
          <p className="text-gray-600 mb-4">
            Create your first proposal to get started
          </p>
          {onCreateProposal && (
            <button
              onClick={onCreateProposal}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Proposal
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Pending Transactions</h2>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          title="Refresh transactions"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="space-y-4">
        {transactions.map((tx) => {
          const details = parseTransactionDetails(tx);

          return (
          <div key={tx.id} className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between gap-6">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  {tx.status === 'Pending' && <Clock className="w-4 h-4 text-yellow-500" />}
                  {tx.status === 'Executed' && <CheckCircle className="w-4 h-4 text-green-500" />}
                  {tx.status === 'Rejected' && <XCircle className="w-4 h-4 text-red-500" />}
                  <span className="text-sm font-medium text-gray-700">
                    Transaction #{tx.id}
                  </span>
                </div>

                {/* Transaction Details Card */}
                {details?.type === 'transfer' ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Coins className="w-5 h-5 text-blue-600" />
                      <span className="text-sm font-semibold text-blue-900">
                        Transfer {formatMoveAmount(details.amount || '0')} {details.coinType || 'MOVE'}
                      </span>
                    </div>
                    {details.recipient && (
                      <div className="flex items-center gap-2 text-sm text-blue-700">
                        <ArrowRight className="w-4 h-4" />
                        <span>To:</span>
                        <code className="bg-blue-100 px-2 py-0.5 rounded font-mono text-xs">
                          {details.recipient.length > 20
                            ? `${details.recipient.slice(0, 10)}...${details.recipient.slice(-8)}`
                            : details.recipient}
                        </code>
                      </div>
                    )}
                  </div>
                ) : details?.type === 'add_owner' ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
                    <span className="text-sm font-semibold text-green-900">Add Owner to Multisig</span>
                  </div>
                ) : details?.type === 'remove_owner' ? (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                    <span className="text-sm font-semibold text-red-900">Remove Owner from Multisig</span>
                  </div>
                ) : details?.type === 'update_threshold' ? (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3">
                    <span className="text-sm font-semibold text-yellow-900">Update Signature Threshold</span>
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 mb-2">Custom transaction</p>
                )}

                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className={`${(tx.approvers?.length || 0) >= threshold ? 'text-green-600 font-medium' : ''}`}>
                    Approvals: {tx.approvers?.length || 0}/{threshold}
                  </span>
                  {tx.rejectors && tx.rejectors.length > 0 && (
                    <span>Rejections: {tx.rejectors.length}</span>
                  )}
                  <span>Status: {tx.status}</span>
                </div>

                {/* Approvers List */}
                {tx.approvers && tx.approvers.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <span className="text-xs text-green-600 font-medium">Approved by:</span>
                    {tx.approvers.map((approver, idx) => (
                      <span
                        key={approver}
                        className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-mono"
                        title={approver}
                      >
                        {approver.slice(0, 6)}...{approver.slice(-4)}
                      </span>
                    ))}
                  </div>
                )}

                {/* Rejectors List */}
                {tx.rejectors && tx.rejectors.length > 0 && (
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <span className="text-xs text-red-600 font-medium">Rejected by:</span>
                    {tx.rejectors.map((rejector, idx) => (
                      <span
                        key={rejector}
                        className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded font-mono"
                        title={rejector}
                      >
                        {rejector.slice(0, 6)}...{rejector.slice(-4)}
                      </span>
                    ))}
                  </div>
                )}

                {tx.creator && (
                  <p className="text-xs text-gray-400 mt-1">
                    Created by: {tx.creator.slice(0, 8)}...
                  </p>
                )}
              </div>

              {tx.status === 'Pending' && (() => {
                const approvalCount = tx.approvers?.length || 0;
                const canExecute = approvalCount >= threshold;
                const currentUserAddress = account?.address?.toString().toLowerCase();
                const hasApproved = tx.approvers?.some(a => a.toLowerCase() === currentUserAddress);
                const hasRejected = tx.rejectors?.some(r => r.toLowerCase() === currentUserAddress);

                return (
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    {canExecute && (
                      <button
                        onClick={() => handleExecute(tx.id)}
                        disabled={processingTxId === tx.id}
                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                      >
                        {processingTxId === tx.id && processingAction === 'execute' ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Executing...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-4 h-4" />
                            Execute Transaction
                          </>
                        )}
                      </button>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(tx.id)}
                        disabled={processingTxId === tx.id || hasApproved}
                        className={`px-3 py-1 text-sm rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 ${
                          hasApproved
                            ? 'bg-green-100 text-green-700 border border-green-300'
                            : 'bg-green-600 text-white hover:bg-green-700'
                        }`}
                      >
                        {processingTxId === tx.id && processingAction === 'approve' ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Approving...
                          </>
                        ) : hasApproved ? (
                          <>
                            <CheckCircle className="w-3 h-3" />
                            Approved
                          </>
                        ) : (
                          'Approve'
                        )}
                      </button>
                      <button
                        onClick={() => handleReject(tx.id)}
                        disabled={processingTxId === tx.id || hasRejected}
                        className={`px-3 py-1 text-sm rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 ${
                          hasRejected
                            ? 'bg-red-100 text-red-700 border border-red-300'
                            : 'bg-red-600 text-white hover:bg-red-700'
                        }`}
                      >
                        {processingTxId === tx.id && processingAction === 'reject' ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Rejecting...
                          </>
                        ) : hasRejected ? (
                          <>
                            <XCircle className="w-3 h-3" />
                            Rejected
                          </>
                        ) : (
                          'Reject'
                        )}
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        );
        })}
      </div>
    </div>
  );
}