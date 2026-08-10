import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card } from '../../components/common'
import type { CreateHealthEventRecordInput } from '../../types'
import { useHealthEventDetail } from '../../hooks/useHealthEventDetail'
import { createHealthEventSubject } from '../../services/healthEventPersonalization'
import { deriveHealthEventTitle } from '../../services/healthEventFacts'
import {
  EventHeader,
  EventIdentitySection,
  FirstRecordComposer,
  TemperatureChartSection,
  TimelineSection
} from './components'

export function HealthEventDetailPage() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const { state, addRecord, previewRecord, addAttachment, organizeRecord, updateTitle, retry } = useHealthEventDetail(eventId)

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
  const hasOrganizedRecord = state.data.organizations.some((organization) => organization.status === 'completed')
    || (state.data.records.length > 0 && state.data.attachments.length > 0)
  if (!subject) return null

  const addHealthRecord = async (input: CreateHealthEventRecordInput) => {
    const originalText = input.content.trim()
    const attachments = input.attachments ?? []
    const bodyLocations = input.bodyLocations ?? []
    const organizationContext = bodyLocations.length ? `身体部位：${bodyLocations.join('、')}` : ''
    if (!originalText && !attachments.length) throw new Error('请先输入健康记录内容或添加图片')

    const preview = originalText ? await previewRecord(originalText) : null
    if (!preview?.hasHealthFacts && !attachments.length) {
      throw new Error('暂未识别到健康相关信息。请描述哪里不舒服、什么时候开始或有什么症状，然后重新编辑。')
    }

    const created = await addRecord({
      type: originalText ? input.type : 'note',
      content: originalText || `添加附件：${attachments.map((attachment) => attachment.name).join('、')}`,
      occurredAt: input.occurredAt
    })
    if (originalText) await organizeRecord(created.id, organizationContext)
    for (const attachment of attachments) await addAttachment({ ...attachment, recordId: created.id })
    if (!state.data.eventDto.title) {
      const title = preview
        ? deriveHealthEventTitle(preview.organizedHealthData, attachments.length > 0)
        : '健康附件'
      if (title) await updateTitle(title.slice(0, 120))
    }
  }

  return (
    <main className="app-shell health-event-detail bg-background pb-8">
      <EventHeader />
      <div className="page-content">
        <EventIdentitySection subject={subject} />
        {!hasOrganizedRecord ? (
          <FirstRecordComposer onSave={addHealthRecord} />
        ) : (
          <>
            <TimelineSection
              event={event}
              firstRecordTime={state.data.records.map((record) => record.occurredAt).sort()[0]}
              onAddRecord={addHealthRecord}
            />
            {event.temperatureRecords.length > 0 && <TemperatureChartSection event={event} />}
          </>
        )}
      </div>
    </main>
  )
}
