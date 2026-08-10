import { Fragment, useMemo, useState } from 'react'
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

  const timelineGroups = useMemo(() => timeline.reduce<Array<{ date: string; entries: TimelineEntry[] }>>((groups, entry) => {
    const date = formatHealthTimelineDate(entry.time)
    const currentGroup = groups[groups.length - 1]
    if (currentGroup?.date === date) currentGroup.entries.push(entry)
    else groups.push({ date, entries: [entry] })
    return groups
  }, []), [timeline])

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
          <Button className="min-h-10 px-4 text-surface shadow-calm" onClick={() => setIsEditorOpen(true)}>
            添加记录<PlusCircle size={17} />
          </Button>
          <button
            aria-label={order === 'desc' ? '当前最新优先，切换为最早优先' : '当前最早优先，切换为最新优先'}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-primary/20 bg-surface text-text-secondary shadow-calm transition hover:border-primary hover:text-primary"
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
          className="cursor-pointer rounded-2xl border-primary/10 py-8 text-center shadow-calm"
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
        <div className="space-y-8" aria-label="健康过程记录">
          {timelineGroups.map((group) => (
            <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-4" key={group.date}>
              <time className="pt-0.5 text-right text-sm font-bold leading-5 text-primary">{group.date}</time>
              <div className="border-l border-primary/25 pl-5">
                {group.entries.map((entry) => (
                  <TimelineRow
                    key={entry.id}
                    entry={entry}
                    isExpanded={expandedAttachmentEntries.has(entry.id)}
                    onToggleAttachments={() => toggleAttachments(entry.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
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
  onToggleAttachments
}: {
  entry: TimelineEntry
  isExpanded: boolean
  onToggleAttachments: () => void
}) {
  const attachments = entry.attachments ?? []
  const visibleAttachments = isExpanded ? attachments : attachments.slice(0, 4)

  return (
    <article className="relative pb-8 last:pb-1">
      <span className="absolute -left-[27px] top-1.5 h-3.5 w-3.5 rounded-full border-[3px] border-primary bg-background" />
      <div className="flex items-center gap-2 text-[13px] font-semibold text-heading">
        <Clock3 className="shrink-0 text-primary" size={17} strokeWidth={1.8} />
        <span>{entry.periodLabel}</span>
      </div>
      <p className="mt-3 text-sm leading-7 text-text-primary">
        {(entry.segments?.length ? entry.segments : [{ label: '记录' as const, content: entry.content }]).map((segment, index, segments) => (
          <Fragment key={`${entry.id}-segment-${index}`}>
            <span className="mr-1.5 inline-flex rounded-pill bg-primary/10 px-2 py-0.5 align-middle text-[11px] font-bold text-heading">{segment.label}</span>
            <span>{segment.content}</span>
            {index < segments.length - 1 && <span className="mx-1 text-text-secondary">；</span>}
          </Fragment>
        ))}
      </p>
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
