import {UpdateDot,useRecordUpdates} from '../../features/record-updates/RecordUpdates'
import { ChevronDown, Menu } from '../icons'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { SideDrawer } from './SideDrawer'
import { CurrentChildSheet } from './CurrentChildSheet'
import { consumeMemberProfileRestore, getCurrentPath, readMemberProfileRestore, type MemberProfileEditOrigin } from './navigationState'
import { useAppStore } from '../../store/useAppStore'
import { useCurrentMember } from '../../hooks/useCurrentMember'
import { Avatar } from '../common/Avatar'
import { compactIdentityAge, maskIdentityName } from '../../utils/privateIdentity'
import { MainBottomNavigation } from './MainBottomNavigation'

export function MainAppHeader({ title, compact = false, action, childSelectionRequest = 0, childIdentity = false, conversation = false, onHistoryNavigate, onNewConversation, conversationDisabled = false }: { title: string; compact?: boolean; action?: ReactNode; childSelectionRequest?: number; childIdentity?: boolean; conversation?: boolean; onHistoryNavigate?: (destination: string) => void; onNewConversation?: () => void; conversationDisabled?: boolean }) {
  const updates=useRecordUpdates()
  const location = useLocation()
  const navigate = useNavigate()
  const accountNotice = (location.state as { accountNotice?: string } | null)?.accountNotice ?? ''
  const restore = readMemberProfileRestore(location.state)
  const currentMemberId = useAppStore((state) => state.currentMemberId)
  const setCurrentMemberId = useAppStore((state) => state.setCurrentMemberId)
  const [open, setOpen] = useState(false)
  const [childSheetOpen, setChildSheetOpen] = useState(() => Boolean(restore))
  const [notice, setNotice] = useState(accountNotice)
  const member = useCurrentMember()
  const hasMembers = useAppStore(state => state.members.length > 0)
  const privateName = maskIdentityName(member.name) || '记录对象'
  const subjectMeta = [member.gender === 'female' ? '女' : member.gender === 'male' ? '男' : '', member.age ? compactIdentityAge(member.age) : ''].filter(Boolean).join(' · ')

  useEffect(() => {
    if (childSelectionRequest > 0) { setOpen(false); setChildSheetOpen(true) }
  }, [childSelectionRequest])

  useEffect(() => {
    if (!restore) return
    setOpen(false)
    setChildSheetOpen(true)
    if (currentMemberId !== restore.memberId) setCurrentMemberId(restore.memberId)
    const frame = window.requestAnimationFrame(() => window.scrollTo({ top: restore.scrollY }))
    navigate(getCurrentPath(location.pathname, location.search, location.hash), { replace: true, state: consumeMemberProfileRestore(location.state) })
    return () => window.cancelAnimationFrame(frame)
  }, [currentMemberId, location.hash, location.pathname, location.search, location.state, navigate, restore, setCurrentMemberId])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => {
      setNotice('')
      navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null })
    }, 2200)
    return () => window.clearTimeout(timer)
  }, [location.hash, location.pathname, location.search, navigate, notice])

  const editMember = (memberId: string) => {
    const returnState = location.state && typeof location.state === 'object'
      ? consumeMemberProfileRestore(location.state) as Record<string, unknown> | null
      : null
    const origin: MemberProfileEditOrigin = {
      source: 'member-profile-sheet',
      memberId,
      returnTo: getCurrentPath(location.pathname, location.search, location.hash),
      returnState,
      reopenMemberProfileSheet: true,
      scrollY: window.scrollY
    }
    setOpen(false)
    setChildSheetOpen(false)
    if (currentMemberId !== memberId) setCurrentMemberId(memberId)
    navigate(`/family/${encodeURIComponent(memberId)}/edit`, { state: { memberProfileEditOrigin: origin } })
  }

  return (
    <>
      <header className={`hoho-page-header hoho-main-header ${conversation ? 'hoho-main-header--conversation' : ''} ${childIdentity ? 'hoho-main-header--subject' : ''} relative flex shrink-0 items-center justify-center px-16 pt-[env(safe-area-inset-top)] ${compact ? 'sticky top-0 z-20 min-h-14' : 'min-h-16'}`}>
        <button className="absolute left-3 grid h-11 w-11 place-items-center rounded-full hover:bg-primary-soft" type="button" aria-label="打开菜单" onClick={() => setOpen(true)}>
          <Menu size={24} strokeWidth={1.8} /><span className="absolute right-1 top-1"><UpdateDot show={updates.length>0}/></span>
        </button>
        {childIdentity ? <><h1 className="sr-only">{title}</h1><button className="hoho-main-header__subject" type="button" aria-label="切换记录对象" onClick={() => setChildSheetOpen(true)}><Avatar name={hasMembers ? privateName : ' '} src={hasMembers ? member.avatar : undefined} size="sm" /><span className="hoho-main-header__subject-copy"><strong>{hasMembers ? privateName : '选择孩子'}</strong>{hasMembers && subjectMeta && <small>{subjectMeta}</small>}</span><ChevronDown size={13} aria-hidden="true" /></button></> : conversation && title === '症状记录' ? <div className="hoho-main-header__identity" aria-label="当前记录对象">{hasMembers && <button className="hoho-main-header__child" type="button" aria-label="切换记录对象" onClick={() => setChildSheetOpen(true)}><Avatar name={privateName} src={member.avatar} size="sm" /><span>{privateName}{member.age ? ` · ${compactIdentityAge(member.age)}` : ''}</span><ChevronDown size={13} aria-hidden="true" /></button>}</div> : <h1 className="hoho-text-section-title w-full truncate text-center">{title}{conversation && title==='护护' && <span className="hoho-conversation-ai" aria-label="AI 助手">AI</span>}</h1>}
        {action && <div className="hoho-main-header__actions absolute right-3 flex min-h-11 items-center">
          {action}
        </div>}
      </header>
      {['/health-events', '/health-profile'].includes(location.pathname) && <MainBottomNavigation />}
      <SideDrawer open={open} onClose={() => setOpen(false)} onOpenChildSheet={() => setChildSheetOpen(true)} onHistoryNavigate={onHistoryNavigate} onNewConversation={onNewConversation} conversationDisabled={conversationDisabled} />
      <CurrentChildSheet
        onAdd={() => { setChildSheetOpen(false); navigate('/family/new') }}
        onClose={() => setChildSheetOpen(false)}
        onEdit={editMember}
        open={childSheetOpen}
      />
      {notice && (
        <div className="app-shell-toast pointer-events-none fixed inset-x-0 bottom-[max(24px,env(safe-area-inset-bottom))] z-[60] mx-auto flex w-full justify-center px-6" aria-live="polite" role="status">
          <p className="rounded-control bg-text-primary px-4 py-2.5 text-sm font-medium text-surface shadow-floating">{notice}</p>
        </div>
      )}
    </>
  )
}
