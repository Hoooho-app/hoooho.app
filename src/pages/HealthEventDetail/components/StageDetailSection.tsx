import { ClipboardCheck, FileSearch, Pill, RefreshCw, Stethoscope } from 'lucide-react'
import type { HealthEvent, HealthEventStage } from '../../../types'
import { Card } from '../../../components/common'

export function StageDetailSection({ event, stage }: { event: HealthEvent; stage: HealthEventStage }) {
  if (stage === 'observing') return null

  if (stage === 'handling') {
    const rows = [
      { label: '就诊记录', detail: '记录就诊时间、医院和医生建议', icon: Stethoscope },
      { label: '检查资料', detail: '整理检查项目和结果', icon: FileSearch },
      { label: '用药记录', detail: '记录药品、剂量和服用时间', icon: Pill }
    ]

    return (
      <section className="space-y-3">
        <h2 className="section-title">处理记录</h2>
        <Card className="divide-y p-0">
          {rows.map(({ label, detail, icon: Icon }) => (
            <button className="flex min-h-16 w-full items-center gap-3 px-4 text-left" key={label} type="button">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-primary-soft text-primary"><Icon size={17} /></span>
              <span><strong className="block text-sm">{label}</strong><span className="mt-1 block text-xs text-text-secondary">{detail}</span></span>
            </button>
          ))}
        </Card>
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
