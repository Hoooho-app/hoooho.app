import { NavLink, Outlet } from 'react-router-dom'
import { MaterialIcon } from '../../components/icons'
import type { MaterialIconName } from '../../components/icons/materialPaths'
import { OpsAccount } from '../../components/auth/OpsAccount'
import { OpsInboxProvider, useOpsInbox } from './workspace'
import './workspace.css'

const navigation: { path: string; title: string; icon: MaterialIconName }[] = [
  { path: '/ops', title: 'Overview', icon: 'assignment' },
  { path: '/ops/billing', title: '费用监控', icon: 'monitoring' },
  { path: '/ops/feedback', title: '反馈中心', icon: 'chat_bubble' },
  { path: '/ops/services', title: '服务链接', icon: 'link' },
  { path: '/ops/versions', title: '版本管理', icon: 'archive' }
]
function Workspace() {
  const inbox = useOpsInbox()!
  const count = inbox.events.filter(event => !event.viewedAt).length
  return <div className="ops-workspace">
    <aside className="ops-sidebar" aria-label="总控台导航">
      <NavLink className="ops-brand" to="/ops"><strong>Hoooho</strong><span>总控台</span></NavLink>
      <nav>{navigation.map(item => <NavLink key={item.path} to={item.path} end={item.path === '/ops'}>{({ isActive }) => <><MaterialIcon name={item.icon} selected={isActive} size={21}/><span>{item.title}</span>{item.path === '/ops' && (inbox.error ? <span className="ops-unread-badge" title="新情况暂时无法更新">!</span> : !inbox.loading && count > 0 ? <span className="ops-unread-badge" aria-label={`${count} 项待查看`}>{count > 99 ? '99+' : count}</span> : null)}</>}</NavLink>)}</nav>
      <NavLink className="ops-workspace-settings" to="/ops/settings"><MaterialIcon name="settings" size={21}/><span>工作台设置</span></NavLink>
    </aside>
    <div className="ops-workspace-body"><header className="ops-account-bar"><OpsAccount /></header><div className="ops-workspace-content"><Outlet /></div></div>
  </div>
}
export function OpsLayout() { return <OpsInboxProvider><Workspace /></OpsInboxProvider> }
