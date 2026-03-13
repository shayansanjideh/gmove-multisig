'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, Search, BookUser, Copy } from 'lucide-react';
import { useContacts } from '@/contexts/ContactsContext';
import { isValidAddress, formatAddress } from '@/lib/aptos';

export function ContactBook() {
  const { contacts, addContact, removeContact, updateContact } = useContacts();

  const [newAddress, setNewAddress] = useState('');
  const [newTag, setNewTag] = useState('');
  const [addError, setAddError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Inline editing state
  const [editingAddress, setEditingAddress] = useState<string | null>(null);
  const [editTag, setEditTag] = useState('');
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');

    if (!newAddress.trim() || !newTag.trim()) {
      setAddError('Both address and label are required.');
      return;
    }

    if (!isValidAddress(newAddress.trim())) {
      setAddError('Invalid address format.');
      return;
    }

    const success = addContact(newAddress.trim(), newTag.trim());
    if (!success) {
      setAddError('This address is already in your contacts.');
      return;
    }

    setNewAddress('');
    setNewTag('');
  };

  const startEdit = (address: string, currentTag: string) => {
    setEditingAddress(address);
    setEditTag(currentTag);
  };

  const saveEdit = (address: string) => {
    if (editTag.trim()) {
      updateContact(address, editTag.trim());
    }
    setEditingAddress(null);
    setEditTag('');
  };

  const cancelEdit = () => {
    setEditingAddress(null);
    setEditTag('');
  };

  const filteredContacts = contacts.filter(c => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return c.tag.toLowerCase().includes(q) || c.address.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-neutral-800">Contacts</h2>
        <p className="text-neutral-500 mt-1">
          Save addresses with labels. Tagged addresses show their label everywhere in the app.
        </p>
      </div>

      {/* Add Contact Form */}
      <div className="bg-white rounded-xl shadow-card border border-neutral-200 p-6">
        <h3 className="text-sm font-semibold text-neutral-700 mb-4">Add Contact</h3>
        <form onSubmit={handleAdd} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="0x..."
              value={newAddress}
              onChange={(e) => { setNewAddress(e.target.value); setAddError(''); }}
              className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-movement-300"
            />
            <input
              type="text"
              placeholder="Label (e.g., Alice)"
              value={newTag}
              onChange={(e) => { setNewTag(e.target.value); setAddError(''); }}
              className="sm:w-48 px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-movement-300"
            />
            <button
              type="submit"
              className="flex items-center justify-center gap-2 px-4 py-2 bg-movement-400 hover:bg-movement-500 text-neutral-900 rounded-lg text-sm font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>
          {addError && (
            <p className="text-sm text-red-600">{addError}</p>
          )}
        </form>
      </div>

      {/* Contact List */}
      <div className="bg-white rounded-xl shadow-card border border-neutral-200">
        {/* Search */}
        {contacts.length > 0 && (
          <div className="p-4 border-b border-neutral-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                type="text"
                placeholder="Search contacts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-movement-300"
              />
            </div>
          </div>
        )}

        {/* List */}
        {filteredContacts.length === 0 ? (
          <div className="p-8 text-center">
            <BookUser className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
            <p className="text-neutral-500 text-sm">
              {contacts.length === 0
                ? 'No contacts yet. Add one above to get started.'
                : 'No contacts match your search.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {filteredContacts.map((contact) => (
              <div key={contact.address} className="flex items-center justify-between p-4 hover:bg-neutral-50 transition-colors">
                {editingAddress === contact.address ? (
                  // Edit mode
                  <div className="flex items-center gap-2 flex-1 mr-2">
                    <input
                      type="text"
                      value={editTag}
                      onChange={(e) => setEditTag(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit(contact.address);
                        if (e.key === 'Escape') cancelEdit();
                      }}
                      className="px-2 py-1 border border-movement-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-movement-300"
                      autoFocus
                    />
                    <button
                      onClick={() => saveEdit(contact.address)}
                      className="p-1 hover:bg-emerald-100 rounded transition-colors"
                    >
                      <Check className="w-4 h-4 text-emerald-600" />
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="p-1 hover:bg-neutral-100 rounded transition-colors"
                    >
                      <X className="w-4 h-4 text-neutral-400" />
                    </button>
                  </div>
                ) : (
                  // Display mode
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-medium text-neutral-800 text-sm">{contact.tag}</span>
                    <span
                      className="inline-flex items-center gap-1 text-xs text-neutral-500 font-mono cursor-pointer group/addr"
                      title={contact.address}
                      onClick={async (e) => {
                        e.stopPropagation();
                        await navigator.clipboard.writeText(contact.address);
                        setCopiedAddress(contact.address);
                        setTimeout(() => setCopiedAddress(null), 2000);
                      }}
                    >
                      {formatAddress(contact.address, 8)}
                      {copiedAddress === contact.address ? (
                        <Check className="w-3 h-3 text-emerald-600" />
                      ) : (
                        <Copy className="w-3 h-3 text-neutral-400 opacity-0 group-hover/addr:opacity-100 transition-opacity" />
                      )}
                    </span>
                  </div>
                )}

                {editingAddress !== contact.address && (
                  <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                    <button
                      onClick={() => startEdit(contact.address, contact.tag)}
                      className="p-1.5 hover:bg-neutral-100 rounded transition-colors"
                      title="Edit label"
                    >
                      <Pencil className="w-3.5 h-3.5 text-neutral-400" />
                    </button>
                    <button
                      onClick={() => removeContact(contact.address)}
                      className="p-1.5 hover:bg-red-50 rounded transition-colors"
                      title="Remove contact"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Count */}
        {contacts.length > 0 && (
          <div className="px-4 py-3 border-t border-neutral-100">
            <p className="text-xs text-neutral-400">
              {contacts.length} contact{contacts.length !== 1 ? 's' : ''}
              {searchQuery && filteredContacts.length !== contacts.length && ` (${filteredContacts.length} shown)`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
