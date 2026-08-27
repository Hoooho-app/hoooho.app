import { useLayoutEffect, useRef, useState } from 'react'
import { HealthCard, HealthTag, Typography } from '../../../components/design-system'
import type { HealthEventSummaryApiDto, HealthEventSummaryTag } from '../../../types'
import { countVisibleSummaryTags } from './summaryTagLayout'

interface EventSummarySectionProps {
  summary: HealthEventSummaryApiDto
}

function tagTone(tag: HealthEventSummaryTag) {
  return tag.kind === 'diagnosis' ? 'primary' : tag.kind === 'assessment' ? 'warning' : 'neutral'
}

function SummaryTagRow({ tags }: { tags: HealthEventSummaryTag[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(tags.length)

  useLayoutEffect(() => {
    const container = containerRef.current
    const measure = measureRef.current
    if (!container || !measure) return
    const update = () => {
      const widths = [...measure.children].map((child) => (child as HTMLElement).offsetWidth)
      setVisibleCount(countVisibleSummaryTags(widths, container.clientWidth))
    }
    update()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(container)
    window.addEventListener('resize', update)
    return () => { observer?.disconnect(); window.removeEventListener('resize', update) }
  }, [tags])

  if (!tags.length) return null
  return (
    <div className="relative min-w-0 overflow-hidden" ref={containerRef}>
      <div aria-hidden="true" className="pointer-events-none absolute invisible flex w-max flex-nowrap gap-2" ref={measureRef}>
        {tags.map((tag) => <HealthTag className="shrink-0 whitespace-nowrap" key={`${tag.kind}-${tag.label}`} tone={tagTone(tag)}>{tag.label}</HealthTag>)}
      </div>
      <div aria-label="事件摘要标签" className="event-summary-tags flex flex-nowrap gap-2 overflow-hidden">
        {tags.slice(0, visibleCount).map((tag) => <HealthTag className="shrink-0 whitespace-nowrap" key={`${tag.kind}-${tag.label}`} tone={tagTone(tag)}>{tag.label}</HealthTag>)}
      </div>
    </div>
  )
}

export function EventSummarySection({ summary }: EventSummarySectionProps) {
  const displayed = summary.displayedResult
  return (
    <section aria-labelledby="event-summary-title">
      <HealthCard className="event-summary-card">
        <Typography id="event-summary-title" variant="sectionTitle">事件摘要</Typography>
        <SummaryTagRow tags={displayed.tags ?? []} />
        <Typography className="event-summary-description" variant="body">{displayed.summary}</Typography>
      </HealthCard>
    </section>
  )
}
