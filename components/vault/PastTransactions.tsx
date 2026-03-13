'use client';

import { useState, useEffect } from 'react';
import { useMultisigAccount } from '@/hooks/useMultisig';
import { getCurrentNetwork } from '@/lib/aptos';
import { CheckCircle, ExternalLink, RefreshCw, History, Copy, Check, ChevronDown, ChevronUp, ArrowRight, Coins, Ban } from 'lucide-react';
import { formatCompactMoveAmount } from '@/lib/utils';
import { AddressDisplay } from '@/components/ui/AddressDisplay';

interface PastTransactionsProps {
  vaultAddress: string;
}

interface TransferDetails {
  type: 'transfer' | 'other';
  recipient?: string;
  amount?: string;
  coinType?: string;
  functionName?: string;
}

interface ExecutedTransaction {
  id: number;
  version: string;
  hash: string;
  timestamp: string;
  success: boolean;
  status: 'executed' | 'execution_failed' | 'rejected';
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
  const [expandedTx, setExpandedTx] = useState<number | null>(null);

  const lastExecutedId = multisigAccount
    ? parseInt(multisigAccount.last_executed_sequence_number || '0')
    : 0;

  // Decode entry function name from BCS-encoded hex (from TransactionExecutionSucceeded event)
  const decodeBcsEntryFunction = (hex: string): string | undefined => {
    try {
      const h = hex.startsWith('0x') ? hex.slice(2) : hex;
      // Skip 1-byte enum variant (MultisigTransactionPayload::EntryFunction = 0x00)
      let pos = 2;
      // 32-byte address
      const addrHex = h.slice(pos, pos + 64);
      const addr = '0x' + (addrHex.replace(/^0+/, '') || '0');
      pos += 64;
      // Module name: ULEB128 length + UTF-8 bytes
      const modLen = parseInt(h.slice(pos, pos + 2), 16);
      pos += 2;
      const modBytes = new Uint8Array(modLen);
      for (let i = 0; i < modLen; i++) modBytes[i] = parseInt(h.slice(pos + i * 2, pos + i * 2 + 2), 16);
      const modName = new TextDecoder().decode(modBytes);
      pos += modLen * 2;
      // Function name: ULEB128 length + UTF-8 bytes
      const fnLen = parseInt(h.slice(pos, pos + 2), 16);
      pos += 2;
      const fnBytes = new Uint8Array(fnLen);
      for (let i = 0; i < fnLen; i++) fnBytes[i] = parseInt(h.slice(pos + i * 2, pos + i * 2 + 2), 16);
      const fnName = new TextDecoder().decode(fnBytes);
      return `${addr}::${modName}::${fnName}`;
    } catch {
      return undefined;
    }
  };

  // Extract the entry function name from a multisig transaction
  const extractFunctionName = (txData: any): string | undefined => {
    try {
      // 1. Try payload.transaction_payload.function (sometimes available)
      const fn = txData.payload?.transaction_payload?.function
        || txData.payload?.function;
      if (fn) return fn;

      // 2. Decode from TransactionExecutionSucceeded event BCS bytes
      const events = txData.events || [];
      const execEvent = events.find((e: any) =>
        e.type?.includes('TransactionExecutionSucceeded')
      );
      if (execEvent?.data?.transaction_payload) {
        return decodeBcsEntryFunction(execEvent.data.transaction_payload);
      }

      return undefined;
    } catch {
      return undefined;
    }
  };

  // Known transfer functions — only these should be classified as transfers
  const TRANSFER_FUNCTIONS = [
    '0x1::coin::transfer',
    '0x1::aptos_account::transfer',
    '0x1::aptos_account::transfer_coins',
    '0x1::primary_fungible_store::transfer',
  ];

  // Parse transaction to find transfer details
  const parseTransactionDetails = (txData: any): TransferDetails => {
    try {
      const functionName = extractFunctionName(txData);

      // If we know the function and it's not a transfer, skip transfer detection
      if (functionName && !TRANSFER_FUNCTIONS.some(f => functionName.includes(f))) {
        return { type: 'other', functionName };
      }

      // 1. Parse from multisig payload arguments (most reliable source)
      const txPayload = txData.payload?.transaction_payload;
      if (txPayload?.function) {
        const fn = txPayload.function as string;
        const args = txPayload.arguments || [];

        if (fn.includes('primary_fungible_store::transfer')) {
          // args: [metadata, recipient, amount]
          return {
            type: 'transfer',
            recipient: typeof args[1] === 'string' ? args[1] : undefined,
            amount: typeof args[2] === 'string' ? args[2] : args[2]?.toString(),
            coinType: 'MOVE',
          };
        }

        if (fn.includes('coin::transfer') || fn.includes('aptos_account::transfer')) {
          // args: [recipient, amount]
          const coinType = txPayload.type_arguments?.[0] || '';
          return {
            type: 'transfer',
            recipient: typeof args[0] === 'string' ? args[0] : undefined,
            amount: typeof args[1] === 'string' ? args[1] : args[1]?.toString(),
            coinType: coinType.includes('AptosCoin') ? 'MOVE' : coinType.split('::').pop() || 'MOVE',
          };
        }
      }

      // 2. Try FA events (fungible_asset::Withdraw/Deposit)
      const events = txData.events || [];
      const faWithdraw = events.find((e: any) => e.type === '0x1::fungible_asset::Withdraw');
      if (faWithdraw?.data?.amount) {
        return {
          type: 'transfer',
          amount: faWithdraw.data.amount,
          coinType: 'MOVE',
        };
      }

      // 3. Legacy coin events (coin::CoinWithdraw has account info)
      const coinWithdraw = events.find((e: any) => e.type === '0x1::coin::CoinWithdraw');
      if (coinWithdraw?.data?.amount) {
        const coinDeposit = events.find((e: any) =>
          e.type === '0x1::coin::CoinDeposit' &&
          e.data?.account?.toLowerCase() !== vaultAddress.toLowerCase()
        );
        return {
          type: 'transfer',
          recipient: coinDeposit?.data?.account,
          amount: coinWithdraw.data.amount,
          coinType: coinWithdraw.data?.coin_type?.includes('AptosCoin') ? 'MOVE' : coinWithdraw.data?.coin_type?.split('::').pop() || 'MOVE',
        };
      }

      return { type: 'other', functionName };
    } catch (error) {
      return { type: 'other' };
    }
  };

  // Fetch event handle events from the REST API
  // Events are returned in ascending order by sequence_number, so we start from the end
  const fetchEventHandle = async (
    rpcUrl: string,
    fieldName: string,
    counter: number,
    limit: number,
  ): Promise<any[]> => {
    const start = Math.max(0, counter - limit);
    const url = `${rpcUrl}/accounts/${vaultAddress}/events/0x1::multisig_account::MultisigAccount/${fieldName}?start=${start}&limit=${limit}`;
    const response = await fetch(url);
    if (!response.ok) return [];
    return response.json();
  };

  // Fetch transaction history using REST API v1 event handles on the MultisigAccount resource.
  // Fetches 4 event types: create, execute, execution_failed, and execute_rejected to show
  // ALL proposals including ones that were rejected before execution.
  // Map V2 module event type to status
  const v2EventTypeToStatus = (type: string): 'executed' | 'execution_failed' | 'rejected' | null => {
    if (type.includes('TransactionExecutionSucceeded')) return 'executed';
    if (type.includes('TransactionExecutionFailed')) return 'execution_failed';
    if (type.includes('ExecuteRejectedTransaction')) return 'rejected';
    return null;
  };

  // Fallback: fetch transaction history via indexer account_transactions + V2 module events.
  // Used when V1 event handle counters are all 0 (e.g. on testnet).
  const fetchViaIndexer = async (network: { rpc: string; indexer: string }) => {
    const query = `query($addr: String!) {
      account_transactions(
        where: { account_address: { _eq: $addr } }
        order_by: { transaction_version: desc }
        limit: 50
      ) { transaction_version }
    }`;
    const resp = await fetch(network.indexer, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { addr: vaultAddress } }),
    });
    if (!resp.ok) return;
    const { data } = await resp.json();
    const versions: string[] = (data?.account_transactions || []).map((t: any) => t.transaction_version);
    if (versions.length === 0) return;

    // Fetch full transactions from REST API
    const txResponses = await Promise.all(
      versions.map(async (v) => {
        try {
          const r = await fetch(`${network.rpc}/transactions/by_version/${v}`);
          return r.ok ? r.json() : null;
        } catch { return null; }
      })
    );

    // Build create event map and collect execution events
    const createMap = new Map<string, any>();
    const executionTxns: Array<{ txData: any; status: 'executed' | 'execution_failed' | 'rejected'; event: any }> = [];

    for (const txData of txResponses) {
      if (!txData) continue;
      for (const event of txData.events || []) {
        if (!event.type?.includes('multisig_account::')) continue;

        if (event.type.includes('CreateTransaction')) {
          const seq = event.data?.sequence_number;
          if (seq) createMap.set(seq, event);
        }

        const status = v2EventTypeToStatus(event.type);
        if (status) {
          executionTxns.push({ txData, status, event });
        }
      }
    }

    if (executionTxns.length === 0) return;

    // Deduplicate by sequence number (keep latest version)
    const seenSeqs = new Set<string>();
    const uniqueTxns = executionTxns.filter(({ event }) => {
      const seq = event.data?.sequence_number;
      if (!seq || seenSeqs.has(seq)) return false;
      seenSeqs.add(seq);
      return true;
    });

    const results: ExecutedTransaction[] = uniqueTxns.map(({ txData, status, event }) => {
      const seqNumber = event.data?.sequence_number;
      const createEvent = createMap.get(seqNumber);
      let details: TransferDetails = { type: 'other' };

      // Decode BCS payload
      const bcsPayload = event.data?.transaction_payload
        || createEvent?.data?.transaction?.payload?.vec?.[0];
      if (bcsPayload) {
        const fnName = decodeBcsEntryFunction(bcsPayload);
        if (fnName) {
          details = { type: 'other', functionName: fnName };
          if (TRANSFER_FUNCTIONS.some(f => fnName.includes(f))) {
            details.type = 'transfer';
          }
        }
      }

      // Parse transfer details from full transaction (only for executed/failed)
      let sender = status === 'rejected'
        ? (createEvent?.data?.creator || event.data?.executor || '')
        : (txData.sender || '');
      if (status !== 'rejected') {
        const fullDetails = parseTransactionDetails(txData);
        if (fullDetails.type === 'transfer' || !details.functionName) {
          details = fullDetails;
        }
      }

      return {
        id: seqNumber ? parseInt(seqNumber) : 0,
        version: txData.version?.toString() || '',
        hash: txData.hash || '',
        timestamp: txData.timestamp || '',
        success: status === 'executed',
        status,
        sender,
        gasUsed: status !== 'rejected' ? (txData.gas_used?.toString() || '0') : undefined,
        details,
      };
    });

    // Sort by id descending
    results.sort((a, b) => b.id - a.id);
    setTransactions(results);
  };

  const fetchTransactionHistory = async () => {
    try {
      const network = getCurrentNetwork();

      // Fetch MultisigAccount resource to get event handle counters
      const resResponse = await fetch(
        `${network.rpc}/accounts/${vaultAddress}/resource/0x1::multisig_account::MultisigAccount`
      );
      if (!resResponse.ok) {
        setTransactions([]);
        return;
      }
      const resource = await resResponse.json();
      const resData = resource.data || {};

      const successCounter = parseInt(resData.execute_transaction_events?.counter || '0');
      const failedCounter = parseInt(resData.transaction_execution_failed_events?.counter || '0');
      const rejectedCounter = parseInt(resData.execute_rejected_transaction_events?.counter || '0');
      const createCounter = parseInt(resData.create_transaction_events?.counter || '0');

      // If all V1 event handle counters are 0, the chain may use V2 module events.
      // Fall back to indexer-based approach.
      if (successCounter === 0 && failedCounter === 0 && rejectedCounter === 0) {
        const lastExec = parseInt(resData.last_executed_sequence_number || '0');
        if (lastExec > 0) {
          await fetchViaIndexer(network);
          return;
        }
        setTransactions([]);
        return;
      }

      // Fetch all event types in parallel (V1 event handles)
      const limit = 50;
      const [successEvents, failedEvents, rejectedEvents, createEvents] = await Promise.all([
        successCounter > 0 ? fetchEventHandle(network.rpc, 'execute_transaction_events', successCounter, limit) : Promise.resolve([]),
        failedCounter > 0 ? fetchEventHandle(network.rpc, 'transaction_execution_failed_events', failedCounter, limit) : Promise.resolve([]),
        rejectedCounter > 0 ? fetchEventHandle(network.rpc, 'execute_rejected_transaction_events', rejectedCounter, limit) : Promise.resolve([]),
        createCounter > 0 ? fetchEventHandle(network.rpc, 'create_transaction_events', createCounter, Math.min(createCounter, 100)) : Promise.resolve([]),
      ]);

      // Build create event map for BCS payload lookup on rejected proposals
      const createMap = new Map<string, any>();
      for (const e of createEvents) {
        if (e.data?.sequence_number) {
          createMap.set(e.data.sequence_number, e);
        }
      }

      // Tag each event with its status and merge all events
      const allEvents: Array<any & { _status: 'executed' | 'execution_failed' | 'rejected' }> = [
        ...successEvents.map((e: any) => ({ ...e, _status: 'executed' as const })),
        ...failedEvents.map((e: any) => ({ ...e, _status: 'execution_failed' as const })),
        ...rejectedEvents.map((e: any) => ({ ...e, _status: 'rejected' as const })),
      ];

      // Sort by version descending (most recent first)
      allEvents.sort((a, b) => parseInt(b.version || '0') - parseInt(a.version || '0'));

      // Take top N after merge
      const topEvents = allEvents.slice(0, limit);

      if (topEvents.length === 0) {
        setTransactions([]);
        return;
      }

      // Fetch full transaction details for each event
      const txnsWithDetails = await Promise.all(
        topEvents.map(async (event: any, index: number) => {
          const version = event.version;
          const status: 'executed' | 'execution_failed' | 'rejected' = event._status;
          const seqNumber = event.data?.sequence_number;
          const createEvent = createMap.get(seqNumber);
          let hash = '';
          let timestamp = '';
          let sender = status === 'rejected'
            ? (createEvent?.data?.creator || event.data?.executor || '')
            : '';
          let gasUsed = '0';
          let details: TransferDetails = { type: 'other' };

          // Try to decode function name from BCS payload
          // For executed/failed: use execution event payload
          // For rejected: fall back to create event payload
          const bcsPayload = event.data?.transaction_payload
            || createEvent?.data?.transaction?.payload?.vec?.[0];
          if (bcsPayload) {
            const fnName = decodeBcsEntryFunction(bcsPayload);
            if (fnName) {
              details = { type: 'other', functionName: fnName };
              if (TRANSFER_FUNCTIONS.some(f => fnName.includes(f))) {
                details.type = 'transfer';
              }
            }
          }

          // Fetch full transaction for hash, timestamp, transfer amounts
          try {
            const txResponse = await fetch(`${network.rpc}/transactions/by_version/${version}`);
            if (txResponse.ok) {
              const txData = await txResponse.json();
              hash = txData.hash || '';
              timestamp = txData.timestamp || '';
              gasUsed = txData.gas_used?.toString() || '0';

              // Only parse transfer details for executed/failed (not rejected — inner payload didn't run)
              if (status !== 'rejected') {
                sender = txData.sender || sender;
                const fullDetails = parseTransactionDetails(txData);
                if (fullDetails.type === 'transfer' || !details.functionName) {
                  details = fullDetails;
                }
              }
            }
          } catch {
            // Use event data as fallback
          }

          return {
            id: seqNumber ? parseInt(seqNumber) : topEvents.length - index,
            version: version?.toString() || '',
            hash,
            timestamp,
            success: status === 'executed',
            status,
            sender,
            gasUsed: status !== 'rejected' ? gasUsed : undefined,
            details,
          };
        })
      );

      setTransactions(txnsWithDetails);
    } catch (error) {
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
        // API timestamps are UTC — ensure Z suffix so Date parses as UTC
        const utc = timestamp.endsWith('Z') || timestamp.includes('+') ? timestamp : timestamp + 'Z';
        return new Date(utc).toLocaleString();
      } else {
        // Numeric timestamps from REST API are in microseconds
        return new Date(parseInt(timestamp) / 1000).toLocaleString();
      }
    } catch {
      return '';
    }
  };

  const truncateHash = (hash: string) => {
    if (!hash || hash.length <= 16) return hash || 'N/A';
    return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
  };

  const copyHash = async (hash: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const toggleExpand = (id: number) => {
    setExpandedTx(expandedTx === id ? null : id);
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-card border border-neutral-200 p-6">
        <div className="text-center py-8 text-neutral-500">
          Loading transaction history...
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-card border border-neutral-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-neutral-800">Transaction History</h2>
          <p className="text-sm text-neutral-500 mt-1">
            {lastExecutedId > 0 ? (
              <span className="text-neutral-600 font-medium">
                {lastExecutedId} proposal{lastExecutedId > 1 ? 's' : ''} resolved
              </span>
            ) : (
              'No proposals yet'
            )}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-2 text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors disabled:opacity-50"
          title="Refresh history"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {transactions.length === 0 ? (
        <div className="text-center py-12">
          <History className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-neutral-800 mb-2">No Transactions Yet</h3>
          <p className="text-neutral-600">
            {lastExecutedId > 0
              ? 'Transaction history could not be loaded from the blockchain.'
              : 'Create your first multisig proposal to see it here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {transactions.map((tx) => (
            <div
              key={tx.id}
              className="border border-neutral-200 rounded-lg overflow-hidden hover:border-neutral-300 transition-colors"
            >
              {/* Clickable header */}
              <div
                onClick={() => toggleExpand(tx.id)}
                className="p-4 cursor-pointer hover:bg-neutral-50 transition-colors"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Icon based on transaction type/status */}
                    <div className={`p-2 rounded-full ${
                      tx.status === 'executed' ? 'bg-emerald-100'
                      : tx.status === 'rejected' ? 'bg-amber-100'
                      : 'bg-red-100'
                    }`}>
                      {tx.status === 'rejected' ? (
                        <Ban className="w-5 h-5 text-amber-600" />
                      ) : tx.details?.type === 'transfer' ? (
                        <Coins className={`w-5 h-5 ${tx.status === 'executed' ? 'text-emerald-600' : 'text-red-600'}`} />
                      ) : (
                        <CheckCircle className={`w-5 h-5 ${tx.status === 'executed' ? 'text-emerald-600' : 'text-red-600'}`} />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Transaction description */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono font-semibold text-neutral-400">#{tx.id}</span>
                        <span className="text-sm font-medium text-neutral-800">
                          {tx.details?.type === 'transfer'
                            ? `Transfer ${formatCompactMoveAmount(tx.details.amount || '0')} ${tx.details.coinType || 'MOVE'}`
                            : tx.details?.functionName
                              ? <>Custom Transaction: <code className="text-xs font-mono bg-neutral-100 px-1.5 py-0.5 rounded">{tx.details.functionName}</code></>
                              : 'Multisig Execution'
                          }
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          tx.status === 'executed' ? 'bg-emerald-100 text-emerald-700'
                          : tx.status === 'rejected' ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-700'
                        }`}>
                          {tx.status === 'executed' ? 'Success' : tx.status === 'rejected' ? 'Rejected' : 'Failed'}
                        </span>
                      </div>

                      {/* Recipient for transfers */}
                      {tx.details?.type === 'transfer' && tx.details.recipient && (
                        <div className="flex items-center gap-1 text-xs text-neutral-500">
                          <ArrowRight className="w-3 h-3" />
                          <span>To: </span><AddressDisplay address={tx.details.recipient} truncateLength={6} className="text-xs text-neutral-500" />
                        </div>
                      )}

                      {/* Timestamp */}
                      <div className="text-xs text-neutral-500 mt-1">
                        {formatTimestamp(tx.timestamp)}
                      </div>
                    </div>
                  </div>

                  {/* Expand/collapse icon */}
                  <div className="flex items-center gap-2">
                    {expandedTx === tx.id ? (
                      <ChevronUp className="w-5 h-5 text-neutral-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-neutral-400" />
                    )}
                  </div>
                </div>
              </div>

              {/* Expanded details */}
              {expandedTx === tx.id && (
                <div className="border-t border-neutral-200 bg-neutral-50 p-4">
                  <div className="space-y-3">
                    {/* Transaction Hash */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-neutral-500">Transaction Hash</span>
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-xs bg-white px-2 py-1 rounded border">
                          {truncateHash(tx.hash)}
                        </code>
                        <button
                          onClick={(e) => copyHash(tx.hash, e)}
                          className="p-1 hover:bg-neutral-200 rounded"
                          title="Copy hash"
                        >
                          {copiedHash === tx.hash ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-neutral-400" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Function name for non-transfer transactions */}
                    {tx.details?.type === 'other' && tx.details.functionName && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-neutral-500">Function</span>
                        <code className="font-mono text-xs bg-white px-2 py-1 rounded border">
                          {tx.details.functionName}
                        </code>
                      </div>
                    )}

                    {/* Transfer details */}
                    {tx.details?.type === 'transfer' && (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-neutral-500">Amount</span>
                          <span className="text-sm font-medium text-neutral-800">
                            {formatCompactMoveAmount(tx.details.amount || '0')} {tx.details.coinType || 'MOVE'}
                          </span>
                        </div>
                        {tx.details.recipient && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-neutral-500">Recipient</span>
                            <AddressDisplay address={tx.details.recipient} truncateLength={8} showCopyIcon className="text-xs" />
                          </div>
                        )}
                      </>
                    )}

                    {/* Version and Gas */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-neutral-500">Version</span>
                      <span className="text-xs text-neutral-700">{tx.version}</span>
                    </div>
                    {tx.status !== 'rejected' && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-neutral-500">Gas Used</span>
                        <span className="text-xs text-neutral-700">{tx.gasUsed}</span>
                      </div>
                    )}

                    {/* Proposed by / Executed by */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-neutral-500">
                        {tx.status === 'rejected' ? 'Proposed by' : 'Executed by'}
                      </span>
                      <AddressDisplay address={tx.sender} truncateLength={6} showCopyIcon className="text-xs" />
                    </div>

                    {/* Explorer link */}
                    {tx.hash && (
                      <a
                        href={`${EXPLORER_URL}/${tx.hash}?network=${getCurrentNetwork().explorerNetwork}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-2 mt-2 text-sm text-movement-700 hover:text-movement-800 hover:bg-movement-50 rounded-lg border border-movement-200 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="w-4 h-4" />
                        View on Explorer
                      </a>
                    )}
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
