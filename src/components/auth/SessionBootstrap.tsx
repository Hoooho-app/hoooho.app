import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { authService } from '../../services/auth'
import { familyMemberService } from '../../services/familyMembers'
import { adaptFamilyMember } from '../../services/healthEventDetailAdapter'
import { useAppStore } from '../../store/useAppStore'
import { HohoButton } from '../design-system/HohoButton'
import { loadProfileSections } from '../../services/profileSectionStorage'
import { registerSessionRecoveryHandler } from '../../services/sessionRecoveryCoordinator'
import { resolveCurrentChildId } from '../../features/family/currentChild'
import { recordGuestDiagnostic } from '../../services/guestDiagnostics'
import type { AuthSession } from '../../types'

let pending: Promise<AuthSession | null> | undefined
async function refreshBrowserSessionToken(transition = true) {
  const state = useAppStore.getState()
  if (transition) state.setAuthStatus('loading')
  const session = await authService.restore(state.authToken ?? '')
  if ('unauthenticated' in session) { state.clearAuthSession(); return null }
  state.setAuthSession(session)
  return session
}

registerSessionRecoveryHandler(async () => {
  try { return (await refreshBrowserSessionToken(false))?.token ?? null }
  catch (error) { useAppStore.getState().setAuthStatus('error'); throw error }
})

export function restoreBrowserSession(options: { transition?: boolean } = {}) {
  if (pending) return pending
  const restore = async () => {
    const state = useAppStore.getState()
    const previousUserId = state.authUser?.id
    const previousMemberId = state.currentMemberId
    const session = await refreshBrowserSessionToken(options.transition !== false)
    if (!session) {
      void recordGuestDiagnostic('route_decision', { routeDecision: 'unauthenticated' })
      return null
    }
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15_000)
    let members
    try {
      members = (await familyMemberService.list(session.token, controller.signal)).map(adaptFamilyMember)
      await loadProfileSections(session.token, members, controller.signal)
    } finally { window.clearTimeout(timeout) }
    const preferred = previousUserId === session.user.id && previousMemberId !== 'self' ? previousMemberId : session.user.currentMemberId ?? ''
    state.setMembers(members)
    state.setCurrentMemberId(resolveCurrentChildId(members, preferred))
    void recordGuestDiagnostic('route_decision', { routeDecision: session.user.guest ? 'guest' : 'authenticated', currentMemberPresent: Boolean(state.currentMemberId && state.currentMemberId !== 'self') })
    return session
  }
  pending = (navigator.locks ? navigator.locks.request('hoooho-browser-session', restore) : restore()).finally(() => { pending = undefined })
  return pending
}

export async function recoverBrowserSession(options: { transition?: boolean } = {}) {
  try { await restoreBrowserSession(options); return true }
  catch { useAppStore.getState().setAuthStatus('error'); return false }
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
