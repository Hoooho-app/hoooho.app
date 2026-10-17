import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, SlidersHorizontal } from 'lucide-react'
import { MainAppHeader } from '../../components/navigation'
import { BottomSheetSurface, HealthCard, HohoButton, StatusNotice, Typography } from '../../components/design-system'
import { FactBucketChart, FactDistribution } from '../../components/design-system/FactCharts'
import { useAppStore } from '../../store/useAppStore'
import { apiRequest } from '../../services/apiClient'
import { buildReview, reviewRange, timeLabel, type ReviewSources, type ReviewRow, type ReviewBucket } from './reviewModel'
import '../../features/case-continuity/cases.css'
import './recentReview.css'

type DataState = { scope: string; status: 'loading' } | { scope: string; status: 'error'; message: string } | { scope: string; status: 'ready'; data: ReviewSources }
const presets = [{ id: '7', title: '7天' }, { id: '30', title: '30天' }, { id: '180', title: '半年' }, { id: '365', title: '一年' }]
function ChartCard({ title, metric, note, children, onSource }: { title: string; metric: ReactNode; note: string; children: ReactNode; onSource: () => void }) {
  return <HealthCard className="review-card"><header><Typography variant="sectionTitle">{title}</Typography><button className="review-source" onClick={onSource}>记录明细</button></header><div className="review-metric">{metric}</div>{children}<Typography variant="caption">{note}</Typography></HealthCard>
}
function ReviewContent({ memberId, token, accountId }: { memberId: string; token: string; accountId: string }) {
  const scope = `${accountId}:${memberId}:${token}`, navigate = useNavigate(), exportRef = useRef<HTMLDivElement>(null)
  const name = useAppStore(s => s.members.find(m => m.id === memberId)?.name || s.profile?.nickname || '')
  const [state, setState] = useState<DataState>({ scope, status: 'loading' }), [revision, setRevision] = useState(0)
  const [preset, setPreset] = useState('180'), [range, setRange] = useState(() => reviewRange('180')), [custom, setCustom] = useState(false), [dates, setDates] = useState(range), [rangeError, setRangeError] = useState('')
  const [detail, setDetail] = useState<{ title: string; rows: ReviewRow[] } | null>(null), [exportMessage, setExportMessage] = useState('')
  useEffect(() => { const refresh = () => setRevision(r => r + 1); window.addEventListener('hoooho-data-changed', refresh); return () => window.removeEventListener('hoooho-data-changed', refresh) }, [])
  useEffect(() => {
    const controller = new AbortController(); setState({ scope, status: 'loading' }); setDetail(null)
    async function load() {
      try {
        const options = { token, signal: controller.signal }, path = `/api/members/${encodeURIComponent(memberId)}`
        const [index, cases, profiles, reminders] = await Promise.all([
          apiRequest<ReviewSources['index']>(`${path}/journal-index`, options),
          apiRequest<ReviewSources['cases']>(`${path}/cases?timezone=Asia%2FShanghai`, options),
          apiRequest<ReviewSources['profiles']>('/api/auth/profile-sections', options),
          apiRequest<ReviewSources['reminders']>(`/api/medication-reminders?memberId=${encodeURIComponent(memberId)}`, options),
        ])
        if (!controller.signal.aborted) setState({ scope, status: 'ready', data: { index, cases, profiles, reminders } })
      } catch (error) { if (!controller.signal.aborted) setState({ scope, status: 'error', message: error instanceof Error ? error.message : '回顾加载失败，请重试' }) }
    }
    if (memberId && token) void load()
    return () => controller.abort()
  }, [scope, memberId, token, revision])
  const model = useMemo(() => state.scope === scope && state.status === 'ready' ? buildReview(state.data, memberId, range.start, range.end) : null, [state, scope, memberId, range])
  const source = (title: string, rows: ReviewRow[]) => setDetail({ title, rows: [...rows].sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id)) })
  const chart = (buckets: ReviewBucket[], label: string, unit: string, kind: 'line' | 'bar' = 'line', format?: (n: number) => string) => <FactBucketChart buckets={buckets} label={label} unit={unit} kind={kind} format={format} onBucket={i => source(`${label} · ${buckets[i].label}`, buckets[i].rows)} />
  function save() {
    if (!exportRef.current || !model || useAppStore.getState().authToken !== token || useAppStore.getState().authUser?.id !== accountId || useAppStore.getState().currentMemberId !== memberId) return
    const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
    const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>近期情况回顾</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:780px;margin:24px auto;padding:20px;color:#263b37;background:#f5f7f6}.review-card{background:white;padding:20px;margin:16px 0;border:1px solid #dce4e1;border-radius:16px}h2{font-size:18px}p{color:#596b65;font-size:13px}.review-metric{font-size:28px;font-weight:600}.review-source{display:none}svg{width:100%;max-height:260px}svg text{font-size:11px;fill:#596b65}.hoho-chart-axis{stroke:#dce4e1}.hoho-chart-trace{stroke:#37816d}.hoho-chart-point{fill:#37816d}.hoho-chart-tone-0{stroke:#37816d;color:#37816d}.hoho-chart-tone-1{stroke:#6485a6;color:#6485a6}.hoho-chart-tone-2{stroke:#bc9a65;color:#bc9a65}.hoho-chart-tone-3{stroke:#7d8984;color:#7d8984}.hoho-fact-distribution{display:flex;gap:20px;align-items:center}.hoho-fact-distribution svg{width:112px}.hoho-fact-distribution figcaption{flex:1}.hoho-fact-distribution figcaption div{display:flex;justify-content:space-between}.review-ratio{display:flex;gap:16px}.review-ratio div{flex:1}.review-ratio meter{width:100%}button{display:none}@media print{.review-card{break-inside:avoid}}</style><h1>${escape(name)} · 近期情况回顾</h1><p>${range.start} 至 ${range.end} · 北京时间 · 基于已录入记录</p>${exportRef.current.innerHTML}<p>统计口径：症状相关事件按跟进事件合并，仅统计首次明确时间落在所选范围内的事件。无时间的记录不分配到日期。反应按明确关联记录去重，项目状态不代表每次反应已证实因果。夜间睡眠仅用已结束且时间完整的记录，缺失月份留空。奶量只汇总明确记录的瓶喂毫升数。用药比例为到期安排中有完成记录的比例，不等同于按时率。补剂与外用为记录条数。此文件为保存时的快照。</p></html>`
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' })), a = document.createElement('a'); a.href = url; a.download = `Hoooho-近期情况回顾-${range.start}-${range.end}.html`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setExportMessage('已保存图表回顾')
  }
  return <>
    <div className="continuity-scroll review-content">
      <div className="review-controls"><div role="group" aria-label="回顾范围">{presets.map(p => <button key={p.id} aria-pressed={preset === p.id} onClick={() => { setPreset(p.id); setRange(reviewRange(p.id)); setDetail(null) }}>{p.title}</button>)}</div><HohoButton variant="text" onClick={() => { setDates(range); setRangeError(''); setCustom(true) }}><SlidersHorizontal size={16} />自定义</HohoButton></div>
      <Typography variant="caption">{range.start} — {range.end} · 北京时间</Typography>
      {state.scope !== scope || state.status === 'loading' ? <p role="status">正在整理图表…</p> : state.status === 'error' ? <StatusNotice tone="error" title={state.message}><HohoButton variant="secondary" onClick={() => setRevision(r => r + 1)}>重试</HohoButton></StatusNotice> : model && <>
        <div className="review-coverage"><span>{name}</span><span>{model.recordCount}条已录入记录</span><span>夜间睡眠覆盖 {model.sleepDays}/{model.totalDays}天</span></div>
        <div ref={exportRef} className="review-charts">
          <ChartCard title="症状相关事件" metric={<>{model.symptoms.length}<small>组</small></>} note="按合并后的事件首次记录时间计数" onSource={() => source('症状相关事件', model.symptoms)}>
            {chart(model.symptomSeries, '症状相关事件', '组', 'bar')}
            {model.kinds.length > 0 && <FactDistribution showPercent values={model.kinds.map(k => ({ label: k.label, count: k.rows.length }))} unit="组事件" />}
          </ChartCard>
          <ChartCard title="过敏反应记录" metric={<>{model.allergy.reduce((n, a) => n + a.rows.length, 0)}<small>次</small></>} note="仅计已明确关联的反应；按项目当前状态分组" onSource={() => source('过敏反应记录', model.allergy.flatMap(a => a.rows))}>
            <FactDistribution showPercent values={model.allergy.map(a => ({ label: a.label, count: a.rows.length }))} unit="次反应记录" />
          </ChartCard>
          <ChartCard title="入睡规律" metric={<>{model.sleepSpreadMinutes ?? '—'}<small>分钟波动</small></>} note="中间50%入睡时刻的跨度；越小越集中，折线为分段中位数" onSource={() => source('夜间睡眠', model.sleepRows)}>{chart(model.bedtime, '入睡时刻', '时刻', 'line', timeLabel)}</ChartCard>
          <ChartCard title="夜间睡眠时长" metric={<>{model.sleepRows.length}<small>次完整记录</small></>} note="每段内单次夜间睡眠的平均时长；不含午睡和进行中记录" onSource={() => source('夜间睡眠', model.sleepRows)}>{chart(model.sleepDuration, '单次夜间睡眠时长', '小时')}</ChartCard>
          <ChartCard title="已记录奶量" metric={<>{Math.round(model.milkTotal).toLocaleString()}<small>mL</small></>} note="仅汇总有明确毫升数的瓶喂记录；缺失处留空" onSource={() => source('已记录奶量', model.milk)}>{chart(model.milkSeries, '已记录奶量合计', 'mL', 'bar')}</ChartCard>
          <ChartCard title="用药安排执行" metric={<>{model.medicationPercent === null ? '—' : `${model.medicationPercent}%`}<small>有完成记录</small></>} note="仅统计所选范围内已到期的用药安排；不等同于按时率" onSource={() => source('用药安排执行', [...model.medicationDone, ...model.medicationUnrecorded])}>
            {model.medicationTotal ? <FactDistribution showPercent values={[{ label: '已完成', count: model.medicationDone.length }, { label: '尚无执行记录', count: model.medicationUnrecorded.length }]} unit="次安排" /> : <Typography variant="caption">暂无可统计的到期用药安排</Typography>}
          </ChartCard>
          <ChartCard title="补剂与外用照护" metric={<>{model.supplements.length + model.topical.length}<small>条记录</small></>} note="按实际录入条数统计，不推算完成率" onSource={() => source('补剂与外用照护', [...model.supplements, ...model.topical])}><div className="review-ratio">{[{ label: '补剂', rows: model.supplements }, { label: '外用照护', rows: model.topical }].map(a => <div key={a.label}><span>{a.label} · {a.rows.length}条</span><meter min={0} max={Math.max(1, model.supplements.length, model.topical.length)} value={a.rows.length}>{a.rows.length}</meter></div>)}</div></ChartCard>
        </div>
        <details className="review-method"><summary>统计口径与记录覆盖</summary><p>基于已录入记录，不代表完整发生情况。症状相关事件按合并后的首次明确时间分组；观察结果为“未观察到”的记录不计入。全部记录中另有 {model.unknownSymptoms} 条症状相关记录未明确时间，不分配到本次日期范围。</p><p>过敏图按档案当前项目状态归类，同一关联记录只计一次；已明确项目不代表每次反应已证实因果。睡眠只统计已结束、起止时间完整的夜间记录。入睡时刻跨午夜连续排列，缺失段不连线。奶量不将母乳时长换算为毫升；补剂和外用仅计记录条数。</p></details>
        <HohoButton fullWidth variant="secondary" onClick={save}><Download size={18} />保存图表回顾</HohoButton>{exportMessage && <p role="status">{exportMessage}</p>}
      </>}
    </div>
    <BottomSheetSurface open={custom} label="回顾时间范围" title="选择时间范围" onClose={() => setCustom(false)} footer={<HohoButton fullWidth onClick={() => { try { if (state.status === 'ready') buildReview(state.data, memberId, dates.start, dates.end); else if (!dates.start || !dates.end || dates.start > dates.end || dates.end > reviewRange('7').end) throw new Error('请选择有效的时间范围'); setRange(dates); setPreset('custom'); setCustom(false); setDetail(null) } catch { setRangeError('请选择有效日期，结束日期不能晚于今天') } }}>应用</HohoButton>}>
      <div className="review-dates"><label className="hoho-field">开始日期<input className="hoho-input" type="date" max={dates.end} value={dates.start} onChange={e => setDates(d => ({ ...d, start: e.target.value }))} /></label><label className="hoho-field">结束日期<input className="hoho-input" type="date" min={dates.start} max={reviewRange('7').end} value={dates.end} onChange={e => setDates(d => ({ ...d, end: e.target.value }))} /></label></div>{rangeError && <p role="alert">{rangeError}</p>}
    </BottomSheetSurface>
    <BottomSheetSurface open={Boolean(detail)} label="图表记录明细" title={detail?.title ?? '记录明细'} onClose={() => setDetail(null)}>
      {detail?.rows.length ? detail.rows.map(row => <article className="review-detail" key={row.id}><Typography variant="caption">{new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(row.at))}</Typography><Typography variant="cardTitle">{row.title || '记录'}</Typography><Typography variant="body">{row.detail}</Typography>{row.eventId && <HohoButton variant="text" onClick={() => navigate(`/health-events?eventId=${encodeURIComponent(row.eventId!)}${row.recordId ? `&recordId=${encodeURIComponent(row.recordId)}` : ''}`)}>查看原始记录</HohoButton>}</article>) : <Typography variant="body">这个范围没有可展示的记录。</Typography>}
    </BottomSheetSurface>
  </>
}
export function RecentReviewPage() {
  const memberId = useAppStore(s => s.currentMemberId), token = useAppStore(s => s.authToken) ?? '', accountId = useAppStore(s => s.authUser?.id) ?? ''
  return <main className="app-shell continuity-page review-page"><MainAppHeader title="近期情况回顾" /><ReviewContent key={`${accountId}:${memberId}`} memberId={memberId} token={token} accountId={accountId} /></main>
}
