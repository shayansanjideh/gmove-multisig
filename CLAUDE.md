# gMove Multisig

A multisig vault manager for the Movement blockchain, built with Next.js 16, React 19, and the Aptos SDK.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 3
- **State**: React Query (TanStack) + React Context + localStorage
- **Blockchain**: Aptos SDK v5 (`@aptos-labs/ts-sdk`), Aptos Wallet Adapter
- **UI**: Radix UI (tabs), Lucide React (icons), custom toast system
- **Deployment**: Vercel (connected to GitHub repo)

## Project Structure

```
app/                    # Next.js App Router pages
  page.tsx              # Home - vault dashboard
  create-multisig/      # Create new multisig
  vault/[address]/      # Vault detail page (tabs: signing room, proposals, owners, history)
  faq/                  # FAQ page

components/
  layout/Header.tsx     # Nav header with wallet connect + network selector
  providers/            # QueryProvider (React Query)
  ui/                   # tabs.tsx, toast.tsx
  vault/                # All vault-related components
  wallet/               # WalletProvider, WalletConnect, NetworkSelector

hooks/
  useMultisig.ts        # Core CRUD: fetch vaults, create multisig, approve/reject/execute
  useMultisig-fixed.ts  # Fixed proposal creation with proper BCS encoding

lib/
  aptos.ts              # Aptos client config (proxy-based, network-aware)
  getMultisigAddress.ts # Extract multisig address from tx events
  multisig-helpers.ts   # Payload generation utilities
  utils.ts              # General helpers (formatMoveAmount, cn, etc.)

contexts/
  NetworkContext.tsx     # Mainnet/testnet switching with localStorage persistence

constants/
  modules.ts            # Module addresses, function names, network configs, storage keys

types/
  multisig.ts           # Vault, Proposal, TokenBalance, transaction types
```

## Key Patterns

- **BCS Encoding**: Proposals use `generateTransactionPayload` from SDK, then extract inner EntryFunction bytes via `txnPayload.multiSig.transaction_payload!.bcsToBytes()`
- **1/1 Optimization**: Single-owner multisigs execute directly without creating a proposal
- **Network Detection**: Wallet reports "custom" for Movement chains; app checks URL for mainnet/testnet indicators
- **Entry Function Types**: Use `as \`\${string}::\${string}::\${string}\`` type assertion for function names passed to wallet adapter

## Build & Run

```bash
npm install
npm run dev          # Development
npm run build        # Production build
npm run start        # Production server (binds to 0.0.0.0)
```

## Environment Variables

```
NEXT_PUBLIC_MOVEMENT_RPC=https://testnet.movementnetwork.xyz/v1
NEXT_PUBLIC_NETWORK_NAME=testnet
```

## On-Chain Modules

All multisig operations use `0x1::multisig_account` (Movement's built-in module):
- `create_with_owners` - Create new multisig
- `create_transaction` - Create proposal
- `approve_transaction` / `reject_transaction` - Vote
- `execute_transaction` - Execute approved proposal
- `add_owner` / `remove_owner` - Manage owners
- `update_signatures_required` - Change threshold

## GitHub & Deployment

- **Repo**: https://github.com/shayansanjideh/gmove-multisig
- **Deployment**: Vercel
- **Branch**: main
