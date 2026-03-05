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

// Format MOVE amount with compact display for large values (500M, 1.2B, etc.)
export function formatCompactMoveAmount(amount: string | number, decimals = 8): string {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount;
  const moveValue = value / Math.pow(10, decimals);
  return formatCompactBalance(moveValue);
}

// Format balance for display: 1.234B, 5.678M, or full number for < 1M
export function formatCompactBalance(value: number): string {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(3)}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(3)}M`;
  }
  return value.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
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