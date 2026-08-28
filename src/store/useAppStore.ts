import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthSession, AuthUser, Member, NotificationPreferences, UserProfile } from '../types'

interface AppState {
  authToken: string | null
  authUser: AuthUser | null
  currentMemberId: string
  members: Member[]
  profile: UserProfile | null
  notifications: NotificationPreferences
  setCurrentMemberId: (memberId: string) => void
  setAuthSession: (session: AuthSession) => void
  clearAuthSession: () => void
  addMember: (member: Member) => void
  setMembers: (members: Member[]) => void
  setProfile: (profile: UserProfile, memberId: string) => void
  clearProfile: () => void
  setNotification: (key: keyof Omit<NotificationPreferences, 'quietHours'>, value: boolean) => void
  setQuietHours: (quietHours: string) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      authToken: null,
      authUser: null,
      currentMemberId: 'self',
      members: [],
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
      setAuthSession: ({ token, user }) => set((state) => ({
        authToken: token,
        authUser: user,
        ...(state.authUser?.id && state.authUser.id !== user.id
          ? { profile: null, currentMemberId: 'self' }
          : {})
      })),
      clearAuthSession: () => set({ authToken: null, authUser: null, profile: null, currentMemberId: 'self' }),
      addMember: (member) => set((state) => ({
        members: state.members.some((item) => item.id === member.id)
          ? state.members.map((item) => item.id === member.id ? member : item)
          : [...state.members, member]
      })),
      setMembers: (members) => set({ members }),
      setProfile: (profile, memberId) => set((state) => ({
        profile,
        currentMemberId: memberId,
        members: state.members.some((member) => member.id === memberId || member.id === 'self')
          ? state.members.map((member) => member.id === memberId || member.id === 'self'
            ? { ...member, id: memberId, name: profile.nickname, birthday: profile.birthday, gender: profile.gender, avatar: profile.avatar }
            : member)
          : [{ id: memberId, name: profile.nickname, age: '', relation: '本人', birthday: profile.birthday, gender: profile.gender, avatar: profile.avatar }, ...state.members]
      })),
      clearProfile: () => set({ profile: null, currentMemberId: 'self' }),
      setNotification: (key, value) => set((state) => ({
        notifications: { ...state.notifications, [key]: value }
      })),
      setQuietHours: (quietHours) => set((state) => ({
        notifications: { ...state.notifications, quietHours }
      }))
    }),
    {
      name: 'hoooho-app',
      version: 2,
      migrate: (persisted) => ({ ...(persisted as AppState), members: [] }),
      partialize: ({ authToken, authUser, currentMemberId, members, profile, notifications }) => ({ authToken, authUser, currentMemberId, members, profile, notifications })
    }
  )
)
