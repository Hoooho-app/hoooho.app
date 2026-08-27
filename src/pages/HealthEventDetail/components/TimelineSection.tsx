import { useMemo, useState } from 'react'
import { ArrowUpDown, ChevronDown, ChevronUp, Clock3 } from 'lucide-react'
import type { EventAttachment, HealthEvent, TimelineEntry } from '../../../types'
import { Card } from '../../../components/common'
import { HealthTag, HohoButton } from '../../../components/design-system'
import { sortAndGroupTimeline, type TimelineOrder } from '../../../services/healthTimelineGrouping'

interface TimelineSectionProps {
  event: HealthEvent
}

export function TimelineSection({ event }: TimelineSectionProps) {
  const [order, setOrder] = useState<TimelineOrder>('desc')
  const [expandedAttachmentEntries, setExpandedAttachmentEntries] = useState<Set<string>>(new Set())
  const [expandedDetailEntries, setExpandedDetailEntries] = useState<Set<string>>(new Set())

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

  const toggleDetails = (entryId: string) => {
    setExpandedDetailEntries((current) => {
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
          {timelineGroups.flatMap((yearGroup) => yearGroup.dates.map((dateGroup) => (
            <section className="timeline-date-group" key={`${yearGroup.year}-${dateGroup.date}`} aria-label={`${dateGroup.date}健康记录`}>
              <h3 className="hoho-text-section-title text-primary">{dateGroup.date}</h3>
              <div className="timeline-date-entries">
                {dateGroup.entries.map((entry) => (
                  <TimelineRow
                    key={entry.id}
                    entry={entry}
                    detailsExpanded={expandedDetailEntries.has(entry.id)}
                    attachmentsExpanded={expandedAttachmentEntries.has(entry.id)}
                    onToggleAttachments={() => toggleAttachments(entry.id)}
                    onToggleDetails={() => toggleDetails(entry.id)}
                  />
                ))}
              </div>
            </section>
          )))}
        </div>
      )}

    </section>
  )
}

function TimelineRow({
  entry,
  attachmentsExpanded,
  detailsExpanded,
  onToggleAttachments,
  onToggleDetails
}: {
  entry: TimelineEntry
  attachmentsExpanded: boolean
  detailsExpanded: boolean
  onToggleAttachments: () => void
  onToggleDetails: () => void
}) {
  const attachments = entry.attachments ?? []
  const visibleAttachments = attachmentsExpanded ? attachments : attachments.slice(0, 4)
  const details = entry.details
  const hasDetails = Boolean(details)
  const Main = hasDetails ? 'button' : 'div'

  return (
    <article className="timeline-entry-row">
      <time className="timeline-entry-time">{entry.periodLabel ?? entry.displayTime ?? formatTimelineClock(entry.time)}</time>
      <div className="timeline-entry-track">
        <span className="timeline-entry-marker" />
        <div className="timeline-record-card">
        <Main
          {...(hasDetails ? { 'aria-expanded': detailsExpanded, onClick: onToggleDetails, type: 'button' as const } : {})}
          className="timeline-record-main"
        >
          <span className="timeline-record-heading">
            <span className="timeline-record-facts">
              {(entry.segments?.length ? entry.segments : [{ label: '记录' as const, content: entry.content }]).map((segment, index) => (
                <span className="timeline-record-fact" key={`${entry.id}-segment-${index}`}>
                  {segment.label === '部位' || segment.label === '症状' || segment.label === '状态'
                    ? <HealthTag tone="primary">{segment.content}</HealthTag>
                    : <><HealthTag tone="primary">{segment.label}</HealthTag><span>{segment.content}</span></>}
                </span>
              ))}
            </span>
            {hasDetails && <span className="timeline-record-expand-icon">{detailsExpanded ? <ChevronUp aria-hidden="true" size={20} /> : <ChevronDown aria-hidden="true" size={20} />}</span>}
          </span>
          <span className="timeline-record-summary">{entry.summary ?? entry.content}</span>
        </Main>
        {attachments.length > 0 && (
          <div className="timeline-record-attachments">
            <div className="grid grid-cols-4 gap-2">
              {visibleAttachments.map((attachment) => <TimelineAttachment key={attachment.id} attachment={attachment} />)}
            </div>
            {attachments.length > 4 && (
              <button className="mt-3 inline-flex min-h-11 items-center gap-1 text-xs font-medium text-primary" onClick={onToggleAttachments} type="button">
                {attachmentsExpanded ? '收起图片' : `展开更多图片（共${attachments.length}张）`}
                {attachmentsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            )}
          </div>
        )}
        {hasDetails && (
          <div aria-hidden={!detailsExpanded} className="timeline-record-details" data-expanded={detailsExpanded}>
            <div>
              <section>
                <h4>发生了什么</h4>
                <p>{details?.description}</p>
              </section>
              {Boolean(details?.measures.length) && (
                <section>
                  <h4>采取的措施</h4>
                  <p>{details?.measures.join('；')}。</p>
                </section>
              )}
            </div>
          </div>
        )}
        {hasDetails && (
          <button aria-expanded={detailsExpanded} className="timeline-record-detail-toggle" onClick={onToggleDetails} type="button">
            {detailsExpanded ? '收起详情' : '展开详情'}
            {detailsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        )}
        </div>
      </div>
    </article>
  )
}

function formatTimelineClock(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
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
