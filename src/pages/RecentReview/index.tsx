import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Download, SlidersHorizontal, Sprout, Bookmark } from 'lucide-react'
import { OrganizeHeader } from '../../features/organize/OrganizeHeader'
import { ProcessingState } from '../../components/design-system/ProcessingState'
import { BottomSheetSurface, HealthCard, HohoButton, StatusNotice, Typography } from '../../components/design-system'
import { FactBucketChart, FactDistribution } from '../../components/design-system/FactCharts'
import { useAppStore } from '../../store/useAppStore'
import { apiRequest, ApiRequestError } from '../../services/apiClient'
import { buildReview, reviewRange, timeLabel, type ReviewSources, type ReviewRow, type ReviewBucket } from './reviewModel'
import { buildReviewComparison, comparisonColumns, isVoucherReviewRange } from '../../features/review-snapshots/reviewComparison'
import { reviewSnapshotService, type ReviewSnapshot } from '../../features/review-snapshots/service'
import '../../features/case-continuity/cases.css'
import './recentReview.css'

type DataState = { scope: string; status: 'loading' } | { scope: string; status: 'error'; message: string } | { scope: string; status: 'ready'; data: ReviewSources }
const presets = [{ id: '7', title: '7天' }, { id: '30', title: '30天' }, { id: '180', title: '半年' }, { id: '365', title: '一年' }]
function ChartCard({ title, metric, note, children, onSource }: { title: string; metric: ReactNode; note: string; children: ReactNode; onSource: () => void }) {
  return <HealthCard className="review-card"><header><Typography variant="sectionTitle">{title}</Typography><button className="review-source" onClick={onSource}>记录明细</button></header><div className="review-metric">{metric}</div>{children}<Typography variant="caption">{note}</Typography></HealthCard>
}
function ReviewContent({ memberId, token, accountId }: { memberId: string; token: string; accountId: string }) {
  const location = useLocation(), query = new URLSearchParams(location.search), snapshotId = query.get('snapshot') ?? '', voucherId = query.get('voucher') ?? query.get('voucherId') ?? ''
  const scope = `${accountId}:${memberId}:${token}:${snapshotId}`, navigate = useNavigate(), exportRef = useRef<HTMLDivElement>(null)
  const currentName = useAppStore(s => s.members.find(m => m.id === memberId)?.name || s.profile?.nickname || '')
  const [frozen, setFrozen] = useState<ReviewSnapshot | null>(null), [view, setView] = useState<'charts' | 'comparison'>('charts')
  const name = frozen?.data.memberName ?? currentName
  const [savingSnapshot, setSavingSnapshot] = useState(false), [snapshotError, setSnapshotError] = useState(''), [libraryOpen, setLibraryOpen] = useState(false)
  const [reviewAccess, setReviewAccess] = useState<{ commercializationReady: boolean; included: boolean } | null>(null)
  const [library, setLibrary] = useState<ReviewSnapshot[]>([]), [libraryState, setLibraryState] = useState<'loading' | 'ready' | 'error'>('loading')
  const savingRef = useRef(false), requestRef = useRef<{ key: string; id: string } | null>(null)
  const [sourcesRead, setSourcesRead] = useState(0)
  const [state, setState] = useState<DataState>({ scope, status: 'loading' }), [revision, setRevision] = useState(0)
  const [preset, setPreset] = useState(voucherId ? '7' : '180'), [range, setRange] = useState(() => reviewRange(voucherId ? '7' : '180')), [custom, setCustom] = useState(false), [dates, setDates] = useState(range), [rangeError, setRangeError] = useState('')
  const [detail, setDetail] = useState<{ title: string; rows: ReviewRow[] } | null>(null), [exportMessage, setExportMessage] = useState('')
  const needsVoucher = Boolean(reviewAccess?.commercializationReady && !reviewAccess.included)
  useEffect(() => {
    const controller = new AbortController()
    void apiRequest<{ commercializationReady: boolean; products: Record<string, { included?: boolean }> }>('/api/care-journey/entitlements', { token, signal: controller.signal }).then(data => { if (!controller.signal.aborted) setReviewAccess({ commercializationReady: data.commercializationReady, included: Boolean(data.products['review-once']?.included) }) }).catch(() => {})
    return () => controller.abort()
  }, [token, accountId])
  useEffect(() => { const refresh = () => { if (!snapshotId && !savingRef.current) setRevision(r => r + 1) }; window.addEventListener('hoooho-data-changed', refresh); return () => window.removeEventListener('hoooho-data-changed', refresh) }, [snapshotId])
  useEffect(() => {
    const controller = new AbortController(); setState({ scope, status: 'loading' }); setSourcesRead(0); setDetail(null); setFrozen(null); setSnapshotError('')
    async function load() {
      try {
        if (snapshotId) {
          const saved = await reviewSnapshotService.get(snapshotId, token, controller.signal)
          if (saved.memberId !== memberId) throw new Error('这份回顾属于另一位孩子，请先切换孩子再查看')
          if (saved.data.version !== 1 || !saved.data.sources || !Number.isFinite(Date.parse(saved.data.capturedAt))) throw new Error('这份固定回顾暂时无法读取，请重试')
          if (!controller.signal.aborted) { setFrozen(saved); setRange({ start: saved.start, end: saved.end }); setPreset('snapshot'); setState({ scope, status: 'ready', data: saved.data.sources }) }
          return
        }
        const options = { token, signal: controller.signal }, path = `/api/members/${encodeURIComponent(memberId)}`
        const track = <T,>(promise: Promise<T>) => promise.then(value => { if (!controller.signal.aborted) setSourcesRead(n => n + 1); return value })
        const [index, cases, profiles, reminders] = await Promise.all([
          track(apiRequest<ReviewSources['index']>(`${path}/journal-index`, options)),
          track(apiRequest<ReviewSources['cases']>(`${path}/cases?timezone=Asia%2FShanghai`, options)),
          track(apiRequest<ReviewSources['profiles']>('/api/auth/profile-sections', options)),
          track(apiRequest<ReviewSources['reminders']>(`/api/medication-reminders?memberId=${encodeURIComponent(memberId)}`, options)),
        ])
        if (!controller.signal.aborted) setState({ scope, status: 'ready', data: { index, cases, profiles, reminders } })
      } catch (error) { if (!controller.signal.aborted) setState({ scope, status: 'error', message: error instanceof Error ? error.message : '回顾加载失败，请重试' }) }
    }
    if (memberId && token) void load()
    return () => controller.abort()
  }, [scope, memberId, token, revision, snapshotId])
  const model = useMemo(() => state.scope === scope && state.status === 'ready' ? buildReview(state.data, memberId, range.start, range.end, frozen ? new Date(frozen.data.capturedAt) : new Date()) : null, [state, scope, memberId, range, frozen])
  const comparison = useMemo(() => state.scope === scope && state.status === 'ready' ? buildReviewComparison(state.data, memberId, range.start, range.end, frozen ? new Date(frozen.data.capturedAt) : new Date()) : [], [state, scope, memberId, range, frozen])
  const source = (title: string, rows: ReviewRow[]) => setDetail({ title, rows: [...rows].sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id)) })
  const chart = (buckets: ReviewBucket[], label: string, unit: string, kind: 'line' | 'bar' = 'line', format?: (n: number) => string) => <FactBucketChart buckets={buckets} label={label} unit={unit} kind={kind} format={format} onBucket={i => source(`${label} · ${buckets[i].label}`, buckets[i].rows)} />
  function openCurrent() { navigate(location.pathname, { replace: true, state: location.state }); setPreset('180'); setRange(reviewRange('180')); setFrozen(null) }
  async function openLibrary() {
    setLibraryOpen(true); setLibraryState('loading')
    try { const saved = await reviewSnapshotService.list(token); if (useAppStore.getState().authUser?.id === accountId && useAppStore.getState().currentMemberId === memberId) { setLibrary(saved.filter(item => item.memberId === memberId)); setLibraryState('ready') } }
    catch { setLibraryState('error') }
  }
  async function saveSnapshot() {
    if (savingRef.current || !model || !model.recordCount || frozen || useAppStore.getState().authUser?.id !== accountId || useAppStore.getState().currentMemberId !== memberId) return
    if (needsVoucher && !voucherId) { navigate('/care-journey/exchange', { state: { returnTo: location.pathname } }); return }
    if (needsVoucher && voucherId && !isVoucherReviewRange(range.start, range.end)) { setSnapshotError('单次券适用于一个孩子连续7天，请先选择7天范围'); return }
    const usedVoucherId = needsVoucher ? voucherId : ''
    const key = `${memberId}:${range.start}:${range.end}:${usedVoucherId}`
    if (requestRef.current?.key !== key) requestRef.current = { key, id: crypto.randomUUID() }
    savingRef.current = true; setSavingSnapshot(true); setSnapshotError('')
    try {
      const saved = await reviewSnapshotService.create({ memberId, ...range, ...(usedVoucherId ? { voucherId: usedVoucherId } : {}), requestId: requestRef.current.id }, token)
      if (useAppStore.getState().authUser?.id !== accountId || useAppStore.getState().currentMemberId !== memberId) return
      navigate(`${location.pathname}?snapshot=${encodeURIComponent(saved.id)}`, { replace: true, state: location.state })
      setExportMessage('已保存固定回顾，可重复查看与导出')
    } catch (error) { setSnapshotError(error instanceof ApiRequestError ? error.message : '保存结果暂未确认，请重试；同一次保存不会重复核销') }
    finally { savingRef.current = false; setSavingSnapshot(false) }
  }
  function save() {
    if (!exportRef.current || !model || useAppStore.getState().authToken !== token || useAppStore.getState().authUser?.id !== accountId || useAppStore.getState().currentMemberId !== memberId) return
    const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
    const exported = exportRef.current.cloneNode(true) as HTMLElement
    for (const panel of exported.querySelectorAll('[role="tabpanel"]')) { panel.removeAttribute('aria-hidden'); panel.removeAttribute('aria-labelledby') }
    const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>近期情况回顾</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:780px;margin:24px auto;padding:20px;color:#263b37;background:#f5f7f6}.review-card{background:white;padding:20px;margin:16px 0;border:1px solid #dce4e1;border-radius:16px}h2{font-size:18px}p{color:#596b65;font-size:13px}.review-metric{font-size:28px;font-weight:600}.review-source{display:none}svg{width:100%;max-height:260px}svg text{font-size:11px;fill:#596b65}.hoho-chart-axis{stroke:#dce4e1}.hoho-chart-trace{stroke:#37816d}.hoho-chart-point{fill:#37816d}.hoho-chart-tone-0{stroke:#37816d;color:#37816d}.hoho-chart-tone-1{stroke:#6485a6;color:#6485a6}.hoho-chart-tone-2{stroke:#bc9a65;color:#bc9a65}.hoho-chart-tone-3{stroke:#7d8984;color:#7d8984}.hoho-fact-distribution{display:flex;gap:20px;align-items:center}.hoho-fact-distribution svg{width:112px}.hoho-fact-distribution figcaption{flex:1}.hoho-fact-distribution figcaption div{display:flex;justify-content:space-between}.review-ratio{display:flex;gap:16px}.review-ratio div{flex:1}.review-ratio meter{width:100%}.review-comparison{margin-top:24px}.review-comparison table{width:100%;border-collapse:collapse;table-layout:fixed}.review-comparison th,.review-comparison td{border:1px solid #dce4e1;padding:8px;text-align:left;vertical-align:top;font-size:12px;overflow-wrap:anywhere}.review-comparison article+article{border-top:1px solid #dce4e1}.review-comparison td p{white-space:pre-wrap}.review-comparison time{font-size:11px}button{display:none}@media print{.review-card{break-inside:avoid}}</style><h1>${escape(name)} · 近期情况回顾</h1><p>${range.start} 至 ${range.end} · 北京时间 · 基于已录入记录</p>${exported.innerHTML}<p>统计口径：症状相关事件按跟进事件合并，仅统计首次明确时间落在所选范围内的事件。无时间的记录不分配到日期。反应按明确关联记录去重，项目状态不代表每次反应已证实因果。夜间睡眠仅用已结束且时间完整的记录，缺失月份留空。奶量只汇总明确记录的瓶喂毫升数。用药比例为到期安排中有完成记录的比例，不等同于按时率。补剂与外用为记录条数。此文件为保存时的快照。</p></html>`
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' })), a = document.createElement('a'); a.href = url; a.download = `Hoooho-近期情况回顾-${range.start}-${range.end}.html`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setExportMessage('已保存图表回顾')
  }
  return <>
    <div className="continuity-scroll review-content">
      {state.scope === scope && state.status !== 'loading' && <>{!frozen && <div className="review-controls"><div role="group" aria-label="回顾范围">{presets.map(p => <button key={p.id} aria-pressed={preset === p.id} onClick={() => { setPreset(p.id); setRange(reviewRange(p.id)); setDetail(null); setSnapshotError('') }}>{p.title}</button>)}</div><HohoButton variant="text" onClick={() => { setDates(range); setRangeError(''); setCustom(true) }}><SlidersHorizontal size={16} />自定义</HohoButton></div>}
      <Typography variant="caption">{range.start} — {range.end} · 北京时间</Typography></>}
      {state.scope !== scope || state.status === 'loading' ? <ProcessingState title="正在整理近期情况回顾" steps={['读取健康与日常记录', '汇总统计指标', '生成图表']} step={state.scope === scope && sourcesRead === 4 ? 1 : 0} progress={{ completed: state.scope === scope ? sourcesRead : 0, total: 4 }} /> : state.status === 'error' ? <StatusNotice tone="error" title={state.message}><HohoButton variant="secondary" onClick={() => setRevision(r => r + 1)}>重试</HohoButton></StatusNotice> : model && <>
        <div className="review-snapshot-tools">
          {frozen ? <><div><Bookmark size={18} aria-hidden="true"/><span>已保存的固定回顾 · {new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(frozen.createdAt))}</span></div><Typography variant="caption">按保存时的资料呈现，可重复查看与导出，不随之后的编辑变化。{frozen.voucherConsumed === false ? '本次未消耗回顾券。' : ''}</Typography><HohoButton variant="text" onClick={openCurrent}>查看当前资料</HohoButton></> : <><div><Sprout size={18} aria-hidden="true"/><span>{voucherId ? '近期回顾单次券 · 一个孩子连续7天' : '保存这一段回顾'}</span></div><Typography variant="caption">保存后可在“已保存回顾”找回。{reviewAccess && !reviewAccess.commercializationReady ? '当前回顾与固定保存免费，待用券继续保留。' : reviewAccess?.included ? '当前资格已包含，不消耗待用券。' : needsVoucher ? '单次券适用于一个孩子连续7天，成功保存后核销，失败保留原券。' : '按本次资料保存为固定版本。'}</Typography><HohoButton variant="text" loading={savingSnapshot} disabled={!model.recordCount || Boolean(needsVoucher && voucherId && !isVoucherReviewRange(range.start, range.end))} onClick={() => void saveSnapshot()}>{needsVoucher ? voucherId ? '使用单次券保存' : '兑换回顾单次券' : '保存固定回顾'}</HohoButton></>}
          <HohoButton variant="text" onClick={() => void openLibrary()}>已保存回顾</HohoButton>
        </div>
        {snapshotError && <StatusNotice tone="error" title={snapshotError}/>}
        <div className="review-view-tabs" role="tablist" aria-label="回顾内容"><button id="review-charts-tab" role="tab" aria-selected={view === 'charts'} aria-controls="review-charts-panel" onClick={() => setView('charts')}>图表总览</button><button id="review-comparison-tab" role="tab" aria-selected={view === 'comparison'} aria-controls="review-comparison-panel" onClick={() => setView('comparison')}>记录对照</button></div>
        <div className="review-coverage"><span>{name}</span><span>{model.recordCount}条已录入记录</span><span>夜间睡眠覆盖 {model.sleepDays}/{model.totalDays}天</span></div>
        <div ref={exportRef} className="review-export" data-view={view}>
        <div id="review-charts-panel" role="tabpanel" aria-labelledby="review-charts-tab" aria-hidden={view !== 'charts'} className="review-charts">
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
        <section id="review-comparison-panel" role="tabpanel" aria-labelledby="review-comparison-tab" aria-hidden={view !== 'comparison'} className="review-comparison">
          <Typography variant="caption">同一天的记录放在一起核对。“暂无记录”不表示未发生，同日变化不代表存在因果关系。</Typography>
          {comparison.length ? comparison.map(item => <section className="review-comparison-day" key={item.day}><Typography variant="sectionTitle">{item.day}</Typography><div className="review-comparison-scroll" tabIndex={0} role="region" aria-label={`${item.day}的记录对照`}><table><thead><tr>{comparisonColumns.map(column => <th scope="col" key={column.id}>{column.label}</th>)}</tr></thead><tbody><tr>{comparisonColumns.map(column => <td key={column.id}>{item.columns[column.id].length ? item.columns[column.id].map(row => <article key={row.id}><time dateTime={row.at}>{new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(row.at))}</time><p>{row.title || row.detail || '记录'}</p><HohoButton variant="text" size="small" onClick={() => source(`${item.day} · ${column.label}`, [row])}>原记录</HohoButton></article>) : <span className="review-comparison-empty">暂无记录</span>}</td>)}</tr></tbody></table></div></section>) : <Typography variant="body">这个范围还没有可对照的明确时间记录。</Typography>}
        </section>
        </div>
        <details className="review-method"><summary>统计口径与记录覆盖</summary><p>基于已录入记录，不代表完整发生情况。症状相关事件按合并后的首次明确时间分组；观察结果为“未观察到”的记录不计入。全部记录中另有 {model.unknownSymptoms} 条症状相关记录未明确时间，不分配到本次日期范围。</p><p>过敏图按档案当前项目状态归类，同一关联记录只计一次；已明确项目不代表每次反应已证实因果。睡眠只统计已结束、起止时间完整的夜间记录。入睡时刻跨午夜连续排列，缺失段不连线。奶量不将母乳时长换算为毫升；补剂和外用仅计记录条数。</p></details>
        <HohoButton fullWidth variant="secondary" onClick={save}><Download size={18} />保存图表回顾</HohoButton>{exportMessage && <p role="status">{exportMessage}</p>}
      </>}
    </div>
    <BottomSheetSurface open={custom} label="回顾时间范围" title="选择时间范围" onClose={() => setCustom(false)} footer={<HohoButton fullWidth onClick={() => { try { if (state.status === 'ready') buildReview(state.data, memberId, dates.start, dates.end); else if (!dates.start || !dates.end || dates.start > dates.end || dates.end > reviewRange('7').end) throw new Error('请选择有效的时间范围'); setRange(dates); setPreset('custom'); setCustom(false); setDetail(null) } catch { setRangeError('请选择有效日期，结束日期不能晚于今天') } }}>应用</HohoButton>}>
      <div className="review-dates"><label className="hoho-field">开始日期<input className="hoho-input" type="date" max={dates.end} value={dates.start} onChange={e => setDates(d => ({ ...d, start: e.target.value }))} /></label><label className="hoho-field">结束日期<input className="hoho-input" type="date" min={dates.start} max={reviewRange('7').end} value={dates.end} onChange={e => setDates(d => ({ ...d, end: e.target.value }))} /></label></div>{rangeError && <p role="alert">{rangeError}</p>}
    </BottomSheetSurface>
    <BottomSheetSurface open={libraryOpen} label="已保存回顾" title="已保存回顾" onClose={() => setLibraryOpen(false)}>
      {libraryState === 'loading' ? <p role="status">正在读取已保存回顾…</p> : libraryState === 'error' ? <StatusNotice tone="error" title="固定回顾读取失败"><HohoButton variant="text" onClick={() => void openLibrary()}>重试</HohoButton></StatusNotice> : library.length ? library.map(item => <article className="review-snapshot-list-row" key={item.id}><div><Typography variant="cardTitle">{item.start} — {item.end}</Typography><Typography variant="caption">固定回顾 · 保存于{new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai' }).format(new Date(item.createdAt))}</Typography></div><HohoButton variant="text" onClick={() => { setLibraryOpen(false); navigate(`${location.pathname}?snapshot=${encodeURIComponent(item.id)}`, { state: location.state }) }}>查看</HohoButton></article>) : <p>这位孩子还没有已保存的固定回顾。</p>}
    </BottomSheetSurface>
    <BottomSheetSurface open={Boolean(detail)} label="图表记录明细" title={detail?.title ?? '记录明细'} onClose={() => setDetail(null)}>
      {detail?.rows.length ? detail.rows.map(row => <article className="review-detail" key={row.id}><Typography variant="caption">{new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(row.at))}</Typography><Typography variant="cardTitle">{row.title || '记录'}</Typography><Typography variant="body">{row.detail}</Typography>{row.eventId && <HohoButton variant="text" onClick={() => navigate(`/health-events?eventId=${encodeURIComponent(row.eventId!)}${row.recordId ? `&recordId=${encodeURIComponent(row.recordId)}` : ''}`)}>查看原始记录</HohoButton>}</article>) : <Typography variant="body">这个范围没有可展示的记录。</Typography>}
    </BottomSheetSurface>
  </>
}
export function RecentReviewPage() {
  const memberId = useAppStore(s => s.currentMemberId), token = useAppStore(s => s.authToken) ?? '', accountId = useAppStore(s => s.authUser?.id) ?? ''
  return <main className="app-shell continuity-page review-page"><OrganizeHeader title="近期情况回顾" /><ReviewContent key={`${accountId}:${memberId}`} memberId={memberId} token={token} accountId={accountId} /></main>
}
