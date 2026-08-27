import { Menu } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { SideDrawer } from './SideDrawer'
import type { MemberSwitchResultState } from './navigationState'

export function MainAppHeader({ title, action }: { title: string; action?: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const switchResult = (location.state as MemberSwitchResultState | null)?.memberSwitchResult
  const [open, setOpen] = useState(() => switchResult?.reopenDrawer ?? false)
  const [switchedMemberName, setSwitchedMemberName] = useState(() => switchResult?.memberName ?? '')

  useEffect(() => {
    if (!switchedMemberName) return
    const timer = window.setTimeout(() => {
      setSwitchedMemberName('')
      navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null })
    }, 1800)
    return () => window.clearTimeout(timer)
  }, [location.hash, location.pathname, location.search, navigate, switchedMemberName])

  return (
    <>
      <header className="hoho-page-header grid min-h-16 shrink-0 grid-cols-[1fr_minmax(0,2fr)_1fr] items-center px-3 pt-[env(safe-area-inset-top)]">
        <button className="grid h-11 w-11 place-items-center rounded-full hover:bg-primary-soft" type="button" aria-label="打开菜单" onClick={() => setOpen(true)}>
          <Menu size={24} strokeWidth={1.8} />
        </button>
        <h1 className="hoho-text-section-title truncate px-2 text-center">{title}</h1>
        <div className="justify-self-end">{action}</div>
      </header>
      <SideDrawer open={open} onClose={() => setOpen(false)} />
      {switchedMemberName && (
        <div className="app-shell-toast pointer-events-none fixed inset-x-0 bottom-[max(24px,env(safe-area-inset-bottom))] z-[60] mx-auto flex w-full justify-center px-6" aria-live="polite" role="status">
          <p className="rounded-control bg-text-primary px-4 py-2.5 text-sm font-medium text-surface shadow-floating">
            已切换至 {switchedMemberName}
          </p>
        </div>
      )}
    </>
  )
}
