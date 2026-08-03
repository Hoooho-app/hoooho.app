import { useState } from 'react'
import { Activity, CalendarDays, CircleDashed, Plus } from 'lucide-react'
import type { HealthEvent } from '../../../types'
import { Button, Card } from '../../../components/common'
import { HealthRecordEditorModal } from './HealthRecordEditorModal'
import { formatHealthDate } from '../../../utils/formatDate'

export function SymptomSection({ event }: { event: HealthEvent }) {
  const [isEditorOpen, setIsEditorOpen] = useState(false)

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="section-title">症状记录</h2>
        {event.status === 'ongoing' && <Button variant="ghost" onClick={() => setIsEditorOpen(true)}><Plus size={16} />补充症状</Button>}
      </div>

      {event.status === 'empty' ? (
        <div className="space-y-2">
          <Card
            interactive
            className="cursor-pointer rounded-b-none border-primary/25 bg-gradient-to-r from-primary-soft to-success-soft"
            role="button"
            tabIndex={0}
            onClick={() => setIsEditorOpen(true)}
            onKeyDown={(keyEvent) => {
              if (keyEvent.key === 'Enter' || keyEvent.key === ' ') setIsEditorOpen(true)
            }}
          >
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-surface shadow-card">
                <Activity size={21} strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <h3 className="font-semibold text-primary">记录一个新情况</h3>
                <span className="mt-1 block text-xs leading-5 text-text-secondary">例如：昨天晚上开始出现喉咙疼痛和轻微咳嗽，今天上午感觉身体乏力，没有发烧，体温37℃，目前没有明显胸闷或其他不适，已多喝水并服用感冒药，正在观察症状变化。</span>
              </span>
            </div>
          </Card>
          <Card className="flex items-start gap-3 rounded-t-none bg-surface/80 py-3 shadow-none">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
              <CircleDashed size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-text-secondary">正文关键词自动提取</span>
              <span className="mt-1 flex items-center gap-1.5 text-xs text-text-secondary">
                <CalendarDays size={13} />开始于 {formatHealthDate(event.startDate)}
              </span>
            </span>
          </Card>
          <HealthRecordEditorModal
            open={isEditorOpen}
            templateType="symptom"
            onClose={() => setIsEditorOpen(false)}
          />
        </div>
      ) : (
        <Card interactive className="cursor-pointer" onClick={() => setIsEditorOpen(true)} role="button" tabIndex={0}>
          <div className="flex flex-wrap gap-2">
            {event.symptoms.map((symptom) => <span key={symptom} className="rounded-pill bg-primary-soft px-3 py-2 text-sm text-primary">{symptom}</span>)}
          </div>
          {event.summary && <p className="mt-4 text-sm leading-7 text-text-secondary">{event.summary}</p>}
        </Card>
      )}
      {event.status !== 'empty' && (
        <HealthRecordEditorModal open={isEditorOpen} templateType="symptom" onClose={() => setIsEditorOpen(false)} />
      )}
    </section>
  )
}
