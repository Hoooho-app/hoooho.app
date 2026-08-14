import { Fragment, useMemo, useState } from 'react'
import { ArrowUpDown, ChevronDown, ChevronUp, Clock3 } from 'lucide-react'
import type { EventAttachment, HealthEvent, TimelineEntry } from '../../../types'
import { Card } from '../../../components/common'
import { HealthTag } from '../../../components/design-system'
import { sortAndGroupTimeline, type TimelineOrder } from '../../../services/healthTimelineGrouping'

interface TimelineSectionProps {
  event: HealthEvent
}

export function TimelineSection({ event }: TimelineSectionProps) {
  const [order, setOrder] = useState<TimelineOrder>('desc')
  const [expandedAttachmentEntries, setExpandedAttachmentEntries] = useState<Set<string>>(new Set())

  const timelineGroups = useMemo(
    () => sortAndGroupTimeline(event.timeline, order),
    [event.timeline, order]
  )

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

      {!event.timeline.length ? (
        <Card
          className="py-8 text-center"
        >
          <Clock3 className="mx-auto text-primary" size={27} strokeWidth={1.6} />
          <h3 className="mt-3 font-semibold">添加第一条过程记录</h3>
          <p className="mt-2 text-sm leading-6 text-text-secondary">直接描述什么时候开始、有哪些变化，以及做过什么处理。</p>
        </Card>
      ) : (
        <div className="space-y-8" aria-label="健康过程记录">
          {timelineGroups.map((yearGroup) => (
            <section className="space-y-5" key={yearGroup.year} aria-label={`${yearGroup.year}年健康记录`}>
              <h3 className="hoho-text-section-title text-primary">{yearGroup.year}年</h3>
              {yearGroup.dates.map((dateGroup) => (
                <div className="grid grid-cols-[60px_minmax(0,1fr)] gap-3" key={`${yearGroup.year}-${dateGroup.date}`}>
                  <time className="pt-0.5 text-right text-sm font-semibold leading-5 text-text-primary">{dateGroup.date}</time>
                  <div className="border-l border-border-strong pl-4">
                    {dateGroup.entries.map((entry) => (
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
            </section>
          ))}
        </div>
      )}

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
    <article className="relative pb-6 last:pb-1">
      <span className="absolute -left-[21px] top-1.5 h-3 w-3 rounded-full border-2 border-primary bg-background" />
      {entry.periodLabel && (
        <div className="flex items-center gap-2 text-[13px] font-semibold text-heading">
          <span>{entry.periodLabel}</span>
        </div>
      )}
      <p className="mt-2.5 text-sm leading-6 text-text-primary">
        {(entry.segments?.length ? entry.segments : [{ label: '记录' as const, content: entry.content }]).map((segment, index, segments) => (
          <Fragment key={`${entry.id}-segment-${index}`}>
            <HealthTag className="mr-1.5 min-h-0 align-middle text-[11px]" tone="primary">{segment.label}</HealthTag>
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
      {attachment.url && <img alt={attachment.name} className="h-full w-full object-cover" decoding="async" loading="lazy" src={attachment.url} />}
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
