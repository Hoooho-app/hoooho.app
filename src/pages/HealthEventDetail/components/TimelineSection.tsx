import { useMemo, useState } from 'react'
import { ArrowUpDown, ChevronDown, ChevronUp, Clock3, PlusCircle } from 'lucide-react'
import type { CreateHealthEventRecordInput, EventAttachment, HealthEvent, TimelineEntry } from '../../../types'
import { Button, Card } from '../../../components/common'
import { formatHealthTimelineDate } from '../../../utils/formatHealthTimePeriod'
import { HealthRecordEditorModal } from './HealthRecordEditorModal'

interface TimelineSectionProps {
  event: HealthEvent
  onAddRecord?: (input: CreateHealthEventRecordInput) => Promise<void>
}

type TimelineOrder = 'desc' | 'asc'

export function TimelineSection({ event, onAddRecord }: TimelineSectionProps) {
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [order, setOrder] = useState<TimelineOrder>('desc')
  const [expandedAttachmentEntries, setExpandedAttachmentEntries] = useState<Set<string>>(new Set())

  const timeline = useMemo(() => [...event.timeline].sort((left, right) => {
    const comparison = left.time.localeCompare(right.time)
      || (left.sequence ?? 0) - (right.sequence ?? 0)
      || left.id.localeCompare(right.id)
    return order === 'desc' ? -comparison : comparison
  }), [event.timeline, order])

  const toggleAttachments = (entryId: string) => {
    setExpandedAttachmentEntries((current) => {
      const next = new Set(current)
      if (next.has(entryId)) next.delete(entryId)
      else next.add(entryId)
      return next
    })
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="section-title">时间线</h2>
        <div className="flex items-center gap-2">
          <Button className="min-h-10 px-4 text-surface" onClick={() => setIsEditorOpen(true)}>
            添加记录<PlusCircle size={17} />
          </Button>
          <button
            aria-label={order === 'desc' ? '当前最新优先，切换为最早优先' : '当前最早优先，切换为最新优先'}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border bg-surface text-text-secondary transition hover:border-primary hover:text-primary"
            onClick={() => setOrder((current) => current === 'desc' ? 'asc' : 'desc')}
            title={order === 'desc' ? '切换为最早优先' : '切换为最新优先'}
            type="button"
          >
            <ArrowUpDown size={19} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {!timeline.length ? (
        <Card
          interactive
          className="cursor-pointer py-8 text-center"
          role="button"
          tabIndex={0}
          onClick={() => setIsEditorOpen(true)}
          onKeyDown={(keyEvent) => {
            if (keyEvent.key === 'Enter' || keyEvent.key === ' ') setIsEditorOpen(true)
          }}
        >
          <Clock3 className="mx-auto text-primary" size={27} strokeWidth={1.6} />
          <h3 className="mt-3 font-semibold">添加第一条过程记录</h3>
          <p className="mt-2 text-sm leading-6 text-text-secondary">直接描述什么时候开始、有哪些变化，以及做过什么处理。</p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          {timeline.map((entry, index) => {
            const previousEntry = timeline[index - 1]
            const showDate = !previousEntry || formatHealthTimelineDate(previousEntry.time) !== formatHealthTimelineDate(entry.time)
            const isExpanded = expandedAttachmentEntries.has(entry.id)
            return (
              <TimelineRow
                key={entry.id}
                entry={entry}
                isExpanded={isExpanded}
                showDate={showDate}
                onToggleAttachments={() => toggleAttachments(entry.id)}
              />
            )
          })}
        </Card>
      )}

      <HealthRecordEditorModal
        open={isEditorOpen}
        templateType="timeline"
        defaultRecordType="note"
        onClose={() => setIsEditorOpen(false)}
        onSave={onAddRecord ? (result) => onAddRecord({
          type: result.recordType,
          content: result.originalText,
          occurredAt: result.occurredAt,
          attachments: result.attachments
        }) : undefined}
      />
    </section>
  )
}

function TimelineRow({
  entry,
  isExpanded,
  showDate,
  onToggleAttachments
}: {
  entry: TimelineEntry
  isExpanded: boolean
  showDate: boolean
  onToggleAttachments: () => void
}) {
  const attachments = entry.attachments ?? []
  const visibleAttachments = isExpanded ? attachments : attachments.slice(0, 4)

  return (
    <article className="grid grid-cols-[88px_minmax(0,1fr)] border-b last:border-b-0">
      <div className="relative border-r border-border px-3 py-5 text-center">
        <span className={`block text-sm font-semibold text-primary ${showDate ? '' : 'sr-only'}`}>
          {formatHealthTimelineDate(entry.time)}
        </span>
        <span className="absolute right-[-7px] top-7 h-3.5 w-3.5 rounded-full border-[3px] border-primary bg-surface" />
      </div>
      <div className="min-w-0 px-4 py-5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Clock3 className="shrink-0 text-primary" size={19} strokeWidth={1.8} />
          <span>{entry.periodLabel}</span>
        </div>
        <div className="mt-3 space-y-2 text-sm leading-6 text-text-primary">
          {(entry.segments?.length ? entry.segments : [{ label: '记录' as const, content: entry.content }]).map((segment, index) => (
            <p key={`${entry.id}-segment-${index}`}>
              <span className="mr-2 inline-flex rounded-pill bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">{segment.label}</span>
              <span>{segment.content}{index < (entry.segments?.length ?? 1) - 1 ? '；' : ''}</span>
            </p>
          ))}
        </div>
        {attachments.length > 0 && (
          <div className="mt-4">
            <div className="grid grid-cols-4 gap-2">
              {visibleAttachments.map((attachment) => <TimelineAttachment key={attachment.id} attachment={attachment} />)}
            </div>
            {attachments.length > 4 && (
              <button className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary" onClick={onToggleAttachments} type="button">
                {isExpanded ? '收起图片' : `展开更多图片（共${attachments.length}张）`}
                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

function TimelineAttachment({ attachment }: { attachment: EventAttachment }) {
  return (
    <figure className="relative aspect-square overflow-hidden rounded-lg bg-primary-soft">
      {attachment.url && <img alt={attachment.name} className="h-full w-full object-cover" src={attachment.url} />}
      <figcaption className="absolute bottom-1 left-1 max-w-[calc(100%-8px)] truncate rounded bg-text-primary/65 px-1.5 py-0.5 text-[10px] text-surface">
        {attachmentLabel(attachment.name)}
      </figcaption>
    </figure>
  )
}

function attachmentLabel(name: string) {
  if (/药|药盒|药瓶/.test(name)) return '药'
  if (/腿|膝|脚/.test(name)) return '腿'
  if (/喉|咽/.test(name)) return '喉'
  if (/皮肤|皮疹|红疹/.test(name)) return '皮肤'
  if (/报告/.test(name)) return '报告'
  if (/检查|化验|验血|血常规|单/.test(name)) return '单'
  return '图片'
}
