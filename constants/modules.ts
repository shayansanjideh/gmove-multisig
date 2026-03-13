// Movement/Aptos Core Module Constants
export const MODULES = {
  // Core modules
  MULTISIG: '0x1::multisig_account',
  COIN: '0x1::coin',
  APTOS_COIN: '0x1::aptos_coin',
  FUNGIBLE_ASSET: '0x1::fungible_asset',
  PRIMARY_STORE: '0x1::primary_fungible_store',

  // Type strings
  MOVE_COIN_TYPE: '0x1::aptos_coin::AptosCoin',
} as const;

// Multisig module functions
export const MULTISIG_FUNCTIONS = {
  CREATE_WITH_OWNERS: 'create_with_owners',
  CREATE_TRANSACTION: 'create_transaction',
  APPROVE: 'approve_transaction',
  REJECT: 'reject_transaction',
  EXECUTE: 'execute_transaction',
  REMOVE_TRANSACTION: 'remove_transaction',
  ADD_OWNER: 'add_owner',
  REMOVE_OWNER: 'remove_owner',
  UPDATE_THRESHOLD: 'update_signatures_required',
} as const;

// Network configurations
export const NETWORK_CONFIG = {
  mainnet: {
    name: 'Movement Mainnet',
    chainId: 1,
    rpc: process.env.NEXT_PUBLIC_MAINNET_RPC || 'https://mainnet.movementnetwork.xyz/v1',
    indexer: 'https://indexer.mainnet.movementnetwork.xyz/v1/graphql',
    explorerNetwork: 'mainnet',
  },
  testnet: {
    name: 'Movement Testnet',
    chainId: 4,
    rpc: process.env.NEXT_PUBLIC_TESTNET_RPC || 'https://testnet.movementnetwork.xyz/v1',
    indexer: 'https://indexer.testnet.movementnetwork.xyz/v1/graphql',
    explorerNetwork: 'testnet',
  },
} as const;

// Local storage keys
export const STORAGE_KEYS = {
  WATCHED_VAULTS: 'movement_multisig_vaults',
  SELECTED_VAULT: 'movement_selected_vault',
  NETWORK: 'movement_network',
  CONTACTS: 'movement_multisig_contacts',
} as const;