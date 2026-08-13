import type { HealthEvent } from '../../../types'
import { formatHealthTimelineDate } from '../../../utils/formatHealthTimePeriod'

export function TemperatureChartSection({ event }: { event: HealthEvent }) {
  const records = event.temperatureRecords
  const labelStep = Math.max(1, Math.ceil(records.length / 4))
  const accessibleSummary = records.map((record) => `${formatHealthTimelineDate(record.time)} ${record.periodLabel} ${record.label ?? `${record.value.toFixed(1)}℃`}`).join('，')
  const points = records.map((record, index) => {
    const x = records.length === 1 ? 150 : 16 + (index * 268) / (records.length - 1)
    const y = 92 - ((record.value - 36) / 3) * 70
    return { ...record, x, y: Math.max(16, Math.min(92, y)) }
  })

  return (
    <section className="space-y-3">
      <h2 className="section-title">体温记录（℃）</h2>
      <div className="border-t border-primary/15 px-1 pt-5">
        <div className="rounded-2xl bg-primary/[0.045] px-3 py-4">
          <svg aria-label={`体温记录：${accessibleSummary}`} className="h-32 w-full overflow-hidden" viewBox="0 0 300 120" role="img">
            {[20, 55, 90].map((y) => <line key={y} x1="12" x2="288" y1={y} y2={y} className="stroke-border" strokeDasharray="3 4" />)}
            <polyline fill="none" points={points.map(({ x, y }) => `${x},${y}`).join(' ')} className="stroke-primary" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
            {points.map(({ time, value, label, x, y }) => (
              <g key={time}>
                <circle cx={x} cy={y} r="4" className="fill-surface stroke-primary" strokeWidth="2" />
                <text x={x} y={y - 9} textAnchor="middle" className="fill-text-primary text-[9px] font-semibold">{label ?? value.toFixed(1)}</text>
              </g>
            ))}
          </svg>
          <div className="grid text-center text-[10px] leading-4 text-text-secondary" style={{ gridTemplateColumns: `repeat(${records.length}, minmax(0, 1fr))` }}>
            {records.map((record, index) => {
              const showLabel = index === 0 || index === records.length - 1 || index % labelStep === 0
              return (
                <span aria-hidden={!showLabel} className={showLabel ? 'min-w-0' : 'invisible'} key={record.time}>
                  <span className="block">{formatHealthTimelineDate(record.time)}</span>
                  <span className="block truncate">{record.periodLabel}</span>
                </span>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
