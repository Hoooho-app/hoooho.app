import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card } from '../../components/common'
import type { CreateHealthEventRecordInput } from '../../types'
import { useHealthEventDetail } from '../../hooks/useHealthEventDetail'
import { createHealthEventSubject } from '../../services/healthEventPersonalization'
import {
  EventHeader,
  ActionSheet,
  ComingSoonPrompt,
  EventDetailStickyHeader,
  EventSummarySection,
  FirstRecordComposer,
  HealthRecordEditorModal,
  TemperatureChartSection,
  TimelineSection
} from './components'

export function HealthEventDetailPage() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const { state, addRecord, previewRecord, addAttachment, organizeRecord, updateTitle, correctSummary, retry } = useHealthEventDetail(eventId)
  const [actionOpen, setActionOpen] = useState(false)
  const [recordEditorOpen, setRecordEditorOpen] = useState(false)
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
  const hasOrganizedRecord = state.data.organizations.some((organization) => organization.healthAIOutput?.facts.length > 0)
    || state.data.attachments.length > 0
  if (!subject) return null

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
      content: recordText || `添加附件：${attachments.map((attachment) => attachment.name).join('、')}`,
      occurredAt: input.occurredAt
    })
    if (recordText) await organizeRecord(created.id, organizationContext)
    for (const attachment of attachments) await addAttachment({ ...attachment, recordId: created.id })
    if (!state.data.eventDto.title && !preview?.hasHealthFacts && attachments.length > 0) {
      await updateTitle('健康附件')
    }
  }

  return (
    <main className="app-shell health-event-detail flex flex-col overflow-hidden bg-background pb-0">
      <div className="health-event-detail-fixed">
        <EventHeader />
        <EventDetailStickyHeader onAction={() => setActionOpen(true)} onAddRecord={() => setRecordEditorOpen(true)} subject={subject} />
      </div>
      <div className="page-content min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {!hasOrganizedRecord ? (
          <FirstRecordComposer onSave={addHealthRecord} />
        ) : (
          <>
            {state.data.eventDto.eventSummary && (
              <EventSummarySection summary={state.data.eventDto.eventSummary} onSave={correctSummary} />
            )}
            <TimelineSection event={event} />
            {event.temperatureRecords.length > 0 && <TemperatureChartSection event={event} />}
          </>
        )}
      </div>
      <HealthRecordEditorModal
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
      />
      <ActionSheet onClose={() => setActionOpen(false)} onComingSoon={() => setComingSoonOpen(true)} open={actionOpen} />
      <ComingSoonPrompt onClose={() => setComingSoonOpen(false)} open={comingSoonOpen} />
    </main>
  )
}
