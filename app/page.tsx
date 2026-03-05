'use client';

import { Header } from '@/components/layout/Header';
import { VaultDashboard } from '@/components/vault/VaultDashboard';

export default function Home() {
  return (
    <div className="min-h-screen bg-neutral-50">
      <Header />

      {/* Main Content */}
      <main>
        <VaultDashboard />
      </main>
    </div>
  );
}