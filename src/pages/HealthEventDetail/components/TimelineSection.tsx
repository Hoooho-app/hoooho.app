import { useState } from 'react'
import { Clock3, Plus } from 'lucide-react'
import type { HealthEvent } from '../../../types'
import { Button, Card } from '../../../components/common'
import { formatHealthDate } from '../../../utils/formatDate'
import { HealthRecordEditorModal } from './HealthRecordEditorModal'

export function TimelineSection({ event }: { event: HealthEvent }) {
  const [isEditorOpen, setIsEditorOpen] = useState(false)

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="section-title">时间线</h2>
        {event.status === 'ongoing' && <Button variant="ghost" onClick={() => setIsEditorOpen(true)}><Plus size={16} />添加记录</Button>}
      </div>

      {!event.timeline.length ? (
        <>
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
            <h3 className="mt-3 font-semibold">补充事件发展过程</h3>
            <p className="mt-2 text-sm leading-6 text-text-secondary">记录什么时候开始、出现什么症状以及采取了什么措施。</p>
          </Card>
          <HealthRecordEditorModal
            open={isEditorOpen}
            templateType="timeline"
            onClose={() => setIsEditorOpen(false)}
          />
        </>
      ) : (
        <Card className="space-y-0">
          {event.timeline.map((entry, index) => (
            <div key={entry.id} className="relative flex gap-3 pb-5 last:pb-0">
              {index < event.timeline.length - 1 && <span className="absolute left-[5px] top-4 h-full w-px bg-border" />}
              <span className="relative mt-1.5 h-3 w-3 shrink-0 rounded-full border-2 border-primary bg-surface" />
              <div>
                <time className="text-xs text-text-secondary">{formatHealthDate(entry.time)}</time>
                <p className="mt-1 text-sm leading-6">{entry.content}</p>
              </div>
            </div>
          ))}
        </Card>
      )}
      {event.timeline.length > 0 && (
        <HealthRecordEditorModal open={isEditorOpen} templateType="timeline" onClose={() => setIsEditorOpen(false)} />
      )}
    </section>
  )
}
