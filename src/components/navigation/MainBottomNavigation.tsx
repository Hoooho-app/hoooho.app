import { CalendarDays, ClipboardList, SymptomIcon, Folder } from '../icons'
import { useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { OrganizeSheet } from '../../features/organize/OrganizeSheet'
import './primary-navigation.css'

export const primaryDestinations = [
  { label: '症状记录', to: '/nurse-station', icon: SymptomIcon },
  { label: '健康日历', to: '/health-events', icon: CalendarDays },
  { label: '孩子档案', to: '/health-profile', icon: Folder },
] as const

export function MainBottomNavigation({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate(), location = useLocation()
  const [organizeOpen, setOrganizeOpen] = useState(false)
  return <>
    <nav className={`hoho-bottom-navigation${embedded ? ' hoho-bottom-navigation--embedded' : ' hoho-bottom-navigation--fixed'}`} aria-label="主要导航">
      {primaryDestinations.map(({ label, to, icon: Icon }) => <button key={to} type="button" aria-current={location.pathname === to ? 'page' : undefined} onClick={() => { if (location.pathname !== to) navigate(to) }}>
        <span className="hoho-bottom-navigation__icon"><Icon size={22} strokeWidth={1.7} aria-hidden="true" /></span><span>{label}</span>
      </button>)}
      <button type="button" aria-haspopup="dialog" aria-expanded={organizeOpen} onClick={() => setOrganizeOpen(true)}><ClipboardList size={24} selected={organizeOpen} aria-hidden="true" /><span>一键整理</span></button>
    </nav>
    <OrganizeSheet open={organizeOpen} onClose={() => setOrganizeOpen(false)} />
  </>
}
