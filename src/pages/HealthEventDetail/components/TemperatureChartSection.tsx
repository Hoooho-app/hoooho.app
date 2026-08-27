import { useMemo, useState } from 'react'
import {
  AXILLARY_TEMPERATURE_REFERENCE,
  buildMonotoneCurve,
  classifyTemperatureForSite,
  formatTemperatureClock,
  formatTemperatureDate,
  formatTemperatureValue,
  getMeasurementSiteKey,
  getMeasurementSiteLabel,
  getTemperatureDomain,
  isValidTemperature
} from '../../../features/temperature/temperatureTrend'
import type { HealthEvent, TemperatureRecord } from '../../../types'

const chart = { left: 18, right: 302, top: 30, bottom: 132 }

interface PositionedRecord extends TemperatureRecord {
  x: number
  y: number
  classification: ReturnType<typeof classifyTemperatureForSite>
}

export function TemperatureChartSection({ event }: { event: HealthEvent }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const records = useMemo(() => event.temperatureRecords
    .filter((record) => isValidTemperature(record.value) && !Number.isNaN(new Date(record.time).getTime()))
    .slice()
    .sort((left, right) => new Date(left.time).getTime() - new Date(right.time).getTime()), [event.temperatureRecords])

  if (records.length === 0) return null

  const domain = getTemperatureDomain(records.map((record) => record.value))
  const toY = (value: number) => chart.bottom - ((value - domain.min) / (domain.max - domain.min)) * (chart.bottom - chart.top)
  const points: PositionedRecord[] = records.map((record, index) => ({
    ...record,
    x: records.length === 1 ? 160 : chart.left + (index * (chart.right - chart.left)) / (records.length - 1),
    y: toY(record.value),
    classification: classifyTemperatureForSite(record.value, record.measurementSite)
  }))
  const siteKeys = [...new Set(records.map((record) => getMeasurementSiteKey(record.measurementSite)))]
  const showsAxillaryReference = siteKeys.length === 1 && siteKeys[0] === 'axillary'
  const curveGroups = splitPointsByMeasurementSite(points)
  const labelLayouts = layoutVisibleLabels(points)
  const tickIndexes = getTickIndexes(points.length)
  const selected = selectedIndex === null ? null : points[selectedIndex]
  const critical = [...points].reverse().find((point) => point.classification.emphasis === 'critical')
  const accessibleSummary = points.map((point) => `${formatTemperatureDate(point.time)} ${formatTemperatureClock(point.time)}，${formatTemperatureValue(point.value)}，${point.classification.label}`).join('；')

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="section-title">体温记录（℃）</h2>
        <span className="text-xs text-text-secondary">{showsAxillaryReference ? AXILLARY_TEMPERATURE_REFERENCE.label : '包含不同测量部位'}</span>
      </div>
      <div className="border-t border-primary/15 px-1 pt-5">
        <div className="rounded-card border border-border bg-surface px-2 pb-3 pt-2 shadow-calm">
          <svg aria-label={`体温趋势：${accessibleSummary}`} className="h-auto w-full overflow-visible" viewBox="0 0 320 194" role="img">
            {[chart.top, (chart.top + chart.bottom) / 2, chart.bottom].map((y) => (
              <line key={y} x1={chart.left} x2={chart.right} y1={y} y2={y} className="stroke-border" strokeDasharray="3 5" />
            ))}
            {showsAxillaryReference && (
              <g aria-label="腋温正常参考区间 36.0 到 37.2 摄氏度">
                <rect x={chart.left} y={toY(AXILLARY_TEMPERATURE_REFERENCE.normalMax)} width={chart.right - chart.left} height={toY(AXILLARY_TEMPERATURE_REFERENCE.normalMin) - toY(AXILLARY_TEMPERATURE_REFERENCE.normalMax)} fill="rgb(var(--hoho-color-primary))" opacity="0.07" />
                {[AXILLARY_TEMPERATURE_REFERENCE.normalMin, AXILLARY_TEMPERATURE_REFERENCE.normalMax].map((value) => (
                  <line key={value} x1={chart.left} x2={chart.right} y1={toY(value)} y2={toY(value)} stroke="rgb(var(--hoho-color-primary))" strokeDasharray="2 4" strokeOpacity="0.3" />
                ))}
                <text x={chart.right} y={Math.max(10, toY(AXILLARY_TEMPERATURE_REFERENCE.normalMax) - 5)} textAnchor="end" className="fill-primary text-[8px] font-medium">正常参考 36.0–37.2℃</text>
              </g>
            )}
            {curveGroups.map((group, index) => {
              const curve = buildMonotoneCurve(group)
              if (!curve.path) return null
              return <path key={`${group[0].time}-${index}`} d={curve.path} fill="none" stroke="rgb(var(--hoho-color-primary))" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" />
            })}
            {points.map((point, index) => {
              const isLatest = index === points.length - 1
              const radius = point.classification.emphasis === 'critical' ? 5.5 : point.classification.isAbnormal ? 4.8 : 4
              return (
                <g
                  aria-label={`${formatTemperatureValue(point.value)}，${point.classification.label}，${formatTemperatureDate(point.time)} ${formatTemperatureClock(point.time)}，${getMeasurementSiteLabel(point.measurementSite)}`}
                  className="cursor-pointer outline-none"
                  key={`${point.time}-${index}`}
                  onClick={() => setSelectedIndex(index)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setSelectedIndex(index)
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  {point.classification.emphasis !== 'standard' && <circle cx={point.x} cy={point.y} r={radius + 5} fill={point.classification.color} opacity={point.classification.emphasis === 'critical' ? 0.16 : 0.09} />}
                  <circle cx={point.x} cy={point.y} r={radius} fill={isLatest ? point.classification.color : 'rgb(var(--hoho-color-surface))'} stroke={point.classification.color} strokeWidth="2.2" />
                </g>
              )
            })}
            {labelLayouts.map(({ point, x, y, width }) => (
              <g key={`label-${point.time}-${point.x}`} pointerEvents="none">
                <rect x={x - width / 2} y={y} width={width} height="18" rx="9" fill="rgb(var(--hoho-color-surface))" stroke={point.classification.color} strokeOpacity="0.24" />
                <text x={x} y={y + 12} textAnchor="middle" fill={point.classification.color} className="text-[8px] font-semibold">{formatTemperatureValue(point.value)}{point.classification.isAbnormal ? ` · ${point.classification.label}` : ''}</text>
              </g>
            ))}
            {tickIndexes.map((index) => {
              const point = points[index]
              const anchor = index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'
              return (
                <text key={`tick-${point.time}-${index}`} x={point.x} y="162" textAnchor={anchor} className="fill-text-secondary text-[8px]">
                  <tspan x={point.x}>{formatTemperatureDate(point.time)}</tspan>
                  <tspan x={point.x} dy="13">{formatTemperatureClock(point.time)}</tspan>
                </text>
              )
            })}
          </svg>

          {selected && (
            <div aria-live="polite" className="mx-2 -mt-1 rounded-control border border-border bg-surface-muted px-3 py-2 text-xs leading-5 text-text-secondary">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-text-primary">{formatTemperatureValue(selected.value)} · {selected.classification.label}</strong>
                <button className="min-h-8 text-primary" onClick={() => setSelectedIndex(null)} type="button">关闭</button>
              </div>
              <p>{formatTemperatureDate(selected.time)} {formatTemperatureClock(selected.time)} · 测量部位：{getMeasurementSiteLabel(selected.measurementSite)}</p>
            </div>
          )}

          {critical && (
            <p className="mx-2 mt-2 text-xs leading-5 text-danger">
              {critical.classification.level === 'marked-low'
                ? '体温明显偏低，建议确认测量方式并复测；如伴明显不适，请及时寻求医疗帮助。'
                : '体温明显升高，建议立即复测并及时寻求医疗帮助。'}
            </p>
          )}
          {!showsAxillaryReference && <p className="mx-2 mt-2 text-xs leading-5 text-text-secondary">不同测量部位的参考范围不同，曲线已在测量部位变化处断开，未显示统一正常区间。</p>}
          <p className="mx-2 mt-2 text-[11px] leading-4 text-text-secondary">趋势与状态仅供记录参考，不作为诊断依据。</p>
        </div>
      </div>
    </section>
  )
}

function splitPointsByMeasurementSite(points: PositionedRecord[]) {
  const groups: PositionedRecord[][] = []
  for (const point of points) {
    const current = groups.at(-1)
    if (!current || getMeasurementSiteKey(current.at(-1)?.measurementSite) !== getMeasurementSiteKey(point.measurementSite)) groups.push([point])
    else current.push(point)
  }
  return groups
}

function getTickIndexes(length: number) {
  if (length <= 4) return Array.from({ length }, (_, index) => index)
  return [...new Set([0, Math.round((length - 1) / 3), Math.round(((length - 1) * 2) / 3), length - 1])]
}

function layoutVisibleLabels(points: PositionedRecord[]) {
  const visible = points.filter((point, index) => point.classification.isAbnormal || index === points.length - 1)
  const boxes: Array<{ left: number; right: number; top: number; bottom: number }> = []
  return visible.map((point) => {
    const text = `${formatTemperatureValue(point.value)}${point.classification.isAbnormal ? ` · ${point.classification.label}` : ''}`
    const width = Math.min(108, Math.max(48, text.length * 7))
    const x = Math.max(chart.left + width / 2, Math.min(chart.right - width / 2, point.x))
    const candidates = [point.y - 27, point.y + 10, point.y - 48, point.y + 31]
    const y = candidates.map((candidate) => Math.max(4, Math.min(140, candidate))).find((candidate) => {
      const next = { left: x - width / 2, right: x + width / 2, top: candidate, bottom: candidate + 18 }
      return boxes.every((box) => next.right + 3 < box.left || next.left - 3 > box.right || next.bottom + 3 < box.top || next.top - 3 > box.bottom)
    }) ?? Math.max(4, Math.min(140, point.y - 27))
    boxes.push({ left: x - width / 2, right: x + width / 2, top: y, bottom: y + 18 })
    return { point, x, y, width }
  })
}
