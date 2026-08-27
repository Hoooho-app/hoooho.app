import {
  BookOpen, ChevronRight, CircleHelp, Folder, House, Info, LogOut, MessageCircle, Settings, X
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

interface SideDrawerProps {
  open: boolean
  onClose: () => void
}

const menuGroups = [
  {
    title: '健康管理',
    items: [
    { label: '健康事件', icon: House, to: '/health-events' },
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
  const clearAuthSession = useAppStore((state) => state.clearAuthSession)
  usePageScrollLock(open)
  useDialogFocus(open, drawerRef)

  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open, onClose])

  if (!open) return null

  const openPage = (to: string) => {
    onClose()
    if (to === '/login') clearAuthSession()
    navigate(to, to === '/feedback' ? {
      state: makeFeedbackState(
        getCurrentPath(location.pathname, location.search, location.hash),
        location.pathname.startsWith('/health-events/') ? '健康事件详情' : location.pathname === '/health-events' ? '健康事件' : location.pathname === '/settings' ? '我的' : '原页面',
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
          <button className="flex w-full items-center gap-3 text-left" type="button" aria-label={`编辑${member.name}的基本信息`} onClick={() => openPage(`/family/${encodeURIComponent(member.id)}/edit`)}>
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
        </section>

        <nav className="mt-5 flex-1 space-y-5" aria-label="侧边栏导航">
          {menuGroups.map((group) => (
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

        <button className="hoho-drawer__logout mt-5 flex min-h-[52px] w-full items-center gap-3.5 px-2 text-left text-[15px] font-medium" type="button" onClick={() => openPage('/login')}>
          <LogOut size={20} strokeWidth={1.7} />
          <span className="flex-1">退出登录</span>
          <ChevronRight className="text-text-secondary" size={17} strokeWidth={1.7} />
        </button>
      </aside>
    </div>
  )
}
