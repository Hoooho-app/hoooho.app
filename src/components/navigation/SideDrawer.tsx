import {
  BookOpen, ChevronRight, CircleHelp, Folder, House, Info, MessageCircle, Settings, UserRound, X
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Avatar } from '../common'
import { useCurrentMember } from '../../hooks/useCurrentMember'
import { usePageScrollLock } from '../../hooks/usePageScrollLock'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { useAppStore } from '../../store/useAppStore'
import { getCurrentPath } from './navigationState'
import { makeFeedbackState } from '../../features/feedback/navigation'
import { AccountSheet, MembershipBadge } from '../account/AccountSheet'
import { accountService } from '../../services/account'
import { useState } from 'react'

interface SideDrawerProps {
  open: boolean
  onClose: () => void
}

export const sidebarMenuGroups = [
  {
    title: '健康管理',
    items: [
    { label: '健康随记', icon: House, to: '/health-events' },
    { label: '健康档案', icon: Folder, to: '/health-profile' }
    ]
  },
  {
    title: '工具与帮助',
    items: [
    { label: '使用说明', icon: BookOpen, to: '/guide' },
    { label: '设置', icon: Settings, to: '/settings' },
    { label: '帮助', icon: CircleHelp, to: '/help' },
    { label: '反馈', icon: MessageCircle, to: '/feedback' },
    { label: '关于', icon: Info, to: '/about' }
    ]
  }
]

const genderLabel = { male: '男', female: '女', undisclosed: '不方便透露', '': '未填写' } as const

export function SideDrawer({ open, onClose }: SideDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const member = useCurrentMember()
  const members = useAppStore((state) => state.members)
  const authToken = useAppStore((state) => state.authToken)
  const authUser = useAppStore((state) => state.authUser)
  const accountProfile = useAppStore((state) => state.accountProfile)
  const setAccountProfile = useAppStore((state) => state.setAccountProfile)
  const [accountOpen, setAccountOpen] = useState(false)
  usePageScrollLock(open)
  useDialogFocus(open, drawerRef)

  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open, onClose])

  useEffect(() => {
    if (!open || !authToken || authUser?.guest || accountProfile) return
    void accountService.get(authToken).then(setAccountProfile).catch(() => undefined)
  }, [accountProfile, authToken, authUser?.guest, open, setAccountProfile])

  if (!open) return null

  const openPage = (to: string) => {
    onClose()
    if (members.length === 0 && to === '/health-profile') {
      navigate('/health-events', { replace: true })
      return
    }
    navigate(to, to === '/feedback' ? {
      state: makeFeedbackState(
        getCurrentPath(location.pathname, location.search, location.hash),
        location.pathname.startsWith('/health-events/') ? '健康随记详情' : location.pathname === '/health-events' ? '健康随记' : location.pathname === '/settings' ? '我的' : '原页面',
        window.scrollY
      )
    } : to === '/family' ? {
      state: {
        familyEntry: {
          returnTo: getCurrentPath(location.pathname, location.search, location.hash),
          reopenDrawer: true
        }
      }
    } : undefined)
  }

  return (
    <div className="hoho-drawer-layer" role="dialog" aria-modal="true" aria-label="侧边栏菜单">
      <button className="absolute inset-0 bg-text-primary/55" type="button" aria-label="关闭侧边栏" onClick={onClose} />
      <aside className="hoho-drawer" ref={drawerRef} tabIndex={-1}>
        <button className="hoho-drawer__close grid h-10 w-10 place-items-center rounded-full" type="button" aria-label="关闭菜单" onClick={onClose}>
          <X size={24} strokeWidth={1.7} />
        </button>

        <section className="hoho-drawer__member mt-2" aria-label="当前角色">
          {members.length > 0 ? (
            <>
              <button className="flex w-full items-center gap-3 text-left" type="button" aria-label={`编辑${member.name}的资料`} onClick={() => { onClose(); navigate(`/family/${encodeURIComponent(member.id)}/edit`, { state: { returnTo: getCurrentPath(location.pathname, location.search, location.hash) } }) }}>
                <Avatar name={member.name} src={member.avatar} size="md" />
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-base font-semibold text-heading">{member.name}</strong>
                  <span className="mt-1 block truncate text-sm text-text-secondary">{genderLabel[member.gender ?? '']} · {member.age}</span>
                </span>
                <ChevronRight className="shrink-0 text-text-secondary" size={20} strokeWidth={1.7} />
              </button>
              <button className="hoho-drawer__switch mt-1 inline-flex min-h-10 items-center px-1 text-sm font-medium text-primary" type="button" onClick={() => openPage('/family')}>
                切换人物
              </button>
            </>
          ) : (
            <button className="flex min-h-14 w-full items-center justify-between text-left" type="button" onClick={() => openPage('/family/new')}>
              <span><strong className="block text-base font-semibold text-heading">尚未添加家人</strong><span className="mt-1 block text-sm text-text-secondary">添加后即可开始记录</span></span>
              <ChevronRight className="text-text-secondary" size={20} strokeWidth={1.7} />
            </button>
          )}
        </section>

        <nav className="mt-3 flex-1 space-y-3" aria-label="侧边栏导航">
          {sidebarMenuGroups.map((group) => (
            <section key={group.title} aria-labelledby={`drawer-${group.title}`}>
              <h2 id={`drawer-${group.title}`} className="mb-1 px-2 text-xs font-medium tracking-wide text-text-secondary">{group.title}</h2>
              <div className="hoho-drawer__menu">
              {group.items.map(({ label, icon: Icon, to }) => {
                const active = location.pathname === to || (to !== '/health-events' && location.pathname.startsWith(`${to}/`))
                return (
                  <button aria-current={active ? 'page' : undefined} key={label} className="hoho-drawer__item" data-active={active} type="button" onClick={() => openPage(to)}>
                    <Icon size={20} strokeWidth={1.7} />
                    <span className="flex-1">{label}</span>
                    <ChevronRight className="text-text-secondary" size={17} strokeWidth={1.7} />
                  </button>
                )
              })}
              </div>
            </section>
          ))}
        </nav>

        <button className="hoho-drawer__account mt-3 flex min-h-[58px] w-full items-center gap-3 px-2 text-left" type="button" onClick={() => setAccountOpen(true)}>
          {authUser?.guest
            ? <span className="account-neutral-avatar"><UserRound size={19} /></span>
            : <Avatar name={accountProfile?.nickname ?? '用户'} src={accountProfile?.avatar ?? undefined} size="sm" />}
          <span className="min-w-0 flex-1">
            <strong className="block truncate text-sm font-semibold">{authUser?.guest ? '未登录' : accountProfile?.nickname ?? 'Hoooho 用户'}</strong>
            <span className="mt-0.5 block truncate text-xs text-text-secondary">{authUser?.guest ? '当前为体验模式' : '已同步'}</span>
          </span>
          {!authUser?.guest && <MembershipBadge />}
          <ChevronRight className="text-text-secondary" size={17} strokeWidth={1.7} />
        </button>
      </aside>
      <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} />
    </div>
  )
}
