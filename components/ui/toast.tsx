'use client';

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { CheckCircle, XCircle, X, ExternalLink, Copy, Check } from 'lucide-react';
import { getCurrentNetwork } from '@/lib/aptos';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
  txHash?: string;
  duration?: number;
}

interface ToastContextType {
  showToast: (toast: Omit<Toast, 'id'>) => void;
  showSuccessToast: (title: string, txHash?: string) => void;
  showErrorToast: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const EXPLORER_URL = 'https://explorer.movementnetwork.xyz/txn';

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (toast.duration !== 0) {
      const timer = setTimeout(onClose, toast.duration || 8000);
      return () => clearTimeout(timer);
    }
  }, [toast.duration, onClose]);

  const copyHash = async () => {
    if (toast.txHash) {
      await navigator.clipboard.writeText(toast.txHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const truncateHash = (hash: string) => {
    if (hash.length <= 20) return hash;
    return `${hash.slice(0, 10)}...${hash.slice(-10)}`;
  };

  return (
    <div
      className={`
        relative flex flex-col gap-2 p-4 rounded-xl shadow-dropdown border
        animate-slide-in-right
        ${toast.type === 'success' ? 'bg-emerald-50 border-emerald-200' : ''}
        ${toast.type === 'error' ? 'bg-red-50 border-red-200' : ''}
        ${toast.type === 'info' ? 'bg-movement-50 border-movement-200' : ''}
      `}
    >
      <div className="flex items-start gap-3">
        {toast.type === 'success' && <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />}
        {toast.type === 'error' && <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />}

        <div className="flex-1 min-w-0">
          <p className={`font-medium ${
            toast.type === 'success' ? 'text-emerald-800' :
            toast.type === 'error' ? 'text-red-800' : 'text-movement-800'
          }`}>
            {toast.title}
          </p>

          {toast.message && (
            <p className={`text-sm mt-1 ${
              toast.type === 'success' ? 'text-emerald-700' :
              toast.type === 'error' ? 'text-red-700' : 'text-movement-700'
            }`}>
              {toast.message}
            </p>
          )}

          {toast.txHash && (
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-500">Transaction Hash:</span>
                <code className="text-xs font-mono bg-white/50 px-2 py-0.5 rounded">
                  {truncateHash(toast.txHash)}
                </code>
                <button
                  onClick={copyHash}
                  className="p-1 hover:bg-white/50 rounded transition-colors"
                  title="Copy hash"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-neutral-500" />
                  )}
                </button>
              </div>

              <a
                href={`${EXPLORER_URL}/${toast.txHash}?network=${getCurrentNetwork().explorerNetwork}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-movement-700 hover:text-movement-800 hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                View on Explorer
              </a>
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="p-1 hover:bg-black/5 rounded transition-colors"
        >
          <X className="w-4 h-4 text-neutral-500" />
        </button>
      </div>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { ...toast, id }]);
  };

  const showSuccessToast = (title: string, txHash?: string) => {
    showToast({
      type: 'success',
      title,
      txHash,
      duration: txHash ? 12000 : 5000,
    });
  };

  const showErrorToast = (title: string, message?: string) => {
    showToast({
      type: 'error',
      title,
      message,
      duration: 8000,
    });
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast, showSuccessToast, showErrorToast }}>
      {children}

      {/* Toast container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-md">
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
