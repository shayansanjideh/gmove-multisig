# Indexer API Reference

Complete GraphQL API reference for Aptos Indexer with table schemas, query examples, and field documentation.

## Key Tables for This Project

### `account_transactions`
Maps accounts and transactions that interact with that account.

| Field | Type | Primary Key | Description |
|-------|------|-------------|-------------|
| account_address | String! | Yes | Aptos account address (66 chars, 0-padded) |
| transaction_version | bigint! | Yes | Blockchain version of the transaction |

Indexes: `account_transactions_pkey` (account_address, transaction_version), `at_version_index` (transaction_version DESC)

### `fungible_asset_activities`
Tracks FA activity including v1 token data.

| Field | Type | Description |
|-------|------|-------------|
| amount | bigint | Amount involved |
| asset_type | String | Move resource type, e.g. `0x1::aptos_coin::AptosCoin` |
| entry_function_id_str | String | Function called, e.g. `0x1::aptos_account::transfer` |
| event_index | bigint | Index of event within txn |
| is_transaction_success | Boolean | Whether txn succeeded |
| owner_address | String | Account that owns the asset |
| transaction_timestamp | String | When txn occurred |
| transaction_version | bigint | Blockchain version |
| type | String | Move entry function type, e.g. `0x1::coin::WithdrawEvent` |

Indexes: `faa_owner_type_index` (owner_address, type), `faa_at_index` (asset_type)

### `current_fungible_asset_balances`
Current asset balances per account.

| Field | Type | Description |
|-------|------|-------------|
| amount | bigint | Amount owned |
| asset_type | String | Move resource type |
| owner_address | String | Account address |
| storage_id | String | PK |
| is_primary | Boolean | Whether primary balance |
| last_transaction_version | bigint | Last txn version |

### `fungible_asset_metadata`
Metadata for each fungible asset (decimals, name, symbol, etc.).

| Field | Type | Description |
|-------|------|-------------|
| asset_type | String | PK - Move resource type |
| creator_address | String | Creator account |
| decimals | bigint | Decimal places |
| name | String | Asset name |
| symbol | String | Trading symbol |

### `user_transactions`
User transactions (not system).

| Field | Type | Description |
|-------|------|-------------|
| version | bigint | PK |
| sender | String | Sender address |
| sequence_number | bigint | Sender's sequence number |
| entry_function_contract_address | String | Contract address |
| entry_function_module_name | String | Module name |
| entry_function_function_name | String | Function name |

Indexes: `user_transactions_contract_info_index` (entry_function_contract_address, entry_function_module_name, entry_function_function_name)

## Deprecated Tables (DO NOT USE)
- `current_coin_balances` → use `current_fungible_asset_balances`
- `coin_activities` → use `fungible_asset_activities`
- `coin_balances` → use `current_fungible_asset_balances`
- `coin_infos` → use `fungible_asset_metadata`
- `events_view` → use No-Code Indexer
- `move_resources` → use `account_transactions`
