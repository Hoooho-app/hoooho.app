import { BottomSheetSurface, HohoButton, StatusNotice } from '../../components/design-system'
import { useHealthEventDetail } from '../../hooks/useHealthEventDetail'
import { SymptomRecordSheet } from '../HealthEventDetail/components'
import type { ReactNode } from 'react'

export function JournalRecordDetail({ eventId, recordId, onChanged, onClose }: {
  eventId: string
  recordId: string
  onChanged: () => void
  onClose: () => void
}) {
  const { state, retry, updateRecord, deleteRecord } = useHealthEventDetail(eventId)

  if (state.status === 'loading') return <StatusSheet onClose={onClose}><StatusNotice title="正在读取记录详情" /></StatusSheet>
  if (state.status === 'error') return <StatusSheet onClose={onClose}><StatusNotice action={<HohoButton variant="secondary" onClick={retry}>重新加载</HohoButton>} tone="error" title={state.message} /></StatusSheet>
  if (state.status === 'not-found') return <StatusSheet onClose={onClose}><StatusNotice tone="error" title="未找到这条健康随记" /></StatusSheet>

  const entry = state.data.viewModel.event.timeline.find((item) => item.sourceRecordId === recordId) ?? null
  const record = state.data.records.find((item) => item.id === recordId) ?? null
  if (!entry) return <StatusSheet onClose={onClose}><StatusNotice tone="error" title="未找到这条记录" /></StatusSheet>

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
