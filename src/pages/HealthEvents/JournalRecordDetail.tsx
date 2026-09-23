import { BottomSheetSurface, HohoButton, StatusNotice } from '../../components/design-system'
import { useHealthEventDetail } from '../../hooks/useHealthEventDetail'
import { SymptomRecordSheet } from '../HealthEventDetail/components'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Moon } from 'lucide-react'
import { useJournal } from './useJournal'
import { useAppStore } from '../../store/useAppStore'
import { healthEventRecordService } from '../../services/healthEventRecords'
import { localDateTimeToIso, localDateTimeValue } from '../../utils/healthOccurredAt'

export function JournalRecordDetail({ eventId, recordId, onChanged, onClose }: {
  eventId: string
  recordId: string
  onChanged: () => void
  onClose: () => void
}) {
  const { state, retry, updateRecord, deleteRecord } = useHealthEventDetail(eventId)
  const memberId = useAppStore((value) => value.currentMemberId)
  const token = useAppStore((value) => value.authToken ?? '')
  const relatedJournal = useJournal(memberId, token, 0)
  const [now, setNow] = useState(() => Date.now())
  const [ending, setEnding] = useState(false)
  const [endError, setEndError] = useState('')
  const [correctionOpen, setCorrectionOpen] = useState(false)
  const [sleepAtInput, setSleepAtInput] = useState('')
  const [wakeAtInput, setWakeAtInput] = useState('')
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer) }, [])

  if (state.status === 'loading') return <StatusSheet onClose={onClose}><StatusNotice title="正在读取记录详情" /></StatusSheet>
  if (state.status === 'error') return <StatusSheet onClose={onClose}><StatusNotice action={<HohoButton variant="secondary" onClick={retry}>重新加载</HohoButton>} tone="error" title={state.message} /></StatusSheet>
  if (state.status === 'not-found') return <StatusSheet onClose={onClose}><StatusNotice tone="error" title="未找到这条健康随记" /></StatusSheet>

  const entry = state.data.viewModel.event.timeline.find((item) => item.sourceRecordId === recordId) ?? null
  const record = state.data.records.find((item) => item.id === recordId) ?? null
  if (!entry) return <StatusSheet onClose={onClose}><StatusNotice tone="error" title="未找到这条记录" /></StatusSheet>
  if (record?.journal?.sleep?.status === 'ongoing') {
    const sleep = record.journal.sleep
    const elapsed = Math.floor((now - Date.parse(sleep.sleepAt)) / 60_000)
    const abnormal = !Number.isFinite(elapsed) || elapsed < 0 || elapsed > 1440
    const openCorrection = () => {
      setSleepAtInput(localDateTimeValue(new Date(sleep.sleepAt)))
      setWakeAtInput(localDateTimeValue())
      setCorrectionOpen(true); setEndError('')
    }
    const endSleep = async () => {
      if (ending) return
      if (abnormal && !correctionOpen) { openCorrection(); return }
      setEnding(true); setEndError('')
      try {
        const sleepAt = correctionOpen ? localDateTimeToIso(sleepAtInput) : sleep.sleepAt
        const wakeAt = correctionOpen ? localDateTimeToIso(wakeAtInput) : new Date().toISOString()
        const duration = Math.round((Date.parse(wakeAt) - Date.parse(sleepAt)) / 60_000)
        if (Date.parse(sleepAt) > Date.now() || Date.parse(wakeAt) > Date.now() || duration <= 0 || duration > 1440) throw new Error('请确认结束时间晚于开始时间，且睡眠时长不超过24小时。')
        await healthEventRecordService.endSleep(record.id, { sleepAt, wakeAt }, token)
        onChanged(); onClose()
      } catch (error) { setEndError(error instanceof Error ? error.message : '结束睡眠失败，请重试') }
      finally { setEnding(false) }
    }
    return <BottomSheetSurface label="正在记录睡眠" onClose={onClose} open title="正在记录睡眠"><div className="sleep-active-detail"><span><Moon aria-hidden="true" size={30} /></span>{abnormal ? <><h2>这次睡眠记录尚未结束，请核对时间。</h2><p>{`原开始时间：${new Date(sleep.sleepAt).toLocaleString('zh-CN', { hour12: false })}`}</p></> : <><strong>{`${Math.floor(elapsed / 60)}小时${elapsed % 60}分钟`}</strong><h2>{`${state.data.member.name}开始睡觉了`}</h2></>}{correctionOpen && <div className="sleep-correction-fields"><label><span>实际开始时间</span><input aria-label="实际开始时间" max={localDateTimeValue()} onChange={(event) => setSleepAtInput(event.target.value)} type="datetime-local" value={sleepAtInput} /></label><label><span>实际结束时间</span><input aria-label="实际结束时间" max={localDateTimeValue()} onChange={(event) => setWakeAtInput(event.target.value)} type="datetime-local" value={wakeAtInput} /></label></div>}<HohoButton fullWidth loading={ending} onClick={() => void endSleep()} size="large">{correctionOpen ? '确认并结束睡眠' : abnormal ? '核对时间' : '结束睡眠'}</HohoButton><p>离开页面也会继续记录</p>{endError && <p role="alert">{endError}</p>}<button className="sleep-delete-action" onClick={async () => { if (!window.confirm('确定删除这条睡眠记录吗？')) return; await deleteRecord(record.id); onChanged(); onClose() }} type="button">删除这条记录</button></div></BottomSheetSurface>
  }

  return <SymptomRecordSheet
    entry={entry}
    memberName={state.data.member.name}
    onClose={onClose}
    onDelete={async (id) => { await deleteRecord(id); onChanged() }}
    onUpdate={async (id, input) => { const updated = await updateRecord(id, input); onChanged(); return updated }}
    record={record}
    relatedEntries={relatedJournal.entries}
    relatedError={relatedJournal.error}
    relatedLoading={relatedJournal.loading}
    onRelatedRetry={relatedJournal.retry}
  />
}

function StatusSheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return <BottomSheetSurface label="记录详情" onClose={onClose} open title="记录详情">{children}</BottomSheetSurface>
}
