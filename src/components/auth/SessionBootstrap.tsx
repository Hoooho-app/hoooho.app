import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { authService, AuthApiError } from '../../services/auth'
import { familyMemberService } from '../../services/familyMembers'
import { adaptFamilyMember } from '../../services/healthEventDetailAdapter'
import { useAppStore } from '../../store/useAppStore'
import { clearProfileSectionCache, getProfileSectionSnapshot, loadProfileSections } from '../../services/profileSectionStorage'
import { invalidateSessionRecoveryRequests, registerSessionRecoveryHandler } from '../../services/sessionRecoveryCoordinator'
import { useBrowserRecoveryState, type RecoveryStage } from '../../services/browserRecoveryState'
import { resolveCurrentChildId } from '../../features/family/currentChild'
import { appCache } from '../../services/appCacheStorage'
import type { AuthSession } from '../../types'
import { SessionRecoveryScreen, SessionRecoveryNotice } from './SessionRecoveryView'

class StaleSessionRecoveryError extends Error {}
let recoveryGeneration = 0
let attemptId = 0
let recoveryBlocked = false
let lastRecoveryAt = 0
let pending: { generation: number; promise: Promise<AuthSession | null> } | undefined
let profilePending: { generation: number; accountId: string; promise: Promise<void> } | undefined
const hydrationControllers = new Set<AbortController>()

function assertCurrentRecovery(generation: number) {
  if (generation !== recoveryGeneration || recoveryBlocked) throw new StaleSessionRecoveryError('Session recovery was superseded')
}

function invalidateBrowserSessionRecovery() {
  recoveryGeneration += 1
  attemptId += 1
  pending = undefined
  profilePending = undefined
  hydrationControllers.forEach((controller) => controller.abort())
  hydrationControllers.clear()
  invalidateSessionRecoveryRequests()
}

export function beginBrowserSessionLogout() {
  recoveryBlocked = true
  invalidateBrowserSessionRecovery()
}

export function endBrowserSessionLogout() {
  invalidateBrowserSessionRecovery()
  recoveryBlocked = false
}

function showFailure(stage: RecoveryStage, generation: number, attempt: number) {
  if (generation !== recoveryGeneration || attempt !== attemptId || recoveryBlocked) return
  if (!useAppStore.getState().authToken && !useBrowserRecoveryState.getState().reauthenticationRequired) useAppStore.getState().setAuthStatus('error')
  useBrowserRecoveryState.setState({ phase: 'failed', stage })
}

async function refreshBrowserSessionToken(generation: number) {
  assertCurrentRecovery(generation)
  const state = useAppStore.getState()
  // A temporary connectivity check must not replace an already authenticated route.
  if (!state.authToken) state.setAuthStatus('loading')
  const controller = new AbortController()
  hydrationControllers.add(controller)
  const timeout = window.setTimeout(() => controller.abort(), 10_000)
  try {
    let started = false
    const read = () => {
      started = true
      controller.signal.throwIfAborted()
      return authService.restore(useAppStore.getState().authToken ?? '', controller.signal)
    }
    let session: AuthSession | { unauthenticated: true }
    try {
      // This is an idempotent session GET. A suspended tab must not hold up
      // another tab's read; actual authentication stays authoritative on server.
      session = await (navigator.locks
        ? navigator.locks.request('hoooho-browser-session', { ifAvailable: true }, read)
        : read())
    } catch (error) {
      if (started || controller.signal.aborted) throw error
      // Some browser contexts disallow Web Locks. Never retry a started HTTP
      // request here, and never replay login, logout or record mutations.
      session = await read()
    }
    assertCurrentRecovery(generation)
    if ('unauthenticated' in session) {
      if (state.authUser && useBrowserRecoveryState.getState().contextAccountId === state.authUser.id) {
        useBrowserRecoveryState.setState({ reauthenticationRequired: true, phase: 'idle' })
        state.suspendAuthSession()
      } else state.clearAuthSession()
      return null
    }
    if (state.authUser?.id !== session.user.id) clearProfileSectionCache()
    useAppStore.getState().setAuthSession(session)
    useBrowserRecoveryState.setState({ reauthenticationRequired: false })
    return session
  } finally {
    window.clearTimeout(timeout)
    hydrationControllers.delete(controller)
  }
}

function hydrateProfiles(session: AuthSession, generation: number) {
  if (profilePending?.generation === generation && profilePending.accountId === session.user.id) return profilePending.promise
  const controller = new AbortController()
  hydrationControllers.add(controller)
  const timeout = window.setTimeout(() => controller.abort(), 10_000)
  const promise = loadProfileSections(session.token, useAppStore.getState().members, controller.signal)
    .then(() => {
      if (generation === recoveryGeneration && !getProfileSectionSnapshot().loaded) throw new Error('Profile initialization was superseded')
    })
    .finally(() => {
      window.clearTimeout(timeout)
      hydrationControllers.delete(controller)
      if (profilePending?.promise === promise) profilePending = undefined
    })
  profilePending = { generation, accountId: session.user.id, promise }
  return promise
}

export function restoreBrowserSession(_options: { transition?: boolean } = {}) {
  const generation = recoveryGeneration
  if (pending?.generation === generation) return pending.promise
  const attempt = ++attemptId
  const run = async () => {
    assertCurrentRecovery(generation)
    let stage: RecoveryStage = 'session'
    useBrowserRecoveryState.setState({ phase: 'recovering', stage })
    try {
      const previous = useAppStore.getState()
      let session: AuthSession | null
      try {
        session = await refreshBrowserSessionToken(generation)
      } catch (error) {
        assertCurrentRecovery(generation)
        // Only the idempotent session read is retried automatically, once.
        if (!(error instanceof AuthApiError) || !['AUTH_NETWORK_ERROR', 'AUTH_REQUEST_TIMEOUT'].includes(error.code)) throw error
        await new Promise((resolve) => window.setTimeout(resolve, 1000))
        assertCurrentRecovery(generation)
        session = await refreshBrowserSessionToken(generation)
      }
      if (!session) {
        // An acknowledged signed-out session is also a completed connectivity
        // check. The initial pageshow must not immediately repeat that read.
        lastRecoveryAt = Date.now()
        return null
      }
      stage = 'members'
      useBrowserRecoveryState.setState({ stage })
      const controller = new AbortController()
      hydrationControllers.add(controller)
      const timeout = window.setTimeout(() => controller.abort(), 10_000)
      try {
        const members = (await familyMemberService.list(session.token, controller.signal)).map(adaptFamilyMember)
        assertCurrentRecovery(generation)
        if (useAppStore.getState().authUser?.id !== session.user.id) throw new StaleSessionRecoveryError('Account changed during recovery')
        const preferred = appCache.isWritable() && previous.authUser?.id === session.user.id && previous.currentMemberId !== 'self' ? previous.currentMemberId : session.user.currentMemberId ?? ''
        const current = useAppStore.getState()
        if (JSON.stringify(current.members) !== JSON.stringify(members)) current.setMembers(members)
        const selected = resolveCurrentChildId(members, preferred)
        if (current.currentMemberId !== selected) current.setCurrentMemberId(selected, { sync: false })
      } finally {
        window.clearTimeout(timeout)
        hydrationControllers.delete(controller)
      }
      useBrowserRecoveryState.setState({ contextAccountId: session.user.id, reauthenticationRequired: false, stage: 'profile' })
      lastRecoveryAt = Date.now()
      // Archives hydrate separately. Unrelated pages can open as soon as identity
      // and member ownership are known; archive-dependent routes have a local gate.
      void hydrateProfiles(session, generation).then(() => {
        if (generation === recoveryGeneration && attempt === attemptId && !recoveryBlocked) useBrowserRecoveryState.setState({ phase: 'restored' })
      }, () => showFailure('profile', generation, attempt))
      return session
    } catch (error) {
      if (useAppStore.getState().authStatus === 'unauthenticated' && !useAppStore.getState().authUser) return null
      if (!(error instanceof StaleSessionRecoveryError)) showFailure(stage, generation, attempt)
      throw error
    }
  }
  const promise = run().finally(() => { if (pending?.promise === promise) pending = undefined })
  pending = { generation, promise }
  return promise
}

export async function recoverBrowserSession(options: { transition?: boolean } = {}) {
  try { await restoreBrowserSession(options); return true } catch { return false }
}

registerSessionRecoveryHandler(async () => {
  if (useBrowserRecoveryState.getState().reauthenticationRequired) return null
  const generation = recoveryGeneration
  const attempt = pending ? attemptId : ++attemptId
  const accountId = useAppStore.getState().authUser?.id
  if (!pending) useBrowserRecoveryState.setState({ phase: 'recovering', stage: 'session' })
  try {
    // Token recovery must not await member/archive hydration: either hydration
    // request may itself be the 401 caller waiting for this handler.
    const session = await refreshBrowserSessionToken(generation)
    if (session && accountId && accountId !== session.user.id) {
      invalidateBrowserSessionRecovery()
      void recoverBrowserSession()
      throw new StaleSessionRecoveryError('Account changed during token recovery')
    }
    if (session && !pending) useBrowserRecoveryState.setState({ phase: 'restored' })
    return session?.token ?? null
  } catch (error) {
    if (!(error instanceof StaleSessionRecoveryError)) showFailure('session', generation, attempt)
    throw error
  }
})

export function SessionBootstrap({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const load = useCallback(async () => {
    setFailed(false)
    try { await restoreBrowserSession(); setReady(true) } catch { setFailed(true) }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!ready) return
    const resume = () => {
      if (document.visibilityState === 'hidden' || recoveryBlocked || useBrowserRecoveryState.getState().reauthenticationRequired) return
      if (Date.now() - lastRecoveryAt > 30_000 || useBrowserRecoveryState.getState().phase === 'failed') void recoverBrowserSession({ transition: false })
    }
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('pageshow', resume)
    window.addEventListener('online', resume)
    return () => {
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('pageshow', resume)
      window.removeEventListener('online', resume)
    }
  }, [ready])
  if (!ready) return <SessionRecoveryScreen failed={failed} onRetry={() => void load()} />
  return <>{children}<SessionRecoveryNotice /></>
}
