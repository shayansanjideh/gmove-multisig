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

    console.log('Transaction details for multisig extraction:', txDetails);

    // Look through events for the multisig account creation
    const txAny = txDetails as any;
    if (txAny.events && Array.isArray(txAny.events)) {
      for (const event of txAny.events) {
        console.log('Checking event:', {
          type: event.type,
          data: event.data,
        });

        // Look for account creation events
        if (event.type.includes('0x1::account::CreateAccount')) {
          // The created account address should be in the event data
          if (event.data?.created) {
            console.log('Found created account:', event.data.created);
            return event.data.created;
          }
        }

        // Look for multisig-specific events
        if (event.type.includes('multisig_account')) {
          if (event.data?.multisig_account) {
            console.log('Found multisig account:', event.data.multisig_account);
            return event.data.multisig_account;
          }
          if (event.data?.account) {
            console.log('Found account in multisig event:', event.data.account);
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
          console.log('Found multisig resource at address:', change.address);
          return change.address;
        }
      }
    }

    console.log('Could not find multisig address in transaction');
    return null;
  } catch (error) {
    console.error('Error extracting multisig address:', error);
    return null;
  }
}