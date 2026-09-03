import { Activity, ArrowRight, FileHeart, Mic, NotebookPen } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { EmptyState, HohoButton, ListSkeleton, StatusNotice } from '../../components/design-system'
import { MainAppHeader } from '../../components/navigation'
import { useHealthEventsList } from '../../hooks/useHealthEventsList'
import { useCurrentMember } from '../../hooks/useCurrentMember'
import { getMemberHealthEvents } from '../../services/healthEventListPresentation'
import { useAppStore } from '../../store/useAppStore'
import { canChildCreateRecords } from '../../features/children/childAge'

export function HomePage() {
  const navigate = useNavigate()
  const member = useCurrentMember()
  const currentMemberId = useAppStore((state) => state.currentMemberId)
  const { state, retry } = useHealthEventsList()
  if (state.status === 'loading') return <main className="app-shell"><MainAppHeader title="首页" /><ListSkeleton /></main>
  if (state.status === 'error') return <main className="app-shell"><MainAppHeader title="首页" /><StatusNotice action={<HohoButton onClick={retry}>重试</HohoButton>} title="首页加载失败" tone="error">{state.message}</StatusNotice></main>
  if (!state.data.members.length) return <main className="app-shell"><MainAppHeader title="首页" /><EmptyState action={<HohoButton onClick={() => navigate('/children/new')}>添加孩子</HohoButton>} description="为孩子建立身份后，就可以开始连续记录。" icon={<FileHeart />} title="先添加一个孩子" /></main>
  const events = getMemberHealthEvents(state.data.events, currentMemberId)
  const active = events.filter((item) => !['recovered', 'ended'].includes(item.status)).slice(0, 3)
  const canRecord = canChildCreateRecords(member.birthday) && !member.recordingPausedAt
  return <main className="app-shell child-home"><MainAppHeader title="首页" /><div className="child-page-stack">
    <section className="child-identity-band"><span>当前孩子</span><strong>{member.name}</strong><small>{member.age} · {member.gender === 'male' ? '男' : member.gender === 'female' ? '女' : '性别未填写'}</small><button onClick={() => navigate('/children')} type="button">切换孩子</button></section>
    {!canRecord && <p className="child-readonly-note">当前版本主要服务7岁以下儿童，既有记录仍可查看和导出。</p>}
    <section className="child-home-hero"><p>今天有什么变化？</p><h1>不用一次说完，<br />有变化再补充。</h1><HohoButton disabled={!canRecord} onClick={() => navigate('/health-events', { state: { openQuickRecord: true } })}><Mic size={18} />说一段或写下来</HohoButton></section>
    <section><div className="child-section-heading"><div><span>正在关注</span><h2>{active.length ? `${active.length} 个连续问题` : '还没有健康追踪'}</h2></div><button onClick={() => navigate('/health-tracking')} type="button">全部<ArrowRight size={16} /></button></div>
      <div className="child-focus-list">{active.map((event) => <button key={event.id} onClick={() => navigate(`/health-tracking/${event.id}`)} type="button"><Activity /><span><strong>{event.displayTitle}</strong><small>{event.summaryFragments[0]?.label || '等待下一次补充'}</small></span><ArrowRight /></button>)}{!active.length && <p>从孩子最近的一次身体变化开始记。</p>}</div>
    </section>
    <div className="child-home-grid"><button onClick={() => navigate('/health-events')} type="button"><NotebookPen /><strong>健康随记</strong><span>按发生时间查看</span></button><button onClick={() => navigate('/health-profile')} type="button"><FileHeart /><strong>健康档案</strong><span>维护稳定背景</span></button></div>
  </div></main>
}
