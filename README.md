# Movement Multisig

A native multisig interface for the Movement blockchain, built with Next.js and the Aptos TypeScript SDK. Supports Nightly wallet and Ledger hardware wallet integration.

## Features

- **Create Multisig Accounts**: Set up M-of-N multisig vaults with configurable thresholds
- **Transaction Proposals**: Create coin transfer proposals with support for any fungible asset
- **Signing Room**: Approve, reject, or execute pending transactions
- **Past Transactions**: View executed multisig transactions with full details
- **Multi-Token Support**: Transfer MOVE or any other coin held by the vault
- **Wallet Integration**: Nightly wallet with Ledger hardware wallet support

## Project Structure

```
├── app/
│   ├── layout.tsx              # Root layout with providers
│   ├── page.tsx                # Home page (vault dashboard)
│   ├── create-multisig/        # Multisig creation page
│   └── vault/[address]/        # Individual vault page
├── components/
│   ├── layout/Header.tsx       # Navigation header
│   ├── providers/              # React Query provider
│   ├── ui/                     # Reusable UI components (tabs, toast)
│   ├── vault/                  # Vault-related components
│   └── wallet/                 # Wallet connection components
├── hooks/
│   ├── useMultisig.ts          # Core multisig hooks (CRUD operations)
│   └── useMultisig-fixed.ts    # Fixed proposal creation hook
├── lib/
│   ├── aptos.ts                # Aptos client configuration
│   ├── getMultisigAddress.ts   # Extract multisig address from tx
│   ├── multisig-helpers.ts     # Payload generation helpers
│   └── utils.ts                # Utility functions
├── constants/modules.ts        # Module addresses and function names
└── types/multisig.ts           # TypeScript interfaces
```

## How It Works

### Multisig Account Structure

Movement uses the standard `0x1::multisig_account` module. A multisig account has:
- **Owners**: List of addresses that can propose and vote on transactions
- **Threshold**: Number of approvals required to execute a transaction
- **Transactions Table**: On-chain table storing pending transactions

### Transaction Lifecycle

1. **Create Proposal**: An owner submits a transaction payload to create a pending proposal
2. **Approval Phase**: Owners approve or reject the transaction
3. **Execution**: Once threshold approvals are met, any owner can execute the transaction

### BCS Encoding (Critical for Transaction Building)

When creating a multisig proposal, the transaction payload must be BCS-encoded correctly:

```typescript
// Generate the transaction payload using the SDK
const txnPayload = await generateTransactionPayload({
  multisigAddress,
  function: '0x1::coin::transfer',
  typeArguments: ['0x1::aptos_coin::AptosCoin'],
  functionArguments: [recipientAddress, amount],
  aptosConfig: aptosClient.config,
});

// Extract the BCS bytes from the inner EntryFunction
const bcsBytes = txnPayload.multiSig.transaction_payload!.bcsToBytes();

// Submit the create_transaction call
signAndSubmitTransaction({
  data: {
    function: '0x1::multisig_account::create_transaction',
    typeArguments: [],
    functionArguments: [multisigAddress, Array.from(bcsBytes)],
  },
});
```

Key insight: The BCS payload is the serialized `EntryFunction`, NOT the entire `TransactionPayloadMultiSig`.

### Decoding Stored Payloads

Pending transactions store the BCS-encoded payload in this format:
```
{ vec: ["0x<hex-encoded-bytes>"] }
```

To decode, parse the BCS structure:
1. Optional variant byte (skip if byte[32] < 3)
2. Module address (32 bytes)
3. Module name (ULEB128 length + string)
4. Function name (ULEB128 length + string)
5. Type arguments (vector)
6. Function arguments (vector of byte arrays)

### 1/1 Multisig Optimization

For single-owner multisigs with threshold 1, transactions are executed directly without creating a proposal (immediate execution path).

## Key Hooks

### `useMultisig.ts`

- `useMultisigAccount(address)` - Fetch multisig resource
- `useWatchedVaults()` - Get all watched vaults with balances
- `useMultisigTransactions(address)` - Fetch pending transactions
- `useAccountCoins(address)` - Fetch all coins held by an account
- `useApproveTransaction(address)` - Approve a pending transaction
- `useRejectTransaction(address)` - Reject a pending transaction
- `useExecuteTransaction(address)` - Execute a ready transaction
- `useCreateMultisig()` - Create a new multisig account

### `useMultisig-fixed.ts`

- `useCreateProposalFixed(address)` - Create proposal with correct BCS encoding

## Environment Variables

```env
NEXT_PUBLIC_MOVEMENT_RPC=https://testnet.movementnetwork.xyz/v1
NEXT_PUBLIC_NETWORK_NAME=testnet
```

## Running Locally

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## Module Addresses

```typescript
// Core modules
MULTISIG: '0x1::multisig_account'
COIN: '0x1::coin'
APTOS_COIN: '0x1::aptos_coin'
MOVE_COIN_TYPE: '0x1::aptos_coin::AptosCoin'

// Multisig functions
CREATE_WITH_OWNERS: 'create_with_owners'
CREATE_TRANSACTION: 'create_transaction'
APPROVE: 'approve_transaction'
REJECT: 'reject_transaction'
EXECUTE: 'execute_transaction'
```

## Wallet Support

- **Nightly Wallet**: Primary supported wallet with full Movement chain support
- **Ledger**: Hardware wallet support through Nightly's Ledger integration

## License

MIT
