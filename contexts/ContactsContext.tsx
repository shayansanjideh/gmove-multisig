'use client';

import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { storage } from '@/lib/utils';
import { expandAddress } from '@/lib/aptos';
import { STORAGE_KEYS } from '@/constants/modules';
import type { Contact } from '@/types/contact';

interface ContactsContextType {
  contacts: Contact[];
  addContact: (address: string, tag: string) => boolean;
  removeContact: (address: string) => void;
  updateContact: (address: string, newTag: string) => void;
  getTagForAddress: (address: string) => string | null;
}

const ContactsContext = createContext<ContactsContextType | null>(null);

export function ContactsProvider({ children }: { children: ReactNode }) {
  const [contacts, setContacts] = useState<Contact[]>([]);

  useEffect(() => {
    const saved = storage.get<Contact[]>(STORAGE_KEYS.CONTACTS);
    if (saved && Array.isArray(saved)) {
      setContacts(saved);
    }
  }, []);

  const persist = (updated: Contact[]) => {
    setContacts(updated);
    storage.set(STORAGE_KEYS.CONTACTS, updated);
  };

  // O(1) lookup map: lowercase expanded address -> tag
  const tagMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of contacts) {
      map.set(c.address.toLowerCase(), c.tag);
    }
    return map;
  }, [contacts]);

  const addContact = (address: string, tag: string): boolean => {
    const expanded = expandAddress(address);
    if (!expanded) return false;
    if (tagMap.has(expanded.toLowerCase())) return false;
    persist([...contacts, { address: expanded, tag: tag.trim() }]);
    return true;
  };

  const removeContact = (address: string) => {
    const expanded = expandAddress(address)?.toLowerCase();
    if (!expanded) return;
    persist(contacts.filter(c => c.address.toLowerCase() !== expanded));
  };

  const updateContact = (address: string, newTag: string) => {
    const expanded = expandAddress(address)?.toLowerCase();
    if (!expanded) return;
    persist(contacts.map(c =>
      c.address.toLowerCase() === expanded ? { ...c, tag: newTag.trim() } : c
    ));
  };

  const getTagForAddress = (address: string): string | null => {
    if (!address) return null;
    const expanded = expandAddress(address);
    if (!expanded) return null;
    return tagMap.get(expanded.toLowerCase()) ?? null;
  };

  return (
    <ContactsContext.Provider value={{ contacts, addContact, removeContact, updateContact, getTagForAddress }}>
      {children}
    </ContactsContext.Provider>
  );
}

export function useContacts() {
  const context = useContext(ContactsContext);
  if (!context) {
    throw new Error('useContacts must be used within a ContactsProvider');
  }
  return context;
}
