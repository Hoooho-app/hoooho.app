import { ClipboardCheck, FileSearch, Pill, RefreshCw, Stethoscope } from 'lucide-react'
import type { HealthEvent, HealthEventStage } from '../../../types'
import { Card } from '../../../components/common'

interface StageDetailSectionProps {
  event: HealthEvent
  stage: HealthEventStage
}

export function StageDetailSection({ event, stage }: StageDetailSectionProps) {
  const rows = [
    { label: '就诊记录', values: event.visits, icon: Stethoscope },
    { label: '检查记录', values: event.examinations, icon: FileSearch },
    { label: '用药记录', values: event.medications, icon: Pill }
  ].filter((row) => row.values.length)

  return (
    <>
      {rows.length > 0 && (
        <section className="space-y-3">
          <h2 className="section-title">处理记录</h2>
          <Card className="divide-y p-0">
            {rows.map(({ label, values, icon: Icon }) => (
              <div className="flex min-h-16 w-full items-start gap-3 px-4 py-3" key={label}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"><Icon size={17} /></span>
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm">{label}</strong>
                  {values.map((value) => <span className="mt-1 block text-xs leading-5 text-text-secondary" key={value}>{value}</span>)}
                </span>
              </div>
            ))}
          </Card>
        </section>
      )}

      {stage === 'recovered' && (
        <section className="space-y-3">
          <h2 className="section-title">恢复与总结</h2>
          <Card className="space-y-4">
            <div className="flex gap-3"><RefreshCw className="shrink-0 text-success" size={20} /><div><h3 className="font-semibold">恢复情况</h3><p className="mt-1 text-sm leading-6 text-text-secondary">{event.recoveryInfo?.note || '补充恢复时间和当前身体情况。'}</p></div></div>
            <div className="flex gap-3 border-t pt-4"><ClipboardCheck className="shrink-0 text-primary" size={20} /><div><h3 className="font-semibold">事件总结</h3><p className="mt-1 text-sm leading-6 text-text-secondary">整理本次健康事件的过程与结果。</p></div></div>
          </Card>
        </section>
      )}
    </>
  )
}
