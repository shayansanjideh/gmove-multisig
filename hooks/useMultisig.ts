'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { aptosClient } from '@/lib/aptos';
import { storage } from '@/lib/utils';
import { STORAGE_KEYS, MODULES, MULTISIG_FUNCTIONS } from '@/constants/modules';
import { getMultisigAddressFromTransaction } from '@/lib/getMultisigAddress';
import type { MultisigAccountResource, Vault, Proposal } from '@/types/multisig';
import {
  AccountAddress,
  MultiSig,
  TransactionPayloadMultiSig,
  buildTransaction,
} from '@aptos-labs/ts-sdk';
import { getCurrentNetwork, expandAddress, isValidAddress } from '@/lib/aptos';

// Network-aware storage key: vaults are per-network to avoid cross-network resource_not_found errors
function getVaultsKey(): string {
  const network = getCurrentNetwork();
  return `${STORAGE_KEYS.WATCHED_VAULTS}_${network.explorerNetwork}`;
}

// One-time migration: move vaults from old shared key to current network key
function migrateVaultsStorage(): void {
  if (typeof window === 'undefined') return;
  const oldKey = STORAGE_KEYS.WATCHED_VAULTS;
  const oldData = storage.get<Vault[]>(oldKey);
  if (oldData && oldData.length > 0) {
    const newKey = getVaultsKey();
    const existing = storage.get<Vault[]>(newKey);
    if (!existing || existing.length === 0) {
      storage.set(newKey, oldData);
    }
    storage.remove(oldKey);
  }
}

// Interface for coin data
export interface CoinData {
  coinType: string;
  name: string;
  symbol: string;
  decimals: number;
  balance: string;
  balanceFormatted: string;
  isFungibleAsset?: boolean;
  faMetadata?: string;
  verified?: boolean;
}

// Fetch all token balances via indexer (handles both legacy Coin and Fungible Assets)
export function useAccountCoins(address: string) {
  return useQuery({
    queryKey: ['account-coins', address],
    queryFn: async () => {
      if (!address) return [];

      const network = getCurrentNetwork();
      const query = `
        query GetAccountBalances($address: String!) {
          current_fungible_asset_balances(
            where: { owner_address: { _eq: $address }, amount: { _gt: "0" } }
          ) {
            amount
            asset_type
            metadata {
              asset_type
              name
              symbol
              decimals
              token_standard
            }
          }
        }
      `;

      try {
        const resp = await fetch(network.indexer, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, variables: { address } }),
        });

        if (!resp.ok) throw new Error(`Indexer returned ${resp.status}`);
        const json = await resp.json();
        const balances = json?.data?.current_fungible_asset_balances || [];

        const coins: CoinData[] = [];
        for (const bal of balances) {
          const meta = bal.metadata;
          if (!meta) continue;

          const amount = bal.amount?.toString() || '0';
          const decimals = meta.decimals ?? 8;
          const balanceNum = BigInt(amount);
          if (balanceNum <= 0n) continue;

          const divisor = BigInt(10 ** decimals);
          const whole = balanceNum / divisor;
          const fractional = balanceNum % divisor;
          const balanceFormatted = `${whole}.${fractional.toString().padStart(decimals, '0').slice(0, 4)}`;

          // Determine if this is MOVE (AptosCoin or FA metadata 0x...a)
          const assetType = meta.asset_type || bal.asset_type || '';
          const isMoveToken = assetType === '0x1::aptos_coin::AptosCoin'
            || assetType.replace(/^0x0+/, '0x') === '0xa';
          const isFA = meta.token_standard === 'v2';

          let symbol = meta.symbol || 'UNK';
          let name = meta.name || symbol;

          if (isMoveToken) {
            symbol = 'MOVE';
            name = 'Movement';
          }

          coins.push({
            coinType: isMoveToken ? '0x1::aptos_coin::AptosCoin' : assetType,
            name,
            symbol,
            decimals,
            balance: amount,
            balanceFormatted,
            isFungibleAsset: isFA,
            faMetadata: isFA ? assetType : undefined,
            verified: isMoveToken,
          });
        }

        // Deduplicate: if MOVE appears as both v1 and v2, keep the one with higher balance
        const moveCoins = coins.filter(c => c.symbol === 'MOVE');
        const otherCoins = coins.filter(c => c.symbol !== 'MOVE');
        if (moveCoins.length > 1) {
          moveCoins.sort((a, b) => (BigInt(b.balance) > BigInt(a.balance) ? 1 : -1));
          otherCoins.unshift(moveCoins[0]);
        } else if (moveCoins.length === 1) {
          otherCoins.unshift(moveCoins[0]);
        }

        // Sort: MOVE first (already done), then by balance descending
        otherCoins.sort((a, b) => {
          if (a.symbol === 'MOVE') return -1;
          if (b.symbol === 'MOVE') return 1;
          return BigInt(b.balance) > BigInt(a.balance) ? 1 : -1;
        });

        return otherCoins;
      } catch (error) {
        return [];
      }
    },
    enabled: !!address,
    refetchInterval: 15000,
  });
}

// Fetch multisig account resource
export function useMultisigAccount(address: string) {
  return useQuery({
    queryKey: ['multisig', address],
    queryFn: async () => {
      if (!address) return null;

      try {
        const resource = await aptosClient.getAccountResource<MultisigAccountResource>({
          accountAddress: address,
          resourceType: `${MODULES.MULTISIG}::MultisigAccount`,
        });

        return resource;
      } catch (error) {
        return null;
      }
    },
    enabled: !!address,
    refetchInterval: 10000, // Poll every 10 seconds
  });
}

// Fetch all watched vaults from local storage
export function useWatchedVaults() {
  return useQuery({
    queryKey: ['watched-vaults', getCurrentNetwork().explorerNetwork],
    queryFn: async () => {
      migrateVaultsStorage();
      const saved = storage.get<Vault[]>(getVaultsKey()) || [];

      // Fetch on-chain data for each vault
      const vaultsWithData = await Promise.all(
        saved.map(async (vault) => {
          try {
            // Fetch multisig resource
            const resource = await aptosClient.getAccountResource<MultisigAccountResource>({
              accountAddress: vault.address,
              resourceType: `${MODULES.MULTISIG}::MultisigAccount`,
            });

            // Fetch MOVE balance via indexer (handles both legacy Coin and FA)
            // Balance is stored in MOVE units (not octas) to avoid JS number precision loss
            let balance = 0;
            try {
              const network = getCurrentNetwork();
              const balQuery = `
                query GetMoveBalance($address: String!) {
                  current_fungible_asset_balances(
                    where: {
                      owner_address: { _eq: $address },
                      asset_type: { _in: ["0x1::aptos_coin::AptosCoin", "0x000000000000000000000000000000000000000000000000000000000000000a"] }
                    }
                  ) {
                    amount
                  }
                }
              `;
              const resp = await fetch(network.indexer, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: balQuery, variables: { address: vault.address } }),
              });
              if (resp.ok) {
                const json = await resp.json();
                const balances = json?.data?.current_fungible_asset_balances || [];
                for (const bal of balances) {
                  // Use BigInt to avoid precision loss on large balances (> MAX_SAFE_INTEGER)
                  const amtBigInt = BigInt(bal.amount || '0');
                  const wholeMOVE = Number(amtBigInt / 100000000n);
                  const fracMOVE = Number(amtBigInt % 100000000n) / 1e8;
                  const moveAmt = wholeMOVE + fracMOVE;
                  if (moveAmt > balance) balance = moveAmt;
                }
              }
            } catch {
              // Indexer unavailable, try legacy RPC fallback
              try {
                const octasBalance = await aptosClient.getAccountCoinAmount({
                  accountAddress: vault.address,
                  coinType: MODULES.MOVE_COIN_TYPE,
                });
                balance = octasBalance / 1e8;
              } catch {
                // No balance found
              }
            }

            return {
              ...vault,
              owners: resource.owners,
              threshold: parseInt(resource.num_signatures_required),
              balance,
            };
          } catch (error: any) {
            // If the resource doesn't exist on this network, exclude the vault
            const msg = error?.message || '';
            if (msg.includes('resource_not_found') || msg.includes('account_not_found')) {
              return null;
            }
            // For transient errors (network issues), keep the vault with stale data
            return vault;
          }
        })
      );

      const validVaults = vaultsWithData.filter((v): v is Vault => v !== null);

      // If some vaults were removed (don't exist on this network), update storage
      if (validVaults.length < saved.length) {
        const validAddresses = new Set(validVaults.map(v => v.address));
        const cleaned = saved.filter(v => validAddresses.has(v.address));
        storage.set(getVaultsKey(), cleaned);
      }

      return validVaults;
    },
    refetchInterval: 10000,
  });
}

// Auto-discover multisig vaults the connected wallet is part of
export function useDiscoverVaults() {
  const { account, connected } = useWallet();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['discover-vaults', account?.address?.toString()],
    queryFn: async () => {
      const address = account?.address?.toString();
      if (!address) return { discovered: 0, total: 0 };

      const network = getCurrentNetwork();

      try {
        // Fetch user's transactions from REST API
        const response = await fetch(
          `${network.rpc}/accounts/${address}/transactions?limit=200`
        );
        if (!response.ok) return { discovered: 0, total: 0 };

        const transactions = await response.json();
        const multisigAddresses = new Set<string>();

        for (const tx of transactions) {
          const func = tx.payload?.function || '';
          if (!func.includes('multisig_account')) continue;

          if (func.includes('create_with_owners')) {
            // For creation, extract multisig address from events or changes
            for (const event of tx.events || []) {
              if (event.type?.includes('0x1::account::CreateAccount')) {
                if (event.data?.created) {
                  multisigAddresses.add(event.data.created.toLowerCase());
                }
              }
              if (event.type?.includes('multisig_account')) {
                const addr = event.data?.multisig_account || event.data?.account;
                if (addr) multisigAddresses.add(addr.toLowerCase());
              }
            }
            for (const change of tx.changes || []) {
              if (
                change.type === 'write_resource' &&
                change.data?.type?.includes('MultisigAccount') &&
                change.address
              ) {
                multisigAddresses.add(change.address.toLowerCase());
              }
            }
          } else {
            // For approve, reject, execute, create_transaction - first arg is multisig address
            const args = tx.payload?.arguments || [];
            if (args[0] && typeof args[0] === 'string' && isValidAddress(args[0])) {
              multisigAddresses.add(expandAddress(args[0]).toLowerCase());
            }
          }
        }

        if (multisigAddresses.size === 0) return { discovered: 0, total: 0 };

        // Filter out already-watched vaults
        const saved = storage.get<Vault[]>(getVaultsKey()) || [];
        const savedAddresses = new Set(saved.map((v) => v.address.toLowerCase()));

        const newAddresses = [...multisigAddresses].filter(
          (addr) => !savedAddresses.has(addr) && !savedAddresses.has(`0x${addr.replace('0x', '').padStart(64, '0')}`)
        );

        // Verify each is a valid multisig where the user is still an owner
        let discovered = 0;
        for (const addr of newAddresses) {
          try {
            const normalizedAddr = addr.startsWith('0x') ? addr : `0x${addr}`;
            const resource = await aptosClient.getAccountResource<MultisigAccountResource>({
              accountAddress: normalizedAddr,
              resourceType: `${MODULES.MULTISIG}::MultisigAccount`,
            });

            const isOwner = resource.owners?.some(
              (owner: string) => owner.toLowerCase() === address.toLowerCase()
            );

            if (isOwner) {
              const fullAddr = expandAddress(normalizedAddr);
              // Double-check not already saved (with normalized address)
              if (!saved.some((v) => v.address.toLowerCase() === fullAddr.toLowerCase())) {
                saved.push({
                  address: fullAddr,
                  name: `Vault ${saved.length + 1}`,
                  owners: resource.owners,
                  threshold: parseInt(resource.num_signatures_required),
                });
                discovered++;
              }
            }
          } catch {
            // Skip invalid addresses
          }
        }

        if (discovered > 0) {
          storage.set(getVaultsKey(), saved);
          queryClient.invalidateQueries({ queryKey: ['watched-vaults', getCurrentNetwork().explorerNetwork] });
        }

        return { discovered, total: multisigAddresses.size };
      } catch (error) {
        return { discovered: 0, total: 0 };
      }
    },
    enabled: connected && !!account?.address,
    staleTime: 60000, // Only re-run every 60 seconds
    refetchOnWindowFocus: false,
  });
}

// Add a new vault to watch list
export function useAddVault() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vault: { address: string; name: string }) => {
      const saved = storage.get<Vault[]>(getVaultsKey()) || [];

      // Check if already exists
      if (saved.some((v) => v.address === vault.address)) {
        throw new Error('Vault already in watch list');
      }

      // Verify it's a valid multisig account
      try {
        await aptosClient.getAccountResource({
          accountAddress: vault.address,
          resourceType: `${MODULES.MULTISIG}::MultisigAccount`,
        });
      } catch {
        throw new Error('Address is not a valid multisig account');
      }

      const newVault: Vault = {
        ...vault,
        owners: [],
        threshold: 0,
        balance: 0,
      };

      storage.set(getVaultsKey(), [...saved, newVault]);
      return newVault;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watched-vaults', getCurrentNetwork().explorerNetwork] });
    },
  });
}

// Fetch transactions for a multisig account
export function useMultisigTransactions(address: string) {
  return useQuery({
    queryKey: ['multisig-transactions', address],
    queryFn: async () => {
      if (!address) return [];

      try {
        const resource = await aptosClient.getAccountResource<MultisigAccountResource>({
          accountAddress: address,
          resourceType: `${MODULES.MULTISIG}::MultisigAccount`,
        });

        // Get the transaction IDs range
        const nextTransactionId = parseInt(resource.next_sequence_number || '0');
        const lastExecutedId = parseInt(resource.last_executed_sequence_number || '-1');

        // If there are no transactions yet
        if (nextTransactionId === 0) {
          return [];
        }


        // Check if transactions table handle exists
        if (!resource.transactions || !resource.transactions.handle) {
          return [];
        }

        // Fetch each transaction from the table
        // In Movement/Aptos, we need to query the table items
        const transactions: Proposal[] = [];

        // Fetch pending transactions (those after lastExecutedId)
        // Executed transactions are removed from the table in Aptos multisig
        // Transaction IDs start from 1, not 0
        const startId = Math.max(1, lastExecutedId + 1);


        for (let id = startId; id < nextTransactionId; id++) {
          try {
            // Try to fetch the transaction from the table using view function

            const tableItem = await aptosClient.getTableItem<any>({
              handle: resource.transactions.handle,
              data: {
                key_type: 'u64',
                value_type: '0x1::multisig_account::MultisigTransaction',
                key: id.toString(),
              },
            });


            // Parse the votes from the data array
            // votes.data is an array of {key: address, value: boolean}
            // value=true means approval, value=false means rejection
            const votesData = tableItem.votes?.data || [];
            const approvers = votesData
              .filter((v: { key: string; value: boolean }) => v.value === true)
              .map((v: { key: string; value: boolean }) => v.key);
            const rejectors = votesData
              .filter((v: { key: string; value: boolean }) => v.value === false)
              .map((v: { key: string; value: boolean }) => v.key);


            // Parse the transaction data
            const proposal: Proposal = {
              id,
              multisig_account: address,
              payload: tableItem.payload || null,
              approvers,
              rejectors,
              creator: tableItem.creator || '',
              status: id <= lastExecutedId ? 'Executed' : 'Pending',
            };

            transactions.push(proposal);
          } catch (error: any) {
            // Transaction might not exist at this ID (executed and removed)
            const errorMessage = error?.message || '';
            if (errorMessage.includes('table_item_not_found')) {
              // Skip this transaction - it was executed
              continue;
            }
          }
        }

        return transactions.reverse(); // Show newest first
      } catch (error) {
        return [];
      }
    },
    enabled: !!address,
    refetchInterval: 10000,
  });
}

// Create a new multisig account
export function useCreateMultisig() {
  const { signAndSubmitTransaction } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ owners, threshold, name }: { owners: string[]; threshold: number; name?: string }) => {
      if (!signAndSubmitTransaction) {
        throw new Error('Wallet not connected');
      }

      const payload = {
        function: `${MODULES.MULTISIG}::${MULTISIG_FUNCTIONS.CREATE_WITH_OWNERS}` as `${string}::${string}::${string}`,
        typeArguments: [],
        functionArguments: [
          owners,                    // array of owner addresses
          threshold.toString(),      // threshold as string (u64 requires string)
          [],                        // metadata_keys (empty array)
          []                         // metadata_values (empty array)
        ],
      };

      try {
        const response = await signAndSubmitTransaction({
          data: payload as any,
        });

        // Wait for transaction
        await aptosClient.waitForTransaction({
          transactionHash: response.hash,
        });

        // Extract the multisig address from the transaction
        const multisigAddress = await getMultisigAddressFromTransaction(response.hash);

        if (!multisigAddress) {
        }

        return {
          ...response,
          multisigAddress,
          vaultName: name, // Pass through the name
        };
      } catch (innerError) {
        const message = innerError && typeof innerError === 'object' && 'message' in innerError
          ? (innerError as any).message
          : 'Transaction failed';
        throw new Error(message);
      }
    },
    onSuccess: (data) => {
      // If we found the multisig address, add it to watched vaults
      if (data.multisigAddress) {
        const saved = storage.get<Vault[]>(getVaultsKey()) || [];
        const newVault: Vault = {
          address: data.multisigAddress,
          name: data.vaultName || `Multisig ${saved.length + 1}`,
        };

        // Add to storage
        storage.set(getVaultsKey(), [...saved, newVault]);

        // Invalidate the query to refresh the list
        queryClient.invalidateQueries({ queryKey: ['watched-vaults', getCurrentNetwork().explorerNetwork] });
      }
    },
  });
}

// Rename a vault
export function useRenameVault() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ address, name }: { address: string; name: string }) => {
      const saved = storage.get<Vault[]>(getVaultsKey()) || [];
      const updated = saved.map((v) =>
        v.address === address ? { ...v, name } : v
      );
      storage.set(getVaultsKey(), updated);
      return { address, name };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watched-vaults', getCurrentNetwork().explorerNetwork] });
    },
  });
}

// Approve a transaction
export function useApproveTransaction(multisigAddress: string) {
  const { signAndSubmitTransaction, account, connected } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (transactionId: number) => {

      if (!signAndSubmitTransaction || !account) {
        throw new Error('Wallet not connected. Please connect your wallet and try again.');
      }

      const payload = {
        function: `${MODULES.MULTISIG}::${MULTISIG_FUNCTIONS.APPROVE}` as `${string}::${string}::${string}`,
        typeArguments: [],
        functionArguments: [multisigAddress, transactionId.toString()],
      };


      const response = await signAndSubmitTransaction({
        data: payload,
      });


      await aptosClient.waitForTransaction({
        transactionHash: response.hash,
      });

      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['multisig-transactions', multisigAddress] });
    },
  });
}

// Reject a transaction
export function useRejectTransaction(multisigAddress: string) {
  const { signAndSubmitTransaction, account } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (transactionId: number) => {
      if (!signAndSubmitTransaction || !account) {
        throw new Error('Wallet not connected. Please connect your wallet and try again.');
      }


      const payload = {
        function: `${MODULES.MULTISIG}::${MULTISIG_FUNCTIONS.REJECT}` as `${string}::${string}::${string}`,
        typeArguments: [],
        functionArguments: [multisigAddress, transactionId.toString()],
      };

      const response = await signAndSubmitTransaction({
        data: payload,
      });

      await aptosClient.waitForTransaction({
        transactionHash: response.hash,
      });

      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['multisig-transactions', multisigAddress] });
    },
  });
}

// Reject a broken proposal and execute the rejection to clear it from the queue.
// Used to clean up old proposals with invalid (JSON) payloads that block execution.
export function useCleanupProposal(multisigAddress: string) {
  const { signAndSubmitTransaction, account } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (transactionId: number) => {
      if (!signAndSubmitTransaction || !account) {
        throw new Error('Wallet not connected');
      }

      // Step 1: Cast a reject vote on the broken proposal
      const rejectPayload = {
        function: `${MODULES.MULTISIG}::${MULTISIG_FUNCTIONS.REJECT}` as `${string}::${string}::${string}`,
        typeArguments: [],
        functionArguments: [multisigAddress, transactionId.toString()],
      };

      const rejectResponse = await signAndSubmitTransaction({ data: rejectPayload });
      await aptosClient.waitForTransaction({ transactionHash: rejectResponse.hash });

      // Step 2: Execute the rejection to clear the proposal from the queue
      const executeRejectedPayload = {
        function: `${MODULES.MULTISIG}::execute_rejected_transaction` as `${string}::${string}::${string}`,
        typeArguments: [],
        functionArguments: [multisigAddress],
      };

      const execResponse = await signAndSubmitTransaction({ data: executeRejectedPayload });
      await aptosClient.waitForTransaction({ transactionHash: execResponse.hash });

      return execResponse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['multisig-transactions', multisigAddress] });
      queryClient.invalidateQueries({ queryKey: ['multisig', multisigAddress] });
      queryClient.invalidateQueries({ queryKey: ['watched-vaults', getCurrentNetwork().explorerNetwork] });
    },
  });
}

// Execute a rejected transaction - clears it from the queue when rejections >= threshold
export function useExecuteRejectedTransaction(multisigAddress: string) {
  const { signAndSubmitTransaction, account } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (_transactionId: number) => {
      if (!signAndSubmitTransaction || !account) {
        throw new Error('Wallet not connected. Please connect your wallet and try again.');
      }

      const executeRejectedPayload = {
        function: `${MODULES.MULTISIG}::execute_rejected_transaction` as `${string}::${string}::${string}`,
        typeArguments: [],
        functionArguments: [multisigAddress],
      };

      const response = await signAndSubmitTransaction({ data: executeRejectedPayload });
      await aptosClient.waitForTransaction({ transactionHash: response.hash });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['multisig-transactions', multisigAddress] });
      queryClient.invalidateQueries({ queryKey: ['multisig', multisigAddress] });
      queryClient.invalidateQueries({ queryKey: ['watched-vaults', getCurrentNetwork().explorerNetwork] });
    },
  });
}

// Execute a transaction - triggers execution of stored multisig payload
// Uses the wallet adapter features directly as per Nightly docs for Movement network
export function useExecuteTransaction(multisigAddress: string) {
  const { wallet, account } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (transactionId: number) => {
      if (!wallet || !account) {
        throw new Error('Wallet not connected. Please connect your wallet and try again.');
      }


      try {
        // Create the multisig execution payload
        // When transaction_payload is omitted, it executes the stored on-chain payload
        const multisigPayload = new TransactionPayloadMultiSig(
          new MultiSig(AccountAddress.fromString(multisigAddress))
        );


        // Build the transaction using buildTransaction with the raw payload
        const transaction = await buildTransaction({
          aptosConfig: aptosClient.config,
          sender: account.address.toString(),
          payload: multisigPayload,
        });


        // Use the wallet adapter features to sign and submit (Nightly approach for Movement)
        const signAndSubmit = (wallet as any).features?.['aptos:signAndSubmitTransaction'];
        if (!signAndSubmit) {
          throw new Error('Wallet does not support signAndSubmitTransaction');
        }

        // Pass the SimpleTransaction directly
        const response = await signAndSubmit.signAndSubmitTransaction(transaction);


        // Handle response - it might be wrapped in a status object
        const txHash = (response as any)?.hash || (response as any)?.args?.hash;
        if (!txHash) {
          throw new Error('Could not get transaction hash from response');
        }

        // Wait for transaction confirmation
        await aptosClient.waitForTransaction({
          transactionHash: txHash,
        });

        return { hash: txHash };
      } catch (error: any) {
        throw new Error(`Failed to execute: ${error?.message || 'Unknown error'}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['multisig-transactions', multisigAddress] });
      queryClient.invalidateQueries({ queryKey: ['multisig', multisigAddress] });
      queryClient.invalidateQueries({ queryKey: ['watched-vaults', getCurrentNetwork().explorerNetwork] });
    },
  });
}