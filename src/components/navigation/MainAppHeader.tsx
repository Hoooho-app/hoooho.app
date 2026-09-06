import { Menu } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { SideDrawer } from './SideDrawer'
import { CurrentChildSheet } from './CurrentChildSheet'
import { consumeMemberProfileRestore, getCurrentPath, readMemberProfileRestore, type MemberProfileEditOrigin } from './navigationState'
import { useAppStore } from '../../store/useAppStore'

export function MainAppHeader({ title, compact = false, action }: { title: string; compact?: boolean; action?: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const accountNotice = (location.state as { accountNotice?: string } | null)?.accountNotice ?? ''
  const restore = readMemberProfileRestore(location.state)
  const currentMemberId = useAppStore((state) => state.currentMemberId)
  const setCurrentMemberId = useAppStore((state) => state.setCurrentMemberId)
  const [open, setOpen] = useState(false)
  const [childSheetOpen, setChildSheetOpen] = useState(() => Boolean(restore))
  const [notice, setNotice] = useState(accountNotice)

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
      <header className={`hoho-page-header hoho-main-header relative flex shrink-0 items-center justify-center px-16 pt-[env(safe-area-inset-top)] ${compact ? 'sticky top-0 z-20 min-h-14' : 'min-h-16'}`}>
        <button className="absolute left-3 grid h-11 w-11 place-items-center rounded-full hover:bg-primary-soft" type="button" aria-label="打开菜单" onClick={() => setOpen(true)}>
          <Menu size={24} strokeWidth={1.8} />
        </button>
        <h1 className="hoho-text-section-title w-full truncate text-center">{title}</h1>
        {action && <div className="absolute right-3 flex min-h-11 items-center">{action}</div>}
      </header>
      <SideDrawer open={open} onClose={() => setOpen(false)} onOpenChildSheet={() => setChildSheetOpen(true)} />
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
