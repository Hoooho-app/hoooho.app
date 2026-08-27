import { useCallback, useMemo, useRef, useState } from 'react'
import { Check, Mic } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card } from '../../components/common'
import { HohoButton } from '../../components/design-system'
import type { CreateHealthEventRecordInput, EventAttachmentApiDto, HealthEventRecordApiDto } from '../../types'
import { useHealthEventDetail } from '../../hooks/useHealthEventDetail'
import { createHealthEventSubject } from '../../services/healthEventPersonalization'
import { hasPersistedHealthEventRecords } from '../../services/healthEventDetailState'
import { getImageRecordTitle } from '../../services/imageAnalysisPresentation'
import { createQuickRecordCandidates } from '../../features/quick-record'
import {
  EventHeader,
  ActionSheet,
  ComingSoonPrompt,
  EventDetailStickyHeader,
  EventSummarySection,
  FirstRecordComposer,
  type FirstRecordComposerHandle,
  QuickVoiceRecordFlow,
  TemperatureChartSection,
  TimelineSection
} from './components'
import { needsNewQuickRecord } from './components/quickRecordPresentation'

export function HealthEventDetailPage() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const { state, addRecord, commitRecord, previewRecord, addAttachment, organizeRecord, updateTitle, retry } = useHealthEventDetail(eventId)
  const [actionOpen, setActionOpen] = useState(false)
  const [voiceRecordOpen, setVoiceRecordOpen] = useState(false)
  const [recordedMessage, setRecordedMessage] = useState('')
  const [comingSoonOpen, setComingSoonOpen] = useState(false)
  const [firstRecordCanSave, setFirstRecordCanSave] = useState(false)
  const [firstRecordSaving, setFirstRecordSaving] = useState(false)
  const firstRecordRef = useRef<FirstRecordComposerHandle>(null)
  const pendingFirstRecordRef = useRef<{ attachmentIndexes: Set<number>; fingerprint: string; organized: boolean; record: HealthEventRecordApiDto; savedAttachments: EventAttachmentApiDto[] } | null>(null)
  const pendingQuickRecordRef = useRef<{ recordId: string; transcript: string } | null>(null)
  const updateFirstRecordAvailability = useCallback((available: boolean, saving: boolean) => {
    setFirstRecordCanSave(available)
    setFirstRecordSaving(saving)
  }, [])

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

    const fingerprint = JSON.stringify(input)
    let pending = pendingFirstRecordRef.current
    if (!pending || pending.fingerprint !== fingerprint) {
      const created = await addRecord(
        { type: recordText ? input.type : 'note', content: recordText || '图片记录', occurredAt: input.occurredAt },
        { deferCommit: true }
      )
      pending = { attachmentIndexes: new Set(), fingerprint, organized: false, record: created, savedAttachments: [] }
      pendingFirstRecordRef.current = pending
    }
    if (recordText && !pending.organized) {
      await organizeRecord(pending.record.id, organizationContext)
      pending.organized = true
    }
    for (let index = 0; index < attachments.length; index += 1) {
      if (pending.attachmentIndexes.has(index)) continue
      pending.savedAttachments.push(await addAttachment({ ...attachments[index], recordId: pending.record.id }))
      pending.attachmentIndexes.add(index)
    }
    if (!state.data.eventDto.title && !preview?.hasHealthFacts && attachments.length > 0) {
      await updateTitle(getImageRecordTitle(pending.savedAttachments))
    }
    commitRecord(pending.record)
    pendingFirstRecordRef.current = null
  }

  const saveQuickRecord = async (transcript: string, occurredAt: string) => {
    let pending = pendingQuickRecordRef.current
    if (needsNewQuickRecord(pending, transcript)) {
      const created = await addRecord({ type: 'note', content: transcript, occurredAt })
      pending = { recordId: created.id, transcript }
      pendingQuickRecordRef.current = pending
    }
    if (!pending) throw new Error('保存失败，请重试')
    const organization = await organizeRecord(pending.recordId)
    if (organization.status !== 'completed') throw new Error('原始记录已保存，整理失败，请重试')
    pendingQuickRecordRef.current = null
    setRecordedMessage('已记录')
    window.setTimeout(() => setRecordedMessage(''), 3000)
  }

  const previewQuickRecord = async (transcript: string, occurredAt: string) => {
    const preview = await previewRecord(transcript, { selectedOccurredAt: occurredAt })
    if (!preview.hasHealthFacts) throw new Error('暂未识别到健康记录，请补充发生了什么、时间或数值。')
    return createQuickRecordCandidates(preview, occurredAt)
  }

  return (
    <main className="app-shell health-event-detail flex flex-col overflow-hidden bg-background pb-0" data-first-record={!hasRecords}>
      <div className="health-event-detail-fixed">
        <EventHeader confirmDisabled={!firstRecordCanSave} confirming={firstRecordSaving} onConfirm={hasRecords ? undefined : () => firstRecordRef.current?.submit()} title={hasRecords ? '健康事件详情' : '记录情况'} />
        <EventDetailStickyHeader
          onAction={() => setActionOpen(true)}
          showActions={hasRecords}
          subject={subject}
        />
      </div>
      <div className="page-content min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {!hasRecords ? (
          <FirstRecordComposer onAvailabilityChange={updateFirstRecordAvailability} onRecorded={() => { setRecordedMessage('已记录'); window.setTimeout(() => setRecordedMessage(''), 3000) }} onSave={addHealthRecord} ref={firstRecordRef} />
        ) : (
          <>
            {state.data.eventDto.eventSummary && (
              <EventSummarySection summary={state.data.eventDto.eventSummary} />
            )}
            <TimelineSection event={event} />
            {event.temperatureRecords.length > 0 && <TemperatureChartSection event={event} />}
          </>
        )}
      </div>
      {hasRecords && !voiceRecordOpen && <button className="quick-record-trigger" onClick={() => setVoiceRecordOpen(true)} type="button"><Mic size={18} />快捷记录</button>}
      {hasRecords && <QuickVoiceRecordFlow
        onClose={() => setVoiceRecordOpen(false)}
        onConfirm={saveQuickRecord}
        onPreview={previewQuickRecord}
        open={voiceRecordOpen}
      />}
      {hasRecords && <ActionSheet context={{ event: { ...event, summary: state.data.eventDto.eventSummary?.displayedResult.summary ?? event.summary }, member: state.data.member }} onClose={() => setActionOpen(false)} onComingSoon={() => setComingSoonOpen(true)} onOnlineConsultation={() => { setActionOpen(false); navigate(`/health-events/${event.id}/online-consultation`) }} open={actionOpen} />}
      {hasRecords && <ComingSoonPrompt onClose={() => setComingSoonOpen(false)} open={comingSoonOpen} />}
      {recordedMessage && <div aria-live="polite" className="quick-record-toast" role="status"><Check size={17} />{recordedMessage}</div>}
    </main>
  )
}
