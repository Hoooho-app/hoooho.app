import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { authService } from '../../services/auth'
import { familyMemberService } from '../../services/familyMembers'
import { adaptFamilyMember } from '../../services/healthEventDetailAdapter'
import { useAppStore } from '../../store/useAppStore'
import { HohoButton } from '../design-system/HohoButton'
import { loadProfileSections } from '../../services/profileSectionStorage'
import { invalidateSessionRecoveryRequests, registerSessionRecoveryHandler } from '../../services/sessionRecoveryCoordinator'
import { resolveCurrentChildId } from '../../features/family/currentChild'
import type { AuthSession } from '../../types'

class StaleSessionRecoveryError extends Error {}
let recoveryGeneration = 0
let recoveryBlocked = false
let pending: { generation: number; promise: Promise<AuthSession | null> } | undefined
const hydrationControllers = new Set<AbortController>()

function assertCurrentRecovery(generation: number) {
  if (generation !== recoveryGeneration) throw new StaleSessionRecoveryError('Session recovery was superseded')
}

function invalidateBrowserSessionRecovery() {
  recoveryGeneration += 1
  pending = undefined
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

async function refreshBrowserSessionToken(transition = true, generation = recoveryGeneration) {
  if (recoveryBlocked) throw new StaleSessionRecoveryError('Session recovery is blocked during logout')
  if (transition) useAppStore.getState().setAuthStatus('loading')
  const controller = new AbortController()
  hydrationControllers.add(controller)
  try {
    let session
    try {
      session = await authService.restore(useAppStore.getState().authToken ?? '', controller.signal)
    } catch (error) {
      assertCurrentRecovery(generation)
      throw error
    }
    assertCurrentRecovery(generation)
    if ('unauthenticated' in session) { useAppStore.getState().clearAuthSession(); return null }
    useAppStore.getState().setAuthSession(session)
    return session
  } finally {
    hydrationControllers.delete(controller)
  }
}

registerSessionRecoveryHandler(async () => {
  const generation = recoveryGeneration
  try { return (await refreshBrowserSessionToken(false, generation))?.token ?? null }
  catch (error) {
    if (!(error instanceof StaleSessionRecoveryError)) useAppStore.getState().setAuthStatus('error')
    throw error
  }
})

export function restoreBrowserSession(options: { transition?: boolean } = {}) {
  const generation = recoveryGeneration
  if (pending?.generation === generation) return pending.promise
  const restore = async () => {
    const state = useAppStore.getState()
    const previousUserId = state.authUser?.id
    const previousMemberId = state.currentMemberId
    const session = await refreshBrowserSessionToken(options.transition !== false, generation)
    if (!session) {
      return null
    }
    const controller = new AbortController()
    hydrationControllers.add(controller)
    const timeout = window.setTimeout(() => controller.abort(), 15_000)
    let members
    try {
      members = (await familyMemberService.list(session.token, controller.signal)).map(adaptFamilyMember)
      await loadProfileSections(session.token, members, controller.signal)
      assertCurrentRecovery(generation)
    } catch (error) {
      assertCurrentRecovery(generation)
      throw error
    } finally {
      hydrationControllers.delete(controller)
      window.clearTimeout(timeout)
    }
    const preferred = previousUserId === session.user.id && previousMemberId !== 'self' ? previousMemberId : session.user.currentMemberId ?? ''
    useAppStore.getState().setMembers(members)
    useAppStore.getState().setCurrentMemberId(resolveCurrentChildId(members, preferred))
    return session
  }
  const promise = (navigator.locks ? navigator.locks.request('hoooho-browser-session', restore) : restore()).finally(() => {
    if (pending?.promise === promise) pending = undefined
  })
  pending = { generation, promise }
  return promise
}

export async function recoverBrowserSession(options: { transition?: boolean } = {}) {
  try { await restoreBrowserSession(options); return true }
  catch (error) {
    if (!(error instanceof StaleSessionRecoveryError)) useAppStore.getState().setAuthStatus('error')
    return false
  }
}

export function SessionBootstrap({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setReady(false)
    setError('')
    try { await restoreBrowserSession(); setReady(true) }
    catch { setError('暂时无法恢复使用状态，请检查网络后重试') }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!ready) return
    const resume = () => {
      if (document.visibilityState !== 'hidden') void recoverBrowserSession({ transition: false })
    }
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('pageshow', resume)
    return () => {
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('pageshow', resume)
    }
  }, [ready])
  if (ready) return children
  return <main className="app-shell px-4 py-16"><p role={error ? 'alert' : 'status'}>{error || '正在恢复使用状态…'}</p>{error && <HohoButton onClick={() => void load()}>重试</HohoButton>}</main>
}
