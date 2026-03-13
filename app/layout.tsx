import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { WalletProvider } from '@/components/wallet/WalletProvider';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { ToastProvider } from '@/components/ui/toast';
import { NetworkProvider } from '@/contexts/NetworkContext';
import { ContactsProvider } from '@/contexts/ContactsContext';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Movement Multisig',
  description: 'Native Movement Multisig Interface with Ledger Support',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        <QueryProvider>
          <NetworkProvider>
            <WalletProvider>
              <ContactsProvider>
                <ToastProvider>{children}</ToastProvider>
              </ContactsProvider>
            </WalletProvider>
          </NetworkProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
