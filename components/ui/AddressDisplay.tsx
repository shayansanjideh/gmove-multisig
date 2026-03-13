'use client';

import { useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';
import { useContacts } from '@/contexts/ContactsContext';
import { formatAddress, expandAddress } from '@/lib/aptos';
import { cn } from '@/lib/utils';

interface AddressDisplayProps {
  address: string;
  className?: string;
  truncateLength?: number;
  showCopyIcon?: boolean;
  copyOnClick?: boolean;
}

export function AddressDisplay({
  address,
  className,
  truncateLength = 6,
  showCopyIcon = false,
  copyOnClick = true,
}: AddressDisplayProps) {
  const { getTagForAddress } = useContacts();
  const [copied, setCopied] = useState(false);

  const fullAddress = expandAddress(address) || address;
  const tag = getTagForAddress(address);

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    if (!copyOnClick) return;
    e.stopPropagation();
    e.preventDefault();
    await navigator.clipboard.writeText(fullAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [fullAddress, copyOnClick]);

  const displayText = tag || formatAddress(fullAddress, truncateLength);

  return (
    <span
      className={cn(
        'relative inline-flex items-center gap-1 group',
        copyOnClick && 'cursor-pointer',
        className,
      )}
      onClick={handleCopy}
      title={fullAddress}
    >
      <span className={cn(
        tag
          ? 'bg-movement-100 text-movement-800 px-1.5 py-0.5 rounded text-xs font-medium'
          : 'font-mono',
      )}>
        {displayText}
      </span>

      {showCopyIcon && (
        <span className="inline-flex">
          {copied ? (
            <Check className="w-3 h-3 text-emerald-600" />
          ) : (
            <Copy className="w-3 h-3 text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </span>
      )}

      {copied && !showCopyIcon && (
        <span className="text-xs text-emerald-600 ml-1">Copied!</span>
      )}

      {tag && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-neutral-800 text-white text-xs font-mono rounded shadow-dropdown whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
          {formatAddress(fullAddress, 10)}
        </span>
      )}
    </span>
  );
}
