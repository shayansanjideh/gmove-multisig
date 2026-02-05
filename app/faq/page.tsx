'use client';

import { Header } from '@/components/layout/Header';
import { FAQ } from '@/components/vault/FAQ';

export default function FAQPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Header />
      <div className="p-6">
        <div className="max-w-3xl mx-auto">
          <FAQ />
        </div>
      </div>
    </div>
  );
}
