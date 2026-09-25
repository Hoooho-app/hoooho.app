import { useEffect, useState } from 'react'
import {
  BottomSheetSurface,
  HohoButton,
  StatusNotice,
} from '../../components/design-system'
import { healthEventRecordService } from '../../services/healthEventRecords'
import type { HealthEventRecordApiDto } from '../../types'
import { JournalRecordDetail } from '../HealthEvents/JournalRecordDetail'
import { MedicationRecordFlow } from '../HealthEvents/MedicationRecordFlow'
import { getLocalDateKey } from '../../utils/localCalendarDate'

export function SourceRecordEditor({
  eventId,
  recordId,
  memberId,
  token,
  onClose,
  onChanged,
}: {
  eventId: string
  recordId: string
  memberId: string
  token: string
  onClose: () => void
  onChanged: () => void
}) {
  const [record, setRecord] = useState<HealthEventRecordApiDto | null>(null),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0)
  useEffect(() => {
    const c = new AbortController()
    healthEventRecordService
      .list(eventId, token, c.signal)
      .then((records) => {
        if (c.signal.aborted) return
        const value = records.find((r) => r.id === recordId)
        if (!value) throw new Error('原始记录已不可用')
        setRecord(value)
      })
      .catch((reason) => {
        if (!c.signal.aborted)
          setError(reason instanceof Error ? reason.message : '读取失败')
      })
    return () => c.abort()
  }, [eventId, recordId, token, retry])
  if (!record)
    return (
      <BottomSheetSurface
        open
        label="原始记录"
        title="原始记录"
        onClose={onClose}
      >
        <StatusNotice
          title={error || '正在读取原始记录'}
          tone={error ? 'error' : 'info'}
        />
        {error && (
          <HohoButton
            onClick={() => {
              setError('')
              setRetry((n) => n + 1)
            }}
          >
            重试
          </HohoButton>
        )}
      </BottomSheetSurface>
    )
  if (record.journal?.medication)
    return (
      <MedicationRecordFlow
        recordEditOnly
        memberId={memberId}
        token={token}
        selectedDay={record.occurredAt.slice(0, 10)}
        today={getLocalDateKey(new Date())!}
        initialMedication={record.journal.medication}
        initialOccurredAt={record.occurredAt}
        onBack={onClose}
        onClose={onClose}
        onSaved={() => undefined}
        onConfirm={async (content, occurredAt, _channel, _photos, journal) => {
          const original = record.journal!.medication!
          await healthEventRecordService.update(
            record.id,
            {
              content,
              occurredAt,
              journal: {
                ...record.journal,
                ...journal,
                medication: {
                  ...original,
                  ...journal.medication!,
                  administrationRoute: original.administrationRoute,
                  medications: journal.medication?.medications?.map((item) => ({
                    ...item,
                    photoIds:
                      original.medications?.find((old) => old.id === item.id)
                        ?.photoIds ?? item.photoIds,
                  })),
                },
              },
            },
            token,
          )
          onChanged()
          return '原始用药记录已保存'
        }}
      />
    )
  return (
    <JournalRecordDetail
      eventId={eventId}
      recordId={recordId}
      onClose={onClose}
      onChanged={onChanged}
    />
  )
}
