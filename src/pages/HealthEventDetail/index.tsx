import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card } from '../../components/common'
import type { CreateHealthEventRecordInput, HealthEventStage } from '../../types'
import { useHealthEventDetail } from '../../hooks/useHealthEventDetail'
import { createHealthEventSubject } from '../../services/healthEventPersonalization'
import {
  EventHeader,
  EventIdentitySection,
  EventStatus,
  FirstRecordComposer,
  AttachmentSection,
  ConcernSection,
  MedicalInfoSection,
  NextActionSection,
  SymptomSection,
  StageDetailSection,
  TemperatureChartSection,
  TimelineSection
} from './components'

export function HealthEventDetailPage() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const { state, addRecord, addAttachment, organizeRecord, updateStage, retry } = useHealthEventDetail(eventId)
  const loadedStage = state.status === 'success' ? state.data.viewModel.stage : 'observing'
  const [stage, setStage] = useState<HealthEventStage>(loadedStage)

  useEffect(() => {
    setStage(loadedStage)
  }, [loadedStage])

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
  const isFirstRecord = state.data.records.length === 0
  if (!subject) return null

  const addHealthRecord = async (input: CreateHealthEventRecordInput) => {
    const originalText = input.content.trim()
    const attachments = input.attachments ?? []
    if (!originalText && !attachments.length) throw new Error('请先输入健康记录内容或添加图片')
    const created = await addRecord({
      type: originalText ? input.type : 'note',
      content: originalText || `添加附件：${attachments.map((attachment) => attachment.name).join('、')}`,
      occurredAt: input.occurredAt
    })
    if (originalText) await organizeRecord(created.id)
    for (const attachment of attachments) await addAttachment(attachment)
  }

  const changeStage = (nextStage: HealthEventStage) => {
    const previousStage = stage
    setStage(nextStage)
    void updateStage(nextStage).catch(() => setStage(previousStage))
  }

  const saveFirstRecord = async (input: CreateHealthEventRecordInput) => {
    const rawInput = input.content.trim()
    if (!rawInput) throw new Error('请先描述当前不舒服的情况')
    const created = await addRecord({
      type: 'symptom',
      content: rawInput,
      occurredAt: input.occurredAt
    })
    await organizeRecord(created.id)
  }

  return (
    <main className="app-shell bg-background pb-8">
      <EventHeader />
      <div className="page-content space-y-6">
        <EventIdentitySection subject={subject} />
        {isFirstRecord ? (
          <FirstRecordComposer onSave={saveFirstRecord} />
        ) : (
          <>
            {event.symptoms.length > 0 && <SymptomSection event={event} onAddRecord={addHealthRecord} />}
            <EventStatus stage={stage} onStageChange={changeStage} />
            <StageDetailSection event={event} stage={stage} />
            {event.timeline.length > 0 && <TimelineSection event={event} onAddRecord={addHealthRecord} />}
            {event.temperatureRecords.length > 0 && <TemperatureChartSection event={event} />}
            {event.attachments.length > 0 && <AttachmentSection event={event} />}
            {event.concerns.length > 0 && <ConcernSection event={event} />}
            <MedicalInfoSection event={event} />
            <NextActionSection status={event.status} onMarkRecovered={async () => { await updateStage('recovered') }} />
          </>
        )}
      </div>
    </main>
  )
}
