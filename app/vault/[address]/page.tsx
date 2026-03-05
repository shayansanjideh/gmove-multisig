'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { VaultDetails } from '@/components/vault/VaultDetails';
import { TransactionList } from '@/components/vault/TransactionList';
import { PastTransactions } from '@/components/vault/PastTransactions';
import { ProposalForm } from '@/components/vault/ProposalForm';
import { ManageOwners } from '@/components/vault/ManageOwners';
import { DeveloperModeForm } from '@/components/vault/DeveloperModeForm';
import { useWatchedVaults, useAddVault } from '@/hooks/useMultisig';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Download, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';

export default function VaultPage() {
  const params = useParams();
  const address = params.address as string;
  const { data: vaults = [] } = useWatchedVaults();
  const addVault = useAddVault();
  const [activeTab, setActiveTab] = useState('signing');
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState('');

  const vault = vaults.find(v => v.address === address);

  const handleAddVaultFromUrl = async () => {
    setIsImporting(true);
    setImportError('');
    try {
      await addVault.mutateAsync({ address, name: 'Imported Vault' });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to import vault');
    } finally {
      setIsImporting(false);
    }
  };

  if (!vault) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <Header />
        <div className="p-6">
          <div className="max-w-7xl mx-auto">
            <Link href="/" className="inline-flex items-center gap-2 text-neutral-500 hover:text-neutral-800 mb-6">
              <ArrowLeft className="w-4 h-4" />
              Back to Vaults
            </Link>

            <div className="bg-white rounded-xl shadow-card border border-neutral-200 p-8 text-center">
              <h2 className="text-2xl font-bold text-neutral-800 tracking-heading mb-4">Vault Not Found</h2>
              <p className="text-neutral-500 mb-6">
                This vault is not in your watch list. You can add it or go back.
              </p>
              {importError && (
                <p className="text-sm text-red-600 mb-4">{importError}</p>
              )}
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={handleAddVaultFromUrl}
                  disabled={isImporting}
                  className="flex items-center gap-2 px-4 py-2 bg-movement-400 text-neutral-900 rounded-lg hover:bg-movement-500 font-semibold disabled:opacity-50"
                >
                  {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {isImporting ? 'Adding...' : 'Add This Vault'}
                </button>
                <Link href="/" className="px-4 py-2 border border-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-50 font-medium">
                  Go to Vault List
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <Header />
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <Link href="/" className="inline-flex items-center gap-2 text-neutral-500 hover:text-neutral-800 mb-6">
            <ArrowLeft className="w-4 h-4" />
            Back to Vaults
          </Link>

          <VaultDetails vault={vault} />

          <div className="mt-8">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="flex w-full">
                <TabsTrigger value="builder" className="flex-1">Simple Transfer</TabsTrigger>
                <TabsTrigger value="developer" className="flex-1">Developer Mode</TabsTrigger>
                <TabsTrigger value="owners" className="flex-1">Manage Owners</TabsTrigger>
                <div className="w-px bg-neutral-300 mx-1 my-2 shrink-0" />
                <TabsTrigger value="signing" className="flex-1">Signing Room</TabsTrigger>
                <TabsTrigger value="history" className="flex-1">Past Transactions</TabsTrigger>
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

              <TabsContent value="developer" className="mt-6">
                <DeveloperModeForm
                  vaultAddress={address}
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
