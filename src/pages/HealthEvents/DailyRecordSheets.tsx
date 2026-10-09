import { useCallback, useEffect, useState } from 'react'
import { BottomSheetSurface, HohoButton, HohoInput } from '../../components/design-system'
import { dailyRecords, type DailyExtras, type DailyFields, type DailyInstance, type DailyKind, type DailyRule } from '../../services/dailyRecords'
import { DailyRecordScope, DailyRecordSettings, DailyTypeFields } from './DailyRecordSettings'

export function useDailyInstances(memberId: string, day: string, token: string, revision: number) {
  const key = `${memberId}:${day}:${token}`
  const [state, setState] = useState<{ key: string; items: DailyInstance[]; error: string; loading: boolean }>({ key, items: [], error: '', loading: true }), [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const abort = new AbortController(); setState({ key, items: [], error: '', loading: true })
    const load = () => dailyRecords.instances(memberId, day, token, abort.signal).then(value => { if (!abort.signal.aborted) setState({ key, items: value, error: '', loading: false }) }).catch(reason => { if (!abort.signal.aborted) setState(previous => ({ ...previous, key, loading: false, error: reason instanceof Error ? reason.message : '自动记录加载失败' })) })
    void load()
    // This refreshes server-created proposals; it never generates records in the browser.
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, 30_000)
    const visible = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', visible)
    return () => { abort.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', visible) }
  }, [memberId, day, token, revision, attempt, key])
  return { ...(state.key === key ? state : { items: [], error: '', loading: true }), retry: () => setAttempt(value => value + 1) }
}

function localInput(iso: string) { const date = new Date(iso); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) }
export function DailyRecordOrigin({ memberId, recordId, token }: { memberId: string; recordId: string; token: string }) {
  const [source, setSource] = useState<DailyInstance | null>(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(0), [manage, setManage] = useState(false)
  useEffect(() => { const abort = new AbortController(); setSource(null); setError(''); void dailyRecords.source(memberId, recordId, token, abort.signal).then(value => { if (!abort.signal.aborted) setSource(value) }).catch(() => { if (!abort.signal.aborted) setError('自动记录来源读取失败') }); return () => abort.abort() }, [memberId, recordId, token, attempt])
  if (error) return <p role="alert">{error}<HohoButton variant="ghost" onClick={() => setAttempt(value => value + 1)}>重试来源</HohoButton></p>
  if (!source) return null
  return <section className="daily-record-settings"><small>自动记录 · 已确认 · {source.name}</small><small>计划时间：{new Date(source.plannedAt).toLocaleString('zh-CN', { timeZone: source.timeZone, hour12: false })}（{source.timeZone}）</small><HohoButton variant="ghost" onClick={() => setManage(true)}>修改每天设置</HohoButton>{manage && <DailyManagementSheet memberId={memberId} token={token} initialKind={source.kind} onClose={() => setManage(false)} onChanged={() => setManage(false)} onLegacy={() => setManage(false)}/>}</section>
}
export function dailyPreview(item: DailyInstance) {
  const f = item.fields ?? {}
  return [f.bottleMl && `${f.bottleMl}mL`, f.foods, f.names, f.amount, f.unit, f.productName, f.medicationName, f.amountValue, f.amountUnit, item.kind === 'sleep' && `${f.kind === 'nap' ? '午睡' : '夜间睡眠'} · 通常醒来${f.endTime}`].filter(Boolean).join(' · ')
}

export function DailyInstanceSheet({ item, memberId, token, onClose, onChanged, onManage }: { item: DailyInstance; memberId: string; token: string; onClose: () => void; onChanged: () => void; onManage: (kind: DailyKind) => void }) {
  const [at, setAt] = useState(localInput(item.plannedAt)), [fields, setFields] = useState<DailyFields>(item.fields ?? {}), [awake, setAwake] = useState(false), [wake, setWake] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const act = async (action: 'confirm' | 'skip') => {
    if (busy) return
    setBusy(true); setError('')
    try {
      await dailyRecords.act(memberId, item.id, { action, ...(action === 'confirm' ? { occurredAt: new Date(at).toISOString(), fields, ...(item.kind === 'sleep' ? { sleepStatus: awake ? 'completed' as const : 'ongoing' as const, ...(awake ? { wakeAt: new Date(wake).toISOString() } : {}) } : {}) } : {}) }, token)
      onChanged(); onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '未保存，请重试') } finally { setBusy(false) }
  }
  return <BottomSheetSurface open label="自动记录详情" title={item.name} onClose={() => { if (!busy) onClose() }} footer={<div className="daily-record-footer"><HohoButton disabled={busy || item.status === 'confirming'} loading={busy} onClick={() => void act('confirm')}>确认已发生</HohoButton><HohoButton disabled={busy || item.status === 'confirming'} variant="secondary" onClick={() => void act('skip')}>本次未发生</HohoButton></div>}>
    <div className="daily-record-settings"><small>自动记录 · 未确认 · {item.timeZone}</small><p>确认真实发生后，才进入统计与就诊摘要。以下调整只改这次，不改每天设置。</p>
      <HohoInput label="实际发生时间（设备当地时间）" type="datetime-local" value={at} onChange={event => setAt(event.target.value)} />
      <DailyTypeFields kind={item.kind} value={fields} onChange={setFields} prefix="本次" />
      {item.kind === 'sleep' && <><label className="daily-record-check"><input type="checkbox" checked={awake} onChange={event => setAwake(event.target.checked)} />已经醒来（不按通常时间自动结束）</label>{awake && <HohoInput label="真实醒来时间" type="datetime-local" value={wake} onChange={event => setWake(event.target.value)} />}</>}
      {error && <p role="alert">{error}</p>}
      <HohoButton disabled={busy} variant="ghost" onClick={() => onManage(item.kind)}>修改每天设置（不改这次）</HohoButton>
    </div>
  </BottomSheetSurface>
}

export function DailyBatchSheet({ items, memberId, token, onClose, onChanged }: { items: DailyInstance[]; memberId: string; token: string; onClose: () => void; onChanged: () => void }) {
  const pending = items.filter(item => item.status === 'unconfirmed')
  const [selected, setSelected] = useState<string[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const confirm = async () => {
    if (busy || !selected.length) return
    setBusy(true); setError('')
    try { for (const id of selected) { await dailyRecords.act(memberId, id, { action: 'confirm' }, token); setSelected(values => values.filter(value => value !== id)) } onChanged(); onClose() }
    catch (reason) { onChanged(); setError(reason instanceof Error ? reason.message : '部分条目确认失败，已成功的不会重复确认') }
    finally { setBusy(false) }
  }
  return <BottomSheetSurface open label="核对自动记录" title="核对今天的自动记录" onClose={() => { if (!busy) onClose() }} footer={<HohoButton fullWidth loading={busy} disabled={busy || !selected.length} onClick={() => void confirm()}>确认选中的{selected.length}项已发生</HohoButton>}><div className="daily-record-settings"><p>逐项核对名称、时间与用量。不确定的项目不勾选；需要改时间或内容，请先打开对应条目。</p>{pending.map(item => <label className="daily-batch-item" key={item.id}><input disabled={busy} type="checkbox" checked={selected.includes(item.id)} onChange={event => setSelected(values => event.target.checked ? [...values, item.id] : values.filter(id => id !== item.id))} /><span>{item.name} · {new Date(item.plannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}<small>{dailyPreview(item) || '到点建议，确认前不是真实记录'}</small></span></label>)}{error && <p role="alert">{error}</p>}</div></BottomSheetSurface>
}

function RuleEditor({ kind, memberId, token, onSaved }: { kind: DailyKind; memberId: string; token: string; onSaved: () => void }) {
  const [input, setInput] = useState<DailyExtras>({}), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const save = async () => { if (!input.dailySettings || busy) return; setBusy(true); setError(''); try { await dailyRecords.save(memberId, input.dailySettings, token); onSaved() } catch (reason) { setError(reason instanceof Error ? reason.message : '设置未保存') } finally { setBusy(false) } }
  return <DailyRecordScope.Provider value={{ memberId, token, day: '', input, onChange: setInput }}><DailyRecordSettings kind={kind} />{error && <p role="alert">{error}</p>}<HohoButton fullWidth disabled={!input.dailySettings || busy} loading={busy} onClick={() => void save()}>保存每天设置</HohoButton></DailyRecordScope.Provider>
}

export function DailyManagementSheet({ memberId, token, initialKind, onClose, onChanged, onLegacy }: { memberId: string; token: string; initialKind?: DailyKind; onClose: () => void; onChanged: () => void; onLegacy: () => void }) {
  const [rules, setRules] = useState<DailyRule[]>([]), [kind, setKind] = useState<DailyKind | undefined>(initialKind), [error, setError] = useState(''), [loading, setLoading] = useState(true), [version, setVersion] = useState(0)
  const load = useCallback(() => setVersion(value => value + 1), [])
  useEffect(() => { const abort = new AbortController(); setLoading(true); setError(''); void dailyRecords.settings(memberId, token, abort.signal).then(value => { if (!abort.signal.aborted) setRules(value) }).catch(reason => { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : '设置加载失败') }).finally(() => { if (!abort.signal.aborted) setLoading(false) }); return () => abort.abort() }, [memberId, token, version])
  return <BottomSheetSurface open label="每天记录设置" title={kind ? '修改每天设置' : '每天自动记录'} onClose={onClose}><div className="daily-record-settings">{kind ? <><HohoButton variant="ghost" onClick={() => setKind(undefined)}>返回设置列表</HohoButton><RuleEditor key={`${kind}:${version}`} memberId={memberId} token={token} kind={kind} onSaved={() => { onChanged(); setKind(undefined); load() }} /></> : <>{loading && <p role="status">正在加载…</p>}{error && <p role="alert">{error}<HohoButton variant="secondary" onClick={load}>重试</HohoButton></p>}{!loading && !error && !rules.length && <p>在各记录表单中开启第一项，再按需添加。尚未开启每天自动记录。</p>}{rules.map(rule => <HohoButton key={rule.id} variant="secondary" onClick={() => setKind(rule.kind)}>{rule.slots.map(slot => slot.name).filter(Boolean).join('、') || '已删除的每天设置'} · {rule.enabled ? '启用' : '暂停'}</HohoButton>)}<HohoButton variant="ghost" onClick={onLegacy}>原日常作息设置（仅计划）</HohoButton></>}</div></BottomSheetSurface>
}
