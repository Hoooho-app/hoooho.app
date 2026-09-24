import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Moon, Utensils } from 'lucide-react'
import { BottomSheetSurface, HohoButton } from '../../components/design-system'
import { routineTrackService, type RoutineDay, type RoutineItemKey, type RoutineTrack } from '../../services/routineTracks'

const definitions: Array<{ key: RoutineItemKey; label: string; sleep?: boolean }> = [
  { key: 'nightSleep', label: '夜间睡眠', sleep: true },
  { key: 'breakfast', label: '早餐' },
  { key: 'lunch', label: '午餐' },
  { key: 'dinner', label: '晚餐' }
]

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
  const initial = useMemo(() => Object.fromEntries(definitions.map(({ key }) => {
    const item = routineDay.template?.items.find((candidate) => candidate.key === key)
    return [key, { enabled: Boolean(item), time: item?.time ?? '', endTime: item?.endTime ?? '' }]
  })) as Record<RoutineItemKey, { enabled: boolean; time: string; endTime: string }>, [routineDay.template])
  const [items, setItems] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [attempted, setAttempted] = useState(false)
  useEffect(() => { if (open) { setItems(initial); setError(''); setAttempted(false) } }, [initial, open])
  const valid = definitions.every(({ key }) => !items[key].enabled || (items[key].time && items[key].endTime))
  const dirty = JSON.stringify(items) !== JSON.stringify(initial)
  const close = () => { if (!dirty || window.confirm('作息设置还没有保存，确定退出吗？')) onClose() }
  const save = async () => {
    setAttempted(true)
    if (!valid || saving) return
    setSaving(true); setError('')
    try {
      const enabled = definitions.some(({ key }) => items[key].enabled)
      await routineTrackService.saveTemplate(memberId, { effectiveFrom, enabled, items: enabled ? items : {} }, token)
      onSaved('已保存，日常作息已更新'); onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，请重试') }
    finally { setSaving(false) }
  }
  return <BottomSheetSurface className="routine-setup-sheet" label="设置日常作息" onClose={close} open={open} title="设置日常作息" footer={<HohoButton fullWidth loading={saving} onClick={() => void save()} size="large">保存日常作息</HohoButton>}>
    <p className="routine-sheet-intro">按孩子通常的作息生成每天的轻量轨迹。之后可以补充或修改，也不会发送催填提醒。</p>
    <div className="routine-setup-list">
      {definitions.map(({ key, label, sleep }) => <div className="routine-setup-row" key={key}>
        <label className="routine-enable"><input checked={items[key].enabled} onChange={(event) => setItems((value) => ({ ...value, [key]: { ...value[key], enabled: event.target.checked } }))} type="checkbox" /><span>{label}</span></label>
        {!items[key].enabled ? <span className="routine-disabled-copy">未启用</span> : <div className="routine-time-fields">
          <label><span>{sleep ? '通常入睡' : '开始'}</span><input aria-label={`${label}${sleep ? '通常入睡' : '开始时间'}`} onChange={(event) => setItems((value) => ({ ...value, [key]: { ...value[key], time: event.target.value } }))} type="time" value={items[key].time} />{attempted && !items[key].time && <small role="alert">请选择开始时间</small>}</label>
          <label><span>{sleep ? '通常醒来' : '结束'}</span><input aria-label={`${label}${sleep ? '通常醒来' : '结束时间'}`} onChange={(event) => setItems((value) => ({ ...value, [key]: { ...value[key], endTime: event.target.value } }))} type="time" value={items[key].endTime} />{attempted && !items[key].endTime && <small role="alert">请选择结束时间</small>}{items[key].time && items[key].endTime && items[key].endTime <= items[key].time && <em>次日</em>}</label>
        </div>}
      </div>)}
    </div>
    {routineDay.consent === 'unset' && <button className="routine-decline" disabled={saving} onClick={async () => {
      setSaving(true); setError('')
      try { await routineTrackService.setConsent(memberId, 'declined', token); onSaved('已暂不使用日常作息'); onClose() }
      catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，请重试') }
      finally { setSaving(false) }
    }} type="button">暂不使用</button>}
    {routineDay.consent === 'enabled' && <button className="routine-decline" disabled={saving} onClick={async () => {
      setSaving(true); setError('')
      try { await routineTrackService.saveTemplate(memberId, { effectiveFrom, enabled: false, items: {} }, token); onSaved('已保存，日常作息已更新'); onClose() }
      catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，请重试') }
      finally { setSaving(false) }
    }} type="button">停用日常作息</button>}
    {error && <p className="routine-sheet-error" role="alert">{error}</p>}
  </BottomSheetSurface>
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
        ...(track.category === 'diet' ? { foods: foods.split(/[，,、]/).map((item) => item.trim()).filter(Boolean), startedAt: occurredAt ? new Date(occurredAt).toISOString() : undefined, endedAt: wakeAt ? new Date(wakeAt).toISOString() : undefined } : { sleepAt: occurredAt ? new Date(occurredAt).toISOString() : undefined, wakeAt: wakeAt ? new Date(wakeAt).toISOString() : undefined })
      }, token)
      onSaved(action === 'confirm' ? '已记录' : action === 'skipped' ? '已标记当天未发生' : '已恢复日常轨迹', { eventId: saved.eventId, recordId: saved.recordId ?? undefined })
      onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，请重试') }
    finally { setSaving(false) }
  }
  const icon = track.category === 'sleep' ? <Moon size={24} /> : <Utensils size={24} />
  return <BottomSheetSurface className="routine-track-sheet" label={`${track.title}日常轨迹`} leading={icon} onClose={onClose} open title={track.title}>
    <div className="routine-track-source"><span>日常作息</span><strong>{track.endTime ? `${track.time}–${track.endTime <= track.time ? '次日 ' : ''}${track.endTime}` : track.time}</strong></div>
    {track.status === 'skipped' ? <div className="routine-skipped-panel"><p>{track.category === 'diet' ? '今天没吃' : '本次未发生'}</p><HohoButton fullWidth loading={saving} onClick={() => void act('reset')} variant="secondary">恢复日常轨迹</HohoButton></div> : <>
      <label className="routine-field"><span>{track.endTime ? '开始时间' : '时间'}</span><input max={localInput(now.toISOString())} onChange={(event) => setOccurredAt(event.target.value)} type="datetime-local" value={occurredAt} /></label>
      {track.endTime && <label className="routine-field"><span>结束时间</span><input max={localInput(now.toISOString())} onChange={(event) => setWakeAt(event.target.value)} type="datetime-local" value={wakeAt} /></label>}
      {details && track.category === 'diet' && <label className="routine-field"><span>吃了什么（选填）</span><input onChange={(event) => setFoods(event.target.value)} placeholder="没有填写也可以保存" value={foods} /></label>}
      {(future || incompleteInterval) && <p className="routine-sheet-hint">{track.endTime ? `完整${track.category === 'sleep' ? '睡眠' : '用餐'}需要填写已经结束的真实时间。` : '尚未到达这个时间，可以调整为实际发生时间后保存。'}</p>}
      <HohoButton disabled={future || incompleteInterval} fullWidth loading={saving} onClick={() => void act('confirm')} size="large"><CheckCircle2 size={20} />按平常记录</HohoButton>
      <div className="routine-sheet-actions"><button onClick={() => setDetails((value) => !value)} type="button">{details ? '收起详情' : '调整详情'}</button><button disabled={saving} onClick={() => void act('skipped')} type="button">{track.category === 'diet' ? '今天没吃' : '本次未发生'}</button></div>
    </>}
    {error && <p className="routine-sheet-error" role="alert">{error}</p>}
  </BottomSheetSurface>
}
