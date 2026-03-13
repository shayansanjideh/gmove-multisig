'use client';

import { Header } from '@/components/layout/Header';
import { ContactBook } from '@/components/contacts/ContactBook';

export default function ContactsPage() {
  return (
    <div className="min-h-screen bg-neutral-50">
      <Header />
      <div className="p-6">
        <div className="max-w-3xl mx-auto">
          <ContactBook />
        </div>
      </div>
    </div>
  );
}
