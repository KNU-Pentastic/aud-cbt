import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type SSOContact = {
  id: string;
  name: string;
  relationship: string;
  phone: string;
};

type SettingsState = {
  ssoContacts: SSOContact[];
  addContact: (contact: Omit<SSOContact, 'id'>) => void;
  updateContact: (id: string, contact: Omit<SSOContact, 'id'>) => void;
  removeContact: (id: string) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ssoContacts: [],
      addContact: (contact) =>
        set((state) => ({
          ssoContacts: [...state.ssoContacts, { ...contact, id: Date.now().toString() }],
        })),
      updateContact: (id, contact) =>
        set((state) => ({
          ssoContacts: state.ssoContacts.map((c) => (c.id === id ? { ...contact, id } : c)),
        })),
      removeContact: (id) =>
        set((state) => ({
          ssoContacts: state.ssoContacts.filter((c) => c.id !== id),
        })),
    }),
    {
      name: '@cbt_settings',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
