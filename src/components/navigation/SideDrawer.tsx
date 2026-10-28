import { ChevronRight, CircleHelp, FileText, Info, MessageCircle, Pencil, Plus, UserRound } from '../icons'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Avatar } from '../common'
import { useCurrentMember } from '../../hooks/useCurrentMember'
import { usePageScrollLock } from '../../hooks/usePageScrollLock'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { useAppStore } from '../../store/useAppStore'
import { getCurrentPath } from './navigationState'
import { makeFeedbackState } from '../../features/feedback/navigation'
import { AccountSheet } from '../account/AccountSheet'
import { accountService } from '../../services/account'
import { apiRequest } from '../../services/apiClient'
import { retainedCaptureDrafts } from '../../features/ai-business/captureDraft'
import { compactIdentityAge, maskIdentityName, recordSubjectRelationship } from '../../utils/privateIdentity'
import './side-drawer-layout.css'

interface SideDrawerProps {
  open: boolean
  cleanChrome?: boolean
  onClose: () => void
  onOpenChildSheet: () => void
  onHistoryNavigate?: (destination: string) => void
  onNewConversation?: () => void
  conversationDisabled?: boolean
}
interface HistoryRow { id: string; title: string; updatedAt: string; destination: string }
interface ServerHistory { items: { id: string; title: string; updatedAt: string }[]; hasMore: boolean }
const utilityLinks = [
  { label: '帮助', icon: CircleHelp, to: '/help' },
  { label: '反馈', icon: MessageCircle, to: '/feedback' },
  { label: '关于', icon: Info, to: '/about' }
]
function historyGroup(at: string) {
  const day = new Date(at), today = new Date(), yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  const sameDay = (date: Date) => day.getFullYear() === date.getFullYear() && day.getMonth() === date.getMonth() && day.getDate() === date.getDate()
  return sameDay(today) ? '今天' : sameDay(yesterday) ? '昨天' : '更早'
}
export function SideDrawer({ onClose, onOpenChildSheet, open, cleanChrome = true, onHistoryNavigate, onNewConversation, conversationDisabled = false }: SideDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null), navigate = useNavigate(), location = useLocation()
  const member = useCurrentMember()
  const members = useAppStore(state => state.members), authToken = useAppStore(state => state.authToken)
  const authUser = useAppStore(state => state.authUser), accountProfile = useAppStore(state => state.accountProfile)
  const setAccountProfile = useAppStore(state => state.setAccountProfile)
  const accountId = authUser?.id ?? 'guest', identity = accountId + ':' + member.id
  const [accountOpen, setAccountOpen] = useState(false), [reload, setReload] = useState(0)
  const [history, setHistory] = useState<{ identity: string; rows: HistoryRow[]; loading: boolean; error: boolean }>({ identity: '', rows: [], loading: false, error: false })
  const ownHistory = history.identity === identity ? history : { identity, rows: [], loading: true, error: false }
  const userName = authUser?.guest ? '创建正式账户' : maskIdentityName(accountProfile?.nickname || authUser?.nickname) || '我的账户'
  const childName = maskIdentityName(member.name) || '记录对象'
  usePageScrollLock(open)
  useDialogFocus(open, drawerRef)
  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open, onClose])
  useEffect(() => {
    if (!open || !authToken || authUser?.guest || accountProfile) return
    void accountService.get(authToken).then(profile => {
      if (useAppStore.getState().authUser?.id === accountId) setAccountProfile(profile)
    }).catch(() => undefined)
  }, [accountId, accountProfile, authToken, authUser?.guest, open, setAccountProfile])
  useEffect(() => {
    if (!open) return
    if (!members.length || !authToken) { setHistory({ identity, rows: [], loading: false, error: false }); return }
    let active = true
    const controller = new AbortController()
    setHistory({ identity, rows: [], loading: true, error: false })
    const key = 'home-smart:' + accountId + ':' + member.id + ':new'
    void Promise.allSettled([
      apiRequest<ServerHistory>('/api/members/' + encodeURIComponent(member.id) + '/front-desk-record/history', { token: authToken, signal: controller.signal }),
      retainedCaptureDrafts(key)
    ]).then(([server, retained]) => {
      if (!active || controller.signal.aborted) return
      const saved = server.status === 'fulfilled' ? server.value.items : []
      const rows: HistoryRow[] = saved.map(item => ({ ...item, destination: '/conversation-history/' + encodeURIComponent(item.id) }))
      if (retained.status === 'fulfilled') for (const item of retained.value) {
        const draft = item.draft
        if (draft.frontContextId && saved.some(row => row.id === draft.frontContextId) && !draft.conversationInput?.trim() && !draft.pendingVoice) continue
        const title = draft.conversationInput || draft.text || draft.conversationTurns?.find(turn => turn.role !== 'assistant' && turn.text)?.text || (draft.files.length ? '照片与资料草稿' : '')
        if (title) rows.push({ id: item.key, title: title.replace(/\s+/g, ' ').slice(0, 80), updatedAt: new Date(draft.updatedAt ?? 0).toISOString(), destination: '/conversation-history?draft=' + encodeURIComponent(item.key) })
      }
      rows.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      setHistory({ identity, rows, loading: false, error: server.status === 'rejected' })
    })
    return () => { active = false; controller.abort() }
  }, [accountId, authToken, identity, member.id, members.length, open, reload])
  const openHistory = (destination: string) => {
    if (conversationDisabled) return
    onClose()
    if (onHistoryNavigate) onHistoryNavigate(destination)
    else navigate(destination)
  }
  const startConversation = () => {
    if (conversationDisabled) return
    onClose()
    if (onNewConversation) onNewConversation()
    else navigate('/nurse-station', { state: { frontDeskNewConversation: crypto.randomUUID() } })
  }
  const openUtility = (to: string) => {
    onClose()
    navigate(to, to === '/feedback' ? { state: makeFeedbackState(getCurrentPath(location.pathname, location.search, location.hash), '侧边栏', window.scrollY) } : undefined)
  }
  if (!open) return <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} />
  return <>
    <div className="hoho-drawer-layer" role="dialog" aria-modal="true" aria-label="侧边栏菜单">
      <button className="absolute inset-0 bg-text-primary/55" type="button" aria-label="关闭侧边栏" onClick={onClose} />
      <aside className={'hoho-drawer hoho-drawer--history' + (cleanChrome ? ' hoho-drawer--clean' : '')} ref={drawerRef} tabIndex={-1}>
        <section className="drawer-identities" aria-label="账户与记录对象">
          <button type="button" className="drawer-identity-row" aria-label="编辑我的信息" onClick={() => setAccountOpen(true)}>
            {accountProfile?.avatar ? <Avatar name={userName} src={accountProfile.avatar} size="sm" /> : <span className="drawer-identity-avatar"><UserRound size={20} aria-hidden="true" /></span>}
            <strong>{userName}</strong><Pencil className="drawer-identity-action" size={17} aria-hidden="true" />
          </button>
          <button type="button" className="drawer-identity-row" aria-label={members.length ? '切换记录对象' : '添加记录对象'} onClick={() => { onClose(); onOpenChildSheet() }}>
            {members.length ? <Avatar name={childName} src={member.avatar} size="sm" /> : <span className="drawer-identity-avatar"><Plus size={20} aria-hidden="true" /></span>}
            <strong>{members.length ? childName : '添加孩子'}</strong>
            {members.length > 0 && <span className="drawer-identity-meta">{recordSubjectRelationship(member)}{member.age ? ' · ' + compactIdentityAge(member.age) : ''}</span>}
            <ChevronRight className="drawer-identity-action" size={17} aria-hidden="true" />
          </button>
        </section>
        <nav className="drawer-conversations" aria-label="对话记录">
          <div className="drawer-conversations__heading"><h2>对话记录</h2><button type="button" disabled={conversationDisabled} onClick={startConversation} aria-label="新建对话"><Pencil size={17} aria-hidden="true" /><span>新建对话</span></button></div>
          {ownHistory.loading && <p role="status" className="drawer-history-notice">正在读取对话…</p>}
          {ownHistory.error && <div className="drawer-history-notice" role="status"><span>部分对话暂未加载。</span><button type="button" onClick={() => setReload(value => value + 1)}>重试</button></div>}
          {!ownHistory.loading && !ownHistory.error && !ownHistory.rows.length && <p className="drawer-history-notice">还没有对话记录</p>}
          {(['今天', '昨天', '更早'] as const).map(group => {
            const rows = ownHistory.rows.filter(row => historyGroup(row.updatedAt) === group)
            return rows.length ? <section className="drawer-history-group" key={group} aria-label={group}><h3>{group}</h3>{rows.map(row => <button type="button" key={row.id} disabled={conversationDisabled} onClick={() => openHistory(row.destination)}><FileText size={18} aria-hidden="true" /><span>{row.title}</span><ChevronRight size={16} aria-hidden="true" /></button>)}</section> : null
          })}
          {!ownHistory.loading && (ownHistory.rows.length > 0 || ownHistory.error) && <button type="button" className="drawer-history-all" disabled={conversationDisabled} onClick={() => openHistory('/conversation-history')}>查看全部对话<ChevronRight size={16} aria-hidden="true" /></button>}
        </nav>
        <footer className="drawer-utilities" aria-label="帮助与信息">{utilityLinks.map(({ label, icon: Icon, to }) => <button key={to} type="button" onClick={() => openUtility(to)}><Icon size={22} strokeWidth={1.7} aria-hidden="true" /><span>{label}</span></button>)}</footer>
      </aside>
    </div>
    <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} />
  </>
}
