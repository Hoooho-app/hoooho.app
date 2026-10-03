import { Link, useNavigate } from 'react-router-dom'
import { HohoButton } from '../../components/design-system'
import { useCases } from './useCases'
import type { FollowedCase } from './types'
import './cases.css'
const taskStates = { active: '观察中', scheduled: '尚未开始', expired: '观察已到期', paused: '已暂停', ended: '已结束' }
export function CaseCard({ item }: { item: FollowedCase }) {
  const navigate = useNavigate()
  return <article className="continuity-card" onClick={event => { if (!(event.target as HTMLElement).closest('a,button,input,select')) navigate(`/health-events/${item.event.id}`) }}>
    <div className="continuity-card__heading"><Link to={`/health-events/${item.event.id}`}>{item.event.title}</Link><span>{item.event.caseArchivedAt ? '已归档' : item.observations.some(t => t.state === 'active') ? '观察中' : '正在跟进'}</span></div>
    <p className="continuity-card__latest">{item.latest?.content || '还没有记录'}</p>
    {item.observations.map(task => <div className="continuity-observation" key={task.id}><p>观察：{task.item}</p><small>{taskStates[task.state]} · 每天{task.timesPerDay}次 · 截止 {task.endsOn}</small><p>{task.todayTarget > 0 ? task.todayRecorded === 0 ? '今日待记录' : `今日已记录 ${task.todayRecorded}/${task.todayTarget}${task.todayNotObserved ? `（${task.todayNotObserved}次未观察）` : ''}` : '不自动补为正常'}</p>{task.todayTarget > 0 && <Link to={`/smart-record?eventId=${item.event.id}&taskId=${task.id}`}>记录今天的变化 ›</Link>}</div>)}
    <div className="continuity-card__links"><Link to={`/health-events/${item.event.id}`}>查看情况 ›</Link>{!item.event.caseArchivedAt && <Link to={`/smart-record?eventId=${item.event.id}`}>继续记录 ›</Link>}</div><Link className="continuity-return-link" to={`/cases/${item.event.id}/materials`}>带回问诊资料 ›</Link>
  </article>
}
export function FollowUpHome() {
  const navigate = useNavigate()
  const { data, error, reload } = useCases()
  return <section className="continuity-home" aria-label="健康事件随时记与情况列表">
    <div className="continuity-record-entry">
      <Link className="continuity-record-entry__copy" to="/smart-record"><strong>健康事件随时记</strong><span>突发情况先记下来</span></Link>
      <HohoButton className="continuity-record-entry__action" size="small" onClick={() => navigate('/smart-record')}>速记</HohoButton>
    </div>
    <div className="continuity-section-heading continuity-home__list-link"><Link to="/cases">{data ? data.active.length > 3 ? `查看全部 ${data.active.length} 件` : `${data.active.length}件 · 查看列表` : '查看列表'} ›</Link></div>
    {error ? <div role="alert">情况暂未加载 <HohoButton variant="text" onClick={reload}>重试</HohoButton></div> : !data ? <p role="status">正在加载情况…</p> : data.active.slice(0, 3).map(item => <CaseCard key={item.event.id} item={item}/>)}
    {!!data?.archived.length && <Link className="continuity-return-link" to="/cases?state=archived">查看已归档 {data.archived.length} 件 ›</Link>}
  </section>
}
