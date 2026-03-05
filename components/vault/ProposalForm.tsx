'use client';

import { useState, useEffect } from 'react';
import { useCreateProposalFixed } from '@/hooks/useMultisig-fixed';
import { useAccountCoins, CoinData } from '@/hooks/useMultisig';
import { isValidAddress, expandAddress } from '@/lib/aptos';
import { Send, AlertCircle, Loader2, Info, Wallet, X, ChevronDown, Coins, BadgeCheck } from 'lucide-react';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { useToast } from '@/components/ui/toast';

interface ProposalFormProps {
  vaultAddress: string;
  vaultBalance?: number;
  onSuccess?: () => void;
}

export function ProposalForm({ vaultAddress, vaultBalance = 0, onSuccess }: ProposalFormProps) {
  const createProposal = useCreateProposalFixed(vaultAddress);
  const { data: coins = [], isLoading: coinsLoading } = useAccountCoins(vaultAddress);
  const { connected, connect, account, wallets } = useWallet();
  const { showSuccessToast, showErrorToast } = useToast();

  // Selected coin state
  const [selectedCoin, setSelectedCoin] = useState<CoinData | null>(null);
  const [showCoinDropdown, setShowCoinDropdown] = useState(false);

  // Set default coin when coins are loaded
  useEffect(() => {
    if (coins.length > 0 && !selectedCoin) {
      setSelectedCoin(coins[0]);
    }
  }, [coins, selectedCoin]);

  // Get balance for selected coin
  // vaultBalance is in MOVE units; selectedCoin.balance is in smallest units (octas)
  const selectedBalance = selectedCoin ? BigInt(selectedCoin.balance) : BigInt(Math.floor(vaultBalance * 1e8));
  const selectedDecimals = selectedCoin?.decimals || 8;
  const balanceDisplay = selectedCoin
    ? selectedCoin.balanceFormatted
    : vaultBalance.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  const coinSymbol = selectedCoin?.symbol || 'MOVE';

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [amountError, setAmountError] = useState('');
  const [expandedAddress, setExpandedAddress] = useState('');
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const handleWalletConnect = async (walletName: string) => {
    setIsConnecting(true);
    setError('');
    try {
      await connect(walletName);
      setShowWalletModal(false);
    } catch (err) {
      console.error('Failed to connect wallet:', err);
      setError('Failed to connect wallet. Please try again.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleRecipientChange = (value: string) => {
    setRecipient(value);
    setError('');

    if (value) {
      if (isValidAddress(value)) {
        const expanded = expandAddress(value);
        setExpandedAddress(expanded);
      } else {
        setExpandedAddress('');
        setError('Invalid address format');
      }
    } else {
      setExpandedAddress('');
    }
  };

  const handleAmountChange = (value: string) => {
    // Only allow valid decimal number characters
    if (value && !/^\d*\.?\d*$/.test(value)) return;

    setAmount(value);
    setAmountError('');

    if (value) {
      const parsed = parseFloat(value);
      const maxAmount = Number(selectedBalance) / (10 ** selectedDecimals);
      const minAmount = 1 / (10 ** Math.min(selectedDecimals, 4));

      if (isNaN(parsed)) {
        setAmountError('Please enter a valid number');
      } else if (parsed <= 0) {
        setAmountError('Amount must be greater than 0');
      } else if (parsed < minAmount) {
        setAmountError(`Minimum amount is ${minAmount} ${coinSymbol}`);
      } else if (parsed > maxAmount) {
        setAmountError(`Amount exceeds available balance (${balanceDisplay} ${coinSymbol})`);
      }
    }
  };

  const handleCoinSelect = (coin: CoinData) => {
    setSelectedCoin(coin);
    setShowCoinDropdown(false);
    setAmount('');
    setAmountError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!connected) {
      setShowWalletModal(true);
      return;
    }

    if (!isValidAddress(recipient)) {
      setError('Invalid recipient address');
      return;
    }

    const fullAddress = expandAddress(recipient);

    const amountInSmallestUnit = Math.floor(parseFloat(amount) * (10 ** selectedDecimals));
    if (isNaN(amountInSmallestUnit) || amountInSmallestUnit <= 0) {
      setError('Invalid amount');
      return;
    }

    if (BigInt(amountInSmallestUnit) > selectedBalance) {
      setError(`Amount exceeds available balance (${balanceDisplay} ${coinSymbol})`);
      return;
    }

    const coinType = selectedCoin?.coinType || '0x1::aptos_coin::AptosCoin';
    const isFA = selectedCoin?.isFungibleAsset;

    try {
      const payload = isFA
        ? {
            function: '0x1::primary_fungible_store::transfer' as `${string}::${string}::${string}`,
            typeArguments: ['0x1::fungible_asset::Metadata'],
            functionArguments: [selectedCoin!.faMetadata || '0xa', fullAddress, amountInSmallestUnit.toString()],
          }
        : {
            function: '0x1::coin::transfer' as `${string}::${string}::${string}`,
            typeArguments: [coinType],
            functionArguments: [fullAddress, amountInSmallestUnit.toString()],
          };

      const result = await createProposal.mutateAsync(payload);

      showSuccessToast(
        'Proposal Created Successfully!',
        result?.hash
      );

      setRecipient('');
      setAmount('');
      setDescription('');
      setExpandedAddress('');

      if (onSuccess) {
        setTimeout(() => {
          onSuccess();
        }, 500);
      }
    } catch (err) {
      if (err instanceof Error && err.message.toLowerCase().includes('wallet')) {
        setShowWalletModal(true);
      } else {
        const errorMessage = err instanceof Error ? err.message : 'Failed to create proposal';
        setError(errorMessage);
        showErrorToast('Failed to Create Proposal', errorMessage);
      }
    }
  };

  return (
    <>
      <div className="bg-white rounded-xl shadow-card border border-neutral-200 p-6">
        <h2 className="text-lg font-semibold text-neutral-800 mb-4">Create Transfer Proposal</h2>

        {!connected && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-amber-600" />
              <p className="text-sm text-amber-800">Please connect your wallet to create proposals</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Recipient Address
          </label>
          <input
            type="text"
            value={recipient}
            onChange={(e) => handleRecipientChange(e.target.value)}
            placeholder="Recipient address"
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-movement-300 font-mono text-sm"
            required
          />
          {expandedAddress && recipient !== expandedAddress && (
            <div className="mt-2 p-2 bg-movement-50 border border-movement-200 rounded-lg">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-movement-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs">
                  <p className="text-movement-800 font-medium">Expanded address:</p>
                  <p className="text-movement-700 break-all font-mono mt-1">{expandedAddress}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Coin Selector */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Token to Transfer
          </label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowCoinDropdown(!showCoinDropdown)}
              className="w-full flex items-center justify-between px-3 py-2 border border-neutral-200 rounded-lg bg-white hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-movement-300"
            >
              {coinsLoading ? (
                <span className="text-neutral-500">Loading coins...</span>
              ) : selectedCoin ? (
                <div className="flex items-center gap-2">
                  <Coins className="w-4 h-4 text-neutral-600" />
                  <span className="font-medium">{selectedCoin.symbol}</span>
                  {selectedCoin.verified && <BadgeCheck className="w-4 h-4 text-movement-500" />}
                  <span className="text-neutral-500 text-sm">({selectedCoin.balanceFormatted})</span>
                </div>
              ) : coins.length === 0 ? (
                <span className="text-neutral-500">No tokens available</span>
              ) : (
                <span className="text-neutral-500">Select a token</span>
              )}
              <ChevronDown className={`w-4 h-4 text-neutral-500 transition-transform ${showCoinDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showCoinDropdown && coins.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-neutral-200 rounded-lg shadow-dropdown max-h-60 overflow-auto">
                {coins.map((coin) => (
                  <button
                    key={coin.coinType}
                    type="button"
                    onClick={() => handleCoinSelect(coin)}
                    className={`w-full flex items-center justify-between px-3 py-2 hover:bg-neutral-50 ${
                      selectedCoin?.coinType === coin.coinType ? 'bg-movement-50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Coins className="w-4 h-4 text-neutral-600" />
                      <span className="font-medium">{coin.symbol}</span>
                      {coin.verified && <BadgeCheck className="w-4 h-4 text-movement-500" />}
                      {coin.name !== coin.symbol && (
                        <span className="text-neutral-400 text-sm">{coin.name}</span>
                      )}
                    </div>
                    <span className="text-neutral-500 text-sm">{coin.balanceFormatted}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {coins.length === 0 && !coinsLoading && (
            <p className="mt-1 text-xs text-amber-600">
              No tokens found in this vault. Deposit tokens to enable transfers.
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Amount ({coinSymbol})
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => handleAmountChange(e.target.value)}
            placeholder="0.0"
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-movement-300 ${
              amountError ? 'border-red-500' : 'border-neutral-200'
            }`}
          />
          {amountError ? (
            <p className="mt-1 text-xs text-red-600">{amountError}</p>
          ) : (
            <p className="mt-1 text-xs text-neutral-500">
              Available balance: {balanceDisplay} {coinSymbol}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Description (Optional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe this transaction..."
            rows={3}
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-movement-300"
          />
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={createProposal.isPending}
          className="w-full px-4 py-2 bg-movement-400 hover:bg-movement-500 text-neutral-900 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
        >
          {createProposal.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Creating Proposal...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Create Transfer Proposal
            </>
          )}
        </button>
      </form>
    </div>

    {/* Wallet Connection Modal */}
    {showWalletModal && (
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-dropdown">
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-lg font-semibold text-neutral-800">Connect Wallet</h3>
            <button
              onClick={() => setShowWalletModal(false)}
              className="text-neutral-400 hover:text-neutral-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-3">
            {wallets.length > 0 ? (
              wallets.map((wallet) => (
                <button
                  key={wallet.name}
                  onClick={() => handleWalletConnect(wallet.name)}
                  disabled={isConnecting}
                  className="w-full flex items-center gap-3 p-3 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors disabled:opacity-50"
                >
                  <img
                    src={wallet.icon}
                    alt={wallet.name}
                    className="w-8 h-8 rounded"
                  />
                  <span className="font-medium">{wallet.name}</span>
                  {isConnecting && (
                    <Loader2 className="w-4 h-4 animate-spin ml-auto" />
                  )}
                </button>
              ))
            ) : (
              <p className="text-neutral-500 text-center py-4">
                No wallets detected. Please install a Movement-compatible wallet like Nightly.
              </p>
            )}
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    )}
  </>
  );
}
