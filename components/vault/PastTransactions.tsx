'use client';

import { useState, useEffect } from 'react';
import { useMultisigAccount } from '@/hooks/useMultisig';
import { getCurrentNetwork } from '@/lib/aptos';
import { CheckCircle, XCircle, ExternalLink, RefreshCw, History, Copy, Check, ChevronDown, ChevronUp, ArrowRight, Coins } from 'lucide-react';
import { formatMoveAmount } from '@/lib/utils';

interface PastTransactionsProps {
  vaultAddress: string;
}

interface TransferDetails {
  type: 'transfer' | 'other';
  recipient?: string;
  amount?: string;
  coinType?: string;
}

interface ExecutedTransaction {
  id: number;
  version: string;
  hash: string;
  timestamp: string;
  success: boolean;
  sender: string;
  gasUsed?: string;
  details?: TransferDetails;
}

const EXPLORER_URL = 'https://explorer.movementnetwork.xyz/txn';

export function PastTransactions({ vaultAddress }: PastTransactionsProps) {
  const { data: multisigAccount } = useMultisigAccount(vaultAddress);
  const [transactions, setTransactions] = useState<ExecutedTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [expandedTx, setExpandedTx] = useState<string | null>(null);

  const lastExecutedId = multisigAccount
    ? parseInt(multisigAccount.last_executed_sequence_number || '0')
    : 0;

  // Parse transaction changes to find transfer details
  const parseTransactionDetails = (txData: any): TransferDetails => {
    try {
      // Look for coin transfer events in changes
      const changes = txData.changes || [];

      for (const change of changes) {
        if (change.type === 'write_resource' && change.data?.type?.includes('CoinStore')) {
          // This is a coin balance change
          const coinType = change.data.type.match(/<(.+)>/)?.[1] || 'Unknown Coin';

          // Check if this is a deposit to another address (not the multisig)
          if (change.address && change.address.toLowerCase() !== vaultAddress.toLowerCase()) {
            // Try to get amount from events
            const events = txData.events || [];
            for (const event of events) {
              if (event.type?.includes('DepositEvent') || event.type?.includes('WithdrawEvent')) {
                const amount = event.data?.amount;
                if (amount) {
                  return {
                    type: 'transfer',
                    recipient: change.address,
                    amount: amount,
                    coinType: coinType.includes('AptosCoin') ? 'MOVE' : coinType.split('::').pop() || 'Token',
                  };
                }
              }
            }
          }
        }
      }

      // Also check events directly for transfers
      const events = txData.events || [];
      for (const event of events) {
        if (event.type?.includes('0x1::coin::WithdrawEvent')) {
          const amount = event.data?.amount;
          // Find the corresponding deposit event to get recipient
          const depositEvent = events.find((e: any) =>
            e.type?.includes('0x1::coin::DepositEvent') &&
            e.guid?.account_address?.toLowerCase() !== vaultAddress.toLowerCase()
          );

          if (depositEvent && amount) {
            return {
              type: 'transfer',
              recipient: depositEvent.guid?.account_address,
              amount: amount,
              coinType: 'MOVE',
            };
          }
        }
      }

      return { type: 'other' };
    } catch (error) {
      console.warn('Failed to parse transaction details:', error);
      return { type: 'other' };
    }
  };

  // Fetch transaction history using the Movement indexer API
  const fetchTransactionHistory = async () => {
    try {
      const network = getCurrentNetwork();
      const indexerUrl = 'https://indexer.testnet.movementnetwork.xyz/v1/graphql';

      // Query for transactions that involve this address
      const query = `
        query GetAccountTransactions($address: String!) {
          account_transactions(
            where: { account_address: { _eq: $address } }
            order_by: { transaction_version: desc }
            limit: 50
          ) {
            transaction_version
            user_transaction {
              sender
              entry_function_id_str
              timestamp
            }
          }
        }
      `;

      console.log('Fetching from Movement indexer:', indexerUrl);

      const response = await fetch(indexerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          variables: { address: vaultAddress }
        })
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Indexer response:', data);

        if (data.data?.account_transactions?.length > 0) {
          // Filter for only multisig executions (empty entry_function_id_str)
          const multisigExecutions = data.data.account_transactions.filter(
            (tx: any) => !tx.user_transaction?.entry_function_id_str
          );

          console.log('Filtered multisig executions:', multisigExecutions.length);

          // Fetch transaction details from REST API
          const txnsWithDetails = await Promise.all(
            multisigExecutions.map(async (tx: any, index: number) => {
              const version = tx.transaction_version;
              let hash = '';
              let success = true;
              let gasUsed = '0';
              let details: TransferDetails = { type: 'other' };

              try {
                const txResponse = await fetch(`${network.rpc}/transactions/by_version/${version}`);
                if (txResponse.ok) {
                  const txData = await txResponse.json();
                  hash = txData.hash || '';
                  success = txData.success !== false;
                  gasUsed = txData.gas_used?.toString() || '0';
                  details = parseTransactionDetails(txData);
                }
              } catch (err) {
                console.warn(`Failed to fetch tx ${version}:`, err);
              }

              return {
                id: multisigExecutions.length - index,
                version: version?.toString() || '',
                hash,
                timestamp: tx.user_transaction?.timestamp || '',
                success,
                sender: tx.user_transaction?.sender || vaultAddress,
                gasUsed,
                details,
              };
            })
          );

          setTransactions(txnsWithDetails);
          return;
        }
      }

      setTransactions([]);
    } catch (error) {
      console.error('Failed to fetch from indexer:', error);
      setTransactions([]);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await fetchTransactionHistory();
      setIsLoading(false);
    };
    loadData();
  }, [vaultAddress]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchTransactionHistory();
    setIsRefreshing(false);
  };

  const formatTimestamp = (timestamp: string) => {
    if (!timestamp) return '';
    try {
      if (timestamp.includes('T') || timestamp.includes('-')) {
        const date = new Date(timestamp);
        return date.toLocaleString();
      } else {
        const date = new Date(parseInt(timestamp) / 1000);
        return date.toLocaleString();
      }
    } catch {
      return '';
    }
  };

  const truncateHash = (hash: string) => {
    if (!hash || hash.length <= 16) return hash || 'N/A';
    return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
  };

  const truncateAddress = (address: string) => {
    if (!address || address.length <= 14) return address || 'N/A';
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  };

  const copyHash = async (hash: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const toggleExpand = (hash: string) => {
    setExpandedTx(expandedTx === hash ? null : hash);
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="text-center py-8 text-gray-500">
          Loading transaction history...
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Executed Transactions</h2>
          <p className="text-sm text-gray-500 mt-1">
            {lastExecutedId > 0 ? (
              <span className="text-green-600 font-medium">
                {lastExecutedId} multisig transaction{lastExecutedId > 1 ? 's' : ''} executed
              </span>
            ) : (
              'No transactions yet'
            )}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          title="Refresh history"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {transactions.length === 0 ? (
        <div className="text-center py-12">
          <History className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Executed Transactions</h3>
          <p className="text-gray-600">
            {lastExecutedId > 0
              ? 'Transaction history could not be loaded from the blockchain.'
              : 'Execute your first multisig transaction to see it here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {transactions.map((tx) => (
            <div
              key={tx.hash || tx.version}
              className="border border-gray-200 rounded-lg overflow-hidden hover:border-gray-300 transition-colors"
            >
              {/* Clickable header */}
              <div
                onClick={() => toggleExpand(tx.hash)}
                className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Icon based on transaction type */}
                    <div className={`p-2 rounded-full ${tx.success ? 'bg-green-100' : 'bg-red-100'}`}>
                      {tx.details?.type === 'transfer' ? (
                        <Coins className={`w-5 h-5 ${tx.success ? 'text-green-600' : 'text-red-600'}`} />
                      ) : (
                        <CheckCircle className={`w-5 h-5 ${tx.success ? 'text-green-600' : 'text-red-600'}`} />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Transaction description */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-900">
                          {tx.details?.type === 'transfer'
                            ? `Transfer ${formatMoveAmount(tx.details.amount || '0')} ${tx.details.coinType || 'MOVE'}`
                            : 'Multisig Execution'
                          }
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          tx.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {tx.success ? 'Success' : 'Failed'}
                        </span>
                      </div>

                      {/* Recipient for transfers */}
                      {tx.details?.type === 'transfer' && tx.details.recipient && (
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <ArrowRight className="w-3 h-3" />
                          <span>To: {truncateAddress(tx.details.recipient)}</span>
                        </div>
                      )}

                      {/* Timestamp */}
                      <div className="text-xs text-gray-500 mt-1">
                        {formatTimestamp(tx.timestamp)}
                      </div>
                    </div>
                  </div>

                  {/* Expand/collapse icon */}
                  <div className="flex items-center gap-2">
                    {expandedTx === tx.hash ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>
              </div>

              {/* Expanded details */}
              {expandedTx === tx.hash && (
                <div className="border-t border-gray-200 bg-gray-50 p-4">
                  <div className="space-y-3">
                    {/* Transaction Hash */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Transaction Hash</span>
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-xs bg-white px-2 py-1 rounded border">
                          {truncateHash(tx.hash)}
                        </code>
                        <button
                          onClick={(e) => copyHash(tx.hash, e)}
                          className="p-1 hover:bg-gray-200 rounded"
                          title="Copy hash"
                        >
                          {copiedHash === tx.hash ? (
                            <Check className="w-3.5 h-3.5 text-green-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-gray-400" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Transfer details */}
                    {tx.details?.type === 'transfer' && (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">Amount</span>
                          <span className="text-sm font-medium text-gray-900">
                            {formatMoveAmount(tx.details.amount || '0')} {tx.details.coinType || 'MOVE'}
                          </span>
                        </div>
                        {tx.details.recipient && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">Recipient</span>
                            <code className="font-mono text-xs bg-white px-2 py-1 rounded border">
                              {truncateAddress(tx.details.recipient)}
                            </code>
                          </div>
                        )}
                      </>
                    )}

                    {/* Version and Gas */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Version</span>
                      <span className="text-xs text-gray-700">{tx.version}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Gas Used</span>
                      <span className="text-xs text-gray-700">{tx.gasUsed}</span>
                    </div>

                    {/* Executed by */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Executed by</span>
                      <code className="font-mono text-xs bg-white px-2 py-1 rounded border">
                        {truncateAddress(tx.sender)}
                      </code>
                    </div>

                    {/* Explorer link */}
                    <a
                      href={`${EXPLORER_URL}/${tx.hash}?network=testnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-2 mt-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg border border-blue-200 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="w-4 h-4" />
                      View on Explorer
                    </a>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
