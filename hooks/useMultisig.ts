'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { aptosClient } from '@/lib/aptos';
import { storage } from '@/lib/utils';
import { STORAGE_KEYS, MODULES, MULTISIG_FUNCTIONS } from '@/constants/modules';
import { getMultisigAddressFromTransaction } from '@/lib/getMultisigAddress';
import { generateMultisigPayload } from '@/lib/multisig-helpers';
import type { MultisigAccountResource, Vault, Proposal } from '@/types/multisig';
import {
  AccountAddress,
  MultiSig,
  TransactionPayloadMultiSig,
  buildTransaction,
} from '@aptos-labs/ts-sdk';

// Interface for coin data
export interface CoinData {
  coinType: string;
  name: string;
  symbol: string;
  decimals: number;
  balance: string;
  balanceFormatted: string;
}

// Fetch all coins held by an account
export function useAccountCoins(address: string) {
  return useQuery({
    queryKey: ['account-coins', address],
    queryFn: async () => {
      if (!address) return [];

      try {
        // Fetch all coin resources for the account
        const resources = await aptosClient.getAccountResources({
          accountAddress: address,
        });

        const coins: CoinData[] = [];

        // Look for CoinStore resources
        for (const resource of resources) {
          if (resource.type.startsWith('0x1::coin::CoinStore<')) {
            // Extract coin type from resource type
            const match = resource.type.match(/0x1::coin::CoinStore<(.+)>/);
            if (match) {
              const coinType = match[1];
              const coinData = resource.data as { coin: { value: string } };
              const balance = coinData.coin?.value || '0';

              // Determine coin name and symbol from type
              let name = 'Unknown';
              let symbol = 'UNK';
              let decimals = 8;

              if (coinType === '0x1::aptos_coin::AptosCoin') {
                name = 'Movement';
                symbol = 'MOVE';
                decimals = 8;
              } else {
                // Try to extract name from coin type
                const parts = coinType.split('::');
                if (parts.length >= 3) {
                  symbol = parts[parts.length - 1];
                  name = symbol;
                }
              }

              // Format the balance
              const balanceNum = BigInt(balance);
              const divisor = BigInt(10 ** decimals);
              const whole = balanceNum / divisor;
              const fractional = balanceNum % divisor;
              const balanceFormatted = `${whole}.${fractional.toString().padStart(decimals, '0').slice(0, 4)}`;

              // Only add if balance > 0
              if (balanceNum > 0n) {
                coins.push({
                  coinType,
                  name,
                  symbol,
                  decimals,
                  balance,
                  balanceFormatted,
                });
              }
            }
          }
        }

        // Sort with MOVE first, then by balance
        coins.sort((a, b) => {
          if (a.symbol === 'MOVE') return -1;
          if (b.symbol === 'MOVE') return 1;
          return BigInt(b.balance) > BigInt(a.balance) ? 1 : -1;
        });

        return coins;
      } catch (error) {
        console.error('Failed to fetch account coins:', error);
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
        console.error('Failed to fetch multisig account:', error);
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
    queryKey: ['watched-vaults'],
    queryFn: async () => {
      const saved = storage.get<Vault[]>(STORAGE_KEYS.WATCHED_VAULTS) || [];

      // Fetch on-chain data for each vault
      const vaultsWithData = await Promise.all(
        saved.map(async (vault) => {
          try {
            // Fetch multisig resource
            const resource = await aptosClient.getAccountResource<MultisigAccountResource>({
              accountAddress: vault.address,
              resourceType: `${MODULES.MULTISIG}::MultisigAccount`,
            });

            // Fetch MOVE balance
            const balance = await aptosClient.getAccountCoinAmount({
              accountAddress: vault.address,
              coinType: MODULES.MOVE_COIN_TYPE,
            });

            return {
              ...vault,
              owners: resource.owners,
              threshold: parseInt(resource.num_signatures_required),
              balance: balance || 0,
            };
          } catch (error) {
            console.error(`Failed to fetch data for vault ${vault.address}:`, error);
            return vault;
          }
        })
      );

      return vaultsWithData;
    },
    refetchInterval: 10000,
  });
}

// Add a new vault to watch list
export function useAddVault() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vault: { address: string; name: string }) => {
      const saved = storage.get<Vault[]>(STORAGE_KEYS.WATCHED_VAULTS) || [];

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

      storage.set(STORAGE_KEYS.WATCHED_VAULTS, [...saved, newVault]);
      return newVault;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watched-vaults'] });
    },
  });
}

// Remove vault from watch list
export function useRemoveVault() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (address: string) => {
      const saved = storage.get<Vault[]>(STORAGE_KEYS.WATCHED_VAULTS) || [];
      const filtered = saved.filter((v) => v.address !== address);
      storage.set(STORAGE_KEYS.WATCHED_VAULTS, filtered);
      return filtered;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watched-vaults'] });
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

        console.log('Multisig state:', {
          address,
          nextTransactionId,
          lastExecutedId,
          tableHandle: resource.transactions?.handle,
          resource: resource,
        });

        // If there are no transactions yet
        if (nextTransactionId === 0) {
          console.log('No transactions exist yet (nextTransactionId is 0)');
          return [];
        }

        console.log(`Found ${nextTransactionId} transactions to fetch`);

        // Check if transactions table handle exists
        if (!resource.transactions || !resource.transactions.handle) {
          console.warn('Transactions table handle not found');
          return [];
        }

        // Fetch each transaction from the table
        // In Movement/Aptos, we need to query the table items
        const transactions: Proposal[] = [];

        // Fetch pending transactions (those after lastExecutedId)
        // Executed transactions are removed from the table in Aptos multisig
        // Transaction IDs start from 1, not 0
        const startId = Math.max(1, lastExecutedId + 1);

        console.log(`Fetching transactions from ${startId} to ${nextTransactionId - 1}`);

        for (let id = startId; id < nextTransactionId; id++) {
          try {
            // Try to fetch the transaction from the table using view function
            console.log(`Attempting to fetch transaction ${id} from table ${resource.transactions.handle}`);

            const tableItem = await aptosClient.getTableItem<any>({
              handle: resource.transactions.handle,
              data: {
                key_type: 'u64',
                value_type: '0x1::multisig_account::MultisigTransaction',
                key: id.toString(),
              },
            });

            console.log(`Successfully fetched transaction ${id}:`, tableItem);

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

            console.log(`Transaction ${id} votes:`, { approvers, rejectors, votesData });

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
              console.log(`Transaction ${id} not found (likely executed and removed)`);
              // Skip this transaction - it was executed
              continue;
            }
            console.log(`Failed to fetch transaction ${id}:`, errorMessage);
            console.error('Full error:', error);
          }
        }

        return transactions.reverse(); // Show newest first
      } catch (error) {
        console.error('Failed to fetch transactions:', error);
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

      console.log('Creating multisig with:', {
        owners,
        threshold: threshold.toString(),
        name,
        function: `${MODULES.MULTISIG}::${MULTISIG_FUNCTIONS.CREATE_WITH_OWNERS}`,
      });

      const payload = {
        function: `${MODULES.MULTISIG}::${MULTISIG_FUNCTIONS.CREATE_WITH_OWNERS}`,
        typeArguments: [],
        functionArguments: [
          owners,                    // array of owner addresses
          threshold.toString(),      // threshold as string (u64 requires string)
          [],                        // metadata_keys (empty array)
          []                         // metadata_values (empty array)
        ],
      };

      try {
        console.log('Calling signAndSubmitTransaction...');
        const response = await signAndSubmitTransaction({
          data: payload as any,
        });
        console.log('Transaction submitted successfully:', response);

        // Wait for transaction
        await aptosClient.waitForTransaction({
          transactionHash: response.hash,
        });

        // Extract the multisig address from the transaction
        const multisigAddress = await getMultisigAddressFromTransaction(response.hash);

        if (!multisigAddress) {
          console.warn('Could not extract multisig address from transaction');
        }

        return {
          ...response,
          multisigAddress,
          vaultName: name, // Pass through the name
        };
      } catch (innerError) {
        console.error('Transaction submission failed:', innerError);
        const message = innerError && typeof innerError === 'object' && 'message' in innerError
          ? (innerError as any).message
          : 'Transaction failed';
        throw new Error(message);
      }
    },
    onSuccess: (data) => {
      // If we found the multisig address, add it to watched vaults
      if (data.multisigAddress) {
        const saved = storage.get<Vault[]>(STORAGE_KEYS.WATCHED_VAULTS) || [];
        const newVault: Vault = {
          address: data.multisigAddress,
          name: data.vaultName || `Multisig ${saved.length + 1}`,
        };

        // Add to storage
        storage.set(STORAGE_KEYS.WATCHED_VAULTS, [...saved, newVault]);

        // Invalidate the query to refresh the list
        queryClient.invalidateQueries({ queryKey: ['watched-vaults'] });
      }
    },
  });
}

// Rename a vault
export function useRenameVault() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ address, name }: { address: string; name: string }) => {
      const saved = storage.get<Vault[]>(STORAGE_KEYS.WATCHED_VAULTS) || [];
      const updated = saved.map((v) =>
        v.address === address ? { ...v, name } : v
      );
      storage.set(STORAGE_KEYS.WATCHED_VAULTS, updated);
      return { address, name };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watched-vaults'] });
    },
  });
}

// Propose a new transaction
export function useCreateProposal(multisigAddress: string) {
  const { signAndSubmitTransaction, account } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: any) => {
      if (!signAndSubmitTransaction || !account) {
        throw new Error('Wallet not connected. Please connect your wallet and try again.');
      }

      try {
        console.log('Creating proposal for multisig account:', multisigAddress);
        console.log('Connected wallet:', account.address);
        console.log('Payload:', payload);

        // First verify we're an owner
        const resource = await aptosClient.getAccountResource<MultisigAccountResource>({
          accountAddress: multisigAddress,
          resourceType: `${MODULES.MULTISIG}::MultisigAccount`,
        });

        const isOwner = resource.owners?.some(owner =>
          owner.toLowerCase() === account.address.toString().toLowerCase()
        );
        console.log('Is wallet an owner?', isOwner, 'Owners:', resource.owners);

        if (!isOwner) {
          throw new Error('Your wallet is not an owner of this multisig account');
        }

        // Generate the BCS-serialized transaction payload
        const serializedPayload = await generateMultisigPayload({
          multisigAddress,
          targetFunction: payload.function,
          typeArguments: payload.typeArguments || [],
          functionArguments: payload.functionArguments || [],
        });

        console.log('Serialized payload length:', serializedPayload.length);

        // Try multiple approaches to pass the payload
        // Approach 1: As hex string
        const payloadHex = '0x' + Array.from(serializedPayload)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');

        console.log('Trying with hex payload:', payloadHex.substring(0, 100) + '...');

        const proposalPayload = {
          function: '0x1::multisig_account::create_transaction',
          typeArguments: [],
          functionArguments: [
            multisigAddress,
            payloadHex, // Try as hex string first
          ],
        };

        console.log('Submitting create_transaction with payload:', {
          ...proposalPayload,
          functionArguments: [
            multisigAddress,
            `[${serializedPayload.length} bytes as hex]`, // Log byte count instead of full hex
          ],
        });

        // Submit the transaction
        const response = await signAndSubmitTransaction({
          data: proposalPayload,
        });

        // Wait for confirmation
        await aptosClient.waitForTransaction({
          transactionHash: response.hash,
        });

        console.log('✓ Transaction submitted successfully! TX:', response.hash);

        // Verify the proposal was actually created by checking the resource again
        const updatedResource = await aptosClient.getAccountResource<MultisigAccountResource>({
          accountAddress: multisigAddress,
          resourceType: `${MODULES.MULTISIG}::MultisigAccount`,
        });

        const newNextId = parseInt(updatedResource.next_sequence_number || '0');
        const oldNextId = parseInt(resource.next_sequence_number || '0');

        console.log('Transaction ID before:', oldNextId, 'after:', newNextId);

        if (newNextId <= oldNextId) {
          console.error('WARNING: Transaction was submitted but next_transaction_id did not increment!');
          console.error('This means the proposal was NOT actually created on-chain.');
          console.error('Possible issues:');
          console.error('1. Wrong module or function name');
          console.error('2. Payload format is incorrect');
          console.error('3. Module expects different parameters');

          // Try to get the transaction details to see what happened
          try {
            const txDetails = await aptosClient.getTransactionByHash({
              transactionHash: response.hash,
            });
            console.log('Transaction details:', txDetails);
          } catch (e) {
            console.error('Could not fetch transaction details:', e);
          }

          throw new Error('Proposal creation failed - transaction succeeded but no proposal was created');
        }

        console.log('✓ Proposal created successfully! New ID:', newNextId - 1);
        return response;
      } catch (error: any) {
        console.error('Failed to create proposal:', error);

        // Provide helpful error messages
        const errorMessage = error?.message || 'Unknown error';

        if (errorMessage.includes('FUNCTION_NOT_FOUND')) {
          throw new Error('The multisig module function was not found. Please check that the multisig is properly initialized.');
        } else if (errorMessage.includes('INVALID_ARGUMENT') || errorMessage.includes('EBYTES_TOO_LARGE')) {
          throw new Error('Invalid transaction format. The payload may be too large or incorrectly formatted.');
        } else if (errorMessage.includes('ENOT_OWNER')) {
          throw new Error('You are not an owner of this multisig account.');
        } else if (errorMessage.includes('Failed to serialize')) {
          throw new Error('Failed to serialize the transaction payload. The transaction may be malformed.');
        } else {
          throw new Error(`Failed to create proposal: ${errorMessage}`);
        }
      }
    },
    onSuccess: async () => {
      console.log('Proposal created, invalidating queries for:', multisigAddress);

      // Invalidate and refetch the multisig transactions
      await queryClient.invalidateQueries({ queryKey: ['multisig-transactions', multisigAddress] });
      await queryClient.refetchQueries({ queryKey: ['multisig-transactions', multisigAddress] });

      // Also invalidate the multisig account resource
      await queryClient.invalidateQueries({ queryKey: ['multisig', multisigAddress] });

      console.log('Queries invalidated and refetched');
    },
  });
}

// Approve a transaction
export function useApproveTransaction(multisigAddress: string) {
  const { signAndSubmitTransaction, account, connected } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (transactionId: number) => {
      console.log('useApproveTransaction mutationFn called');
      console.log('signAndSubmitTransaction available:', !!signAndSubmitTransaction);
      console.log('account:', account);
      console.log('connected:', connected);

      if (!signAndSubmitTransaction || !account) {
        throw new Error('Wallet not connected. Please connect your wallet and try again.');
      }

      const payload = {
        function: `${MODULES.MULTISIG}::${MULTISIG_FUNCTIONS.APPROVE}`,
        typeArguments: [],
        functionArguments: [multisigAddress, transactionId.toString()],
      };

      console.log('Approve payload:', payload);

      const response = await signAndSubmitTransaction({
        data: payload,
      });

      console.log('signAndSubmitTransaction response:', response);

      await aptosClient.waitForTransaction({
        transactionHash: response.hash,
      });

      console.log('Approve transaction confirmed!');
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

      console.log('Rejecting transaction:', transactionId);

      const payload = {
        function: `${MODULES.MULTISIG}::${MULTISIG_FUNCTIONS.REJECT}`,
        typeArguments: [],
        functionArguments: [multisigAddress, transactionId.toString()],
      };

      const response = await signAndSubmitTransaction({
        data: payload,
      });

      await aptosClient.waitForTransaction({
        transactionHash: response.hash,
      });

      console.log('Reject transaction confirmed!');
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['multisig-transactions', multisigAddress] });
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

      console.log('Executing multisig transaction:', transactionId);
      console.log('Multisig address:', multisigAddress);

      try {
        // Create the multisig execution payload
        // When transaction_payload is omitted, it executes the stored on-chain payload
        const multisigPayload = new TransactionPayloadMultiSig(
          new MultiSig(AccountAddress.fromString(multisigAddress))
        );

        console.log('Created TransactionPayloadMultiSig:', multisigPayload);

        // Build the transaction using buildTransaction with the raw payload
        const transaction = await buildTransaction({
          aptosConfig: aptosClient.config,
          sender: account.address.toString(),
          payload: multisigPayload,
        });

        console.log('Built transaction:', transaction);

        // Use the wallet adapter features to sign and submit (Nightly approach for Movement)
        const signAndSubmit = (wallet as any).features?.['aptos:signAndSubmitTransaction'];
        if (!signAndSubmit) {
          throw new Error('Wallet does not support signAndSubmitTransaction');
        }

        // Pass the SimpleTransaction directly
        const response = await signAndSubmit.signAndSubmitTransaction(transaction);

        console.log('Transaction response:', response);

        // Handle response - it might be wrapped in a status object
        const txHash = (response as any)?.hash || (response as any)?.args?.hash;
        if (!txHash) {
          console.log('Full response object:', JSON.stringify(response, null, 2));
          throw new Error('Could not get transaction hash from response');
        }

        // Wait for transaction confirmation
        await aptosClient.waitForTransaction({
          transactionHash: txHash,
        });

        console.log('Execute transaction confirmed!', txHash);
        return { hash: txHash };
      } catch (error: any) {
        console.error('Failed to execute:', error?.message || error);
        console.error('Full error:', error);
        throw new Error(`Failed to execute: ${error?.message || 'Unknown error'}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['multisig-transactions', multisigAddress] });
      queryClient.invalidateQueries({ queryKey: ['multisig', multisigAddress] });
      queryClient.invalidateQueries({ queryKey: ['watched-vaults'] });
    },
  });
}