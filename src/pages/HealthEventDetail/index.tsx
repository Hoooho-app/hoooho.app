import { useMemo, useState } from 'react'
import { Check, Mic } from 'lucide-react'
import { differenceInCalendarDays } from 'date-fns'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card } from '../../components/common'
import { HohoButton } from '../../components/design-system'
import type { CreateHealthEventRecordInput } from '../../types'
import { useHealthEventDetail } from '../../hooks/useHealthEventDetail'
import { createHealthEventSubject } from '../../services/healthEventPersonalization'
import { hasPersistedHealthEventRecords } from '../../services/healthEventDetailState'
import { getImageRecordTitle } from '../../services/imageAnalysisPresentation'
import {
  EventHeader,
  ActionSheet,
  ComingSoonPrompt,
  EventDetailStickyHeader,
  EventSummarySection,
  FirstRecordComposer,
  HealthRecordEditorModal,
  QuickRecordMenu,
  QuickVoiceRecordFlow,
  TemperatureChartSection,
  TimelineSection
} from './components'

export function HealthEventDetailPage() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const { state, addRecord, previewRecord, addAttachment, organizeRecord, updateTitle, correctSummary, retry } = useHealthEventDetail(eventId)
  const [actionOpen, setActionOpen] = useState(false)
  const [recordEditorOpen, setRecordEditorOpen] = useState(false)
  const [quickRecordMenuOpen, setQuickRecordMenuOpen] = useState(false)
  const [voiceRecordOpen, setVoiceRecordOpen] = useState(false)
  const [recordedMessage, setRecordedMessage] = useState('')
  const [comingSoonOpen, setComingSoonOpen] = useState(false)

  const subject = useMemo(() => state.status === 'success'
    ? createHealthEventSubject(state.data.member)
    : null, [state])

  if (state.status === 'loading') {
    return (
      <main className="app-shell bg-background pb-8">
        <EventHeader />
        <div className="page-content">
          <Card className="py-12 text-center">
            <p className="text-sm text-text-secondary">正在加载健康事件…</p>
          </Card>
        </div>
      </main>
    )
  }

  if (state.status === 'not-found') {
    return (
      <main className="app-shell bg-background pb-8">
        <EventHeader />
        <div className="page-content">
          <Card className="py-10 text-center">
            <h2 className="font-semibold">健康事件不存在或已删除</h2>
            <Button className="mt-5" onClick={() => navigate('/health-events')}>返回健康事件</Button>
          </Card>
        </div>
      </main>
    )
  }

  if (state.status === 'error') {
    return (
      <main className="app-shell bg-background pb-8">
        <EventHeader />
        <div className="page-content">
          <Card className="py-10 text-center">
            <h2 className="font-semibold">健康事件加载失败</h2>
            <p className="mt-2 text-sm text-text-secondary">{state.message}</p>
            <Button className="mt-5" onClick={retry}>重新加载</Button>
          </Card>
        </div>
      </main>
    )
  }

  const event = state.data.viewModel.event
  const hasRecords = hasPersistedHealthEventRecords(state.data.records)
  if (!subject) return null
  const eventDay = Math.max(1, differenceInCalendarDays(new Date(), new Date(event.startDate)) + 1)
  const eventLabel = `${event.title || '健康事件'} · 第${eventDay}天`

  const addHealthRecord = async (input: CreateHealthEventRecordInput) => {
    const originalText = input.content.trim()
    const attachments = input.attachments ?? []
    const bodyLocations = input.bodyLocations ?? []
    const organizationContext = bodyLocations.length ? `身体部位：${bodyLocations.join('、')}` : ''
    if (!originalText && !attachments.length && !bodyLocations.length) throw new Error('请先输入健康记录内容、选择身体部位或添加图片')

    const recordText = originalText || (bodyLocations.length ? `${bodyLocations.join('、')}不舒服` : '')
    const preview = recordText
      ? await previewRecord(recordText, { bodyLocations, selectedOccurredAt: input.occurredAt })
      : null
    if (!preview?.hasHealthFacts && !attachments.length && !bodyLocations.length) {
      throw new Error('暂未识别到健康相关信息。请描述哪里不舒服、什么时候开始或有什么症状，然后重新编辑。')
    }

    const created = await addRecord({
      type: recordText ? input.type : 'note',
      content: recordText || '图片记录',
      occurredAt: input.occurredAt
    })
    if (recordText) await organizeRecord(created.id, organizationContext)
    const savedAttachments = []
    for (const attachment of attachments) savedAttachments.push(await addAttachment({ ...attachment, recordId: created.id }))
    if (!state.data.eventDto.title && !preview?.hasHealthFacts && attachments.length > 0) {
      await updateTitle(getImageRecordTitle(savedAttachments))
    }
  }

  return (
    <main className="app-shell health-event-detail flex flex-col overflow-hidden bg-background pb-0">
      <div className="health-event-detail-fixed">
        <EventHeader />
        <EventDetailStickyHeader
          onAction={() => setActionOpen(true)}
          onAddRecord={() => setQuickRecordMenuOpen(true)}
          showActions={hasRecords}
          subject={subject}
        />
      </div>
      <div className="page-content min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {!hasRecords ? (
          <FirstRecordComposer onSave={addHealthRecord} />
        ) : (
          <>
            {state.data.eventDto.eventSummary && (
              <EventSummarySection summary={state.data.eventDto.eventSummary} onSave={correctSummary} />
            )}
            <TimelineSection event={event} />
            {event.temperatureRecords.length > 0 && <TemperatureChartSection event={event} />}
            <HohoButton fullWidth onClick={() => setVoiceRecordOpen(true)}><Mic size={18} />继续说</HohoButton>
          </>
        )}
      </div>
      {hasRecords && <HealthRecordEditorModal
        defaultRecordType="note"
        minOccurredAt={state.data.records.map((record) => record.occurredAt).sort()[0] ?? event.startDate}
        onClose={() => setRecordEditorOpen(false)}
        onSave={(result) => addHealthRecord({
          type: result.recordType,
          content: result.originalText,
          occurredAt: result.occurredAt,
          attachments: result.attachments,
          bodyLocations: result.bodyLocations
        })}
        open={recordEditorOpen}
        templateType="timeline"
      />}
      {hasRecords && <QuickRecordMenu
        onClose={() => setQuickRecordMenuOpen(false)}
        onManual={() => { setQuickRecordMenuOpen(false); setRecordEditorOpen(true) }}
        onVoice={() => { setQuickRecordMenuOpen(false); setVoiceRecordOpen(true) }}
        open={quickRecordMenuOpen}
      />}
      {hasRecords && <QuickVoiceRecordFlow
        eventLabel={eventLabel}
        member={{ name: subject.name, avatar: subject.avatar }}
        onClose={() => setVoiceRecordOpen(false)}
        onConfirm={async (records) => {
          for (const record of records) await addHealthRecord(record)
          setRecordedMessage(`已记录 ${records.length} 条`)
          window.setTimeout(() => setRecordedMessage(''), 3000)
        }}
        onParse={(text, occurredAt) => previewRecord(text, { selectedOccurredAt: occurredAt })}
        onSwitchEvent={() => navigate('/health-events')}
        open={voiceRecordOpen}
      />}
      {hasRecords && <ActionSheet onClose={() => setActionOpen(false)} onComingSoon={() => setComingSoonOpen(true)} open={actionOpen} />}
      {hasRecords && <ComingSoonPrompt onClose={() => setComingSoonOpen(false)} open={comingSoonOpen} />}
      {recordedMessage && <div aria-live="polite" className="quick-record-toast" role="status"><Check size={17} />{recordedMessage}</div>}
    </main>
  )
}
