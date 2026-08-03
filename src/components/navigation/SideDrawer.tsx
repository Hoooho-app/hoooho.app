import {
  BookOpen, ChevronRight, CircleHelp, Folder, House, Info, LogOut, MessageCircle, Settings, X
} from 'lucide-react'
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Avatar } from '../common'
import { useCurrentMember } from '../../hooks/useCurrentMember'
import { usePageScrollLock } from '../../hooks/usePageScrollLock'

interface SideDrawerProps {
  open: boolean
  onClose: () => void
}

const menuGroups = [
  [
    { label: '健康事件', icon: House, to: '/health-events' },
    { label: '健康档案', icon: Folder, to: '/health-profile' }
  ],
  [
    { label: '使用说明', icon: BookOpen, to: '/guide' },
    { label: '设置', icon: Settings, to: '/settings' },
    { label: '帮助', icon: CircleHelp, to: '/help' },
    { label: '反馈', icon: MessageCircle, to: '/feedback' },
    { label: '关于', icon: Info, to: '/about' }
  ],
  [{ label: '退出登录', icon: LogOut, to: '/login' }]
]

const genderLabel = { male: '男', female: '女', undisclosed: '不方便透露', '': '未填写' } as const

export function SideDrawer({ open, onClose }: SideDrawerProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const member = useCurrentMember()
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
    navigate(to)
  }

  return (
    <div className="fixed inset-0 z-50 mx-auto w-full max-w-[402px]" role="dialog" aria-modal="true" aria-label="侧边栏菜单">
      <button className="absolute inset-0 bg-text-primary/55" type="button" aria-label="关闭侧边栏" onClick={onClose} />
      <aside className="relative flex h-dvh w-[80%] max-w-[322px] flex-col overflow-y-auto bg-surface px-6 pb-6 pt-5 shadow-[18px_0_44px_rgb(17_24_39_/_0.14)]">
        <button className="grid h-10 w-10 place-items-center" type="button" aria-label="关闭菜单" onClick={onClose}>
          <X size={24} strokeWidth={1.7} />
        </button>

        <button className="mt-5 flex h-[58px] w-full items-center gap-3 text-left" type="button" onClick={() => openPage('/family')}>
          <Avatar name={member.name} />
          <span className="min-w-0 flex-1">
            <strong className="block truncate text-[15px] font-medium">{member.name}</strong>
            <span className="mt-0.5 block truncate text-xs text-text-secondary">{genderLabel[member.gender ?? '']} · {member.age}</span>
          </span>
          <span className="whitespace-nowrap text-[13px] font-medium text-primary">切换身份</span>
        </button>

        <nav className="mt-4" aria-label="侧边栏导航">
          {menuGroups.map((group, groupIndex) => (
            <div key={groupIndex} className={`${groupIndex > 0 ? 'border-t border-border pt-3' : ''} ${groupIndex < menuGroups.length - 1 ? 'pb-3' : ''}`}>
              {group.map(({ label, icon: Icon, to }) => {
                const active = location.pathname === to || (to !== '/health-events' && location.pathname.startsWith(`${to}/`))
                return (
                  <button key={label} className={`flex h-[52px] w-full items-center gap-3.5 rounded-control px-2 text-left text-[15px] font-medium transition ${active ? 'bg-primary-soft text-primary' : 'hover:bg-primary-soft/60'}`} type="button" onClick={() => openPage(to)}>
                    <Icon size={20} strokeWidth={1.7} />
                    <span className="flex-1">{label}</span>
                    {groupIndex === 0 && <ChevronRight size={17} strokeWidth={1.7} />}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>
      </aside>
    </div>
  )
}
