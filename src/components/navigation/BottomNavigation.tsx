import { ClipboardList, FileHeart, UserRound } from 'lucide-react'
import { NavLink } from 'react-router-dom'

const items = [
  { to: '/health-events', label: '健康事件', icon: ClipboardList },
  { to: '/health-profile', label: '健康档案', icon: FileHeart },
  { to: '/my', label: '我的', icon: UserRound }
]

export function BottomNavigation() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto grid w-full max-w-[402px] grid-cols-3 border-t bg-surface/95 pb-safe-bottom backdrop-blur" aria-label="主要导航">
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} className={({ isActive }) => `flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium ${isActive ? 'text-primary' : 'text-text-secondary'}`}>
          <Icon size={20} strokeWidth={1.75} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
