import { Link, useNavigate } from 'react-router-dom'
import type { FollowedCase } from './types'
import './cases.css'
import { NurseStationFactTypewriter } from '../../pages/NurseStation/NurseStationFactTypewriter'
import { useSettingsStore } from '../../store/useSettingsStore'
import { HohoButton } from '../../components/design-system/HohoButton'
import { quickNoteExamples, quickNoteTiming } from './quickNoteExamples'
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
  const care = useSettingsStore(state => state.care)
  const startRecord = () => navigate('/smart-record')
  return <section className="continuity-home" aria-label="情况速记与跟进列表">
    <div className="continuity-record-entry">
      <button aria-label="症状描述示例，情况速记" className="continuity-record-entry__record" onClick={startRecord} type="button">
        <span className="continuity-record-entry__copy"><NurseStationFactTypewriter clearOnComplete className="continuity-record-entry__example" facts={quickNoteExamples} highlightNumbers={false} reduceMotion={care.enabled && care.reduceMotion} timing={quickNoteTiming} /></span>
      </button>
      <div className="continuity-record-entry__buttons">
        <HohoButton className="continuity-record-entry__action" size="small" onClick={startRecord}>情况速记</HohoButton>
        <HohoButton className="continuity-record-entry__followup" size="small" variant="secondary" onClick={() => navigate('/cases')}>跟进列表</HohoButton>
      </div>
    </div>
  </section>
}
