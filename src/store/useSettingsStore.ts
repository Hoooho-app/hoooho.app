import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  defaultAccountPreferences,
  defaultCarePreferences,
  getAccountPreferences,
  nextCareModePreferences,
  type AccountPreferences,
  type CarePreferences
} from '../features/settings/preferences'

interface SettingsState {
  accounts: Record<string, AccountPreferences>
  care: CarePreferences
  setAccountPreferences: (accountId: string, changes: Partial<AccountPreferences>) => void
  setCareEnabled: (enabled: boolean) => void
  setCarePreferences: (changes: Partial<Omit<CarePreferences, 'enabled' | 'hasConfigured'>>) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      accounts: {},
      care: defaultCarePreferences,
      setAccountPreferences: (accountId, changes) => set((state) => ({
        accounts: {
          ...state.accounts,
          [accountId]: {
            ...getAccountPreferences(state.accounts, accountId),
            ...changes
          }
        }
      })),
      setCareEnabled: (enabled) => set((state) => ({
        care: nextCareModePreferences(state.care, enabled)
      })),
      setCarePreferences: (changes) => set((state) => ({
        care: { ...state.care, ...changes, hasConfigured: true }
      }))
    }),
    {
      name: 'hoooho-settings',
      version: 1,
      partialize: ({ accounts, care }) => ({ accounts, care })
    }
  )
)
