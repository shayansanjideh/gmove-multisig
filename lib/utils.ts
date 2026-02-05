import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Tailwind CSS class merger
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format MOVE amount (8 decimals)
export function formatMoveAmount(amount: string | number, decimals = 8): string {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount;
  const divisor = Math.pow(10, decimals);
  return (value / divisor).toFixed(4);
}

// Parse MOVE amount to lamports
export function parseMoveAmount(amount: string | number, decimals = 8): string {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount;
  const multiplier = Math.pow(10, decimals);
  return Math.floor(value * multiplier).toString();
}

// Convert hex to bytes array
export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
  }
  return bytes;
}

// Convert bytes to hex
export function bytesToHex(bytes: Uint8Array): string {
  return '0x' + Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Decode transaction payload for human-readable display
export function decodePayload(payload: any): string {
  if (!payload) return 'Unknown transaction';

  try {
    if (payload.function) {
      const func = payload.function.split('::').pop();
      const module = payload.function.split('::')[1];

      // Handle common functions
      if (func === 'transfer' && module === 'coin') {
        const recipient = payload.arguments?.[0] || 'unknown';
        const amount = formatMoveAmount(payload.arguments?.[1] || 0);
        return `Transfer ${amount} MOVE to ${recipient.slice(0, 8)}...`;
      }

      if (func === 'transfer' && module === 'primary_fungible_store') {
        const metadata = payload.arguments?.[0] || 'unknown token';
        const recipient = payload.arguments?.[1] || 'unknown';
        const amount = payload.arguments?.[2] || 0;
        return `Transfer ${amount} tokens to ${recipient.slice(0, 8)}...`;
      }

      return `Call ${func} on ${module}`;
    }

    if (payload.type === 'entry_function_payload') {
      return `Execute ${payload.function || 'unknown function'}`;
    }

    return 'Custom transaction';
  } catch (error) {
    return 'Unknown transaction';
  }
}

// Local storage helpers with error handling
export const storage = {
  get: <T>(key: string): T | null => {
    if (typeof window === 'undefined') return null;
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch {
      return null;
    }
  },

  set: <T>(key: string, value: T): void => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error('Failed to save to localStorage:', error);
    }
  },

  remove: (key: string): void => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      console.error('Failed to remove from localStorage:', error);
    }
  },
};