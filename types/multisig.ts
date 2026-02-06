// The on-chain resource shape for 0x1::multisig_account::MultisigAccount
export interface MultisigAccountResource {
  owners: string[]; // addresses
  num_signatures_required: string; // u64 represented as string
  transactions: {
    handle: string; // Table handle
  };
  next_sequence_number: string; // u64 - next transaction ID to be created
  last_executed_sequence_number?: string; // u64 - last executed transaction ID
  signer_cap?: any;
}

// Internal app representation of a vault
export interface Vault {
  address: string;
  name: string;
  threshold?: number;
  owners?: string[];
  balance?: number; // In MOVE (lamports)
  tokens?: TokenBalance[];
}

export interface TokenBalance {
  metadata: string;
  name: string;
  symbol: string;
  decimals: number;
  balance: number;
}

// Transaction Proposal State
export interface Proposal {
  id: number;
  multisig_account: string;
  payload: any; // Decoded payload
  payload_hash?: string;
  approvers: string[];
  rejectors: string[];
  creator: string;
  created_at?: string;
  status: 'Pending' | 'Executed' | 'Rejected';
  execution_hash?: string;
  human_readable?: string; // Human-readable description
}

// Transaction builder types
export interface StandardTransaction {
  type: 'transfer';
  recipient: string;
  amount: string;
  token: 'MOVE' | string; // MOVE or FA metadata address
}

export interface DeveloperTransaction {
  type: 'custom';
  target: string;
  module: string;
  function: string;
  typeArgs: string[];
  args: any[];
}

export type TransactionPayload = StandardTransaction | DeveloperTransaction;