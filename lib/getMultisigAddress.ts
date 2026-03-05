import { aptosClient } from './aptos';

/**
 * Extract the multisig address from a create_with_owners transaction
 * In Movement/Aptos, the multisig account address should be in the transaction events
 */
export async function getMultisigAddressFromTransaction(txHash: string): Promise<string | null> {
  try {
    const txDetails = await aptosClient.getTransactionByHash({
      transactionHash: txHash,
    });
    // Look through events for the multisig account creation
    const txAny = txDetails as any;
    if (txAny.events && Array.isArray(txAny.events)) {
      for (const event of txAny.events) {
        // Look for account creation events
        if (event.type.includes('0x1::account::CreateAccount')) {
          // The created account address should be in the event data
          if (event.data?.created) {
            return event.data.created;
          }
        }

        // Look for multisig-specific events
        if (event.type.includes('multisig_account')) {
          if (event.data?.multisig_account) {
            return event.data.multisig_account;
          }
          if (event.data?.account) {
            return event.data.account;
          }
        }
      }
    }

    // Alternative: Look in the transaction changes
    if (txAny.changes && Array.isArray(txAny.changes)) {
      for (const change of txAny.changes) {
        // Look for write_resource changes that create a MultisigAccount resource
        if (change.type === 'write_resource' &&
            change.data?.type?.includes('multisig_account::MultisigAccount')) {
          return change.address;
        }
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}