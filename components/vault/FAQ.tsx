'use client';

import { AlertCircle, HelpCircle, Shield, Wallet, Key } from 'lucide-react';

export function FAQ() {
  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
        <HelpCircle className="w-5 h-5" />
        Frequently Asked Questions
      </h2>

      <div className="space-y-6">
        {/* Ledger Hardware Wallet Section */}
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Wallet className="w-5 h-5 text-amber-600" />
            </div>
            <h3 className="font-semibold text-gray-900">Ledger Hardware Wallet Setup</h3>
          </div>

          <div className="space-y-4 text-sm text-gray-600">
            <p>
              If you are using a Ledger hardware wallet through Nightly, please ensure:
            </p>

            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>
                <span className="font-semibold">Blind Signing</span> is enabled in your Ledger device settings
              </li>
              <li>
                Your Ledger is connected and unlocked
              </li>
              <li>
                The Aptos app is open on your device
              </li>
            </ul>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-amber-800">
                <span className="font-semibold">Important:</span> Without Blind Signing enabled,
                you won't be able to sign complex transactions like multisig operations.
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-blue-800">
                <span className="font-semibold">Tip:</span> In Developer Mode, we'll show you
                the transaction hash to verify on your Ledger screen.
              </p>
            </div>
          </div>
        </div>

        {/* How Multisig Works */}
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Shield className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="font-semibold text-gray-900">How Multisig Works</h3>
          </div>

          <div className="space-y-3 text-sm text-gray-600">
            <p>
              A multisig (multi-signature) vault requires multiple approvals before any transaction can be executed.
            </p>
            <ol className="list-decimal list-inside space-y-2 ml-2">
              <li>An owner creates a transaction proposal</li>
              <li>Other owners review and approve or reject the proposal</li>
              <li>Once the threshold is met, any owner can execute the transaction</li>
            </ol>
            <p>
              For example, a 2-of-3 multisig requires at least 2 out of 3 owners to approve before execution.
            </p>
          </div>
        </div>

        {/* Transaction Threshold */}
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Key className="w-5 h-5 text-purple-600" />
            </div>
            <h3 className="font-semibold text-gray-900">Approval Threshold</h3>
          </div>

          <div className="space-y-3 text-sm text-gray-600">
            <p>
              The approval threshold determines how many owners must approve a transaction before it can be executed.
            </p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li><span className="font-semibold">1/1:</span> Single-owner vault (immediate execution)</li>
              <li><span className="font-semibold">2/3:</span> Requires 2 of 3 owners to approve</li>
              <li><span className="font-semibold">3/5:</span> Requires 3 of 5 owners to approve</li>
            </ul>
            <p>
              Higher thresholds provide more security but require more coordination among owners.
            </p>
          </div>
        </div>

        {/* Gas Fees */}
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <AlertCircle className="w-5 h-5 text-green-600" />
            </div>
            <h3 className="font-semibold text-gray-900">Gas Fees</h3>
          </div>

          <div className="space-y-3 text-sm text-gray-600">
            <p>
              Each action on the blockchain requires gas fees paid in MOVE:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li><span className="font-semibold">Creating a vault:</span> Paid by the creator</li>
              <li><span className="font-semibold">Creating a proposal:</span> Paid by the proposer</li>
              <li><span className="font-semibold">Approving/Rejecting:</span> Paid by the signer</li>
              <li><span className="font-semibold">Executing:</span> Paid by whoever executes</li>
            </ul>
            <p>
              Make sure your wallet has enough MOVE to cover gas fees.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
