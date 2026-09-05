import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { authService } from '../../services/auth'
import { familyMemberService } from '../../services/familyMembers'
import { adaptFamilyMember } from '../../services/healthEventDetailAdapter'
import { useAppStore } from '../../store/useAppStore'
import { HohoButton } from '../design-system/HohoButton'
import { loadProfileSections } from '../../services/profileSectionStorage'

let pending: Promise<void> | undefined
export function restoreBrowserSession() {
  if (pending) return pending
  const restore = async () => {
    const state = useAppStore.getState()
    state.setAuthStatus('loading')
    const session = await authService.restore(state.authToken ?? '')
    if ('unauthenticated' in session) { state.clearAuthSession(); return }
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15_000)
    let members
    try {
      members = (await familyMemberService.list(session.token, controller.signal)).map(adaptFamilyMember)
      await loadProfileSections(session.token, members, controller.signal)
    } finally { window.clearTimeout(timeout) }
    const preferred = state.authUser?.id === session.user.id && state.currentMemberId !== 'self' ? state.currentMemberId : session.user.currentMemberId ?? ''
    state.setAuthSession(session)
    state.setMembers(members)
    state.setCurrentMemberId(members.some((member) => member.id === preferred) ? preferred : members[0]?.id ?? 'self')
  }
  pending = (navigator.locks ? navigator.locks.request('hoooho-browser-session', restore) : restore()).finally(() => { pending = undefined })
  return pending
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
  if (ready) return children
  return <main className="app-shell px-4 py-16"><p role={error ? 'alert' : 'status'}>{error || '正在恢复使用状态…'}</p>{error && <HohoButton onClick={() => void load()}>重试</HohoButton>}</main>
}
