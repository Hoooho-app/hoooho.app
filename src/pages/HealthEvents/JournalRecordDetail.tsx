import { BottomSheetSurface, HohoButton, HohoInput, StatusNotice } from '../../components/design-system'
import type { JournalDietDetails } from '../../types/journal'
import { useHealthEventDetail } from '../../hooks/useHealthEventDetail'
import { SymptomRecordSheet } from '../HealthEventDetail/components'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Moon } from 'lucide-react'
import { useJournal } from './useJournal'
import { useAppStore } from '../../store/useAppStore'
import { healthEventRecordService } from '../../services/healthEventRecords'
import { localDateTimeToIso, localDateTimeValue } from '../../utils/healthOccurredAt'
import { DietRecordFlow } from './DietRecordFlow'
import { TopicalRecordFlow } from './TopicalRecordFlow'
import { getLocalDateKey } from '../../utils/localCalendarDate'
import { DailyRecordOrigin } from './DailyRecordSheets'

export function JournalRecordDetail({ eventId, recordId, startSleepCorrection = false, onChanged, onClose }: {
  eventId: string
  recordId: string
  startSleepCorrection?: boolean
  onChanged: (day?: string) => void
  onClose: () => void
}) {
  const { state, retry, updateRecord, deleteRecord } = useHealthEventDetail(eventId, true)
  const memberId = useAppStore((value) => value.currentMemberId)
  const token = useAppStore((value) => value.authToken ?? '')
  const relatedJournal = useJournal(memberId, token, 0)
  const [now, setNow] = useState(() => Date.now())
  const [editingDiet,setEditingDiet] = useState(false)
  const [editingTopical,setEditingTopical] = useState(false)
  const [ending, setEnding] = useState(false)
  const [endError, setEndError] = useState('')
  const [correctionOpen, setCorrectionOpen] = useState(false)
  const [sleepAtInput, setSleepAtInput] = useState('')
  const [wakeAtInput, setWakeAtInput] = useState('')
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer) }, [])
  useEffect(() => {
    if (state.status !== 'success' || !startSleepCorrection) return
    const current = state.data.records.find((item) => item.id === recordId)
    const sleep = current?.journal?.sleep
    if (!sleep || sleep.status !== 'ongoing') return
    const elapsed = Math.floor((Date.now() - Date.parse(sleep.sleepAt)) / 60_000)
    if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= 1440) return
    setSleepAtInput(localDateTimeValue(new Date(sleep.sleepAt)))
    setWakeAtInput('')
    setCorrectionOpen(true)
    setEndError('')
  }, [recordId, startSleepCorrection, state])

  if (state.status === 'loading') return <StatusSheet onClose={onClose}><StatusNotice title="正在读取记录详情" /></StatusSheet>
  if (state.status === 'error') return <StatusSheet onClose={onClose}><StatusNotice action={<HohoButton variant="secondary" onClick={retry}>重新加载</HohoButton>} tone="error" title={state.message} /></StatusSheet>
  if (state.status === 'not-found') return <StatusSheet onClose={onClose}><StatusNotice tone="error" title="未找到这条健康随记" /></StatusSheet>

  if(state.data.member.id!==memberId)return <StatusSheet onClose={onClose}><StatusNotice tone="error" title="这条记录不属于当前家庭成员" /></StatusSheet>
  const entry = state.data.viewModel.event.timeline.find((item) => item.sourceRecordId === recordId) ?? null
  const record = state.data.records.find((item) => item.id === recordId) ?? null
  const origin = <DailyRecordOrigin memberId={memberId} recordId={recordId} token={token}/>
  if (!entry) return <StatusSheet onClose={onClose}><StatusNotice tone="error" title="未找到这条记录" /></StatusSheet>
  if (record?.journal?.sleep?.status === 'ongoing') {
    const sleep = record.journal.sleep
    const elapsed = Math.floor((now - Date.parse(sleep.sleepAt)) / 60_000)
    const abnormal = !Number.isFinite(elapsed) || elapsed < 0 || elapsed > 1440
    const originalSleepAt = localDateTimeValue(new Date(sleep.sleepAt))
    const correctionDirty = correctionOpen && (sleepAtInput !== originalSleepAt || wakeAtInput !== '')
    const close = () => { if (!correctionDirty || window.confirm('时间修改还没有保存，确定退出吗？')) onClose() }
    const validateCorrection = () => {
      if (!correctionOpen) return ''
      if (!sleepAtInput) return '请填写实际开始时间。'
      if (!wakeAtInput) return '请填写实际结束时间。'
      const start = Date.parse(sleepAtInput)
      const end = Date.parse(wakeAtInput)
      if (!Number.isFinite(start) || !Number.isFinite(end)) return '时间格式无效，请重新选择。'
      if (start > Date.now()) return '实际开始时间不能晚于现在。'
      if (end > Date.now()) return '实际结束时间不能晚于现在。'
      if (end <= start) return '实际结束时间必须晚于实际开始时间。'
      return ''
    }
    const correctionError = validateCorrection()
    const correctionSpan = correctionOpen && sleepAtInput && wakeAtInput && Number.isFinite(Date.parse(sleepAtInput)) && Number.isFinite(Date.parse(wakeAtInput))
      ? Math.round((Date.parse(wakeAtInput) - Date.parse(sleepAtInput)) / 60_000)
      : null
    const openCorrection = () => {
      setSleepAtInput(originalSleepAt)
      setWakeAtInput('')
      setCorrectionOpen(true); setEndError('')
    }
    const endSleep = async () => {
      if (ending) return
      if (abnormal && !correctionOpen) { openCorrection(); return }
      setEnding(true); setEndError('')
      try {
        const sleepAt = correctionOpen && sleepAtInput !== originalSleepAt ? localDateTimeToIso(sleepAtInput) : sleep.sleepAt
        const wakeAt = correctionOpen ? localDateTimeToIso(wakeAtInput) : new Date().toISOString()
        if (correctionError) throw new Error(correctionError)
        await healthEventRecordService.endSleep(record.id, { sleepAt, wakeAt }, token)
        onChanged(getLocalDateKey(wakeAt) ?? undefined); onClose()
      } catch (error) { setEndError(error instanceof Error ? error.message : '结束睡眠失败，请重试') }
      finally { setEnding(false) }
    }
    const correctionSpanCopy = correctionSpan === null || correctionSpan <= 0 ? '' : `当前区间跨度：${Math.floor(correctionSpan / 1440)}天${Math.floor((correctionSpan % 1440) / 60)}小时${correctionSpan % 60}分钟`
    return <BottomSheetSurface label={abnormal ? '睡眠时间未补全' : '正在记录睡眠'} onClose={close} open title={abnormal ? '睡眠时间未补全' : '正在记录睡眠'}><div className="sleep-active-detail">{origin}<span><Moon aria-hidden="true" size={30} /></span>{abnormal ? <><h2>这次睡眠尚未补全时间</h2><p>{`原始开始时间：${new Date(sleep.sleepAt).toLocaleString('zh-CN', { hour12: false })}`}</p></> : <><strong>{`${Math.floor(elapsed / 60)}小时${elapsed % 60}分钟`}</strong><h2>{`${state.data.member.name}开始睡觉了`}</h2></>}<dl><div><dt>开始时间</dt><dd>{new Date(sleep.sleepAt).toLocaleString('zh-CN', { hour12: false })}</dd></div><div><dt>结束时间</dt><dd>尚未结束</dd></div></dl>{correctionOpen && <div className="sleep-correction-fields"><label><span>实际开始时间</span><input aria-label="实际开始时间" max={localDateTimeValue()} onChange={(event) => setSleepAtInput(event.target.value)} type="datetime-local" value={sleepAtInput} /></label><label><span>实际结束时间</span><input aria-label="实际结束时间" max={localDateTimeValue()} onChange={(event) => setWakeAtInput(event.target.value)} type="datetime-local" value={wakeAtInput} /></label>{correctionSpanCopy && <p>{correctionSpanCopy}</p>}{correctionError && <p role="alert">{correctionError}</p>}</div>}<HohoButton disabled={Boolean(correctionError)} fullWidth loading={ending} onClick={() => void endSleep()} size="large">{correctionOpen ? '确认并结束睡眠' : abnormal ? '核对时间' : '结束睡眠'}</HohoButton>{!abnormal && <p>离开页面也会继续记录</p>}{endError && <p role="alert">{endError}</p>}<button className="sleep-delete-action" onClick={async () => { if (!window.confirm('确定删除这条睡眠记录吗？')) return; await deleteRecord(record.id); onChanged(); onClose() }} type="button">删除这条记录</button></div></BottomSheetSurface>
  }

  const completedSleep = record?.journal?.sleep ?? null
  if (record?.journal?.diet?.status === 'ongoing') return <OngoingDietDetail diet={record.journal.diet} origin={origin} onClose={onClose} onSave={async diet => {
    await updateRecord(record.id, { journal: { ...record.journal, diet }, occurredAt: diet.endedAt })
    onChanged(getLocalDateKey(diet.endedAt!) ?? undefined); onClose()
  }} />
  const mealInterval = record?.journal?.diet?.startedAt && record.journal.diet.endedAt ? record.journal.diet : null
  if (record && (completedSleep || mealInterval)) {
    return <ActivityIntervalDetail
      endAt={completedSleep?.wakeAt ?? mealInterval?.endedAt ?? ''}
      kind={completedSleep ? 'sleep' : 'meal'}
      onClose={onClose}
      onDelete={async () => { await deleteRecord(record.id); onChanged() }}
      onSave={async (startAt, endAt) => {
        const durationMinutes = Math.round((Date.parse(endAt) - Date.parse(startAt)) / 60_000)
        await updateRecord(record.id, {
          occurredAt: endAt,
          journal: completedSleep
            ? { ...record.journal, occurredAt: endAt, sleep: { ...completedSleep, sleepAt: startAt, wakeAt: endAt, durationMinutes } }
            : { ...record.journal, occurredAt: endAt, diet: { ...mealInterval!, startedAt: startAt, endedAt: endAt, status: 'completed' } }
        })
        onChanged(getLocalDateKey(endAt) ?? undefined)
      }}
      startAt={completedSleep?.sleepAt ?? mealInterval?.startedAt ?? record.occurredAt}
      title={completedSleep ? '睡眠' : mealInterval?.name ?? mealInterval?.meal ?? '喂养/用餐'}
      information={<>{origin}<p>{record.content}</p>{record.note && <p>{record.note}</p>}{mealInterval && <DietInformation diet={mealInterval} />}{completedSleep && <p>{[completedSleep.quality, ...(completedSleep.observations ?? []), completedSleep.otherNote].filter(Boolean).join('、')}</p>}</>}
    />
  }

  if (editingDiet && record?.journal?.diet) return <DietRecordFlow key={record.id} kind={record.journal.diet.kind} initialDiet={record.journal.diet} initialOccurredAt={record.occurredAt} recordId={record.id} memberId={state.data.member.id} token={token} selectedDay={getLocalDateKey(new Date(record.occurredAt))!} today={getLocalDateKey(new Date())!} onBack={()=>setEditingDiet(false)} onClose={onClose} onSaved={()=>onChanged()} onConfirm={async(content,occurredAt,_channel,_photos,journal)=>{await updateRecord(record.id,{content,occurredAt,journal:{...record.journal,...journal}});return '记录已更新'}}/>
  if (editingTopical && record?.journal?.topical) return <TopicalRecordFlow key={record.id} initialJournal={record.journal.topical} initialOccurredAt={record.occurredAt} memberId={state.data.member.id} token={token} selectedDay={getLocalDateKey(new Date(record.occurredAt))!} today={getLocalDateKey(new Date())!} onBack={()=>setEditingTopical(false)} onClose={onClose} onSaved={()=>onChanged()} onConfirm={async(content,occurredAt,_channel,_photos,journal)=>{await updateRecord(record.id,{content,occurredAt,journal:{...record.journal,...journal}});return '记录已更新'}}/>
  return <SymptomRecordSheet
    origin={origin}
    onEditTopical={record?.journal?.topical ? ()=>setEditingTopical(true) : undefined}
    memberId={state.data.member.id}
    refreshError={state.refreshError}
    entry={entry}
    memberName={state.data.member.name}
    onClose={onClose}
    onEditDiet={record?.journal?.diet?()=>setEditingDiet(true):undefined}
    onDelete={async (id) => { await deleteRecord(id); onChanged() }}
    onUpdate={async (id, input) => { const updated = await updateRecord(id, input); onChanged(); return updated }}
    record={record}
    relatedEntries={relatedJournal.entries}
    relatedError={relatedJournal.error}
    relatedLoading={relatedJournal.loading}
    onRelatedRetry={relatedJournal.retry}
  />
}

function preciseDuration(startAt: string, endAt: string) {
  const seconds = Math.floor((Date.parse(endAt) - Date.parse(startAt)) / 1000)
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  return `${Math.floor(seconds / 3600)}小时${Math.floor(seconds % 3600 / 60)}分钟${seconds % 60 ? `${seconds % 60}秒` : ''}`
}

function preciseLocalValue(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 19)
}

function ActivityIntervalDetail({ endAt, kind, onClose, onDelete, onSave, startAt, title, information }: {
  information?: ReactNode
  endAt: string
  kind: 'sleep' | 'meal'
  onClose: () => void
  onDelete: () => Promise<void>
  onSave: (startAt: string, endAt: string) => Promise<void>
  startAt: string
  title: string
}) {
  const [editing, setEditing] = useState(false)
  const [startInput, setStartInput] = useState(() => localDateTimeValue(new Date(startAt)))
  const [endInput, setEndInput] = useState(() => localDateTimeValue(new Date(endAt)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const startTime = Date.parse(startInput)
  const endTime = Date.parse(endInput)
  const durationMinutes = Number.isFinite(startTime) && Number.isFinite(endTime) ? Math.round((endTime - startTime) / 60_000) : 0
  const validationError = !startInput || !endInput ? '请填写完整的开始和结束时间。' : endTime <= startTime ? '结束时间必须晚于开始时间。' : endTime > Date.now() ? '结束时间不能晚于现在。' : ''
  const dirty = startInput !== localDateTimeValue(new Date(startAt)) || endInput !== localDateTimeValue(new Date(endAt))
  const close = () => { if (!editing || !dirty || window.confirm('时间修改还没有保存，确定退出吗？')) onClose() }
  const save = async () => {
    if (validationError || busy) return
    setBusy(true); setError('')
    try { await onSave(startInput === localDateTimeValue(new Date(startAt)) ? startAt : localDateTimeToIso(startInput), endInput === localDateTimeValue(new Date(endAt)) ? endAt : localDateTimeToIso(endInput)); onClose() }
    catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，请稍后重试') }
    finally { setBusy(false) }
  }
  const remove = async () => {
    if (busy || !window.confirm(`确定删除这条${title}记录吗？`)) return
    setBusy(true); setError('')
    try { await onDelete(); onClose() }
    catch (reason) { setError(reason instanceof Error ? reason.message : '删除失败，请稍后重试') }
    finally { setBusy(false) }
  }
  return <BottomSheetSurface label={`${title}记录详情`} onClose={close} open title={`${title}记录详情`}>
    <div className="activity-interval-detail" data-activity-kind={kind}>
      {editing ? <div className="sleep-correction-fields"><label><span>开始时间</span><input aria-label={`${title}开始时间`} max={localDateTimeValue()} onChange={(event) => setStartInput(event.target.value)} type="datetime-local" value={startInput} /></label><label><span>结束时间</span><input aria-label={`${title}结束时间`} max={localDateTimeValue()} onChange={(event) => setEndInput(event.target.value)} type="datetime-local" value={endInput} /></label>{durationMinutes > 0 && <p>{`总时长：${Math.floor(durationMinutes / 60)}小时${durationMinutes % 60}分钟`}</p>}{(validationError || error) && <p role="alert">{validationError || error}</p>}<div className="activity-interval-actions"><HohoButton disabled={busy} onClick={() => setEditing(false)} variant="secondary">取消</HohoButton><HohoButton disabled={Boolean(validationError)} loading={busy} onClick={() => void save()}>保存时间</HohoButton></div></div> : <><dl><div><dt>开始时间</dt><dd>{new Date(startAt).toLocaleString('zh-CN', { hour12: false })}</dd></div><div><dt>结束时间</dt><dd>{new Date(endAt).toLocaleString('zh-CN', { hour12: false })}</dd></div><div><dt>总时长</dt><dd>{preciseDuration(startAt, endAt)}</dd></div></dl>{information}<HohoButton fullWidth onClick={() => setEditing(true)}>修改起止时间</HohoButton><button className="sleep-delete-action" onClick={() => void remove()} type="button">删除这条记录</button>{error && <p role="alert">{error}</p>}</>}
    </div>
  </BottomSheetSurface>
}

function StatusSheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return <BottomSheetSurface label="记录详情" onClose={onClose} open title="记录详情">{children}</BottomSheetSurface>
}

function DietInformation({ diet }: { diet: JournalDietDetails }) {
  const labels: Record<string, string> = { name: '名称', feedingMethod: '喂养方式', breastSeconds: '母乳时长（秒）', bottleMl: '奶量（mL）', foods: '食物', foodForm: '食物形态', amount: '进食量', firstTryFoods: '首次尝试', reactions: '进食后观察', meal: '餐次', appetite: '食欲', feedingStatuses: '进食状态', voiceTranscript: '语音原文', note: '备注' }
  return <dl>{Object.entries(diet).filter(([key, value]) => labels[key] && value !== undefined && value !== '').map(([key, value]) => <div key={key}><dt>{labels[key]}</dt><dd>{Array.isArray(value) ? value.join('、') : typeof value === 'object' ? Object.entries(value).map(([side, seconds]) => `${side === 'left' ? '左侧' : side === 'right' ? '右侧' : '合计'} ${seconds}秒`).join(' · ') : key === 'feedingMethod' ? ({ breast: '母乳', formula: '配方奶', expressed: '瓶喂母乳', mixed: '混合喂养' }[String(value)] ?? String(value)) : String(value)}</dd></div>)}</dl>
}

function OngoingDietDetail({ diet, origin, onClose, onSave }: { diet: JournalDietDetails; origin?: ReactNode; onClose: () => void; onSave: (diet: JournalDietDetails) => Promise<void> }) {
  const [endInput, setEndInput] = useState(() => preciseLocalValue())
  const [milk, setMilk] = useState(diet.bottleMl ? String(diet.bottleMl) : '')
  const [note, setNote] = useState(diet.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const title = diet.name || diet.meal || (diet.kind === 'feeding' ? '喂养' : '用餐')
  const validation = !endInput || !Number.isFinite(Date.parse(endInput)) ? '请填写实际结束时间' : Date.parse(endInput) <= Date.parse(diet.startedAt!) ? '结束时间必须晚于开始时间' : Date.parse(endInput) > Date.now() ? '结束时间不能晚于现在' : milk && (!Number.isFinite(Number(milk)) || Number(milk) <= 0 || Number(milk) > 5000) ? '请核对奶量' : ''
  const finish = async () => {
    if (busy || validation) return
    setBusy(true); setError('')
    try { await onSave({ ...diet, status: 'completed', endedAt: localDateTimeToIso(endInput), ...(milk ? { bottleMl: Number(milk) } : {}), note }) }
    catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，请重试') }
    finally { setBusy(false) }
  }
  return <BottomSheetSurface label={`${title}记录详情`} title={`${title}记录详情`} onClose={onClose} open><div className="activity-interval-detail"><p>{title} · 持续中…</p>{origin}<dl><div><dt>开始时间</dt><dd>{new Date(diet.startedAt!).toLocaleString('zh-CN', { hour12: false })}</dd></div><div><dt>结束时间</dt><dd>尚未结束</dd></div></dl><DietInformation diet={diet} /><label className="routine-field"><span>实际结束时间</span><input aria-label="实际结束时间" type="datetime-local" step="1" max={preciseLocalValue()} value={endInput} onChange={event => setEndInput(event.target.value)} /></label>{diet.kind === 'feeding' && <HohoInput label="奶量（mL，选填）" type="number" min={1} max={5000} value={milk} onChange={event => setMilk(event.target.value)} />}<HohoInput label="备注（选填）" maxLength={1000} value={note} onChange={event => setNote(event.target.value)} />{(validation || error) && <p role="alert">{validation || error}</p>}<HohoButton disabled={Boolean(validation)} loading={busy} fullWidth onClick={() => void finish()}>{diet.kind === 'feeding' ? '结束喂养' : '结束用餐'}</HohoButton></div></BottomSheetSurface>
}
