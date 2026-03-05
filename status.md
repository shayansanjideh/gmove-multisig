# gMove Multisig - Project Status

## Completed Features

- [x] **Create Multisig Vaults** - M-of-N configuration, auto-includes signer as owner
- [x] **Vault Dashboard** - List watched vaults, search/filter by ownership, add/remove vaults
- [x] **Vault Details** - Owners list, threshold, balance display, copyable addresses
- [x] **Transfer Proposals** - Multi-token support, address expansion, balance validation
- [x] **Proposal Voting** - Approve/reject with threshold tracking, execute when ready
- [x] **Owner Management** - Add/remove owners, update threshold via proposals
- [x] **Transaction History** - Past executed transactions view
- [x] **Wallet Integration** - Nightly wallet (primary), Ledger support, auto-connect
- [x] **Network Switching** - Mainnet/testnet toggle with localStorage persistence
- [x] **Smart Network Mismatch Detection** - Handles wallet reporting "custom" for Movement
- [x] **Toast Notifications** - Success/error toasts with explorer links and tx hash copying
- [x] **Auto-redirect to Signing Room** - After creating a proposal
- [x] **Approver/Rejector Display** - Shows who voted on each transaction
- [x] **BCS Payload Decoding** - Manual decoder for displaying transaction details
- [x] **1/1 Multisig Optimization** - Direct execution for single-owner vaults
- [x] **Vercel Deployment** - Live and working

## In Progress / Backlog

- [ ] **Developer Mode** - Allow advanced users to execute arbitrary Move functions via multisig
  - Custom module address, module name, function name inputs
  - Type arguments builder
  - Function arguments builder with type selection (address, u64, bool, vector, etc.)
  - BCS encoding for custom payloads
  - Preview of decoded payload before submission

## Known Issues

- `useMultisig-fixed.ts` exists alongside `useMultisig.ts` — the "fixed" version has correct BCS encoding for proposals. Consider consolidating.
- Wallet adapter types require `as \`\${string}::\${string}::\${string}\`` assertions for entry function names.
- `Vault` interface has optional fields (threshold, owners, balance) to support initial creation before on-chain data is fetched.

## Architecture Notes

- React Query polls every 10s for live updates
- Network changes trigger full page reload to reset all queries
- Vault watch list stored in localStorage (not on-chain)
- All on-chain operations go through `0x1::multisig_account` module
