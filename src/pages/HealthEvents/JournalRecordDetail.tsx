import { BottomSheetSurface, HohoButton, StatusNotice } from '../../components/design-system'
import { useHealthEventDetail } from '../../hooks/useHealthEventDetail'
import { SymptomRecordSheet } from '../HealthEventDetail/components'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Moon } from 'lucide-react'

export function JournalRecordDetail({ eventId, recordId, onChanged, onClose }: {
  eventId: string
  recordId: string
  onChanged: () => void
  onClose: () => void
}) {
  const { state, retry, updateRecord, deleteRecord } = useHealthEventDetail(eventId)
  const [now, setNow] = useState(() => Date.now())
  const [ending, setEnding] = useState(false)
  const [endError, setEndError] = useState('')
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer) }, [])

  if (state.status === 'loading') return <StatusSheet onClose={onClose}><StatusNotice title="正在读取记录详情" /></StatusSheet>
  if (state.status === 'error') return <StatusSheet onClose={onClose}><StatusNotice action={<HohoButton variant="secondary" onClick={retry}>重新加载</HohoButton>} tone="error" title={state.message} /></StatusSheet>
  if (state.status === 'not-found') return <StatusSheet onClose={onClose}><StatusNotice tone="error" title="未找到这条健康随记" /></StatusSheet>

  const entry = state.data.viewModel.event.timeline.find((item) => item.sourceRecordId === recordId) ?? null
  const record = state.data.records.find((item) => item.id === recordId) ?? null
  if (!entry) return <StatusSheet onClose={onClose}><StatusNotice tone="error" title="未找到这条记录" /></StatusSheet>
  if (record?.journal?.sleep?.status === 'ongoing') {
    const sleep = record.journal.sleep
    const elapsed = Math.max(0, Math.floor((now - Date.parse(sleep.sleepAt)) / 60_000))
    const endSleep = async () => {
      if (ending) return
      setEnding(true); setEndError('')
      const wakeAt = new Date()
      const durationMinutes = Math.max(1, Math.round((wakeAt.getTime() - Date.parse(sleep.sleepAt)) / 60_000))
      try {
        await updateRecord(record.id, { journal: { ...record.journal, sleep: { ...sleep, wakeAt: wakeAt.toISOString(), durationMinutes, status: 'completed' } } })
        onChanged(); onClose()
      } catch (error) { setEndError(error instanceof Error ? error.message : '结束睡眠失败，请重试') }
      finally { setEnding(false) }
    }
    return <BottomSheetSurface label="正在记录睡眠" onClose={onClose} open title="正在记录睡眠"><div className="sleep-active-detail"><span><Moon aria-hidden="true" size={30} /></span><strong>{`${Math.floor(elapsed / 60)}小时${elapsed % 60}分钟`}</strong><h2>{`${state.data.member.name}开始睡觉了`}</h2><HohoButton fullWidth loading={ending} onClick={() => void endSleep()} size="large">结束睡眠</HohoButton><p>离开页面也会继续记录</p>{endError && <p role="alert">{endError}</p>}</div></BottomSheetSurface>
  }

  return <SymptomRecordSheet
    entry={entry}
    memberName={state.data.member.name}
    onClose={onClose}
    onDelete={async (id) => { await deleteRecord(id); onChanged() }}
    onUpdate={async (id, input) => { const updated = await updateRecord(id, input); onChanged(); return updated }}
    record={record}
  />
}

function StatusSheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return <BottomSheetSurface label="记录详情" onClose={onClose} open title="记录详情">{children}</BottomSheetSurface>
}
