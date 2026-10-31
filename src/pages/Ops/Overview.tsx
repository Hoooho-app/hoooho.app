import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { MaterialIconName } from '../../components/icons/materialPaths'
import { MaterialIcon } from '../../components/icons'
import { OpsProjectPicker, projectName, useOpsInbox, useOpsProject, type OpsEvent } from './workspace'

const kinds: Record<string, { label: string; icon: MaterialIconName }> = {
  'billing-reminder': { label: '费用提醒', icon: 'warning' },
  feedback: { label: '新反馈', icon: 'chat_bubble' }, 'feedback-reply': { label: '新回复', icon: 'chat_bubble' },
  'billing-alert': { label: '费用提醒', icon: 'warning' }, 'billing-update': { label: '账单更新', icon: 'description' }
}
const day = (value: string) => new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
const time = (value: string) => new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai' })
export function OpsOverviewPage() {
  const inbox = useOpsInbox()!
  const { project } = useOpsProject()
  const [tab, setTab] = useState<'unread' | 'viewed'>('unread')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const scoped = inbox.events.filter(event => project === 'all' || event.projectId === project)
  const unread = scoped.filter(event => !event.viewedAt).length
  const filtered = scoped.filter(event => (tab === 'unread' ? !event.viewedAt : event.viewedAt) && `${event.title} ${event.preview} ${projectName(event.projectId)}`.toLowerCase().includes(search.trim().toLowerCase()))
  const active = filtered.find(event => event.id === selected) ?? filtered[0]
  const today = day(new Date().toISOString())
  const groups = [{ label: '今天', events: filtered.filter(event => day(event.occurredAt) === today) }, { label: tab === 'unread' ? '更早未查看' : '更早', events: filtered.filter(event => day(event.occurredAt) !== today) }]
  return <main className="ops-overview-page">
    <header className="ops-overview-heading"><div><h1>Overview</h1><p>新情况，逐项查看</p></div><OpsProjectPicker /></header>
    <div className="ops-inbox-toolbar"><div role="tablist" aria-label="查看状态"><button type="button" role="tab" aria-selected={tab === 'unread'} onClick={() => setTab('unread')}>待查看 <span>{inbox.loading || inbox.error ? '—' : unread}</span></button><button type="button" role="tab" aria-selected={tab === 'viewed'} onClick={() => setTab('viewed')}>已查看</button></div><label><MaterialIcon name="search" size={18}/><input type="search" aria-label="搜索新情况" placeholder="搜索新情况" value={search} onChange={event => setSearch(event.target.value)}/></label><button className="ops-inbox-reload" type="button" onClick={() => void inbox.refresh()}>重新加载</button></div>
    {inbox.error ? <section className="ops-inbox-empty" role="alert"><h2>暂时无法读取新情况</h2><p>{inbox.error}</p><button type="button" onClick={() => void inbox.refresh()}>重新加载</button></section> : inbox.loading ? <div className="ops-inbox-empty" role="status">正在读取新情况…</div> : <div className="ops-inbox-layout">
      <section className="ops-inbox-list" aria-label="新情况列表">{filtered.length ? groups.map(group => group.events.length ? <section key={group.label}><h2>{group.label}</h2>{group.events.map(event => <EventRow key={event.id} event={event} active={active?.id === event.id} onSelect={() => setSelected(event.id)} />)}</section> : null) : <div className="ops-inbox-empty"><MaterialIcon name={tab === 'unread' && scoped.length && !search ? 'check_circle' : 'mail'} size={32}/><h2>{search ? '没有匹配的新情况' : tab === 'unread' && scoped.length ? '当前项目的新情况已全部查看' : tab === 'viewed' ? '暂无已查看记录' : '暂无新情况'}</h2><p>{search ? '换个关键词试试。' : project !== 'all' && project !== 'hoooho' && !scoped.length ? '该项目暂未接入动态来源。' : '新反馈、费用快照更新和费用连接异常会出现在这里。'}</p></div>}<p className="ops-inbox-footnote">打开对应内容后计为已查看；未查看项持续保留。</p></section>
      <aside className="ops-inbox-preview" aria-label="动态摘要"><h2>动态摘要</h2>{active ? <><span className="ops-event-kind">{kinds[active.kind]?.label}</span><h3>{active.title}</h3><p className="ops-event-meta">{projectName(active.projectId)} · {time(active.occurredAt)}</p><p className="ops-event-preview-text">{active.preview}</p><Link className="hoho-button ops-open-source" data-variant="primary" to={active.target}>打开{kinds[active.kind]?.label.startsWith('新') ? '反馈' : '费用来源'}并定位 <MaterialIcon name="arrow_forward" size={18}/></Link></> : <p className="ops-event-preview-text">选择一项新情况查看摘要。</p>}</aside>
    </div>}
  </main>
}
function EventRow({ event, active, onSelect }: { event: OpsEvent; active: boolean; onSelect: () => void }) {
  const kind: { label: string; icon: MaterialIconName } = kinds[event.kind] ?? { label: '新情况', icon: 'notifications' }
  return <div className="ops-event-row" data-selected={active} data-event-id={event.id}><button type="button" className="ops-event-select" onClick={onSelect} aria-label={`预览 ${event.title}`}><MaterialIcon name={kind.icon} size={21}/><span className="ops-event-type">{kind.label}</span><span className="ops-event-project">{projectName(event.projectId)}</span><strong>{event.title}</strong><time dateTime={event.occurredAt}>{time(event.occurredAt)}</time></button><Link to={event.target} aria-label={`打开并定位 ${event.title}`}><MaterialIcon name="chevron_right" size={20}/></Link></div>
}
