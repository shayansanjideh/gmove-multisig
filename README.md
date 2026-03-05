# gMove Multisig

A native multisig vault manager for the Movement blockchain, built with Next.js, React, and the Aptos TypeScript SDK.

## Features

- **Create Multisig Vaults**: Set up M-of-N multisig accounts with configurable thresholds and owners
- **Vault Dashboard**: View all watched vaults with real-time balances and owner counts
- **Auto-Discovery**: Automatically finds multisig vaults you're an owner of by scanning your on-chain transaction history
- **Simple Transfers**: Send MOVE or any fungible asset held by the vault via a simple form
- **Developer Mode**: Submit arbitrary Move entry function calls through the multisig
- **Signing Room**: Approve, reject, or execute pending proposals with clear queue ordering
- **Rejection Execution**: Clear fully-rejected proposals from the queue
- **Broken Proposal Cleanup**: Detect and remove old proposals with invalid (non-BCS) payloads that block the queue
- **Manage Owners**: Add/remove owners and update the signing threshold
- **Past Transactions**: Full transaction history with BCS payload decoding (supports both V1 event handles and V2 module events)
- **Network Switching**: Toggle between Movement mainnet and testnet with persistent storage
- **Wallet Integration**: Nightly wallet with Ledger hardware wallet support

## Tech Stack

- **Framework**: Next.js (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS with custom Movement design tokens
- **State**: React Query (TanStack) + React Context + localStorage
- **Blockchain**: Aptos SDK v5 (`@aptos-labs/ts-sdk`), Aptos Wallet Adapter
- **UI**: Radix UI (tabs), Lucide React (icons), custom toast system
- **Deployment**: Vercel

## Project Structure

```
app/
  layout.tsx                    # Root layout with providers
  page.tsx                      # Home page (vault dashboard)
  create-multisig/              # Multisig creation page
  vault/[address]/              # Individual vault page
  faq/                          # FAQ page

components/
  layout/Header.tsx             # Navigation header with wallet + network selector
  providers/                    # React Query provider
  ui/                           # Reusable UI components (tabs, toast)
  vault/
    VaultDashboard.tsx          # Main vault list with auto-discovery
    VaultCard.tsx               # Individual vault card
    VaultDetails.tsx            # Vault detail page with tabbed interface
    CreateMultisig.tsx          # Create new multisig form
    ProposalForm.tsx            # Simple transfer proposal form
    DeveloperModeForm.tsx       # Arbitrary entry function call form
    TransactionList.tsx         # Signing room - pending proposals with actions
    PastTransactions.tsx        # Executed transaction history
    ManageOwners.tsx            # Add/remove owners, update threshold
    FAQ.tsx                     # Frequently asked questions
  wallet/
    WalletProvider.tsx          # Wallet adapter provider
    WalletConnect.tsx           # Connect/disconnect wallet button
    NetworkSelector.tsx         # Mainnet/testnet toggle

hooks/
  useMultisig.ts                # Core multisig hooks (fetch, approve, reject, execute, cleanup)
  useMultisig-fixed.ts          # Proposal creation with correct BCS encoding

lib/
  aptos.ts                      # Aptos client config (proxy-based, auto-switches network)
  getMultisigAddress.ts         # Extract multisig address from transaction events
  utils.ts                      # Helpers (formatMoveAmount, cn, storage)

contexts/
  NetworkContext.tsx             # Mainnet/testnet switching with localStorage persistence

constants/modules.ts            # Module addresses, function names, network configs
types/multisig.ts               # TypeScript interfaces (Vault, Proposal, MultisigAccountResource)
```

## How It Works

### Multisig Account Structure

Movement uses the standard `0x1::multisig_account` module. A multisig account has:
- **Owners**: List of addresses that can propose and vote on transactions
- **Threshold**: Number of approvals required to execute a transaction
- **Transaction Queue**: Sequential queue of proposals (must be executed or cleared in order)

### Transaction Lifecycle

1. **Create Proposal**: An owner submits a BCS-encoded transaction payload
2. **Approval Phase**: Owners approve or reject the proposal
3. **Execution**: Once threshold approvals are met and the proposal is next in queue, any owner can execute it
4. **Rejection Path**: If enough owners reject (rejections > owners - threshold), the rejection can be executed to clear the proposal from the queue

### Queue Ordering

The multisig module enforces strict sequential execution. `execute_transaction` always runs the oldest pending proposal (`last_executed_sequence_number + 1`). The Signing Room shows a "Next in queue" badge and only enables the Execute button on the next eligible proposal.

### BCS Encoding

Proposals require BCS-encoded entry function payloads:

```typescript
const txnPayload = await generateTransactionPayload({
  multisigAddress,
  function: '0x1::coin::transfer',
  typeArguments: ['0x1::aptos_coin::AptosCoin'],
  functionArguments: [recipientAddress, amount],
  aptosConfig: aptosClient.config,
});

// Extract the inner EntryFunction bytes (NOT the full TransactionPayloadMultiSig)
const bcsBytes = txnPayload.multiSig.transaction_payload!.bcsToBytes();

signAndSubmitTransaction({
  data: {
    function: '0x1::multisig_account::create_transaction',
    typeArguments: [],
    functionArguments: [multisigAddress, Array.from(bcsBytes)],
  },
});
```

### 1/1 Multisig Optimization

Single-owner multisigs with threshold 1 skip the proposal phase entirely - the transaction is created and immediately executed in one flow.

### Balance Fetching

MOVE tokens can exist as legacy Coin (`CoinStore<AptosCoin>`) or Fungible Asset (FA). The app checks both:
- Legacy: `getAccountCoinAmount()` via SDK
- FA: View function `0x1::primary_fungible_store::balance` with metadata `0xa`

### Past Transactions

Transaction history supports two on-chain event systems:
- **V1 Event Handles**: Used on mainnet. Fetches from event handle counters on the MultisigAccount resource.
- **V2 Module Events**: Used on testnet. Falls back to querying the indexer `account_transactions` table, then parses V2 events (`TransactionExecutionSucceeded`, `TransactionExecutionFailed`, `ExecuteRejectedTransaction`) from full transaction data.

### Auto-Discovery

Since Movement has no API to query "all multisigs where address X is owner", the app scans the connected wallet's transaction history:
- For `create_with_owners` transactions: extracts the multisig address from events/state changes
- For `approve/reject/execute` transactions: the first argument is the multisig address
- Discovered vaults are verified on-chain before auto-adding to the watched list

## Key Hooks

### `useMultisig.ts`

| Hook | Description |
|------|-------------|
| `useMultisigAccount(address)` | Fetch multisig on-chain resource |
| `useWatchedVaults()` | Get all watched vaults with balances |
| `useMultisigTransactions(address)` | Fetch pending transaction proposals |
| `useAccountCoins(address)` | Fetch all coins/tokens held by an account |
| `useApproveTransaction(address)` | Approve a pending proposal |
| `useRejectTransaction(address)` | Reject a pending proposal |
| `useExecuteTransaction(address)` | Execute an approved proposal |
| `useExecuteRejectedTransaction(address)` | Clear a fully-rejected proposal from the queue |
| `useCleanupProposal(address)` | Reject + clear a broken proposal (2 wallet approvals) |
| `useCreateMultisig()` | Create a new multisig account |
| `useAddVault()` | Watch a vault (validates on-chain first) |

### `useMultisig-fixed.ts`

| Hook | Description |
|------|-------------|
| `useCreateProposalFixed(address)` | Create proposal with correct BCS encoding, with 1/1 optimization |

## Environment Variables

```env
NEXT_PUBLIC_MOVEMENT_RPC=https://mainnet.movementnetwork.xyz/v1
NEXT_PUBLIC_MAINNET_RPC=https://mainnet.movementnetwork.xyz/v1
NEXT_PUBLIC_NETWORK_NAME=mainnet
```

## Running Locally

```bash
npm install
npm run dev          # Development server
npm run build        # Production build
npm run start        # Production server
```

## On-Chain Modules

All operations use `0x1::multisig_account`:

| Function | Description |
|----------|-------------|
| `create_with_owners` | Create new multisig with initial owners and threshold |
| `create_transaction` | Submit a proposal with BCS-encoded payload |
| `approve_transaction` | Cast an approval vote |
| `reject_transaction` | Cast a rejection vote |
| `execute_transaction` | Execute the next approved proposal |
| `execute_rejected_transaction` | Clear the next rejected proposal from queue |
| `add_owner` | Add a new owner (via multisig proposal) |
| `remove_owner` | Remove an owner (via multisig proposal) |
| `update_signatures_required` | Change the approval threshold (via multisig proposal) |

## License

MIT
