import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { HohoButton, HohoInput, HohoToggle } from '../../components/design-system'
import { useAppStore } from '../../store/useAppStore'
import { dailyRecords, type DailyExtras, type DailyFields, type DailyKind, type DailySlot, type DailyInstance } from '../../services/dailyRecords'
import './DailyRecordSettings.css'

export const DailyRecordScope = createContext<{ memberId: string; token: string; day: string; input: DailyExtras; onChange: (input: DailyExtras) => void; onReady?: (ready: boolean) => void } | null>(null)
const suggestions: Record<DailyKind, string> = { feeding: '早奶', complementary: '辅食', meal: '早餐', snack: '零食', supplement: '补剂', sleep: '夜间睡眠', bowel: '排便', topical: '涂抹', medication: '用药' }
const fields: Record<DailyKind, Array<[string, string, 'text' | 'number' | 'time' | 'date']>> = {
  feeding: [['bottleMl', '奶量（mL）', 'number']],
  complementary: [['foods', '食物内容', 'text'], ['amount', '份量（选填）', 'text']], meal: [['foods', '食物内容', 'text'], ['amount', '份量（选填）', 'text']], snack: [['foods', '食物内容', 'text'], ['amount', '份量（选填）', 'text']],
  supplement: [['names', '补剂名称', 'text'], ['amount', '用量', 'text']],
  sleep: [['endTime', '通常醒来', 'time']], bowel: [],
  topical: [['productName', '涂抹产品', 'text'], ['bodyLocations', '部位（选填）', 'text'], ['amount', '用量（选填）', 'text']],
  medication: [['medicationName', '药物名称', 'text'], ['amountValue', '剂量', 'number'], ['amountUnit', '单位', 'text'], ['endDate', '结束日期', 'date']]
}
export function DailyTypeFields({ kind, value, onChange, prefix = '' }: { kind: DailyKind; value: DailyFields; onChange: (value: DailyFields) => void; prefix?: string }) {
  const change = (key: string, field: string | number | boolean) => onChange({ ...value, [key]: field })
  const select = (key: string, label: string, options: Array<[string, string]>) => <label>{label}<select aria-label={`${prefix}${label}`} value={String(value[key] ?? '')} onChange={event => change(key, event.target.value)}><option value="">请选择</option>{options.map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label>
  return <div className="daily-record-fields">
    {kind === 'feeding' && select('feedingMethod', '喂养方式', [['breast', '母乳'], ['formula', '配方奶'], ['expressed', '瓶喂母乳'], ['mixed', '混合喂养']])}
    {kind === 'sleep' && select('kind', '睡眠类型', [['night', '夜间睡眠'], ['nap', '午睡']])}
    {kind === 'supplement' && select('unit', '单位', [['滴', '滴'], ['毫升', '毫升'], ['粒', '粒'], ['袋', '袋']])}
    {kind === 'medication' && select('mode', '用药类型', [['fixed', '固定用药'], ['as_needed', '按需用药（不自动执行）']])}
    {kind === 'medication' && value.mode === 'as_needed' && <small role="alert">按需用药不能开启每天自动记录；本次实际用药仍按原表单记录。</small>}
    {kind === 'medication' && select('administrationRoute', '途径', [['oral', '口服'], ['topical', '外用'], ['nebulized', '雾化'], ['inhaled', '吸入'], ['nasal', '鼻用'], ['ophthalmic', '眼用'], ['other', '其他']])}
    {kind === 'topical' && select('kind', '涂抹类型', [['skincare', '护肤'], ['external_medication', '外用药物'], ['other', '其他']])}
    {fields[kind].filter(([key]) => !(kind === 'feeding' && value.feedingMethod === 'breast' && key === 'bottleMl')).map(([key, label, type]) => <HohoInput key={key} id={`daily-${prefix}-${key}`} label={label} aria-label={`${prefix}${label}`} type={type} maxLength={1000} value={String(value[key] ?? '')} onChange={event => change(key, event.target.value)} />)}
    {kind === 'medication' && <label className="daily-record-check"><input type="checkbox" checked={value.untilClosed === true} onChange={event => onChange({ ...value, untilClosed: event.target.checked, ...(event.target.checked ? { endDate: '' } : {}) })} />持续至主动关闭</label>}
    {kind === 'bowel' && <small>不复制本次的形态、颜色、疼痛或照片；到点后仍需确认。</small>}
  </div>
}
export function DailySaveText() {
  const input = useContext(DailyRecordScope)?.input.dailySettings
  return <>{input ? input.revision > 0 ? '保存记录并更新每天设置' : '保存记录并开启自动记录' : '保存记录'}</>
}
export function DailyRecordSettings({ kind, seed = {}, name = '' }: { kind: DailyKind; seed?: DailyFields; name?: string }) {
  const scope = useContext(DailyRecordScope)
  if (!scope) return null
  // A reused food form must not persist the previous category's state under
  // the next category's draft key while its asynchronous settings load starts.
  return <DailyRecordSettingsContent key={`${scope.memberId}:${scope.token}:${scope.day}:${kind}`} kind={kind} seed={seed} name={name} />
}
function DailyRecordSettingsContent({ kind, seed, name }: { kind: DailyKind; seed: DailyFields; name: string }) {
  const scope = useContext(DailyRecordScope)
  const seedUsed = useRef(false)
  const accountId = useAppStore(state => state.authUser?.id ?? '')
  const [enabled, setEnabled] = useState(false), [slots, setSlots] = useState<DailySlot[]>([]), [revision, setRevision] = useState(0)
  const [ready, setReady] = useState(false), [error, setError] = useState(''), [retry, setRetry] = useState(0), [linkId, setLinkId] = useState(''), [instances, setInstances] = useState<DailyInstance[]>([])
  const [timeZone, setTimeZone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone)
  const draftKey = `hoooho:daily:${accountId}:${scope?.memberId}:${kind}`
  const memberId = scope?.memberId, token = scope?.token, day = scope?.day, onChange = scope?.onChange, onReady = scope?.onReady
  useEffect(() => {
    if (!memberId || !token) return
    const abort = new AbortController(); setReady(false); onReady?.(false); setError(''); setLinkId(''); setInstances([]); onChange?.({})
    void dailyRecords.settings(memberId, token, abort.signal).then(rules => {
      if (abort.signal.aborted) return
      const current = rules.find(rule => rule.kind === kind)
      setTimeZone(current?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)
      const currentRevision = current?.revision ?? 0
      let draft: { enabled: boolean; slots: DailySlot[]; revision: number } | null = null
      try { draft = JSON.parse(sessionStorage.getItem(draftKey) || 'null') } catch { /* Storage is optional. */ }
      if (draft && (!Array.isArray(draft.slots) || typeof draft.enabled !== 'boolean' || !draft.slots.every(slot => slot && typeof slot.id === 'string' && typeof slot.name === 'string' && typeof slot.time === 'string' && typeof slot.enabled === 'boolean' && slot.fields && typeof slot.fields === 'object' && !Array.isArray(slot.fields)))) draft = null
      seedUsed.current = Boolean(current || (draft && draft.revision === currentRevision && draft.enabled))
      if (draft && draft.revision === currentRevision) { setEnabled(draft.enabled); setSlots(draft.slots) }
      else { setEnabled(current?.enabled ?? false); setSlots(current?.slots ?? [{ id: crypto.randomUUID(), name: name.trim() || suggestions[kind], enabled: true, time: '', fields: seed }]) }
      setRevision(current?.revision ?? 0); setReady(true); onReady?.(true)
    }).catch(reason => { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : '每天设置加载失败，请重试') })
    if (day) void dailyRecords.instances(memberId, day, token, abort.signal).then(values => { if (!abort.signal.aborted) setInstances(values.filter(value => value.kind === kind && value.status === 'unconfirmed')) }).catch(() => {})
    return () => abort.abort()
    // Seed is used only for the first suggestion; later edits never reset it.
  }, [memberId, token, kind, draftKey, retry, onChange, day, onReady])
  useEffect(() => {
    if (!ready) return
    const effectiveEnabled = enabled && slots.some(slot => slot.enabled)
    const input = effectiveEnabled || revision > 0 ? { kind, revision, enabled: effectiveEnabled, timeZone, slots } : undefined
    onChange?.({ ...(input ? { dailySettings: input } : {}), ...(linkId ? { automaticInstanceId: linkId } : {}) })
    try { sessionStorage.setItem(draftKey, JSON.stringify({ enabled, slots, revision })) } catch { /* Storage is optional. */ }
  }, [ready, enabled, slots, revision, linkId, kind, draftKey, onChange, timeZone])
  if (!scope) return null
  const update = (id: string, changes: Partial<DailySlot>) => setSlots(value => value.map(slot => slot.id === id ? { ...slot, ...changes } : slot))
  return <section className="record-form-group daily-record-settings" aria-label="每天自动记录设置">
    <div className="daily-record-heading"><strong>每天自动记录</strong><fieldset disabled={!ready} className="daily-toggle-fieldset"><HohoToggle label="每天自动记录" checked={enabled} onChange={value => { if (value && !seedUsed.current) { setSlots(slots => slots.map((slot, index) => index === 0 ? { ...slot, name: name.trim() || slot.name, fields: seed } : slot)); seedUsed.current = true } setEnabled(value) }} /></fieldset></div>
    {!ready && !error && <small role="status">正在加载每天设置…</small>}
    {ready && !enabled && <small>只给一个开头，名称和内容由你决定。</small>}
    {error && <p role="alert">{error}<HohoButton variant="ghost" onClick={() => setRetry(value => value + 1)}>重试</HohoButton></p>}
    {ready && enabled && <><small>时区：{timeZone}。新设置从当地次日生效。到点生成未确认条目，确认后才计入真实记录。</small>{slots.map((slot, index) => <div key={slot.id} className="daily-record-slot">
      <div className="daily-record-heading"><HohoInput label={`第${index + 1}项名称`} value={slot.name} maxLength={20} onChange={event => update(slot.id, { name: event.target.value })} /><HohoToggle label={`启用第${index + 1}项`} checked={slot.enabled} onChange={value => update(slot.id, { enabled: value })} /></div>
      {slot.enabled && <><HohoInput label={`第${index + 1}项时间`} type="time" value={slot.time} onChange={event => update(slot.id, { time: event.target.value })} /><DailyTypeFields kind={kind} prefix={`第${index + 1}项`} value={slot.fields} onChange={fields => update(slot.id, { fields })} /></>}
      <HohoButton variant="ghost" onClick={() => setSlots(value => value.filter(item => item.id !== slot.id))}>删除第{index + 1}项</HohoButton>
    </div>)}<HohoButton variant="secondary" disabled={slots.length >= 12} onClick={() => setSlots(value => [...value, { id: crypto.randomUUID(), name: '', time: '', enabled: true, fields: {} }])}>添加一项</HohoButton></>}
    {ready && !enabled && slots.length > 0 && <small>{revision > 0 ? `已设置${slots.length}项 · 暂停（打开可管理）` : name.trim() || suggestions[kind]}</small>}
    {instances.length > 0 && <label>关联本次自动记录（选填）<select value={linkId} onChange={event => setLinkId(event.target.value)}><option value="">不关联，保留为独立实际记录</option>{instances.map(instance => <option key={instance.id} value={instance.id}>{instance.name} · {new Date(instance.plannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</option>)}</select></label>}
  </section>
}
