import { useState } from 'react'
import { ClipboardCheck, FileSearch, Pill, RefreshCw, Stethoscope } from 'lucide-react'
import type { CreateHealthEventRecordInput, HealthEvent, HealthEventRecordType, HealthEventStage } from '../../../types'
import { Card } from '../../../components/common'
import { HealthRecordEditorModal, type HealthRecordTemplateType } from './HealthRecordEditorModal'

interface StageDetailSectionProps {
  event: HealthEvent
  stage: HealthEventStage
  onAddRecord?: (input: CreateHealthEventRecordInput) => Promise<void>
}

interface HandlingRecordOption {
  label: string
  detail: string
  icon: typeof Stethoscope
  recordType: Extract<HealthEventRecordType, 'visit' | 'examination' | 'medication'>
  templateType: HealthRecordTemplateType
}

export function StageDetailSection({ event, stage, onAddRecord }: StageDetailSectionProps) {
  const [selectedOption, setSelectedOption] = useState<HandlingRecordOption | null>(null)
  if (stage === 'observing') return null

  if (stage === 'handling') {
    const rows: HandlingRecordOption[] = [
      { label: '就诊记录', detail: '记录就诊时间、医院和医生建议', icon: Stethoscope, recordType: 'visit', templateType: 'timeline' },
      { label: '检查资料', detail: '整理检查项目和结果', icon: FileSearch, recordType: 'examination', templateType: 'timeline' },
      { label: '用药记录', detail: '记录药品、剂量和服用时间', icon: Pill, recordType: 'medication', templateType: 'medication-change' }
    ]

    return (
      <section className="space-y-3">
        <h2 className="section-title">处理记录</h2>
        <Card className="divide-y p-0">
          {rows.map((option) => {
            const Icon = option.icon
            return (
              <button className="flex min-h-16 w-full items-center gap-3 px-4 text-left" key={option.label} onClick={() => setSelectedOption(option)} type="button">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-primary-soft text-primary"><Icon size={17} /></span>
                <span><strong className="block text-sm">{option.label}</strong><span className="mt-1 block text-xs text-text-secondary">{option.detail}</span></span>
              </button>
            )
          })}
        </Card>
        <HealthRecordEditorModal
          defaultRecordType={selectedOption?.recordType ?? 'note'}
          lockRecordType
          onClose={() => setSelectedOption(null)}
          onSave={onAddRecord ? (result) => onAddRecord({ type: result.recordType, content: result.originalText, occurredAt: result.occurredAt }) : undefined}
          open={Boolean(selectedOption)}
          templateType={selectedOption?.templateType ?? 'timeline'}
          titleOverride={selectedOption?.label}
        />
      </section>
    )
  }

  return (
    <section className="space-y-3">
      <h2 className="section-title">恢复与总结</h2>
      <Card className="space-y-4">
        <div className="flex gap-3"><RefreshCw className="shrink-0 text-success" size={20} /><div><h3 className="font-semibold">恢复情况</h3><p className="mt-1 text-sm leading-6 text-text-secondary">{event.recoveryInfo?.note || '补充恢复时间和当前身体情况。'}</p></div></div>
        <div className="flex gap-3 border-t pt-4"><ClipboardCheck className="shrink-0 text-primary" size={20} /><div><h3 className="font-semibold">事件总结</h3><p className="mt-1 text-sm leading-6 text-text-secondary">{event.summary || '整理本次健康事件的过程与结果。'}</p></div></div>
      </Card>
    </section>
  )
}
