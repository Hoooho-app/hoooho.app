import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Clock3, Moon, Plus, Trash2, Utensils } from 'lucide-react'
import { BottomSheetSurface, ConfirmDialog, HohoButton, HohoToggle } from '../../components/design-system'
import { routineTrackService, type RoutineDay, type RoutineFixedItemKey, type RoutineItemKey, type RoutineTrack } from '../../services/routineTracks'

const definitions: Array<{ key: RoutineFixedItemKey; label: string; sleep?: boolean }> = [
  { key: 'nightSleep', label: '夜间睡眠', sleep: true },
  { key: 'breakfast', label: '早餐' },
  { key: 'lunch', label: '午餐' },
  { key: 'dinner', label: '晚餐' }
]

type RoutineDraftItem = { enabled: boolean; title: string; time: string; endTime: string }
type PendingRoutineChange = { action: 'disable' | 'remove'; key: RoutineItemKey; label: string }

function localIso(day: string, time: string) {
  const value = new Date(`${day}T${time}:00`)
  return Number.isNaN(value.getTime()) ? '' : value.toISOString()
}

function localInput(iso: string) {
  const value = new Date(iso)
  const offset = value.getTimezoneOffset() * 60_000
  return new Date(value.getTime() - offset).toISOString().slice(0, 16)
}

export function RoutineSetupSheet({ effectiveFrom, memberId, open, routineDay, token, onClose, onSaved }: { effectiveFrom: string; memberId: string; open: boolean; routineDay: RoutineDay; token: string; onClose: () => void; onSaved: (message: string) => void }) {
  const initial = useMemo(() => {
    const fixed = Object.fromEntries(definitions.map(({ key, label }) => {
      const item = routineDay.template?.items.find((candidate) => candidate.key === key)
      return [key, { enabled: Boolean(item), title: label, time: item?.time ?? '', endTime: item?.endTime ?? '' }]
    })) as Record<RoutineItemKey, RoutineDraftItem>
    for (const item of routineDay.template?.items ?? []) if (item.key.startsWith('custom:')) fixed[item.key] = { enabled: true, title: item.title, time: item.time, endTime: item.endTime ?? '' }
    return fixed
  }, [routineDay.template])
  const [items, setItems] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [attempted, setAttempted] = useState(false)
  const [pendingChange, setPendingChange] = useState<PendingRoutineChange | null>(null)
  useEffect(() => { if (open) { setItems(initial); setError(''); setAttempted(false); setPendingChange(null) } }, [initial, open])
  const itemEntries = Object.entries(items) as Array<[RoutineItemKey, RoutineDraftItem]>
  const customEntries = itemEntries.filter(([key]) => key.startsWith('custom:'))
  const valid = itemEntries.every(([key, item]) => !item.enabled || (item.time && item.endTime && (!key.startsWith('custom:') || item.title.trim())))
  const dirty = JSON.stringify(items) !== JSON.stringify(initial)
  const close = () => { if (!dirty || window.confirm('作息设置还没有保存，确定退出吗？')) onClose() }
  const setEnabled = (key: RoutineItemKey, label: string, enabled: boolean) => {
    if (!enabled && items[key].enabled) return setPendingChange({ action: 'disable', key, label })
    setItems((value) => ({ ...value, [key]: { ...value[key], enabled } }))
  }
  const confirmChange = () => {
    if (!pendingChange) return
    setItems((value) => {
      if (pendingChange.action === 'remove') return Object.fromEntries(Object.entries(value).filter(([key]) => key !== pendingChange.key)) as Record<RoutineItemKey, RoutineDraftItem>
      return { ...value, [pendingChange.key]: { ...value[pendingChange.key], enabled: false } }
    })
    setPendingChange(null)
  }
  const addCustom = () => {
    if (customEntries.length >= 8) return setError('最多添加8项其他作息')
    const key = `custom:${crypto.randomUUID().replaceAll('-', '')}` as RoutineItemKey
    setItems((value) => ({ ...value, [key]: { enabled: true, title: '', time: '', endTime: '' } }))
    setError('')
  }
  const save = async () => {
    setAttempted(true)
    if (!valid || saving) return
    setSaving(true); setError('')
    try {
      const enabled = itemEntries.some(([, item]) => item.enabled)
      await routineTrackService.saveTemplate(memberId, { effectiveFrom, enabled, items: enabled ? items : {} }, token)
      onSaved(enabled ? '已保存并执行' : '已停用日常作息，此前记录已保留'); onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，请重试') }
    finally { setSaving(false) }
  }
  const renderTimes = (key: RoutineItemKey, label: string, sleep = false) => {
    const item = items[key]
    const nextDay = Boolean(item.time && item.endTime && item.endTime <= item.time)
    return <div className="routine-time-fields">
      <label><span>{sleep ? '通常入睡' : '开始'}</span><span className="routine-time-control"><input aria-label={`${label}${sleep ? '通常入睡' : '开始时间'}`} onChange={(event) => setItems((value) => ({ ...value, [key]: { ...value[key], time: event.target.value } }))} type="time" value={item.time} /></span>{attempted && !item.time && <small role="alert">请选择开始时间</small>}</label>
      <label><span>{sleep ? '通常醒来' : '结束'}</span><span className={`routine-time-control${nextDay ? ' routine-time-control--next-day' : ''}`}><input aria-label={`${label}${sleep ? '通常醒来' : '结束时间'}`} onChange={(event) => setItems((value) => ({ ...value, [key]: { ...value[key], endTime: event.target.value } }))} type="time" value={item.endTime} />{nextDay && <em>次日</em>}</span>{attempted && !item.endTime && <small role="alert">请选择结束时间</small>}</label>
    </div>
  }
  return <><BottomSheetSurface className="routine-setup-sheet" label="设置日常作息" onClose={close} open={open} title="设置日常作息" footer={<HohoButton fullWidth loading={saving} onClick={() => void save()} size="large">保存并执行</HohoButton>}>
    <p className="routine-sheet-intro">按孩子通常的作息生成每天的轻量轨迹。之后可以补充或修改，也不会发送催填提醒。</p>
    <div className="routine-setup-list">
      {definitions.map(({ key, label, sleep }) => <div className="routine-setup-row" key={key}>
        <div className="routine-enable"><HohoToggle checked={items[key].enabled} label={`${label}作息`} onChange={(enabled) => setEnabled(key, label, enabled)} /><span>{label}</span></div>
        {!items[key].enabled ? <span className="routine-disabled-copy">未启用</span> : renderTimes(key, label, sleep)}
      </div>)}
      {customEntries.map(([key, item], index) => <div className="routine-setup-row routine-setup-row--custom" key={key}>
        <div className="routine-custom-heading"><HohoToggle checked={item.enabled} label={`${item.title || `其他作息${index + 1}`}作息`} onChange={(enabled) => setEnabled(key, item.title || `其他作息${index + 1}`, enabled)} /><input aria-label={`其他作息${index + 1}名称`} maxLength={20} onChange={(event) => setItems((value) => ({ ...value, [key]: { ...value[key], title: event.target.value } }))} placeholder="作息名称" value={item.title} /><button aria-label={`删除${item.title || `其他作息${index + 1}`}`} onClick={() => routineDay.template?.items.some((candidate) => candidate.key === key) ? setPendingChange({ action: 'remove', key, label: item.title || `其他作息${index + 1}` }) : setItems((value) => Object.fromEntries(Object.entries(value).filter(([itemKey]) => itemKey !== key)) as Record<RoutineItemKey, RoutineDraftItem>)} type="button"><Trash2 aria-hidden="true" size={17} /></button></div>
        {item.enabled && renderTimes(key, item.title || `其他作息${index + 1}`)}
        {attempted && item.enabled && !item.title.trim() && <small className="routine-custom-error" role="alert">请输入作息名称</small>}
      </div>)}
    </div>
    <button className="routine-add-custom" disabled={saving || customEntries.length >= 8} onClick={addCustom} type="button"><Plus aria-hidden="true" size={17} />添加其他作息</button>
    {routineDay.consent === 'unset' && <button className="routine-decline" disabled={saving} onClick={async () => {
      setSaving(true); setError('')
      try { await routineTrackService.setConsent(memberId, 'declined', token); onSaved('已暂不使用日常作息'); onClose() }
      catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，请重试') }
      finally { setSaving(false) }
    }} type="button">暂不使用</button>}
    {error && <p className="routine-sheet-error" role="alert">{error}</p>}
  </BottomSheetSurface><ConfirmDialog cancelLabel="继续使用" confirmLabel={pendingChange?.action === 'remove' ? '删除设置' : '关闭作息'} danger={pendingChange?.action === 'remove'} description={`关闭“${pendingChange?.label ?? ''}”后，此前的记录保留，之后的作息将不再延续记录。`} onCancel={() => setPendingChange(null)} onConfirm={confirmChange} open={Boolean(pendingChange)} title={pendingChange?.action === 'remove' ? '删除这项作息？' : '关闭这项作息？'} /></>
}

export function RoutineTrackSheet({ memberId, now, openTrack, token, onClose, onSaved }: { memberId: string; now: Date; openTrack: RoutineTrack | null; token: string; onClose: () => void; onSaved: (message: string, record?: { eventId?: string; recordId?: string }) => void }) {
  const track = openTrack
  const [occurredAt, setOccurredAt] = useState('')
  const [wakeAt, setWakeAt] = useState('')
  const [foods, setFoods] = useState('')
  const [details, setDetails] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const idempotencyRef = useRef('')
  useEffect(() => {
    if (!track) return
    const start = localIso(track.day, track.time)
    const endDay = track.endTime && track.endTime <= track.time ? new Date(new Date(`${track.day}T12:00:00`).getTime() + 86_400_000).toISOString().slice(0, 10) : track.day
    setOccurredAt(localInput(start)); setWakeAt(track.endTime ? localInput(localIso(endDay, track.endTime)) : '')
    setFoods(''); setDetails(false); setError(''); idempotencyRef.current = ''
  }, [track])
  if (!track) return null
  const future = new Date(occurredAt).getTime() > now.getTime()
  const incompleteInterval = Boolean(track.endTime) && (!wakeAt || new Date(wakeAt).getTime() > now.getTime() || new Date(wakeAt) <= new Date(occurredAt))
  const act = async (action: 'confirm' | 'skipped' | 'reset') => {
    if (saving) return
    setSaving(true); setError('')
    try {
      if (!idempotencyRef.current) idempotencyRef.current = crypto.randomUUID().replaceAll('-', '')
      const saved = await routineTrackService.act(memberId, track.itemKey, {
        action, day: track.day, idempotencyKey: idempotencyRef.current,
        occurredAt: occurredAt ? new Date(occurredAt).toISOString() : undefined,
        ...(track.category === 'diet'
          ? { foods: foods.split(/[，,、]/).map((item) => item.trim()).filter(Boolean), startedAt: occurredAt ? new Date(occurredAt).toISOString() : undefined, endedAt: wakeAt ? new Date(wakeAt).toISOString() : undefined }
          : track.category === 'sleep'
            ? { sleepAt: occurredAt ? new Date(occurredAt).toISOString() : undefined, wakeAt: wakeAt ? new Date(wakeAt).toISOString() : undefined }
            : { startedAt: occurredAt ? new Date(occurredAt).toISOString() : undefined, endedAt: wakeAt ? new Date(wakeAt).toISOString() : undefined })
      }, token)
      onSaved(action === 'confirm' ? '已记录' : action === 'skipped' ? '已标记当天未发生' : '已恢复日常轨迹', { eventId: saved.eventId, recordId: saved.recordId ?? undefined })
      onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，请重试') }
    finally { setSaving(false) }
  }
  const icon = track.category === 'sleep' ? <Moon size={24} /> : track.category === 'diet' ? <Utensils size={24} /> : <Clock3 size={24} />
  return <BottomSheetSurface className="routine-track-sheet" label={`${track.title}日常轨迹`} leading={icon} onClose={onClose} open title={track.title}>
    <div className="routine-track-source"><span>日常作息</span><strong>{track.endTime ? `${track.time}–${track.endTime <= track.time ? '次日 ' : ''}${track.endTime}` : track.time}</strong></div>
    {track.status === 'skipped' ? <div className="routine-skipped-panel"><p>{track.category === 'diet' ? '今天没吃' : '本次未发生'}</p><HohoButton fullWidth loading={saving} onClick={() => void act('reset')} variant="secondary">恢复日常轨迹</HohoButton></div> : <>
      <label className="routine-field"><span>{track.endTime ? '开始时间' : '时间'}</span><input max={localInput(now.toISOString())} onChange={(event) => setOccurredAt(event.target.value)} type="datetime-local" value={occurredAt} /></label>
      {track.endTime && <label className="routine-field"><span>结束时间</span><input max={localInput(now.toISOString())} onChange={(event) => setWakeAt(event.target.value)} type="datetime-local" value={wakeAt} /></label>}
      {details && track.category === 'diet' && <label className="routine-field"><span>吃了什么（选填）</span><input onChange={(event) => setFoods(event.target.value)} placeholder="没有填写也可以保存" value={foods} /></label>}
      {(future || incompleteInterval) && <p className="routine-sheet-hint">{track.endTime ? `完整${track.category === 'sleep' ? '睡眠' : track.category === 'diet' ? '用餐' : '作息'}需要填写已经结束的真实时间。` : '尚未到达这个时间，可以调整为实际发生时间后保存。'}</p>}
      <HohoButton disabled={future || incompleteInterval} fullWidth loading={saving} onClick={() => void act('confirm')} size="large"><CheckCircle2 size={20} />按平常记录</HohoButton>
      <div className="routine-sheet-actions"><button onClick={() => setDetails((value) => !value)} type="button">{details ? '收起详情' : '调整详情'}</button><button disabled={saving} onClick={() => void act('skipped')} type="button">{track.category === 'diet' ? '今天没吃' : '本次未发生'}</button></div>
    </>}
    {error && <p className="routine-sheet-error" role="alert">{error}</p>}
  </BottomSheetSurface>
}
