import {
  BookOpen, ChevronRight, CircleHelp, Folder, House, Info, LogOut, MessageCircle, Settings, X
} from 'lucide-react'
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Avatar } from '../common'
import { useCurrentMember } from '../../hooks/useCurrentMember'
import { usePageScrollLock } from '../../hooks/usePageScrollLock'
import { useAppStore } from '../../store/useAppStore'

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
  const navigate = useNavigate()
  const location = useLocation()
  const member = useCurrentMember()
  const clearAuthSession = useAppStore((state) => state.clearAuthSession)
  usePageScrollLock(open)

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
    navigate(to)
  }

  return (
    <div className="fixed inset-0 z-50 mx-auto w-full max-w-[402px]" role="dialog" aria-modal="true" aria-label="侧边栏菜单">
      <button className="absolute inset-0 bg-text-primary/55" type="button" aria-label="关闭侧边栏" onClick={onClose} />
      <aside className="relative flex h-dvh w-[84%] max-w-[338px] flex-col overflow-y-auto border-r bg-surface px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-5 shadow-floating">
        <button className="grid h-10 w-10 place-items-center" type="button" aria-label="关闭菜单" onClick={onClose}>
          <X size={24} strokeWidth={1.7} />
        </button>

        <section className="mt-5 rounded-card border bg-surface p-4" aria-label="当前角色">
          <button className="flex w-full items-center gap-3 text-left" type="button" aria-label={`编辑${member.name}的基本信息`} onClick={() => openPage(`/family/${encodeURIComponent(member.id)}/edit`)}>
            <Avatar name={member.name} src={member.avatar} size="lg" />
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-base font-semibold text-heading">{member.name}</strong>
              <span className="mt-1 block truncate text-sm text-text-secondary">{genderLabel[member.gender ?? '']} · {member.age}</span>
            </span>
            <ChevronRight className="shrink-0 text-text-secondary" size={20} strokeWidth={1.7} />
          </button>
          <button className="mt-4 inline-flex min-h-10 items-center rounded-pill border border-primary/35 bg-surface px-4 text-sm font-medium text-primary transition hover:bg-primary-soft" type="button" onClick={() => openPage('/family')}>
            切换角色
          </button>
        </section>

        <nav className="mt-6 flex-1 space-y-6" aria-label="侧边栏导航">
          {menuGroups.map((group) => (
            <section key={group.title} aria-labelledby={`drawer-${group.title}`}>
              <div className="mb-2 flex items-center gap-3">
                <span className="h-px w-5 bg-border" />
                <h2 id={`drawer-${group.title}`} className="text-xs font-medium tracking-wide text-text-secondary">{group.title}</h2>
                <span className="h-px flex-1 bg-border" />
              </div>
              <div className="overflow-hidden rounded-card border bg-surface px-2">
              {group.items.map(({ label, icon: Icon, to }, itemIndex) => {
                const active = location.pathname === to || (to !== '/health-events' && location.pathname.startsWith(`${to}/`))
                return (
                  <button key={label} className={`flex h-[52px] w-full items-center gap-3.5 px-2 text-left text-[15px] font-medium transition ${itemIndex > 0 ? 'border-t border-border' : ''} ${active ? 'text-primary' : 'hover:text-primary'}`} type="button" onClick={() => openPage(to)}>
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

        <button className="mt-6 flex min-h-[54px] w-full items-center gap-3.5 rounded-card border px-4 text-left text-[15px] font-medium transition hover:bg-surface-muted" type="button" onClick={() => openPage('/login')}>
          <LogOut size={20} strokeWidth={1.7} />
          <span className="flex-1">退出登录</span>
          <ChevronRight className="text-text-secondary" size={17} strokeWidth={1.7} />
        </button>
      </aside>
    </div>
  )
}
