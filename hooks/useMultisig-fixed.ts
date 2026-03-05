'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { useNetwork } from '@/contexts/NetworkContext';
import { MODULES } from '@/constants/modules';
import type { MultisigAccountResource } from '@/types/multisig';
import {
  generateTransactionPayload,
  InputEntryFunctionData,
  AccountAddress,
  MultiSig,
  TransactionPayloadMultiSig,
  buildTransaction,
} from '@aptos-labs/ts-sdk';

// Fixed proposal creation that handles 1/1 multisigs correctly
export function useCreateProposalFixed(multisigAddress: string) {
  const { signAndSubmitTransaction, account, wallet, network: walletNetwork } = useWallet();
  const queryClient = useQueryClient();
  const { aptosClient, network } = useNetwork();

  return useMutation({
    mutationFn: async (payload: InputEntryFunctionData) => {
      if (!signAndSubmitTransaction || !account) {
        throw new Error('Wallet not connected. Please connect your wallet and try again.');
      }

      try {

        // Check for network mismatch (Movement wallets report "custom" as network name)
        const walletUrl = walletNetwork?.url?.toLowerCase() || '';
        const walletName = walletNetwork?.name?.toLowerCase() || '';
        let hasMismatch = false;

        if (walletName === 'custom') {
          // Check URL for network indicators
          if (network === 'testnet' && walletUrl.includes('mainnet')) hasMismatch = true;
          if (network === 'mainnet' && walletUrl.includes('testnet')) hasMismatch = true;
        } else if (walletNetwork && walletName !== network) {
          hasMismatch = true;
        }

        if (hasMismatch) {
        }

        // First, check the multisig configuration
        const resource = await aptosClient.getAccountResource<MultisigAccountResource>({
          accountAddress: multisigAddress,
          resourceType: `${MODULES.MULTISIG}::MultisigAccount`,
        });

        const threshold = parseInt(resource.num_signatures_required || '0');
        const numOwners = resource.owners?.length || 0;
        const isOwner = resource.owners?.some(owner =>
          owner.toLowerCase() === account.address.toString().toLowerCase()
        );


        if (!isOwner) {
          throw new Error('Your wallet is not an owner of this multisig account');
        }

        // Check if this is a true 1/1 multisig (single owner with threshold 1)
        if (threshold === 1 && numOwners === 1) {

          // Step 1: Create the proposal (auto-approves since creator is the only owner)
          const txnPayload = await generateTransactionPayload({
            multisigAddress,
            function: payload.function,
            typeArguments: payload.typeArguments,
            functionArguments: payload.functionArguments,
            aptosConfig: aptosClient.config,
          });

          const bcsBytes = txnPayload.multiSig.transaction_payload!.bcsToBytes();

          const createResponse = await signAndSubmitTransaction({
            data: {
              function: '0x1::multisig_account::create_transaction' as `${string}::${string}::${string}`,
              typeArguments: [],
              functionArguments: [multisigAddress, Array.from(bcsBytes)],
            },
          });


          // Wait for proposal creation to confirm
          for (let i = 0; i < 5; i++) {
            try {
              await new Promise(resolve => setTimeout(resolve, 2000));
              await aptosClient.waitForTransaction({
                transactionHash: createResponse.hash,
                options: { timeoutSecs: 10 },
              });
              break;
            } catch (waitError: any) {
              if (i === 4) {
              }
            }
          }

          // Step 2: Execute immediately (threshold already met since creator auto-approves)
          try {
            const multisigPayload = new TransactionPayloadMultiSig(
              new MultiSig(AccountAddress.fromString(multisigAddress))
            );

            const transaction = await buildTransaction({
              aptosConfig: aptosClient.config,
              sender: account.address.toString(),
              payload: multisigPayload,
            });

            const wallet_features = (wallet as any)?.features?.['aptos:signAndSubmitTransaction'];
            if (!wallet_features) {
              throw new Error('Wallet does not support signAndSubmitTransaction');
            }

            const executeResponse = await wallet_features.signAndSubmitTransaction(transaction);
            const txHash = executeResponse?.hash || executeResponse?.args?.hash;

            if (txHash) {
              await aptosClient.waitForTransaction({
                transactionHash: txHash,
                options: { timeoutSecs: 15 },
              });
              return { hash: txHash };
            }
          } catch (executeError: any) {
            // Proposal was created successfully, user can execute manually from the Signing Room
          }

          return createResponse;
        } else {
          // For any multisig with multiple owners OR threshold > 1, create a proposal

          // Get current transaction ID before attempting
          const beforeNextId = parseInt(resource.next_sequence_number || '0');

          // Use the EXACT same approach as Thala Labs Safely
          // Generate the transaction payload using the SDK's generateTransactionPayload function
          const txnPayload = await generateTransactionPayload({
            multisigAddress,
            function: payload.function,
            typeArguments: payload.typeArguments,
            functionArguments: payload.functionArguments,
            aptosConfig: aptosClient.config,
          });

          // Extract the BCS bytes from the inner transaction_payload (EntryFunction)
          // This is the KEY difference - we serialize the EntryFunction, not the entire TransactionPayloadMultiSig
          const bcsBytes = txnPayload.multiSig.transaction_payload!.bcsToBytes();


          // Create the proposal
          const proposeTxn = {
            function: '0x1::multisig_account::create_transaction' as `${string}::${string}::${string}`,
            typeArguments: [],
            functionArguments: [
              multisigAddress,
              Array.from(bcsBytes), // Convert to array for wallet adapter
            ],
          };


          const response = await signAndSubmitTransaction({
            data: proposeTxn,
          });


          // Try to wait for transaction with retries
          let confirmed = false;
          for (let i = 0; i < 5; i++) {
            try {
              await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds between attempts
              await aptosClient.waitForTransaction({
                transactionHash: response.hash,
                options: { timeoutSecs: 10 },
              });
              confirmed = true;
              break;
            } catch (waitError: any) {
              if (i === 4) {
              }
            }
          }

          // Even if we couldn't confirm, check if the proposal was created
          try {
            await new Promise(resolve => setTimeout(resolve, 2000));
            const updatedResource = await aptosClient.getAccountResource<MultisigAccountResource>({
              accountAddress: multisigAddress,
              resourceType: `${MODULES.MULTISIG}::MultisigAccount`,
            });

            const afterNextId = parseInt(updatedResource.next_sequence_number || '0');

            if (afterNextId > beforeNextId) {
              return response;
            }
          } catch (checkError) {
          }

          // Return response even if we couldn't fully verify - the UI will refresh and show the result
          return response;
        }
      } catch (error: any) {
        throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['multisig-transactions', multisigAddress] });
      await queryClient.invalidateQueries({ queryKey: ['multisig', multisigAddress] });
      await queryClient.refetchQueries({ queryKey: ['multisig-transactions', multisigAddress] });
    },
  });
}