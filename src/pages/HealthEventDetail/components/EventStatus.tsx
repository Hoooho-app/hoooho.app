import { useState } from 'react'
import type { HealthEventStage } from '../../../types'
import { Button, Card } from '../../../components/common'
import { usePageScrollLock } from '../../../hooks/usePageScrollLock'

const stages: Array<{ value: HealthEventStage; label: string }> = [
  { value: 'observing', label: '观察中' },
  { value: 'handling', label: '处理中' },
  { value: 'recovered', label: '已康复' }
]

interface EventStatusProps {
  stage: HealthEventStage
  onStageChange: (stage: HealthEventStage) => void
}

export function EventStatus({ stage, onStageChange }: EventStatusProps) {
  const [pendingStage, setPendingStage] = useState<HealthEventStage | null>(null)
  usePageScrollLock(Boolean(pendingStage))

  const requestChange = (nextStage: HealthEventStage) => {
    if (nextStage === stage) return
    if (stage === 'handling' && nextStage === 'recovered') {
      setPendingStage(nextStage)
      return
    }
    onStageChange(nextStage)
  }

  const confirmChange = () => {
    if (!pendingStage) return
    onStageChange(pendingStage)
    setPendingStage(null)
  }

  const cancelChange = () => setPendingStage(null)

  return (
    <>
      <section className="space-y-3">
        <h2 className="section-title">随记阶段</h2>
        <Card className="px-4 py-5">
          <div className="grid grid-cols-3">
            {stages.map((item, index) => {
              const isActive = item.value === stage
              return (
                <button
                  aria-current={isActive ? 'step' : undefined}
                  className={`relative flex flex-col items-center gap-2 text-xs transition ${isActive ? 'font-semibold text-primary' : 'text-text-secondary'}`}
                  key={item.value}
                  onClick={() => requestChange(item.value)}
                  type="button"
                >
                  <span className="flex w-full items-center">
                    <span className={`h-px flex-1 ${index === 0 ? 'bg-transparent' : 'bg-border'}`} />
                    <span className={`relative z-10 h-4 w-4 rounded-full border-2 transition ${isActive ? 'border-primary bg-primary shadow-card' : 'border-border bg-surface'}`} />
                    <span className={`h-px flex-1 ${index === stages.length - 1 ? 'bg-transparent' : 'bg-border'}`} />
                  </span>
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>
        </Card>
      </section>

      {pendingStage && (
        <div className="fixed inset-0 z-50 flex touch-none items-end justify-center overscroll-none bg-black/35 px-6 pb-[max(16px,env(safe-area-inset-bottom))]" role="presentation" onClick={cancelChange}>
          <section aria-modal="true" className="w-full max-w-[354px] touch-auto rounded-t-[24px] bg-surface p-5 shadow-floating" role="dialog" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-lg font-semibold">确认这条健康随记已经恢复？</h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              确认后将进入恢复总结阶段，页面内容会同步调整。
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={cancelChange}>取消</Button>
              <Button onClick={confirmChange}>确认切换</Button>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
