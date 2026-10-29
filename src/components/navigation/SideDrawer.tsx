import { BottomSheetSurface, HohoButton } from '../design-system'
import { drawerConversationLabel, type DrawerHistoryRow } from './drawerHistory'
import { ChevronRight, ConversationBubble, Trash2, Info, MessageCircle, ConversationBubblePlus, Plus } from '../icons'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Avatar } from '../common'
import { useCurrentMember } from '../../hooks/useCurrentMember'
import { usePageScrollLock } from '../../hooks/usePageScrollLock'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { useAppStore } from '../../store/useAppStore'
import { getCurrentPath } from './navigationState'
import { makeFeedbackState } from '../../features/feedback/navigation'
import { accountService } from '../../services/account'
import { useDrawerHistory } from './useDrawerHistory'
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
const utilityLinks = [
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
  const historyScrollRef = useRef<HTMLElement>(null), historyEndRef = useRef<HTMLDivElement>(null)
  const member = useCurrentMember()
  const members = useAppStore(state => state.members), authToken = useAppStore(state => state.authToken)
  const authUser = useAppStore(state => state.authUser), accountProfile = useAppStore(state => state.accountProfile)
  const setAccountProfile = useAppStore(state => state.setAccountProfile)
  const accountId = authUser?.id ?? 'guest'
  const [deleting,setDeleting]=useState<DrawerHistoryRow|null>(null),[deleteBusy,setDeleteBusy]=useState(false),[deleteError,setDeleteError]=useState('')
  useEffect(()=>{setDeleting(null);setDeleteError('')},[open,accountId,member.id])
  const ownHistory = useDrawerHistory({ open, accountId, memberId: member.id, memberName: member.name, token: authToken, hasMembers: members.length > 0 })
  const userName = authUser?.guest ? '创建正式账户' : maskIdentityName(accountProfile?.nickname || authUser?.nickname) || '我的账户'
  const accountAvatar = authUser?.guest ? '我' : Array.from(maskIdentityName(accountProfile?.nickname || authUser?.nickname)).at(-1) || '我'
  const childName = maskIdentityName(member.name) || '记录对象'
  const childAvatarName = Array.from(maskIdentityName(member.name)).at(-1) || '孩'
  const accountOrigin = getCurrentPath(location.pathname, location.search, location.hash)
  usePageScrollLock(open)
  useDialogFocus(open && !deleting, drawerRef)
  useEffect(() => {
    if (!open || !ownHistory.hasMore || ownHistory.loadingMore || ownHistory.moreError || !historyEndRef.current || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) void ownHistory.loadMore() }, { root: historyScrollRef.current, rootMargin: '160px' })
    observer.observe(historyEndRef.current)
    return () => observer.disconnect()
  }, [open, ownHistory.hasMore, ownHistory.loadingMore, ownHistory.moreError, ownHistory.loadMore, ownHistory.rows.length])
  useEffect(() => {
    if (!open || deleting) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open, onClose, deleting])
  useEffect(() => {
    if (!open || !authToken || authUser?.guest || accountProfile) return
    void accountService.get(authToken).then(profile => {
      if (useAppStore.getState().authUser?.id === accountId) setAccountProfile(profile)
    }).catch(() => undefined)
  }, [accountId, accountProfile, authToken, authUser?.guest, open, setAccountProfile])
  const openHistory = (destination: string) => {
    onClose()
    if (onHistoryNavigate) onHistoryNavigate(destination)
    else navigate(destination,{state:{conversationOwner:{accountId,memberId:member.id}}})
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
  const confirmDelete=async()=>{if(!deleting||deleteBusy)return;setDeleteBusy(true);setDeleteError('');try{await ownHistory.remove(deleting);setDeleting(null)}catch(error){setDeleteError(error instanceof Error?error.message:'删除未完成，请重试')}finally{setDeleteBusy(false)}}
  if (!open) return null
  return <>
    <div className="hoho-drawer-layer" role="dialog" aria-modal="true" aria-label="侧边栏菜单">
      <button className="absolute inset-0 bg-text-primary/55" type="button" aria-label="关闭侧边栏" onClick={onClose} />
      <aside className={'hoho-drawer hoho-drawer--history' + (cleanChrome ? ' hoho-drawer--clean' : '')} ref={drawerRef} tabIndex={-1}>
        <section className="drawer-identities" aria-label="账户与记录对象">
          <div className="drawer-embrace">
          <button type="button" className="drawer-identity-row drawer-account" aria-label="我的账户" onClick={() => { onClose(); navigate('/account', { state: { accountFrom: accountOrigin } }) }}>
            <span className="drawer-account-avatar" role="img" aria-label={`${userName}的头像`}><span className="drawer-account-avatar__glyph" aria-hidden="true">{accountAvatar}</span></span>
            <span className="drawer-account-copy"><strong>{userName}</strong><span>记录者</span></span>
            <span className="drawer-account-action">我的<ChevronRight size={20} aria-hidden="true" /></span>
          </button>
          <button type="button" className="drawer-identity-row drawer-subject" aria-label={members.length ? '切换记录对象' : '添加记录对象'} onClick={() => { onClose(); onOpenChildSheet() }}>
            {members.length ? <Avatar name={childAvatarName} src={member.avatar} size="sm" /> : <span className="drawer-identity-avatar"><Plus size={20} aria-hidden="true" /></span>}
            <span className="drawer-subject-copy"><span className="drawer-subject-label">记录对象</span><span className="drawer-subject-detail"><strong>{members.length ? childName : '添加孩子'}</strong>{members.length > 0 && <span className="drawer-identity-meta">{recordSubjectRelationship(member)}{member.age ? ' · ' + compactIdentityAge(member.age) : ''}</span>}</span></span>
            <span className="drawer-subject-action">{members.length ? '切换' : '添加'}<ChevronRight size={16} aria-hidden="true" /></span>
          </button>
          <svg className="drawer-embrace-art" viewBox="0 0 320 200" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <path className="drawer-embrace-paw" d="M 1 164 L 13 164 C 35 164 43 174 43 185 C 43 195 35 199 25 199 C 10 199 1 189 1 174 Z M 319 164 L 307 164 C 285 164 277 174 277 185 C 277 195 285 199 295 199 C 310 199 319 189 319 174 Z" />
            <path className="drawer-embrace-outline" d="M 13 164 C 35 164 43 174 43 185 C 43 195 35 199 25 199 C 10 199 1 189 1 174 V 27 C 1 12 12 1 27 1 H 293 C 308 1 319 12 319 27 V 174 C 319 189 310 199 295 199 C 285 199 277 195 277 185 C 277 174 285 164 307 164" />
          </svg>
          </div>
        </section>
        <nav ref={historyScrollRef} className="drawer-conversations" aria-label="对话记录" onScroll={event => { const node = event.currentTarget; if (node.scrollHeight - node.scrollTop - node.clientHeight < 160 && !ownHistory.moreError) void ownHistory.loadMore() }}>
          <div className="drawer-conversations__heading"><h2>对话记录</h2><button type="button" disabled={conversationDisabled} onClick={startConversation} aria-label="新建对话"><ConversationBubblePlus size={20} aria-hidden="true" /><span>新建对话</span></button></div>
          {ownHistory.loading && <p role="status" className="drawer-history-notice">正在读取对话…</p>}
          {(ownHistory.error || ownHistory.localError) && <div className="drawer-history-notice" role="status"><span>部分对话暂未加载。</span><button type="button" onClick={ownHistory.retry}>重试</button></div>}
          {!ownHistory.loading && !ownHistory.error && !ownHistory.localError && !ownHistory.rows.length && <p className="drawer-history-notice">还没有对话记录</p>}
          {(['今天', '昨天', '更早'] as const).map(group => {
            const rows = ownHistory.rows.filter(row => historyGroup(row.updatedAt) === group)
            return rows.length ? <section className="drawer-history-group" key={group} aria-label={group}><h3>{group}</h3>{rows.map(row => <div className="drawer-history-row" key={row.id}><button className="drawer-history-open" type="button" onClick={() => openHistory(row.destination)} aria-label={row.title+(row.recorded?'，已记录'+(/待确认/u.test(row.title)?'，有待确认':''):'，待确认')}><ConversationBubble size={18} aria-hidden="true" /><span className="drawer-history-title">{drawerConversationLabel(row.title)}</span>{row.recorded&&<span className="drawer-history-recorded">已记录</span>}{(!row.recorded||/待确认/u.test(row.title))&&<span className="drawer-history-pending">{row.recorded?'有待确认':'待确认'}</span>}</button><button className="drawer-history-delete" type="button" disabled={conversationDisabled||deleteBusy} aria-label={'删除对话：'+row.title} onClick={()=>{setDeleteError('');setDeleting(row)}}><Trash2 size={18} aria-hidden="true" /></button></div>)}</section> : null
          })}
          {ownHistory.loadingMore && <p className="drawer-history-notice" role="status">正在读取更多对话…</p>}
          {ownHistory.moreError && <div className="drawer-history-notice" role="status"><span>更早对话暂未加载，已显示的对话仍保留。</span><button type="button" onClick={() => void ownHistory.loadMore()}>重试</button></div>}
          {ownHistory.hasMore && <div ref={historyEndRef} aria-hidden="true" className="drawer-history-end" />}
        </nav>
        <footer className="drawer-utilities" aria-label="反馈与关于">{utilityLinks.map(({ label, icon: Icon, to }) => <button key={to} type="button" onClick={() => openUtility(to)}><Icon size={22} strokeWidth={1.7} aria-hidden="true" /><span>{label}</span></button>)}</footer>
      </aside>
    </div>
    <BottomSheetSurface open={Boolean(deleting)} title="删除这次对话？" label="删除对话" onClose={()=>{if(!deleteBusy)setDeleting(null)}} footer={<div className="drawer-delete-actions"><HohoButton variant="secondary" disabled={deleteBusy} onClick={()=>setDeleting(null)}>取消</HohoButton><HohoButton variant="danger" loading={deleteBusy} onClick={()=>void confirmDelete()}>确认删除</HohoButton></div>}><p>删除对话不会影响已保存的记录。</p>{deleteError&&<p role="alert" className="drawer-delete-error">{deleteError}</p>}</BottomSheetSurface>
  </>
}
