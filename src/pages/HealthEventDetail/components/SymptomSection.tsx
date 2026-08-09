import { useState } from 'react'
import { Activity, CalendarDays, CircleDashed, Plus } from 'lucide-react'
import type { CreateHealthEventRecordInput, HealthEvent } from '../../../types'
import { Button, Card } from '../../../components/common'
import { HealthRecordEditorModal } from './HealthRecordEditorModal'
import { formatHealthDate } from '../../../utils/formatDate'

interface SymptomSectionProps {
  event: HealthEvent
  onAddRecord?: (input: CreateHealthEventRecordInput) => Promise<void>
}

export function SymptomSection({ event, onAddRecord }: SymptomSectionProps) {
  const [isEditorOpen, setIsEditorOpen] = useState(false)

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="section-title">症状记录</h2>
        {event.symptoms.length > 0 && <Button variant="ghost" onClick={() => setIsEditorOpen(true)}><Plus size={16} />补充症状</Button>}
      </div>

      {!event.symptoms.length ? (
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
            defaultRecordType="symptom"
            lockRecordType
            onClose={() => setIsEditorOpen(false)}
            onSave={onAddRecord ? (result) => onAddRecord({ type: result.recordType, content: result.originalText, occurredAt: result.occurredAt, attachments: result.attachments }) : undefined}
          />
        </div>
      ) : (
        <Card interactive className="cursor-pointer p-0" onClick={() => setIsEditorOpen(true)} role="button" tabIndex={0}>
          <ul className="divide-y">
            {event.symptoms.map((symptom) => (
              <li className="flex gap-3 px-4 py-3" key={symptom}>
                <Activity className="mt-0.5 shrink-0 text-primary" size={17} />
                <span className="text-sm leading-6">{symptom}</span>
              </li>
            ))}
          </ul>
          {event.summary && <p className="border-t px-4 py-3 text-sm leading-7 text-text-secondary">{event.summary}</p>}
        </Card>
      )}
      {event.symptoms.length > 0 && (
        <HealthRecordEditorModal
          open={isEditorOpen}
          templateType="symptom"
          defaultRecordType="symptom"
          lockRecordType
          onClose={() => setIsEditorOpen(false)}
          onSave={onAddRecord ? (result) => onAddRecord({ type: result.recordType, content: result.originalText, occurredAt: result.occurredAt, attachments: result.attachments }) : undefined}
        />
      )}
    </section>
  )
}
