import type { ReactNode } from 'react'

export type HealthTimelineLevel = 'list' | 'detail'

export interface HealthTimelineItem {
  content: ReactNode
  id: string
  label: ReactNode
}

export interface HealthTimelineProps {
  ariaLabel: string
  className?: string
  items: HealthTimelineItem[]
  level: HealthTimelineLevel
}

export function HealthTimeline({ ariaLabel, className = '', items, level }: HealthTimelineProps) {
  return (
    <div className={`hoho-timeline ${className}`} data-level={level} aria-label={ariaLabel}>
      {items.map((item) => (
        <section className="hoho-timeline-item" key={item.id}>
          <div className="hoho-timeline-item__label">{item.label}</div>
          <div className="hoho-timeline-item__content">{item.content}</div>
        </section>
      ))}
    </div>
  )
}
