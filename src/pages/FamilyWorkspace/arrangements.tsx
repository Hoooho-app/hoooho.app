import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowUpRight, Check, Plus } from 'lucide-react'
import { HohoButton } from '../../components/design-system/HohoButton'
import { HohoInput } from '../../components/design-system/HohoInput'
import { StatusNotice } from '../../components/design-system/StatusNotice'
import { ConfirmDialog } from '../../components/design-system/ConfirmDialog'
import { api, FamilyApiError, messageOf } from './api'
import { type WorkspaceModule } from './navigation'
import { arrangementDate, canonicalArrangement, chinaToday, type Arrangement, type ArrangementIntent, type ArrangementSnapshot } from './arrangement-model'

export function useFamilyArrangements(onUnauthorized: () => void) {
  const [snapshot, setSnapshot] = useState<ArrangementSnapshot>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [conflict, setConflict] = useState(false)
  const pending = useRef(false)
  const mounted = useRef(true)
  const unauthorized = useRef(onUnauthorized); unauthorized.current = onUnauthorized
  const fail = (cause: unknown) => {
    if (cause instanceof FamilyApiError && cause.status === 401) unauthorized.current()
    return messageOf(cause)
  }
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError('')
    try { const result = await api<ArrangementSnapshot>('/arrangements', undefined, signal); if (mounted.current && !signal?.aborted) { setSnapshot({ ...result, plans: result.plans.map(canonicalArrangement) }); setConflict(false) } }
    catch (cause) { if (mounted.current && !signal?.aborted) setError(fail(cause)) }
    finally { if (mounted.current && !signal?.aborted) setLoading(false) }
  }, [])
  useEffect(() => { mounted.current = true; const controller = new AbortController(); void load(controller.signal); return () => { mounted.current = false; controller.abort() } }, [load])
  const mutate = async (input: { action: 'save'; plan: Arrangement } | { action: 'delete'; id: string }) => {
    if (!snapshot || pending.current || conflict) return false
    pending.current = true; setBusy(true); setError('')
    try {
      const result = await api<ArrangementSnapshot>('/arrangements', { ...input, revision: snapshot.revision })
      if (mounted.current) setSnapshot({ ...result, plans: result.plans.map(canonicalArrangement) })
      return true
    } catch (cause) {
      if (mounted.current) { setError(fail(cause)); if (cause instanceof FamilyApiError && cause.status === 409) setConflict(true) }
      return false
    } finally { pending.current = false; if (mounted.current) setBusy(false) }
  }
  return { snapshot, error, loading, busy, conflict, load, mutate }
}
export type ArrangementStore = ReturnType<typeof useFamilyArrangements>

export function PageArrangements({ module, pageId, store, admin, intent, viewCalendar }: { module: WorkspaceModule; pageId: string; store: ArrangementStore; admin: boolean; intent?: ArrangementIntent; viewCalendar: (month: string) => void }) {
  const [editor, setEditor] = useState<Arrangement>()
  const [dated, setDated] = useState(false)
  const [notice, setNotice] = useState('')
  const [lastMonth, setLastMonth] = useState<string>()
  const [removing, setRemoving] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const handled = useRef<number>()
  const page = module.pages.find(item => item.id === pageId)!
  const plans = (store.snapshot?.plans || []).filter(item => item.module === module.id && item.page === pageId).sort((a, b) => a.month.localeCompare(b.month) || a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title, 'zh-CN'))
  const open = (plan?: Arrangement, month = chinaToday().slice(0, 7), date = '') => {
    const next = plan ? { ...plan } : { id: crypto.randomUUID(), module: module.id, page: pageId, title: '', month, startDate: date, endDate: date, status: 'pending' as const, owner: '', note: '' }
    setEditor(next); setDated(Boolean(next.startDate)); setNotice('')
  }
  useEffect(() => {
    if (!intent || handled.current === intent.key || (intent.id && !store.snapshot)) return
    const plan = intent.id ? store.snapshot?.plans.find(item => item.id === intent.id) : undefined
    handled.current = intent.key
    if (intent.id && !plan) { setNotice('这项安排已不存在，请重新查看月历。'); return }
    open(plan, intent.month, intent.date)
  }, [intent, store.snapshot])
  useEffect(() => { if (editor) { titleRef.current?.focus({ preventScroll: true }); titleRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' }) } }, [editor?.id])
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!editor) return
    if (await store.mutate({ action: 'save', plan: editor })) { setLastMonth(editor.month); setNotice('已保存到首页月历。'); setEditor(undefined) }
  }
  const remove = async () => {
    if (editor && await store.mutate({ action: 'delete', id: editor.id })) { setEditor(undefined); setRemoving(false); setNotice('已删除这项安排。') }
  }
  const change = (update: Partial<Arrangement>) => setEditor(previous => previous ? { ...previous, ...update } : previous)
  return <section className="family-arrangements" aria-label={`${page.title}的安排`}>
    <div className="family-arrangement-heading"><div><h2 className="hoho-text-card-title">本页安排{plans.length > 0 && ` · ${plans.length}`}</h2><p className="hoho-text-caption">汇总到首页月历，可只定月份。</p></div>{admin && !editor && <HohoButton size="small" variant="secondary" disabled={!store.snapshot || store.loading} onClick={() => open()}><Plus size={15} aria-hidden="true"/>添加安排</HohoButton>}</div>
    {store.error && <StatusNotice tone="error" title="安排暂未更新" action={<HohoButton size="small" variant="secondary" disabled={store.busy} onClick={() => void store.load()}>重新载入安排</HohoButton>}>{store.error}</StatusNotice>}
    {notice && <p role="status" className="family-arrangement-notice">{notice}</p>}
    {store.loading && <p role="status" className="hoho-text-caption">正在读取安排…</p>}
    {editor ? <form className="family-arrangement-form" onSubmit={event => void save(event)}>
      <p className="hoho-text-caption">{module.title} / {page.title}</p>
      <HohoInput ref={titleRef} label="安排名称" id="family-arrangement-title" value={editor.title} onChange={event => change({ title: event.target.value })} maxLength={120} required disabled={store.busy || !admin}/>
      <div className="family-arrangement-fields"><HohoInput label="安排月份" type="month" id="family-arrangement-month" value={editor.month} min="2000-01" max="2099-12" required disabled={store.busy || !admin} onChange={event => change({ month: event.target.value, startDate: '', endDate: '' })}/><HohoInput label="负责人（可选）" id="family-arrangement-owner" value={editor.owner} onChange={event => change({ owner: event.target.value })} maxLength={40} disabled={store.busy || !admin}/></div>
      <label className="family-arrangement-check"><input type="checkbox" checked={dated && Boolean(editor.startDate)} disabled={store.busy || !admin} onChange={event => { const next = event.target.checked; setDated(next); change({ startDate: next ? `${editor.month}-01` : '', endDate: next ? `${editor.month}-01` : '' }) }}/><span>指定日期或日期范围<small>不勾选时，归入“本月内 · 日期待定”。</small></span></label>
      {dated && Boolean(editor.startDate) && <div className="family-arrangement-fields"><HohoInput label="开始日期" id="family-arrangement-start" type="date" value={editor.startDate} required min="2000-01-01" max="2099-12-31" disabled={store.busy || !admin} onChange={event => change({ startDate: event.target.value, month: event.target.value.slice(0, 7), endDate: !editor.endDate || editor.endDate < event.target.value ? event.target.value : editor.endDate })}/><HohoInput label="结束日期" id="family-arrangement-end" type="date" value={editor.endDate} required min={editor.startDate} max="2099-12-31" disabled={store.busy || !admin} onChange={event => change({ endDate: event.target.value })}/></div>}
      <label className="hoho-field"><span className="hoho-text-label">准备事项与备注（可选）</span><textarea className="hoho-input" value={editor.note} rows={3} maxLength={2000} disabled={store.busy || !admin} onChange={event => change({ note: event.target.value })}/></label>
      <label className="family-arrangement-check"><input type="checkbox" checked={editor.status === 'done'} disabled={store.busy || !admin} onChange={event => change({ status: event.target.checked ? 'done' : 'pending' })}/><span>这项安排已完成</span></label>
      <div className="family-arrangement-actions">{admin && <HohoButton type="submit" size="small" loading={store.busy} disabled={store.conflict || !editor.title.trim() || store.loading}>保存安排</HohoButton>}<HohoButton variant="secondary" size="small" disabled={store.busy} onClick={() => setEditor(undefined)}>关闭</HohoButton>{admin && plans.some(item => item.id === editor.id) && <HohoButton variant="text" size="small" disabled={store.busy} onClick={() => setRemoving(true)}>删除安排</HohoButton>}</div>
    </form> : plans.length > 0 && <ul className="family-arrangement-list">{plans.map(plan => <li key={plan.id}><button type="button" onClick={() => open(plan)}><span>{plan.status === 'done' && <Check size={14} aria-label="已完成"/>}<strong>{plan.title}</strong><small>{plan.month} · {arrangementDate(plan)}{plan.owner && ` · ${plan.owner}`}{plan.status === 'done' && ' · 已完成'}</small></span><ArrowUpRight size={16} aria-hidden="true"/></button></li>)}</ul>}
    <HohoButton size="small" variant="text" onClick={() => viewCalendar(editor?.month || lastMonth || intent?.month || plans[0]?.month || chinaToday().slice(0, 7))}>查看首页月历<ArrowUpRight size={14} aria-hidden="true"/></HohoButton>
    <ConfirmDialog open={removing} title="删除这项安排？" description="删除后，首页月历中也会移除这项安排。" confirmLabel="删除安排" danger loading={store.busy} onCancel={() => setRemoving(false)} onConfirm={() => void remove()}/>
  </section>
}
