import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AccountProfile, AuthSession, AuthUser, Member, UserProfile } from '../types'

interface AppState {
  authToken: string | null
  authUser: AuthUser | null
  accountProfile: AccountProfile | null
  opsAuthToken: string | null
  opsAuthUser: { email: string } | null
  opsAuthFailure: 'expired' | 'forbidden' | 'not-configured' | null
  currentMemberId: string
  members: Member[]
  profile: UserProfile | null
  setCurrentMemberId: (memberId: string) => void
  setAuthSession: (session: AuthSession) => void
  setAccountProfile: (profile: AccountProfile | null) => void
  clearAuthSession: () => void
  setOpsAuthSession: (session: AuthSession) => void
  clearOpsAuthSession: (reason?: AppState['opsAuthFailure']) => void
  addMember: (member: Member) => void
  setMembers: (members: Member[]) => void
  setProfile: (profile: UserProfile, memberId: string) => void
  clearProfile: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      authToken: null,
      authUser: null,
      accountProfile: null,
      opsAuthToken: null,
      opsAuthUser: null,
      opsAuthFailure: null,
      currentMemberId: 'self',
      members: [],
      profile: null,
      setCurrentMemberId: (currentMemberId) => set({ currentMemberId }),
      setAuthSession: ({ token, user }) => set((state) => ({
        authToken: token,
        authUser: user,
        ...(state.authUser?.id && state.authUser.id !== user.id
          ? { profile: null, accountProfile: null, currentMemberId: 'self' }
          : {})
      })),
      setAccountProfile: (accountProfile) => set({ accountProfile }),
      clearAuthSession: () => set({ authToken: null, authUser: null, accountProfile: null, profile: null, currentMemberId: 'self' }),
      setOpsAuthSession: ({ token, user }) => set({
        opsAuthToken: token,
        opsAuthUser: user.email ? { email: user.email.trim().toLowerCase() } : null,
        opsAuthFailure: null
      }),
      clearOpsAuthSession: (opsAuthFailure = null) => set({ opsAuthToken: null, opsAuthUser: null, opsAuthFailure }),
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
      clearProfile: () => set({ profile: null, currentMemberId: 'self' })
    }),
    {
      name: 'hoooho-app',
      version: 4,
      migrate: (persisted) => {
        const { notifications: _removedNotifications, ...state } = persisted as AppState & { notifications?: unknown }
        return { ...state, members: [] }
      },
      partialize: ({ authToken, authUser, accountProfile, opsAuthToken, opsAuthUser, currentMemberId, members, profile }) => ({ authToken, authUser, accountProfile, opsAuthToken, opsAuthUser, currentMemberId, members, profile })
    }
  )
)
