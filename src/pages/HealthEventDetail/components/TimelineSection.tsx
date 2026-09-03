import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpDown, ChevronRight, Clock3, Pencil, Trash2 } from 'lucide-react'
import type { HealthChangeAnnotationApiDto, HealthChangeType, HealthEvent, HealthEventRecordApiDto, TimelineEntry, UpdateHealthEventRecordInput } from '../../../types'
import { Card } from '../../../components/common'
import { HohoButton } from '../../../components/design-system'
import { sortAndGroupTimeline, type TimelineOrder } from '../../../services/healthTimelineGrouping'
import { SymptomRecordSheet, symptomRecordTitle, symptomRecordTypeLabel } from './SymptomRecordSheet'
import { HealthChangeAnnotationSheet, healthChangeTypeLabel } from './HealthChangeAnnotationSheet'

interface TimelineSectionProps {
  event: HealthEvent
  focusedRecordId?: string | null
  memberName: string
  records: HealthEventRecordApiDto[]
  onDeleteRecord: (recordId: string) => Promise<void>
  onDeleteChangeAnnotation: (recordId: string, annotationId: string) => Promise<void>
  onDetailOpenChange?: (open: boolean) => void
  onUpdateRecord: (recordId: string, input: UpdateHealthEventRecordInput) => Promise<unknown>
  onUpdateChangeAnnotation: (recordId: string, annotationId: string, changeType: HealthChangeType) => Promise<void>
}

export function TimelineSection({ event, focusedRecordId, memberName, records, onDeleteRecord, onDeleteChangeAnnotation, onDetailOpenChange, onUpdateRecord, onUpdateChangeAnnotation }: TimelineSectionProps) {
  const [order, setOrder] = useState<TimelineOrder>('desc')
  const [selection, setSelection] = useState<{ editing: boolean; entry: TimelineEntry } | null>(null)
  const [changeSelection, setChangeSelection] = useState<{ annotation: HealthChangeAnnotationApiDto; recordId: string } | null>(null)
  const [changeBusy, setChangeBusy] = useState(false)
  const [changeError, setChangeError] = useState('')
  const recordsById = useMemo(() => new Map(records.map((record) => [record.id, record])), [records])
  const timelineGroups = useMemo(() => sortAndGroupTimeline(event.timeline, order), [event.timeline, order])
  const openedFocusedRecord = useRef<string | null>(null)

  useEffect(() => {
    if (!focusedRecordId || openedFocusedRecord.current === focusedRecordId) return
    const entry = event.timeline.find((item) => item.sourceRecordId === focusedRecordId)
    if (!entry) return
    openedFocusedRecord.current = focusedRecordId
    setSelection({ editing: false, entry })
  }, [event.timeline, focusedRecordId])

  useEffect(() => {
    onDetailOpenChange?.(Boolean(selection || changeSelection))
    return () => onDetailOpenChange?.(false)
  }, [changeSelection, onDetailOpenChange, selection])

  useEffect(() => {
    const targetId = decodeURIComponent(window.location.hash.replace(/^#/, ''))
    if (!targetId.startsWith('record-')) return
    window.requestAnimationFrame(() => document.getElementById(targetId)?.scrollIntoView({ block: 'center' }))
  }, [timelineGroups])

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="section-title">症状跟踪</h2>
        <HohoButton
          aria-label={order === 'desc' ? '当前最新优先，切换为最早优先' : '当前最早优先，切换为最新优先'}
          onClick={() => setOrder((current) => current === 'desc' ? 'asc' : 'desc')}
          size="icon"
          title={order === 'desc' ? '切换为最早优先' : '切换为最新优先'}
          variant="ghost"
        >
          <ArrowUpDown size={20} strokeWidth={1.7} />
        </HohoButton>
      </div>

      {!event.timeline.length ? (
        <Card className="py-8 text-center">
          <Clock3 className="mx-auto text-primary" size={27} strokeWidth={1.6} />
          <h3 className="mt-3 font-semibold">添加第一条症状记录</h3>
          <p className="mt-2 text-sm leading-6 text-text-secondary">记录什么时候开始、有哪些变化，以及做过什么处理。</p>
        </Card>
      ) : (
        <div className="timeline-groups" aria-label="症状跟踪记录">
          {timelineGroups.flatMap((yearGroup) => yearGroup.dates.map((dateGroup) => (
            <section className="timeline-date-group" key={`${yearGroup.year}-${dateGroup.date}`} aria-label={`${dateGroup.date}症状记录`}>
              <h3 className="timeline-date-heading hoho-text-section-title text-primary">{dateGroup.date}</h3>
              <div className="timeline-date-entries">
                {dateGroup.entries.map((entry) => (
                  <TimelineRow
                    canEdit={Boolean(entry.sourceRecordId && recordsById.has(entry.sourceRecordId))}
                    entry={entry}
                    key={entry.id}
                    annotations={entry.changeAnnotations ?? []}
                    onDelete={async () => {
                      if (!entry.sourceRecordId || !window.confirm('删除这条症状记录？')) return
                      await onDeleteRecord(entry.sourceRecordId)
                    }}
                    onEdit={() => setSelection({ editing: true, entry })}
                    onOpenAnnotation={(annotation) => { setSelection(null); setChangeError(''); setChangeSelection({ annotation, recordId: entry.sourceRecordId! }) }}
                    onOpen={() => setSelection({ editing: false, entry })}
                  />
                ))}
              </div>
            </section>
          )))}
        </div>
      )}

      <SymptomRecordSheet
        entry={selection?.entry ?? null}
        initialEditing={selection?.editing}
        memberName={memberName}
        onClose={() => setSelection(null)}
        onDelete={onDeleteRecord}
        onUpdate={onUpdateRecord}
        record={selection?.entry.sourceRecordId ? recordsById.get(selection.entry.sourceRecordId) ?? null : null}
      />
      <HealthChangeAnnotationSheet
        annotation={changeSelection?.annotation ?? null}
        busy={changeBusy}
        error={changeError}
        onClose={() => { if (!changeBusy) setChangeSelection(null) }}
        onDelete={async () => {
          if (!changeSelection) return
          setChangeBusy(true); setChangeError('')
          try { await onDeleteChangeAnnotation(changeSelection.recordId, changeSelection.annotation.id); setChangeSelection(null) }
          catch { setChangeError('标签删除失败，请稍后重试') }
          finally { setChangeBusy(false) }
        }}
        onSelect={async (changeType) => {
          if (!changeSelection) return
          if (changeType === changeSelection.annotation.changeType) { setChangeSelection(null); return }
          setChangeBusy(true); setChangeError('')
          try { await onUpdateChangeAnnotation(changeSelection.recordId, changeSelection.annotation.id, changeType); setChangeSelection(null) }
          catch { setChangeError('标签修改失败，原状态已保留') }
          finally { setChangeBusy(false) }
        }}
      />
    </section>
  )
}

const actionWidth = 128

function TimelineRow({ annotations, canEdit, entry, onDelete, onEdit, onOpen, onOpenAnnotation }: {
  annotations: HealthChangeAnnotationApiDto[]
  canEdit: boolean
  entry: TimelineEntry
  onDelete: () => Promise<void>
  onEdit: () => void
  onOpen: () => void
  onOpenAnnotation: (annotation: HealthChangeAnnotationApiDto) => void
}) {
  const startX = useRef(0)
  const startTranslate = useRef(0)
  const moved = useRef(false)
  const [translateX, setTranslateX] = useState(0)
  const [busy, setBusy] = useState(false)
  const finishSwipe = () => setTranslateX((current) => current < -actionWidth / 2 ? -actionWidth : 0)

  return (
    <article className="timeline-entry-row" id={entry.sourceRecordId ? `record-${entry.sourceRecordId}` : undefined}>
      <span aria-hidden="true" className="timeline-entry-marker" />
      <time className="timeline-entry-time">{formatTimelineEntryTime(entry)}</time>
      <div className="symptom-record-swipe">
        {canEdit && <div className="symptom-record-swipe__actions">
          <button aria-label={`编辑症状记录：${symptomRecordTitle(entry)}`} disabled={busy} onClick={() => { setTranslateX(0); onEdit() }} type="button"><Pencil size={17} />编辑</button>
          <button aria-label={`删除症状记录：${symptomRecordTitle(entry)}`} disabled={busy} onClick={async () => { setBusy(true); try { await onDelete() } finally { setBusy(false) } }} type="button"><Trash2 size={17} />删除</button>
        </div>}
        <div className="symptom-record-row-shell" data-has-changes={annotations.length > 0} style={{ transform: `translateX(${translateX}px)` }}>
          <button
          aria-label={`查看症状记录：${symptomRecordTitle(entry)}`}
          className="symptom-record-row"
          onClick={() => {
            if (moved.current) { moved.current = false; return }
            if (translateX !== 0) { setTranslateX(0); return }
            onOpen()
          }}
          onPointerCancel={finishSwipe}
          onPointerDown={(pointerEvent) => {
            if (!canEdit) return
            startX.current = pointerEvent.clientX
            startTranslate.current = translateX
            moved.current = false
            pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId)
          }}
          onPointerMove={(pointerEvent) => {
            if (!canEdit || !pointerEvent.currentTarget.hasPointerCapture(pointerEvent.pointerId)) return
            const delta = pointerEvent.clientX - startX.current
            if (Math.abs(delta) > 6) moved.current = true
            setTranslateX(Math.max(-actionWidth, Math.min(0, startTranslate.current + delta)))
          }}
          onPointerUp={finishSwipe}
          type="button"
        >
          <span className="symptom-record-row__content"><strong>{symptomRecordTitle(entry)}</strong><span className="symptom-record-source" data-source={entry.source.type}>{symptomRecordTypeLabel(entry)}</span></span>
          <ChevronRight aria-hidden="true" size={18} />
          </button>
          {annotations.length > 0 && <div aria-label="自动识别的变化" className="health-change-tags">
            {annotations.map((annotation) => <button className="health-change-tag" data-change={annotation.changeType} key={annotation.id} onClick={() => onOpenAnnotation(annotation)} type="button">{annotation.factLabel}<span aria-hidden="true"> · </span>{healthChangeTypeLabel[annotation.changeType]}</button>)}
          </div>}
        </div>
      </div>
    </article>
  )
}

export function formatTimelineEntryTime(entry: TimelineEntry) {
  return entry.displayTime?.trim() || formatTimelineClock(entry.time)
}

function formatTimelineClock(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}
