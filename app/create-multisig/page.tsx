'use client';

import { CreateMultisig } from '@/components/vault/CreateMultisig';
import { Header } from '@/components/layout/Header';

export default function CreateMultisigPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Header />
      <div className="p-6">
        <div className="max-w-2xl mx-auto">
          <CreateMultisig />
        </div>
      </div>
    </div>
  );
}