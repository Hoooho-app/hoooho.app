import { useCallback, useMemo, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card } from '../../components/common'
import { HohoButton } from '../../components/design-system'
import { QuickRecordTrigger } from '../../components/health'
import type { CreateHealthEventRecordInput, EventAttachmentApiDto, HealthEventRecordApiDto } from '../../types'
import { useHealthEventDetail } from '../../hooks/useHealthEventDetail'
import { createHealthEventSubject } from '../../services/healthEventPersonalization'
import { hasPersistedHealthEventRecords } from '../../services/healthEventDetailState'
import { getImageRecordTitle } from '../../services/imageAnalysisPresentation'
import { createQuickRecordCandidates, type QuickRecordCandidate } from '../../features/quick-record'
import { createHealthProfilePromptSections } from '../../features/ask-ai'
import { getStoredHealthProfileSectionSnapshots } from '../../features/health-profile/utils/getHealthProfileSectionGroups'
import { useAppStore } from '../../store/useAppStore'
import { findMultimodalConflicts } from '../../features/health-attachments/multimodalConflict'
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
  const currentMemberId = useAppStore((appState) => appState.currentMemberId)
  const { state, addRecord, commitRecord, previewRecord, confirmPreview, previewAttachment, addAttachment, organizeRecord, updateRecord, deleteRecord, updateTitle, retry } = useHealthEventDetail(eventId)
  const [actionOpen, setActionOpen] = useState(false)
  const [voiceRecordOpen, setVoiceRecordOpen] = useState(false)
  const [recordSheetOpen, setRecordSheetOpen] = useState(false)
  const [recordedMessage, setRecordedMessage] = useState('')
  const [comingSoonOpen, setComingSoonOpen] = useState(false)
  const [firstRecordCanSave, setFirstRecordCanSave] = useState(false)
  const [firstRecordSaving, setFirstRecordSaving] = useState(false)
  const firstRecordRef = useRef<FirstRecordComposerHandle>(null)
  const pendingFirstRecordRef = useRef<{ attachmentIndexes: Set<number>; fingerprint: string; organized: boolean; record: HealthEventRecordApiDto; savedAttachments: EventAttachmentApiDto[] } | null>(null)
  const pendingImageConfirmationRef = useRef<string | null>(null)
  const pendingQuickRecordRef = useRef<{ idempotencyKey: string; previewId: string } | null>(null)
  const updateFirstRecordAvailability = useCallback((available: boolean, saving: boolean) => {
    setFirstRecordCanSave(available)
    setFirstRecordSaving(saving)
  }, [])

  const subject = useMemo(() => state.status === 'success'
    ? createHealthEventSubject(state.data.member)
    : null, [state])
  const promptHealthProfile = useMemo(() => state.status === 'success'
    ? createHealthProfilePromptSections(getStoredHealthProfileSectionSnapshots(state.data.member.id))
    : [], [state])

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
    const fingerprint = JSON.stringify(input)

    const recordText = originalText || (bodyLocations.length ? `${bodyLocations.join('、')}不舒服` : '')
    let preview = null
    let organizationMessage = ''
    let previewFailed = false
    if (recordText) {
      try {
        preview = await previewRecord(recordText, { bodyLocations, selectedOccurredAt: input.occurredAt })
        if (!preview.hasHealthFacts) organizationMessage = '原始记录已保存，暂未自动整理'
      } catch {
        previewFailed = true
        organizationMessage = '原始记录已保存，暂未自动整理'
      }
    }
    if (input.sourceType === 'voice_record' && (previewFailed || !preview?.hasHealthFacts || !['health_fact', 'uncertain_health_fact'].includes(preview.intent))) {
      return '未识别到健康信息，本次未记录'
    }

    // Images remain ephemeral until every item passes server-side decode, safety and health-relevance checks.
    if (attachments.length) {
      const drafts = await Promise.all(attachments.map((attachment) => previewAttachment(attachment)))
      if (drafts.some((draft) => !draft.canConfirm)) throw new Error('图片未通过健康相关性或安全检查，本次未创建记录')
      const conflicts = findMultimodalConflicts(preview?.healthAIOutput.facts ?? [], drafts)
      if (conflicts.length) {
        const conflict = conflicts[0]
        throw new Error(`${conflict.concept}存在来源冲突：${conflict.imageSource} ${conflict.imageValue}，${conflict.textSource} ${conflict.textValue}。请修改描述或移除图片后确认。`)
      }
      if (pendingImageConfirmationRef.current !== fingerprint) {
        pendingImageConfirmationRef.current = fingerprint
        const summaries = drafts.map((draft) => draft.analysis.summary).filter(Boolean).join('；')
        throw new Error(`图片检查结果：${summaries || '检测到健康相关内容'}。请再次点击保存，确认写入时间线。`)
      }
    }

    let pending = pendingFirstRecordRef.current
    if (!pending || pending.fingerprint !== fingerprint) {
      const created = await addRecord(
        { type: recordText ? input.type : 'note', content: recordText || '图片记录', occurredAt: input.occurredAt, sourceType: input.sourceType, bodyLocations },
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
      pending.savedAttachments.push(await addAttachment({ ...attachments[index], recordId: pending.record.id, confirmed: true }))
      pending.attachmentIndexes.add(index)
    }
    if (!state.data.eventDto.title && !preview?.hasHealthFacts && attachments.length > 0) {
      await updateTitle(getImageRecordTitle(pending.savedAttachments))
    }
    commitRecord(pending.record)
    pendingFirstRecordRef.current = null
    pendingImageConfirmationRef.current = null
    navigate('/health-events', { replace: true })
    return organizationMessage
  }

  const showRecordedMessage = (message: string) => {
    setRecordedMessage(message)
    window.setTimeout(() => setRecordedMessage(''), 3000)
  }

  const saveQuickRecord = async (transcript: string, occurredAt: string, candidates: QuickRecordCandidate[], inputChannel: 'voice' | 'text') => {
    if (!candidates.length) return '未识别到健康信息，本次未记录'
    const previewIds = [...new Set(candidates.map((item) => item.previewId).filter(Boolean))]
    if (previewIds.length !== 1) throw new Error('预览已失效，请重新整理后再保存。')
    const previewId = previewIds[0]
    let pending = pendingQuickRecordRef.current
    if (!pending || pending.previewId !== previewId) {
      pending = { previewId, idempotencyKey: crypto.randomUUID().replaceAll('-', '') }
      pendingQuickRecordRef.current = pending
    }
    await confirmPreview(previewId, pending.idempotencyKey)
    pendingQuickRecordRef.current = null
    const message = candidates.length > 1 ? `已整理为 ${candidates.length} 条症状记录` : '已记录'
    showRecordedMessage(message)
    return message
  }

  const previewQuickRecord = async (transcript: string, occurredAt: string, inputChannel: 'voice' | 'text') => {
    const preview = await previewRecord(transcript, { selectedOccurredAt: occurredAt, inputChannel })
    if (!preview.hasHealthFacts || !['health_fact', 'uncertain_health_fact'].includes(preview.intent)) return []
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
              onDetailOpenChange={setRecordSheetOpen}
              onUpdateRecord={updateRecord}
              records={state.data.records}
            />
          </>
        )}
      </div>
      {hasRecords && !voiceRecordOpen && !recordSheetOpen && <QuickRecordTrigger onClick={() => setVoiceRecordOpen(true)} />}
      {hasRecords && <QuickVoiceRecordFlow
        onClose={() => setVoiceRecordOpen(false)}
        onConfirm={saveQuickRecord}
        onIgnored={showRecordedMessage}
        onPreview={previewQuickRecord}
        open={voiceRecordOpen}
      />}
      {hasRecords && <ActionSheet
        context={{
          attachments: state.data.attachments,
          currentMemberId,
          event: { ...event, summary: state.data.eventDto.eventSummary?.displayedResult.summary ?? event.summary },
          healthProfile: promptHealthProfile,
          member: state.data.member,
          organizations: state.data.organizations,
          records: state.data.records,
          relatedEvents: state.data.relatedEvents,
        }}
        onClose={() => setActionOpen(false)}
        onComingSoon={() => setComingSoonOpen(true)}
        open={actionOpen}
      />}
      {hasRecords && <ComingSoonPrompt onClose={() => setComingSoonOpen(false)} open={comingSoonOpen} />}
      {recordedMessage && <div aria-live="polite" className="quick-record-toast" role="status"><Check size={17} />{recordedMessage}</div>}
    </main>
  )
}
