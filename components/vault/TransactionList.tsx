'use client';

import { useState } from 'react';
import { useMultisigTransactions, useApproveTransaction, useExecuteTransaction, useExecuteRejectedTransaction, useRejectTransaction, useMultisigAccount, useCleanupProposal } from '@/hooks/useMultisig';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { FileText, Clock, CheckCircle, XCircle, Plus, Loader2, RefreshCw, Coins, ArrowRight, AlertTriangle, Trash2 } from 'lucide-react';
import { formatMoveAmount } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { getCurrentNetwork } from '@/lib/aptos';

interface TransactionListProps {
  vaultAddress: string;
  onCreateProposal?: () => void;
}

interface ParsedTransactionDetails {
  type: 'transfer' | 'add_owner' | 'remove_owner' | 'update_threshold' | 'custom';
  functionName: string;
  moduleName?: string;
  moduleAddress?: string;
  recipient?: string;
  amount?: string;
  coinType?: string;
  typeArgs?: string[];
  args?: any[];
}

// Manual BCS decoder for EntryFunction
// Format: [Optional variant byte] + AccountAddress (32 bytes) + ModuleName (ULEB128 len + bytes) + FunctionName (ULEB128 len + bytes) + TypeArgs (vector) + Args (vector of bytes)
function manualDecodeEntryFunction(bytes: Uint8Array): { moduleAddress: string, moduleName: string, functionName: string, typeArgsRaw: string[], args: Uint8Array[] } | null {
  try {
    let offset = 0;

    // Check if there's a variant byte at the start (enum type indicator)
    // If byte[32] is a valid module name length (3-20 chars like "coin", "aptos_account"),
    // then there's no variant byte. If byte[32] < 3, it's too small for a module name,
    // meaning there's a variant byte at the start that we need to skip.
    if (bytes[32] < 3 || bytes[32] > 50) {
      offset = 1;
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
        const structAddrBytes = bytes.slice(offset, offset + 32);
        const structAddr = '0x' + Array.from(structAddrBytes).map(b => b.toString(16).padStart(2, '0')).join('').replace(/^0+/, '').padStart(1, '0');
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
        typeArgsRaw.push(`${structAddr}::${modName}::${typeName}`);
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
  } catch {
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
        } catch {
          // skip
        }

        // Second arg is amount (u64 - 8 bytes little endian)
        try {
          const amountBytes = args[1];
          if (amountBytes.length === 8) {
            const view = new DataView(amountBytes.buffer, amountBytes.byteOffset, amountBytes.byteLength);
            const amountValue = view.getBigUint64(0, true); // little endian
            amount = amountValue.toString();
          }
        } catch {
          // skip
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
        } catch {
          // skip
        }

        try {
          const amountBytes = args[1];
          if (amountBytes.length === 8) {
            const view = new DataView(amountBytes.buffer, amountBytes.byteOffset, amountBytes.byteLength);
            const amountValue = view.getBigUint64(0, true);
            amount = amountValue.toString();
          }
        } catch {
          // skip
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
    // Normalize moduleAddress: strip leading zeros for display (e.g. 0x000...001 → 0x1)
    const shortAddress = '0x' + moduleAddress.replace(/^0x0*/, '').padStart(1, '0');
    return {
      type: 'custom',
      functionName,
      moduleName,
      moduleAddress: shortAddress,
      typeArgs: typeArgsRaw,
      args: args.map(a => Array.from(a)),
    };
  } catch {

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
  } catch {
    // skip
  }

  return null;
}

// Check if a proposal has a broken (non-BCS) payload, e.g. JSON from old encoder
function isBrokenPayload(tx: any): boolean {
  if (!tx.payload?.vec?.[0]) return false;
  const hex = tx.payload.vec[0] as string;
  // JSON payloads start with 0x7b ('{' character)
  return hex.startsWith('0x7b') || hex.startsWith('7b');
}

export function TransactionList({ vaultAddress, onCreateProposal }: TransactionListProps) {
  const { data: transactions = [], isLoading, refetch } = useMultisigTransactions(vaultAddress);
  const { data: multisigAccount } = useMultisigAccount(vaultAddress);
  const { account } = useWallet();
  const approveTransaction = useApproveTransaction(vaultAddress);
  const rejectTransaction = useRejectTransaction(vaultAddress);
  const executeTransaction = useExecuteTransaction(vaultAddress);
  const executeRejectedTransaction = useExecuteRejectedTransaction(vaultAddress);
  const cleanupProposal = useCleanupProposal(vaultAddress);
  const queryClient = useQueryClient();
  const { showSuccessToast, showErrorToast } = useToast();
  const [processingTxId, setProcessingTxId] = useState<number | null>(null);
  const [processingAction, setProcessingAction] = useState<'approve' | 'reject' | 'execute' | 'execute_rejection' | 'cleanup' | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Get threshold from multisig account
  const threshold = multisigAccount ? parseInt(multisigAccount.num_signatures_required || '1') : 1;

  // The next proposal that execute_transaction will run
  const lastExecutedId = multisigAccount ? parseInt(multisigAccount.last_executed_sequence_number || '0') : 0;
  const nextExecutableId = lastExecutedId + 1;

  // Count broken proposals in the queue
  const brokenProposals = transactions.filter(tx => tx.status === 'Pending' && isBrokenPayload(tx));
  const hasBrokenProposals = brokenProposals.length > 0;
  // The next proposal to execute — is it broken?
  const nextProposal = transactions.find(tx => tx.id === nextExecutableId);
  const nextIsBroken = nextProposal ? isBrokenPayload(nextProposal) : false;

  const numOwners = multisigAccount?.owners?.length || 1;

  const handleExecuteRejection = async (txId: number) => {
    setProcessingTxId(txId);
    setProcessingAction('execute_rejection');
    try {
      const result = await executeRejectedTransaction.mutateAsync(txId);
      showSuccessToast('Rejected Transaction Cleared', result?.hash);
    } catch (error: any) {
      showErrorToast('Failed to Execute Rejection', error?.message || 'Unknown error');
    } finally {
      setProcessingTxId(null);
      setProcessingAction(null);
    }
  };

  const handleApprove = async (txId: number) => {
    setProcessingTxId(txId);
    setProcessingAction('approve');
    try {
      const result = await approveTransaction.mutateAsync(txId);
      showSuccessToast('Transaction Approved', result?.hash);
    } catch (error: any) {
      showErrorToast('Failed to Approve', error?.message || 'Unknown error');
    } finally {
      setProcessingTxId(null);
      setProcessingAction(null);
    }
  };

  const handleReject = async (txId: number) => {
    setProcessingTxId(txId);
    setProcessingAction('reject');
    try {
      const result = await rejectTransaction.mutateAsync(txId);
      showSuccessToast('Transaction Rejected', result?.hash);
    } catch (error: any) {
      showErrorToast('Failed to Reject', error?.message || 'Unknown error');
    } finally {
      setProcessingTxId(null);
      setProcessingAction(null);
    }
  };

  const handleExecute = async (txId: number) => {
    setProcessingTxId(txId);
    setProcessingAction('execute');
    try {
      const result = await executeTransaction.mutateAsync(txId);
      showSuccessToast('Transaction Executed Successfully!', result?.hash);
    } catch (error: any) {
      showErrorToast('Failed to Execute', error?.message || 'Unknown error');
    } finally {
      setProcessingTxId(null);
      setProcessingAction(null);
    }
  };

  const handleCleanup = async (txId: number) => {
    setProcessingTxId(txId);
    setProcessingAction('cleanup');
    try {
      await cleanupProposal.mutateAsync(txId);
      showSuccessToast('Broken proposal cleared from queue');
    } catch (error: any) {
      showErrorToast('Failed to Clean Up', error?.message || 'Unknown error');
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
      queryClient.invalidateQueries({ queryKey: ['watched-vaults', getCurrentNetwork().explorerNetwork] });
    } finally {
      setIsRefreshing(false);
    }
  };

  if (isLoading && !isRefreshing) {
    return (
      <div className="bg-white rounded-xl shadow-card border border-neutral-200 p-6">
        <div className="text-center py-8 text-neutral-500">
          Loading transactions...
        </div>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-card border border-neutral-200 p-6">
        <div className="text-center py-12">
          <FileText className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-neutral-800 mb-2">No Transactions Yet</h3>
          <p className="text-neutral-600 mb-4">
            Create your first proposal to get started
          </p>
          {onCreateProposal && (
            <button
              onClick={onCreateProposal}
              className="inline-flex items-center gap-2 px-4 py-2 bg-movement-400 text-neutral-900 rounded-lg hover:bg-movement-500 transition-colors"
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
    <div className="bg-white rounded-xl shadow-card border border-neutral-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-neutral-800">Pending Transactions</h2>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-2 text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors disabled:opacity-50"
          title="Refresh transactions"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Warning banner for broken proposals blocking the queue */}
      {hasBrokenProposals && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-amber-900">
                {brokenProposals.length} old proposal{brokenProposals.length > 1 ? 's' : ''} with invalid payload{brokenProposals.length > 1 ? 's' : ''}
              </h3>
              <p className="text-xs text-amber-700 mt-1">
                These proposals were created with an older version and cannot be executed.
                They must be rejected and cleared before newer proposals can run.
                Use the <Trash2 className="w-3 h-3 inline" /> button on each to clean them up (requires 2 wallet approvals per proposal).
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {transactions.map((tx) => {
          const details = parseTransactionDetails(tx);
          const broken = isBrokenPayload(tx);
          const isNextInQueue = tx.id === nextExecutableId;

          return (
          <div key={tx.id} className={`border rounded-lg p-4 ${broken ? 'border-amber-300 bg-amber-50/30' : 'border-neutral-200'}`}>
            <div className="flex items-center justify-between gap-6">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  {broken ? (
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                  ) : tx.status === 'Pending' ? (
                    <Clock className="w-4 h-4 text-movement-400" />
                  ) : tx.status === 'Executed' ? (
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                  <span className="text-sm font-medium text-neutral-700">
                    Transaction #{tx.id}
                  </span>
                  {isNextInQueue && tx.status === 'Pending' && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-movement-100 text-movement-800 font-medium">
                      Next in queue
                    </span>
                  )}
                  {broken && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                      Invalid payload
                    </span>
                  )}
                </div>

                {/* Broken payload notice */}
                {broken ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
                    <span className="text-sm text-amber-800">
                      This proposal has an invalid payload from an older version and cannot be executed.
                    </span>
                  </div>
                ) : details?.type === 'transfer' ? (
                  <div className="bg-movement-50 border border-movement-200 rounded-lg p-3 mb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Coins className="w-5 h-5 text-movement-600" />
                      <span className="text-sm font-semibold text-movement-900">
                        Transfer {formatMoveAmount(details.amount || '0')} {details.coinType || 'MOVE'}
                      </span>
                    </div>
                    {details.recipient && (
                      <div className="flex items-center gap-2 text-sm text-movement-700">
                        <ArrowRight className="w-4 h-4" />
                        <span>To:</span>
                        <code className="bg-movement-100 px-2 py-0.5 rounded font-mono text-xs">
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
                ) : details?.type === 'custom' ? (
                  <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 mb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="w-4 h-4 text-neutral-500" />
                      <span className="text-sm font-semibold text-neutral-800">Custom Transaction</span>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-start gap-2">
                        <span className="text-xs text-neutral-500 shrink-0 mt-0.5">Function</span>
                        <code className="text-xs font-mono bg-white px-2 py-0.5 rounded border border-neutral-200 break-all">
                          {details.moduleAddress}::{details.moduleName}::{details.functionName}
                        </code>
                      </div>
                      {details.typeArgs && details.typeArgs.length > 0 && (
                        <div className="flex items-start gap-2">
                          <span className="text-xs text-neutral-500 shrink-0 mt-0.5">Type Args</span>
                          <div className="flex flex-wrap gap-1">
                            {details.typeArgs.map((arg, i) => (
                              <code key={i} className="text-xs font-mono bg-white px-2 py-0.5 rounded border border-neutral-200">
                                {arg}
                              </code>
                            ))}
                          </div>
                        </div>
                      )}
                      {details.args && details.args.length > 0 && (
                        <div className="flex items-start gap-2">
                          <span className="text-xs text-neutral-500 shrink-0 mt-0.5">Args</span>
                          <div className="flex flex-wrap gap-1">
                            {details.args.map((arg: number[], i: number) => (
                              <code key={i} className="text-xs font-mono bg-white px-2 py-0.5 rounded border border-neutral-200 break-all">
                                0x{arg.map(b => b.toString(16).padStart(2, '0')).join('')}
                              </code>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-neutral-600 mb-2">Custom transaction</p>
                )}

                <div className="flex items-center gap-4 text-xs text-neutral-500">
                  <span className={`${(tx.approvers?.length || 0) >= threshold ? 'text-emerald-600 font-medium' : ''}`}>
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
                    <span className="text-xs text-emerald-600 font-medium">Approved by:</span>
                    {tx.approvers.map((approver, idx) => (
                      <span
                        key={approver}
                        className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-mono"
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
                  <p className="text-xs text-neutral-400 mt-1">
                    Created by: {tx.creator.slice(0, 8)}...
                  </p>
                )}
              </div>

              {tx.status === 'Pending' && (() => {
                const approvalCount = tx.approvers?.length || 0;
                const rejectionCount = tx.rejectors?.length || 0;
                const canExecute = approvalCount >= threshold && isNextInQueue && !broken;
                const canExecuteRejection = rejectionCount > (numOwners - threshold) && isNextInQueue;
                const currentUserAddress = account?.address?.toString().toLowerCase();
                const hasApproved = tx.approvers?.some(a => a.toLowerCase() === currentUserAddress);
                const hasRejected = tx.rejectors?.some(r => r.toLowerCase() === currentUserAddress);

                return (
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    {/* Cleanup button for broken proposals that are next in queue */}
                    {broken && isNextInQueue && (
                      <button
                        onClick={() => handleCleanup(tx.id)}
                        disabled={processingTxId === tx.id}
                        className="px-4 py-2 text-sm bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                      >
                        {processingTxId === tx.id && processingAction === 'cleanup' ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Cleaning up...
                          </>
                        ) : (
                          <>
                            <Trash2 className="w-4 h-4" />
                            Clean Up
                          </>
                        )}
                      </button>
                    )}
                    {/* Execute rejection when enough owners have rejected */}
                    {canExecuteRejection && !canExecute && (
                      <button
                        onClick={() => handleExecuteRejection(tx.id)}
                        disabled={processingTxId === tx.id}
                        className="px-4 py-2 text-sm bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                      >
                        {processingTxId === tx.id && processingAction === 'execute_rejection' ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Executing...
                          </>
                        ) : (
                          <>
                            <XCircle className="w-4 h-4" />
                            Execute Rejection
                          </>
                        )}
                      </button>
                    )}
                    {canExecute && (
                      <button
                        onClick={() => handleExecute(tx.id)}
                        disabled={processingTxId === tx.id}
                        className="px-4 py-2 text-sm bg-movement-400 text-neutral-900 rounded hover:bg-movement-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
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
                    {/* Show waiting message for non-next proposals */}
                    {!isNextInQueue && !broken && approvalCount >= threshold && (
                      <span className="text-xs text-neutral-500 text-center">
                        Waiting for #{nextExecutableId}
                      </span>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(tx.id)}
                        disabled={processingTxId === tx.id || hasApproved}
                        className={`px-3 py-1 text-sm rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 ${
                          hasApproved
                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                            : 'bg-emerald-600 text-white hover:bg-emerald-700'
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