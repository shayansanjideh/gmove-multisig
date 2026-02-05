'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { useNetwork } from '@/contexts/NetworkContext';
import { MODULES } from '@/constants/modules';
import type { MultisigAccountResource } from '@/types/multisig';
import {
  generateTransactionPayload,
  InputEntryFunctionData
} from '@aptos-labs/ts-sdk';

// Fixed proposal creation that handles 1/1 multisigs correctly
export function useCreateProposalFixed(multisigAddress: string) {
  const { signAndSubmitTransaction, account, network: walletNetwork } = useWallet();
  const queryClient = useQueryClient();
  const { aptosClient, network } = useNetwork();

  return useMutation({
    mutationFn: async (payload: InputEntryFunctionData) => {
      if (!signAndSubmitTransaction || !account) {
        throw new Error('Wallet not connected. Please connect your wallet and try again.');
      }

      try {
        console.log('=== CREATE PROPOSAL DEBUG ===');
        console.log('App Network:', network);
        console.log('Wallet Network:', walletNetwork?.name || 'unknown', walletNetwork?.url || '');
        console.log('Multisig address:', multisigAddress);
        console.log('Payload:', payload);

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
          console.warn('⚠️ NETWORK MISMATCH: Wallet on', walletNetwork?.name, '(' + walletUrl + ') but app on', network);
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

        console.log(`Multisig: ${threshold}/${numOwners}, Is owner: ${isOwner}`);

        if (!isOwner) {
          throw new Error('Your wallet is not an owner of this multisig account');
        }

        // Check if this is a true 1/1 multisig (single owner with threshold 1)
        if (threshold === 1 && numOwners === 1) {
          console.log('True 1/1 multisig detected - executing transaction directly');

          const response = await signAndSubmitTransaction({
            data: payload,
          });

          // Try to wait for transaction with retries
          for (let i = 0; i < 5; i++) {
            try {
              await new Promise(resolve => setTimeout(resolve, 2000));
              await aptosClient.waitForTransaction({
                transactionHash: response.hash,
                options: { timeoutSecs: 10 },
              });
              console.log('✓ Transaction executed directly! TX:', response.hash);
              break;
            } catch (waitError: any) {
              console.log(`Attempt ${i + 1}: Transaction not yet confirmed, retrying...`);
              if (i === 4) {
                console.warn('Could not confirm transaction, but it may still be processing');
              }
            }
          }

          return response;
        } else {
          // For any multisig with multiple owners OR threshold > 1, create a proposal
          console.log(`Multi-owner multisig detected (${threshold}/${numOwners}) - creating proposal`);

          // Get current transaction ID before attempting
          const beforeNextId = parseInt(resource.next_sequence_number || '0');
          console.log('Transaction ID before attempt:', beforeNextId);

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

          console.log('BCS bytes length:', bcsBytes.length);
          console.log('First 20 bytes:', Array.from(bcsBytes.slice(0, 20)));

          // Create the proposal
          const proposeTxn = {
            function: '0x1::multisig_account::create_transaction',
            typeArguments: [],
            functionArguments: [
              multisigAddress,
              Array.from(bcsBytes), // Convert to array for wallet adapter
            ],
          };

          console.log('Submitting create_transaction...');

          const response = await signAndSubmitTransaction({
            data: proposeTxn,
          });

          console.log('Transaction submitted, hash:', response.hash);

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
              console.log('Transaction confirmed on-chain');
              break;
            } catch (waitError: any) {
              console.log(`Attempt ${i + 1}: Transaction not yet found, retrying...`);
              if (i === 4) {
                console.warn('Could not confirm transaction, but it may still be pending');
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
            console.log('Transaction ID after:', afterNextId);

            if (afterNextId > beforeNextId) {
              console.log('✅ SUCCESS! Proposal created with ID:', afterNextId - 1);
              return response;
            }
          } catch (checkError) {
            console.log('Could not verify proposal creation, returning response anyway');
          }

          // Return response even if we couldn't fully verify - the UI will refresh and show the result
          console.log('Transaction submitted - check the Signing Room for the proposal');
          return response;
        }
      } catch (error: any) {
        console.error('Failed to create proposal/transaction:', error);
        throw error;
      }
    },
    onSuccess: async () => {
      console.log('Success! Invalidating queries...');
      await queryClient.invalidateQueries({ queryKey: ['multisig-transactions', multisigAddress] });
      await queryClient.invalidateQueries({ queryKey: ['multisig', multisigAddress] });
      await queryClient.refetchQueries({ queryKey: ['multisig-transactions', multisigAddress] });
    },
  });
}