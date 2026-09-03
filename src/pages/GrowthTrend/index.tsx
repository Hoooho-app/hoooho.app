import { useParams } from 'react-router-dom'
import { HohoButton, ListSkeleton, StatusNotice } from '../../components/design-system'
import { WebPageHeader } from '../../components/common'
import { useHealthEventDetail } from '../../hooks/useHealthEventDetail'
import { useAppStore } from '../../store/useAppStore'

function measurements(content: string) { const values: { label: string; value: number; unit: string }[] = []; const rules = [['身高', /身高\s*(\d+(?:\.\d+)?)\s*(?:cm|厘米)?/i, 'cm'], ['体重', /体重\s*(\d+(?:\.\d+)?)\s*(?:kg|公斤|千克)?/i, 'kg'], ['头围', /头围\s*(\d+(?:\.\d+)?)\s*(?:cm|厘米)?/i, 'cm'], ['BMI', /bmi\s*(\d+(?:\.\d+)?)/i, '']] as const; for (const [label, rule, unit] of rules) { const match = rule.exec(content); if (match) values.push({ label, value: Number(match[1]), unit }) } return values }

export function GrowthTrendPage() {
  const { eventId = '' } = useParams(); const currentMemberId = useAppStore((s) => s.currentMemberId); const { state, retry } = useHealthEventDetail(eventId)
  if (state.status === 'loading') return <main className="app-shell"><WebPageHeader fallback={`/health-tracking/${eventId}`} title="生长趋势详情" /><ListSkeleton /></main>
  if (state.status !== 'success' || state.data.eventDto.memberId !== currentMemberId) return <main className="app-shell"><WebPageHeader fallback="/health-tracking" title="生长趋势详情" /><StatusNotice action={<HohoButton onClick={retry}>重试</HohoButton>} title="生长数据不可用" tone="error">请确认当前孩子后重试。</StatusNotice></main>
  const points = state.data.records.flatMap((record) => measurements(record.content).map((value) => ({ ...value, date: record.occurredAt, age: record.ageAtOccurrenceMonths })))
  return <main className="app-shell"><WebPageHeader fallback={`/health-tracking/${eventId}`} title="生长趋势详情" /><div className="child-page-stack"><section className="growth-source"><strong>{state.data.member.name}的测量趋势</strong><p>参考 WS/T 423—2022《7岁以下儿童生长标准》，参考曲线不等于诊断。</p></section>{points.length ? <div className="growth-points">{points.map((point, index) => <article key={`${point.date}-${point.label}-${index}`}><span>{point.label}</span><strong>{point.value}{point.unit}</strong><small>{new Date(point.date).toLocaleDateString('zh-CN')} · {point.age == null ? '当时年龄未记录' : point.age < 12 ? `${point.age}个月` : `${Math.floor(point.age / 12)}岁${point.age % 12}个月`}</small><i style={{ width: `${Math.min(100, Math.max(10, point.value))}%` }} /></article>)}</div> : <StatusNotice title="还没有可绘制的测量点">在健康随记中写下“身高 92cm、体重 13kg”等原始测量值后，这里会按时间出现数据点。</StatusNotice>}<p className="child-supporting-note">身高别年龄、体重别年龄、BMI别年龄和头围别年龄只展示已有数据；缺失指标不会被推算。</p></div></main>
}
