import { create } from 'zustand'

interface AppState {
  currentMemberId: string
  setCurrentMemberId: (memberId: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  currentMemberId: 'xiaoming',
  setCurrentMemberId: (currentMemberId) => set({ currentMemberId })
}))
