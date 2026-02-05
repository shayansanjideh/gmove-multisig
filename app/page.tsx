'use client';

import { Header } from '@/components/layout/Header';
import { VaultDashboard } from '@/components/vault/VaultDashboard';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Header />

      {/* Main Content */}
      <main>
        <VaultDashboard />
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 py-6 text-center text-sm text-gray-600">
          <p>Movement Native Multisig Interface</p>
          <p className="mt-1">
            Built with Nightly Wallet &amp; Ledger Support
          </p>
        </div>
      </footer>
    </div>
  );
}