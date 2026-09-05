import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AccountProfile, AuthSession, AuthUser, Member, UserProfile } from '../types'
import { postAuthRequest } from '../services/auth'
import { clearProfileSectionCache } from '../services/profileSectionStorage'

const authTokenKey = 'hoooho-auth-token'
const opsAuthTokenKey = 'hoooho-ops-auth-token'

function readSessionToken(key: string) {
  try { return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(key) } catch { return null }
}

function writeSessionToken(key: string, value: string | null) {
  try {
    if (typeof sessionStorage === 'undefined') return
    if (value) sessionStorage.setItem(key, value)
    else sessionStorage.removeItem(key)
  } catch { /* The in-memory session remains usable when storage is unavailable. */ }
}

interface AppState {
  authStatus: 'unknown' | 'loading' | 'guest' | 'authenticated' | 'unauthenticated'
  setAuthStatus: (status: AppState['authStatus']) => void
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
      authStatus: 'unknown',
      setAuthStatus: (authStatus) => set({ authStatus }),
      authToken: readSessionToken(authTokenKey),
      authUser: null,
      accountProfile: null,
      opsAuthToken: readSessionToken(opsAuthTokenKey),
      opsAuthUser: null,
      opsAuthFailure: null,
      currentMemberId: 'self',
      members: [],
      profile: null,
      setCurrentMemberId: (currentMemberId) => {
        set({ currentMemberId })
        if (currentMemberId !== 'self') void postAuthRequest('/api/auth/current-member', { memberId: currentMemberId }).catch(() => { /* Retain the non-sensitive local selection as a retry hint. */ })
      },
      setAuthSession: ({ token, user }) => {
        writeSessionToken(authTokenKey, null)
        set((state) => ({
        authStatus: user.guest ? 'guest' : 'authenticated',
        authToken: token,
        authUser: user,
        ...(state.authUser?.id && state.authUser.id !== user.id
          ? { profile: null, accountProfile: null, currentMemberId: 'self', members: [] }
          : {})
        }))
      },
      setAccountProfile: (accountProfile) => set({ accountProfile }),
      clearAuthSession: () => { clearProfileSectionCache(); writeSessionToken(authTokenKey, null); set({ authStatus: 'unauthenticated', authToken: null, authUser: null, accountProfile: null, profile: null, members: [], currentMemberId: 'self' }) },
      setOpsAuthSession: ({ token, user }) => {
        writeSessionToken(opsAuthTokenKey, token)
        set({
        opsAuthToken: token,
        opsAuthUser: user.email ? { email: user.email.trim().toLowerCase() } : null,
        opsAuthFailure: null
        })
      },
      clearOpsAuthSession: (opsAuthFailure = null) => { writeSessionToken(opsAuthTokenKey, null); set({ opsAuthToken: null, opsAuthUser: null, opsAuthFailure }) },
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
      version: 5,
      migrate: (persisted) => {
        const { notifications: _removedNotifications, authToken: _removedAuthToken, opsAuthToken: _removedOpsAuthToken, ...state } = persisted as AppState & { notifications?: unknown }
        return { ...state, members: [] }
      },
      partialize: ({ authUser, accountProfile, opsAuthUser, currentMemberId, members, profile }) => ({ authUser, accountProfile, opsAuthUser, currentMemberId, members, profile })
    }
  )
)
