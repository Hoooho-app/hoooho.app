import { useEffect, useRef, useState } from 'react'
import { expiryCountdown } from '../../../shared/workflow-expiry.mjs'
import { HohoButton } from '../../components/design-system/HohoButton'
import { ApiRequestError } from '../../services/apiClient'
import { opsApiRequest } from '../../services/opsAuth'
import { useResource } from './Modules'
import './workflow-expiry.css'

const endpoint = '/api/ops/workflow/expiry'
type Asset = { id: string; title: string; short: string; scope: 'shared' | 'project' | 'build'; steps?: string[]; nodes?: string[]; source: string; href: string; note: string; renewal?: boolean; onlyWhenRecorded?: boolean }
type Target = { asset: string; project: string | null; version: string | null; build: string | null }
type Record = Target & { date: string | null; exactAt: string | null; checkedOn: string | null; source: 'platform' | 'manual' | null; revision: string | null }
type Expiries = { assets: Asset[]; records: Record[] }
type Row = Record & { definition: Asset }
type Binding = { node?: string; step?: string; project?: string; round?: { version: string; build: string | null } | null }
const keyOf = (row: Target) => [row.asset, row.project, row.version, row.build].join(':')
const clock = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'medium', timeStyle: 'medium' })

export function useWorkflowExpiry() {
  const resource = useResource<Expiries>(endpoint)
  const [now, setNow] = useState(() => new Date())
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)
  useEffect(() => {
    const tick = () => setNow(new Date())
    const timer = window.setInterval(tick, 15_000)
    document.addEventListener('visibilitychange', tick)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick) }
  }, [])
  async function save(row: Row, date: string | null) {
    if (busy.current) throw new Error('正在保存另一个日期，请稍后重试。')
    const { asset, project, version, build, revision } = row
    busy.current = true
    setSaving(true)
    try {
      const result = await opsApiRequest<Expiries>(endpoint, { token: resource.token, method: 'POST', body: { asset, project, version, build, revision, date } })
      resource.setData(result)
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'WORKFLOW_EXPIRY_CONFLICT') resource.reload()
      throw error
    } finally { busy.current = false; setSaving(false) }
  }
  return { data: resource.data, now, error: resource.error, loading: resource.loading, reload: resource.reload, saving, save }
}

export type WorkflowExpiryResource = ReturnType<typeof useWorkflowExpiry>

export function expiryRows(data: Expiries | null, binding: Binding): Row[] {
  if (!data) return []
  return data.assets.flatMap(definition => {
    if (!((binding.node && definition.nodes?.includes(binding.node)) || (binding.step && definition.steps?.includes(binding.step)))) return []
    const { id: asset, scope } = definition
    const project = scope === 'shared' ? null : binding.project ?? 'hoooho'
    const matching = data.records.filter(record => record.asset === asset && record.project === project)
    if (definition.onlyWhenRecorded && !matching.length) return []
    const row = (version: string | null = null, build: string | null = null): Row => ({
      definition,
      ...(matching.find(record => record.version === version && record.build === build) ?? { asset, project, version, build, date: null, exactAt: null, checkedOn: null, source: null, revision: null }),
    })
    if (scope !== 'build') return [row()]
    if (binding.round !== undefined) return [row(binding.round?.version ?? null, binding.round?.build ?? null)]
    return matching.length ? matching.map(record => ({ definition, ...record })) : [row()]
  })
}

function ExpiryValue({ row, now }: { row: Row; now: Date }) {
  const remaining = expiryCountdown(row.date, row.exactAt, now, row.definition.renewal)
  return <span className="ops-expiry-value">
    {row.date ? <><time dateTime={row.date}>{row.date}</time><span className="ops-expiry-count" data-tone={remaining.tone}>{remaining.label}</span></>
      : <span aria-label="日期未核实" className="ops-expiry-count" data-tone="unknown">—</span>}
  </span>
}

export function ExpiryBadges({ rows, now }: { rows: Row[]; now: Date }) {
  if (!rows.length) return null
  const firstPerAsset = rows.filter((row, index) => rows.findIndex(item => item.asset === row.asset) === index)
  return <span className="ops-expiry-badges">
    {firstPerAsset.map(row => <span key={keyOf(row)} className="ops-expiry-badge">
      <span>{row.definition.short}{row.build ? ` ${row.build}` : ''}</span><ExpiryValue row={row} now={now} />
    </span>)}
  </span>
}

function ExpiryEditor({ row, resource }: { row: Row; resource: WorkflowExpiryResource }) {
  const [draft, setDraft] = useState<{ date: string; revision: string | null } | null>(null)
  const [message, setMessage] = useState(''), [error, setError] = useState('')
  const editable = row.definition.scope !== 'build' || !!row.build
  const changed = draft && draft.revision !== row.revision
  const disabled = resource.loading || !!resource.error || resource.saving
  const edit = () => { setDraft({ date: row.date ?? '', revision: row.revision }); setError(''); setMessage('') }
  return <div className="ops-expiry-row">
    <div className="ops-expiry-row-head"><strong>{row.definition.title}{row.build ? ` · ${row.version} (${row.build})` : ''}</strong><ExpiryValue row={row} now={resource.now} /></div>
    <p>{row.definition.note}{!editable && ' 确认上传回执并登记构建号后可填写。'}</p>
    <div className="ops-expiry-meta">
      <a href={row.definition.href} target="_blank" rel="noreferrer">{row.definition.source} ↗</a>
      {row.checkedOn && <span>{row.source === 'manual' ? '手动更新' : '核对于'} <time dateTime={row.checkedOn}>{row.checkedOn}</time></span>}
      {row.exactAt && <span>截止（北京）：<time dateTime={row.exactAt}>{clock.format(new Date(row.exactAt))}</time></span>}
      {editable && !draft && <button type="button" className="ops-expiry-edit" disabled={disabled} onClick={edit}>{row.date ? '更新日期' : '填写日期'}</button>}
    </div>
    {draft && <form className="ops-expiry-form" onSubmit={event => {
      event.preventDefault()
      if (disabled || changed) return
      setError('')
      void resource.save(row, draft.date || null).then(() => { setDraft(null); setMessage('日期已保存。') }).catch(cause => setError(cause instanceof Error ? cause.message : '保存失败，请重试。'))
    }}>
      <label>{row.definition.title}<input type="date" min="2000-01-01" max="9999-12-31" value={draft.date} disabled={resource.saving} onChange={event => setDraft({ ...draft, date: event.target.value })} /></label>
      <HohoButton variant="secondary" type="submit" disabled={disabled || !!changed}>保存日期</HohoButton>
      <button className="ops-expiry-edit" type="button" disabled={resource.saving} onClick={() => { setDraft(null); setError('') }}>取消</button>
      <small>未核实可留空。</small>
      {changed && <button type="button" className="ops-expiry-edit" onClick={edit}>按最新记录重新填写</button>}
    </form>}
    {error && <p className="ops-form-error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
  </div>
}

export function ExpiryDetails({ rows, resource }: { rows: Row[]; resource: WorkflowExpiryResource }) {
  if (!rows.length) return null
  return <section className="ops-expiry-section" aria-label="到期与续订">
    <h3>到期与续订</h3>
    {rows.map(row => <ExpiryEditor row={row} resource={resource} key={keyOf(row)} />)}
  </section>
}
