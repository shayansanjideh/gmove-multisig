'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { VaultDetails } from '@/components/vault/VaultDetails';
import { TransactionList } from '@/components/vault/TransactionList';
import { PastTransactions } from '@/components/vault/PastTransactions';
import { ProposalForm } from '@/components/vault/ProposalForm';
import { ManageOwners } from '@/components/vault/ManageOwners';
import { useWatchedVaults } from '@/hooks/useMultisig';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';

export default function VaultPage() {
  const params = useParams();
  const address = params.address as string;
  const { data: vaults = [] } = useWatchedVaults();
  const [activeTab, setActiveTab] = useState('signing');

  const vault = vaults.find(v => v.address === address);

  if (!vault) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <Header />
        <div className="p-6">
          <div className="max-w-7xl mx-auto">
            <Link href="/" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6">
              <ArrowLeft className="w-4 h-4" />
              Back to Vaults
            </Link>

            <div className="bg-white rounded-xl shadow-lg p-8 text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Vault Not Found</h2>
              <p className="text-gray-600 mb-6">
                This vault is not in your watch list. Add it to continue.
              </p>
              <Link href="/" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Go to Vault List
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Header />
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <Link href="/" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6">
            <ArrowLeft className="w-4 h-4" />
            Back to Vaults
          </Link>

          <VaultDetails vault={vault} />

          <div className="mt-8">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="signing">Signing Room</TabsTrigger>
                <TabsTrigger value="builder">Transaction Builder</TabsTrigger>
                <TabsTrigger value="owners">Manage Owners</TabsTrigger>
                <TabsTrigger value="history">Past Transactions</TabsTrigger>
              </TabsList>

              <TabsContent value="signing" className="mt-6">
                <TransactionList
                  vaultAddress={address}
                  onCreateProposal={() => setActiveTab('builder')}
                />
              </TabsContent>

              <TabsContent value="builder" className="mt-6">
                <ProposalForm
                  vaultAddress={address}
                  vaultBalance={vault.balance}
                  onSuccess={() => setActiveTab('signing')}
                />
              </TabsContent>

              <TabsContent value="owners" className="mt-6">
                <ManageOwners
                  vaultAddress={address}
                  currentOwners={vault.owners || []}
                  threshold={vault.threshold || 1}
                  onSuccess={() => setActiveTab('signing')}
                />
              </TabsContent>

              <TabsContent value="history" className="mt-6">
                <PastTransactions vaultAddress={address} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}