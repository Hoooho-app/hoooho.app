import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { members as initialMembers } from '../mock/members'
import type { Member, NotificationPreferences, UserProfile } from '../types'

interface AppState {
  currentMemberId: string
  members: Member[]
  profile: UserProfile | null
  notifications: NotificationPreferences
  setCurrentMemberId: (memberId: string) => void
  addMember: (member: Member) => void
  setProfile: (profile: UserProfile) => void
  setNotification: (key: keyof Omit<NotificationPreferences, 'quietHours'>, value: boolean) => void
  setQuietHours: (quietHours: string) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentMemberId: 'self',
      members: initialMembers,
      profile: null,
      notifications: {
        healthEvent: true,
        medication: true,
        followUp: true,
        familyHealth: true,
        system: true,
        quietHours: '22:00 - 07:00'
      },
      setCurrentMemberId: (currentMemberId) => set({ currentMemberId }),
      addMember: (member) => set((state) => ({ members: [...state.members, member] })),
      setProfile: (profile) => set((state) => ({
        profile,
        currentMemberId: 'self',
        members: state.members.map((member) => member.id === 'self'
          ? { ...member, name: profile.nickname, birthday: profile.birthday, gender: profile.gender }
          : member)
      })),
      setNotification: (key, value) => set((state) => ({
        notifications: { ...state.notifications, [key]: value }
      })),
      setQuietHours: (quietHours) => set((state) => ({
        notifications: { ...state.notifications, quietHours }
      }))
    }),
    {
      name: 'hoooho-app',
      partialize: ({ currentMemberId, members, profile, notifications }) => ({ currentMemberId, members, profile, notifications })
    }
  )
)
