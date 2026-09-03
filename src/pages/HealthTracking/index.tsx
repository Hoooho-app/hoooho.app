import { Activity, ArrowRight, ChartNoAxesCombined, Images, Stethoscope } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { EmptyState, HohoButton, ListSkeleton, StatusNotice } from '../../components/design-system'
import { WebPageHeader } from '../../components/common'
import { MainAppHeader } from '../../components/navigation'
import { useHealthEventDetail } from '../../hooks/useHealthEventDetail'
import { useHealthEventsList } from '../../hooks/useHealthEventsList'
import { useAppStore } from '../../store/useAppStore'
import { getMemberHealthEvents } from '../../services/healthEventListPresentation'

const categoryLabel: Record<string, string> = { reaction: '过敏与反应', allergy: '过敏与反应', growth: '生长与营养', nutrition: '生长与营养', discomfort: '反复不适', fever: '反复不适', cough: '反复不适', pain: '反复不适', injury: '反复不适', medication: '用药观察', visit: '就诊与检查', other: '其他观察' }
const statusLabel: Record<string, string> = { observing: '正在观察', handling: '正在处理', stable: '暂时稳定', ended: '已结束', recovered: '已结束' }

export function HealthTrackingPage() {
  const { eventId } = useParams()
  return eventId ? <TrackingDetail eventId={eventId} /> : <TrackingList />
}

function TrackingList() {
  const navigate = useNavigate(); const currentMemberId = useAppStore((s) => s.currentMemberId); const { state, retry } = useHealthEventsList()
  if (state.status === 'loading') return <main className="app-shell"><MainAppHeader title="健康追踪" /><ListSkeleton /></main>
  if (state.status === 'error') return <main className="app-shell"><MainAppHeader title="健康追踪" /><StatusNotice action={<HohoButton onClick={retry}>重试</HohoButton>} title="健康追踪加载失败" tone="error">{state.message}</StatusNotice></main>
  const events = getMemberHealthEvents(state.data.events, currentMemberId)
  return <main className="app-shell"><MainAppHeader title="健康追踪" /><div className="child-page-stack"><p className="child-page-lead">把同一问题的多次记录放在一起，看见连续变化。</p>{events.length ? <div className="tracking-list">{events.map((event) => <button key={event.id} onClick={() => navigate(`/health-tracking/${event.id}`)} type="button"><span className="tracking-list__icon"><Activity /></span><span><small>{categoryLabel[event.category]}</small><strong>{event.displayTitle}</strong><em>{statusLabel[event.status] ?? '正在观察'} · {event.summaryFragments[0]?.label ?? '等待补充'}</em></span><ArrowRight /></button>)}</div> : <EmptyState action={<HohoButton onClick={() => navigate('/health-events')}>开始记录</HohoButton>} description="同一问题的补充记录会自动归到一起。" icon={<Activity />} title="还没有健康追踪" />}</div></main>
}

function TrackingDetail({ eventId }: { eventId: string }) {
  const navigate = useNavigate(); const currentMemberId = useAppStore((s) => s.currentMemberId); const { state, retry } = useHealthEventDetail(eventId)
  if (state.status === 'loading') return <main className="app-shell"><WebPageHeader fallback="/health-tracking" title="健康追踪" /><ListSkeleton /></main>
  if (state.status !== 'success') return <main className="app-shell"><WebPageHeader fallback="/health-tracking" title="健康追踪" /><StatusNotice action={<HohoButton onClick={retry}>重试</HohoButton>} title="无法读取追踪" tone="error">请确认当前孩子后重试。</StatusNotice></main>
  if (state.data.eventDto.memberId !== currentMemberId) return <main className="app-shell"><WebPageHeader fallback="/health-tracking" title="健康追踪" /><StatusNotice title="这条追踪不属于当前孩子" tone="error">已停止展示，避免混入其他孩子的数据。</StatusNotice></main>
  const { eventDto, records, attachments, member } = state.data; const isGrowth = ['growth','nutrition'].includes(eventDto.category); const isReaction = ['reaction','allergy'].includes(eventDto.category)
  return <main className="app-shell"><WebPageHeader fallback="/health-tracking" title="健康追踪" /><div className="child-page-stack"><section className="tracking-hero"><span>{categoryLabel[eventDto.category]}</span><h1>{eventDto.title}</h1><p>{member.name} · {member.age}</p><strong>{statusLabel[eventDto.status] ?? '正在观察'}</strong></section>
    <section className="tracking-facts"><h2>连续记录</h2><dl><div><dt>首次出现</dt><dd>{new Date(eventDto.startTime).toLocaleDateString('zh-CN')}</dd></div><div><dt>发生次数</dt><dd>{records.length} 次记录</dd></div><div><dt>最近情况</dt><dd>{records.at(-1)?.content || '等待补充'}</dd></div><div><dt>尚未确认</dt><dd>{records.flatMap((r) => r.uncertainFields ?? []).join('、') || '暂无'}</dd></div></dl></section>
    <div className="tracking-actions">{isGrowth && <button onClick={() => navigate(`/health-tracking/${eventId}/growth`)} type="button"><ChartNoAxesCombined /><span><strong>生长趋势详情</strong><small>查看每次测量与连续变化</small></span><ArrowRight /></button>}{isReaction && <button onClick={() => navigate(`/health-tracking/${eventId}/allergy-comparison`)} type="button"><Images /><span><strong>过敏反应对比</strong><small>比较多次反应与照片</small></span><ArrowRight /></button>}<button onClick={() => navigate(`/visit-preparation/${eventId}`)} type="button"><Stethoscope /><span><strong>就诊准备</strong><small>生成问诊摘要</small></span><ArrowRight /></button></div>
    <HohoButton onClick={() => navigate(`/health-events/${eventId}`)} variant="secondary">继续补充这个问题</HohoButton>
    {attachments.length > 0 && <p className="child-supporting-note">已关联 {attachments.length} 张照片或检查资料。</p>}
  </div></main>
}
