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
import { createQuickRecordCandidates, type QuickRecordCandidate } from '../../features/quick-record'
import {
  EventHeader,
  ActionSheet,
  ComingSoonPrompt,
  EventDetailStickyHeader,
  FirstRecordComposer,
  type FirstRecordComposerHandle,
  QuickVoiceRecordFlow,
  TimelineSection
} from './components'

export function HealthEventDetailPage() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const { state, addRecord, commitRecord, previewRecord, addAttachment, organizeRecord, updateRecord, deleteRecord, updateTitle, retry } = useHealthEventDetail(eventId)
  const [actionOpen, setActionOpen] = useState(false)
  const [voiceRecordOpen, setVoiceRecordOpen] = useState(false)
  const [recordedMessage, setRecordedMessage] = useState('')
  const [comingSoonOpen, setComingSoonOpen] = useState(false)
  const [firstRecordCanSave, setFirstRecordCanSave] = useState(false)
  const [firstRecordSaving, setFirstRecordSaving] = useState(false)
  const firstRecordRef = useRef<FirstRecordComposerHandle>(null)
  const pendingFirstRecordRef = useRef<{ attachmentIndexes: Set<number>; fingerprint: string; organized: boolean; record: HealthEventRecordApiDto; savedAttachments: EventAttachmentApiDto[] } | null>(null)
  const pendingQuickRecordRef = useRef<{ records: Record<string, HealthEventRecordApiDto>; transcript: string } | null>(null)
  const updateFirstRecordAvailability = useCallback((available: boolean, saving: boolean) => {
    setFirstRecordCanSave(available)
    setFirstRecordSaving(saving)
  }, [])

  const subject = useMemo(() => state.status === 'success'
    ? createHealthEventSubject(state.data.member)
    : null, [state])

  if (state.status === 'loading') {
    return (
      <main className="app-shell pb-8">
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
      <main className="app-shell pb-8">
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
      <main className="app-shell pb-8">
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
    let preview = null
    let organizationMessage = ''
    if (recordText) {
      try {
        preview = await previewRecord(recordText, { bodyLocations, selectedOccurredAt: input.occurredAt })
        if (!preview.hasHealthFacts) organizationMessage = '原始记录已保存，暂未自动整理'
      } catch {
        organizationMessage = '原始记录已保存，暂未自动整理'
      }
    }

    const fingerprint = JSON.stringify(input)
    let pending = pendingFirstRecordRef.current
    if (!pending || pending.fingerprint !== fingerprint) {
      const created = await addRecord(
        { type: recordText ? input.type : 'note', content: recordText || '图片记录', occurredAt: input.occurredAt, bodyLocations },
        { deferCommit: true }
      )
      pending = { attachmentIndexes: new Set(), fingerprint, organized: false, record: created, savedAttachments: [] }
      pendingFirstRecordRef.current = pending
    }
    if (recordText && !pending.organized) {
      try {
        const organization = await organizeRecord(pending.record.id, organizationContext)
        if (organization.status !== 'completed') organizationMessage = '原始记录已保存，暂未自动整理'
      } catch {
        organizationMessage = '原始记录已保存，自动整理失败'
      }
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
    navigate('/health-events', { replace: true })
    return organizationMessage
  }

  const saveQuickRecord = async (transcript: string, occurredAt: string, candidates: QuickRecordCandidate[]) => {
    let pending = pendingQuickRecordRef.current
    if (!pending || pending.transcript !== transcript) {
      pending = { records: {}, transcript }
      pendingQuickRecordRef.current = pending
    }
    const items = candidates.length ? candidates : [{
      id: 'raw-record', type: 'note' as const, title: transcript, content: transcript, occurredAt,
      sourceType: 'user_record' as const, measurementMethod: 'unspecified' as const, fields: []
    }]
    let message = '已记录'
    for (const item of items) {
      const key = `${item.id}:${item.occurredAt}:${item.content}`
      let record = pending.records[key]
      if (!record) {
        record = await addRecord({
          type: item.type,
          content: item.content,
          occurredAt: item.occurredAt,
          sourceType: item.sourceType,
          sourceText: transcript,
          measurementMethod: item.measurementMethod
        })
        pending.records[key] = record
      }
      try {
        const organization = await organizeRecord(record.id)
        if (organization.status !== 'completed') message = '记录已保存，部分内容暂未整理'
      } catch {
        message = '记录已保存，部分内容暂未整理'
      }
    }
    pendingQuickRecordRef.current = null
    if (message === '已记录' && items.length > 1) message = `已整理为 ${items.length} 条症状记录`
    setRecordedMessage(message)
    window.setTimeout(() => setRecordedMessage(''), 3000)
    return message
  }

  const previewQuickRecord = async (transcript: string, occurredAt: string) => {
    const preview = await previewRecord(transcript, { selectedOccurredAt: occurredAt })
    if (!preview.hasHealthFacts) return []
    return createQuickRecordCandidates(preview, occurredAt)
  }

  return (
    <main className="app-shell health-event-detail flex flex-col overflow-hidden pb-0" data-first-record={!hasRecords}>
      <div className="health-event-detail-fixed">
        <EventHeader confirmDisabled={!firstRecordCanSave} confirming={firstRecordSaving} onConfirm={hasRecords ? undefined : () => firstRecordRef.current?.submit()} title={hasRecords ? '症状跟踪' : '记录情况'} />
        <EventDetailStickyHeader
          onAction={() => setActionOpen(true)}
          showActions={hasRecords}
          subject={subject}
        />
      </div>
      <div className="page-content min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {!hasRecords ? (
          <FirstRecordComposer onAvailabilityChange={updateFirstRecordAvailability} onRecorded={(message) => { setRecordedMessage(message || '已记录'); window.setTimeout(() => setRecordedMessage(''), 3000) }} onSave={addHealthRecord} ref={firstRecordRef} />
        ) : (
          <>
            <TimelineSection
              event={event}
              memberName={state.data.member.name}
              onDeleteRecord={deleteRecord}
              onUpdateRecord={updateRecord}
              records={state.data.records}
            />
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
