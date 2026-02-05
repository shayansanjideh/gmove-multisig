import { aptosClient } from '@/lib/aptos';

/**
 * Generate a transaction payload for a multisig transaction.
 * For now, we'll use a simple JSON encoding approach that Movement accepts.
 */
export async function generateMultisigPayload({
  multisigAddress,
  targetFunction,
  typeArguments = [],
  functionArguments = [],
}: {
  multisigAddress: string;
  targetFunction: string;
  typeArguments?: string[];
  functionArguments?: any[];
}) {
  try {
    // Create a JSON payload structure
    const jsonPayload = {
      function: targetFunction,
      type_arguments: typeArguments,
      arguments: functionArguments,
    };

    // Convert to bytes
    const jsonString = JSON.stringify(jsonPayload);
    const encoder = new TextEncoder();
    return encoder.encode(jsonString);
  } catch (error) {
    console.error('Failed to generate multisig payload:', error);
    throw error;
  }
}

/**
 * Create a multisig transaction proposal payload
 * This creates the payload for calling create_transaction
 */
export function createProposalPayload(
  multisigAddress: string,
  serializedPayload: Uint8Array
) {
  return {
    function: '0x1::multisig_account::create_transaction',
    typeArguments: [],
    functionArguments: [
      multisigAddress,
      serializedPayload, // Pass the BCS serialized payload
    ],
  };
}