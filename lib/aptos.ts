import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import { NETWORK_CONFIG, STORAGE_KEYS } from '@/constants/modules';

// Get current network from localStorage (client-side) or env (server-side)
const getNetworkFromStorage = (): 'mainnet' | 'testnet' => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEYS.NETWORK);
    if (saved === 'mainnet' || saved === 'testnet') {
      return saved;
    }
  }
  // Fall back to env variable or default
  const envNetwork = process.env.NEXT_PUBLIC_NETWORK_NAME?.toLowerCase();
  return envNetwork === 'testnet' ? 'testnet' : 'mainnet';
};

// Create Aptos client for a given network
const createAptosClient = (network: 'mainnet' | 'testnet') => {
  const config = new AptosConfig({
    network: Network.CUSTOM,
    fullnode: NETWORK_CONFIG[network].rpc,
  });
  return new Aptos(config);
};

// For backwards compatibility - lazy initialized client
let _aptosClient: Aptos | null = null;
let _currentNetwork: string | null = null;

export const aptosClient: Aptos = new Proxy({} as Aptos, {
  get: (_, prop) => {
    const network = getNetworkFromStorage();
    // Recreate client if network changed
    if (!_aptosClient || _currentNetwork !== network) {
      _aptosClient = createAptosClient(network);
      _currentNetwork = network;
    }
    const value = (_aptosClient as any)[prop];
    // Bind methods to maintain correct 'this' context
    if (typeof value === 'function') {
      return value.bind(_aptosClient);
    }
    return value;
  },
});

// Helper to get the current network config
export const getCurrentNetwork = () => {
  const network = getNetworkFromStorage();
  return NETWORK_CONFIG[network];
};

// Helper to expand short addresses to full format
export const expandAddress = (address: string): string => {
  if (!address) return '';

  // Remove 0x prefix if present and strip any non-hex characters
  let cleanAddress = address.toLowerCase()
    .replace('0x', '')
    .replace(/[^0-9a-f]/g, ''); // Strip non-hex characters

  // If no valid hex characters remain, return empty
  if (!cleanAddress) return '';

  // If it's already 64 chars, return it
  if (cleanAddress.length === 64 && /^[0-9a-f]{64}$/.test(cleanAddress)) {
    return `0x${cleanAddress}`;
  }

  // If it's a short format (less than 64 chars), pad with zeros
  if (/^[0-9a-f]+$/.test(cleanAddress) && cleanAddress.length < 64) {
    cleanAddress = cleanAddress.padStart(64, '0');
    return `0x${cleanAddress}`;
  }

  return ''; // Return empty if not valid after cleaning
};

// Helper to validate address format (accepts short format too)
export const isValidAddress = (address: string | any): boolean => {
  if (!address) return false;
  // Convert to string if needed
  const addressStr = typeof address === 'string' ? address : String(address);
  // Remove 0x prefix if present
  const cleanAddress = addressStr.toLowerCase().replace('0x', '');

  // Check if it's valid hex characters (any length up to 64)
  if (!/^[0-9a-f]+$/.test(cleanAddress)) return false;

  // Accept any hex string up to 64 characters
  return cleanAddress.length > 0 && cleanAddress.length <= 64;
};

// Helper to format address (shorten for display)
export const formatAddress = (address: string | any, length = 6): string => {
  if (!address) return '';
  // Convert to string if it's an object or other type
  const addressStr = typeof address === 'string' ? address : String(address);
  const cleanAddress = addressStr.startsWith?.('0x') ? addressStr : `0x${addressStr}`;
  if (cleanAddress.length <= length * 2 + 2) return cleanAddress;
  return `${cleanAddress.slice(0, length + 2)}...${cleanAddress.slice(-length)}`;
};

