import { isProductPathVisible } from '../../../shared/product-visibility.mjs'
import { ChartNoAxesCombined, ChevronRight, ClipboardPlus, HandHeart } from '../../components/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import { BottomSheetSurface } from '../../components/design-system'
import './organize.css'
import { organizeNavigationState } from './navigation'

export const organizeDestinations = [
  { title: '就诊情况单', description: '去医院或咨询 AI 时，快速说明情况', to: '/visit-summary', icon: ClipboardPlus },
  { title: '照顾交接单', description: '固定作息、照护安排和家长交代', to: '/care-handoff', icon: HandHeart },
  { title: '近期情况回顾', description: '用图表回看症状、睡眠和日常变化', to: '/recent-review', icon: ChartNoAxesCombined },
].filter(item => isProductPathVisible(item.to))

export function OrganizeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate(), location = useLocation()
  return <BottomSheetSurface open={open} onClose={onClose} title="一键整理" label="一键整理">
    <div className="organize-choices">{organizeDestinations.map(({ title, description, to, icon: Icon }) => <button className="organize-choice" key={to} type="button" onClick={() => { onClose(); navigate(to, { state: organizeNavigationState(location, window.history.state?.idx) }) }}>
      <Icon size={23} strokeWidth={1.7} aria-hidden="true" />
      <span><strong>{title}</strong><span>{description}</span></span>
      <ChevronRight size={18} aria-hidden="true" />
    </button>)}</div>
  </BottomSheetSurface>
}
