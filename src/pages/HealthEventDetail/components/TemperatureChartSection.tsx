import type { HealthEvent } from '../../../types'
import { Card } from '../../../components/common'
import { formatHealthTimelineDate } from '../../../utils/formatHealthTimePeriod'

export function TemperatureChartSection({ event }: { event: HealthEvent }) {
  const records = event.temperatureRecords
  const points = records.map((record, index) => {
    const x = records.length === 1 ? 150 : 16 + (index * 268) / (records.length - 1)
    const y = 92 - ((record.value - 36) / 3) * 70
    return { ...record, x, y: Math.max(16, Math.min(92, y)) }
  })

  return (
    <section className="space-y-3">
      <h2 className="section-title">体温曲线（℃）</h2>
      <Card>
        <div>
          <svg aria-label="体温变化曲线" className="h-32 w-full overflow-visible" viewBox="0 0 300 120" role="img">
            {[20, 55, 90].map((y) => <line key={y} x1="12" x2="288" y1={y} y2={y} className="stroke-border" strokeDasharray="3 4" />)}
            <polyline fill="none" points={points.map(({ x, y }) => `${x},${y}`).join(' ')} className="stroke-primary" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
            {points.map(({ time, value, label, x, y }) => (
              <g key={time}>
                <circle cx={x} cy={y} r="4" className="fill-surface stroke-primary" strokeWidth="2" />
                <text x={x} y={y - 9} textAnchor="middle" className="fill-text-primary text-[9px] font-semibold">{label ?? value.toFixed(1)}</text>
              </g>
            ))}
          </svg>
          <div className="flex justify-between gap-2 text-center text-[10px] leading-4 text-text-secondary">
            {records.map((record) => (
              <span key={record.time}>
                <span className="block">{formatHealthTimelineDate(record.time)}</span>
                <span className="block">{record.periodLabel}</span>
              </span>
            ))}
          </div>
        </div>
      </Card>
    </section>
  )
}
