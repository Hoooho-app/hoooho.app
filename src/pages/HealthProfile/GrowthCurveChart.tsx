import { useEffect, useId, useMemo, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react'
import { Avatar } from '../../components/common'
import { calculateGrowthPosition, exactAgeInMonths, growthValueAtZScore } from '../../features/health-profile/utils/childGrowthReference'
import type { GrowthMeasurementApiDto, Member } from '../../types'
import { metricRecords, type GrowthMeasure } from './growthInterpretation'

const percentiles = [{ label: 'P3', z: -1.8808 }, { label: 'P15', z: -1.0364 }, { label: 'P50', z: 0 }, { label: 'P85', z: 1.0364 }, { label: 'P97', z: 1.8808 }]
const displayValue = (_measure: GrowthMeasure, value: number) => value.toFixed(1)
const displayUnit = (measure: GrowthMeasure) => measure === 'height' ? 'cm' : 'kg'
const ageText = (age: number) => `${Math.floor(age / 12)}岁${Math.floor(age % 12)}个月`

export function GrowthCurveChart({ compact = false, measure, member, records }: { compact?: boolean; measure: GrowthMeasure; member: Member; records: GrowthMeasurementApiDto[] }) {
  const rawId = useId(), titleId = `growth-chart-${rawId.replace(/:/g, '')}`
  const [selectedId, setSelectedId] = useState('')
  useEffect(() => setSelectedId(''), [measure, member.id])

  const model = useMemo(() => {
    const points = metricRecords(records, measure).flatMap((record) => {
      const value = measure === 'height' ? record.heightCm : record.weightKg
      const age = exactAgeInMonths(member.birthday, record.measuredAt)
      return value == null || age == null || age > 60 ? [] : [{ record, age, value }]
    })
    if (!points.length) return null
    const latest = points.at(-1)!, maxAge = Math.min(60, Math.max(12, Math.ceil((latest.age + 3) / 6) * 6))
    const sampleAges = Array.from({ length: 25 }, (_, index) => maxAge * index / 24)
    const referenceValues = percentiles.flatMap(({ z }) => sampleAges.map((age) => growthValueAtZScore({ ageInMonths: age, gender: member.gender ?? '', measure, zScore: z })).filter((value): value is number => value != null))
    const rawMin = Math.min(...referenceValues, ...points.map((point) => point.value)), rawMax = Math.max(...referenceValues, ...points.map((point) => point.value)), padding = Math.max(measure === 'height' ? 1 : .4, (rawMax - rawMin) * .08)
    const min = Math.floor((rawMin - padding) * 10) / 10, max = Math.ceil((rawMax + padding) * 10) / 10
    const x = (age: number) => 42 + Math.min(maxAge, age) / maxAge * 258, y = (value: number) => 244 - (value - min) / Math.max(.1, max - min) * 208
    const linePoints = (z: number) => sampleAges.flatMap((age) => { const value = growthValueAtZScore({ ageInMonths: age, gender: member.gender ?? '', measure, zScore: z }); return value == null ? [] : [{ age, value }] })
    const pathFor = (values: Array<{ age: number; value: number }>) => values.map((point, index) => `${index ? 'L' : 'M'}${x(point.age).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ')
    const referencePaths = percentiles.map((line) => ({ ...line, values: linePoints(line.z), path: pathFor(linePoints(line.z)) }))
    const upper = referencePaths.at(-1)!.values, lower = [...referencePaths[0].values].reverse()
    const bandPath = `${pathFor(upper)} ${lower.map((point) => `L${x(point.age).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ')} Z`
    const xTicks = [0, .25, .5, .75, 1].map((ratio) => Math.round(maxAge * ratio))
    const yTicks = [0, .25, .5, .75, 1].map((ratio) => Math.round((min + (max - min) * ratio) * 10) / 10)
    return { points, latest, x, y, referencePaths, bandPath, actualPath: pathFor(points), xTicks, yTicks }
  }, [measure, member.birthday, member.gender, records])

  if (!model) return <div className="growth-chart-empty">保存第一次{measure === 'height' ? '身长或身高' : '体重'}测量后，这里会出现真实曲线</div>
  const selectedIndex = model.points.findIndex((point) => point.record.id === selectedId)
  const selected = selectedIndex >= 0 ? model.points[selectedIndex] : null
  const previous = selectedIndex > 0 ? model.points[selectedIndex - 1] : null
  const selectedPosition = selected ? calculateGrowthPosition({ birthday: member.birthday, gender: member.gender, measuredAt: selected.record.measuredAt, measure, value: selected.value }) : null
  const toggle = (id: string) => setSelectedId((current) => current === id ? '' : id)
  const openFromKeyboard = (event: KeyboardEvent<SVGCircleElement>, id: string) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault(); event.stopPropagation(); toggle(id)
  }
  const stopAndToggle = (event: MouseEvent, id: string) => { event.stopPropagation(); toggle(id) }

  return <div className={`growth-curve-chart ${compact ? 'growth-curve-chart--compact' : ''}`}>
    <svg aria-labelledby={titleId} onClick={() => setSelectedId('')} role="img" viewBox="0 0 340 286">
      <title id={titleId}>{measure === 'height' ? '身长身高' : '体重'}成长曲线，可点选真实测量点查看数据</title>
      <path className="growth-chart-band" d={model.bandPath} />
      {model.yTicks.map((value) => <g key={value}><line className="growth-chart-grid" x1="42" x2="300" y1={model.y(value)} y2={model.y(value)} /><text className="growth-chart-axis growth-chart-axis--y" x="36" y={model.y(value) + 3}>{displayValue(measure, value)}</text></g>)}
      {model.xTicks.map((month) => <g key={month}><line className="growth-chart-grid" x1={model.x(month)} x2={model.x(month)} y1="36" y2="244" /><text className="growth-chart-axis" x={model.x(month)} y="266">{month}</text></g>)}
      {model.referencePaths.map((line, index) => <g key={line.label}><path className={`growth-chart-reference growth-chart-reference--${index}`} d={line.path} /><text className="growth-chart-percentile" x="306" y={model.y(line.values.at(-1)?.value ?? 0) + 3}>{line.label}</text></g>)}
      {model.points.length > 1 && <path className="growth-chart-actual" d={model.actualPath} />}
      {model.points.map((point, index) => <g className={`growth-chart-record ${selectedId === point.record.id ? 'growth-chart-record--selected' : ''}`} key={point.record.id} style={{ '--record-index': index } as CSSProperties}>
        <circle className={point.record.dataStatus === 'pending_confirmation' ? 'pending' : ''} cx={model.x(point.age)} cy={model.y(point.value)} r="6" />
        <circle aria-label={`${point.record.measuredAt}，${displayValue(measure, point.value)} ${displayUnit(measure)}`} className="growth-chart-hit" cx={model.x(point.age)} cy={model.y(point.value)} onClick={(event) => stopAndToggle(event, point.record.id)} onKeyDown={(event) => openFromKeyboard(event, point.record.id)} r="17" role="button" tabIndex={0} />
      </g>)}
      <circle className="growth-chart-current-halo" cx={model.x(model.latest.age)} cy={model.y(model.latest.value)} r="13" />
      <line className="growth-chart-avatar-link" x1={model.x(model.latest.age)} x2={model.x(model.latest.age)} y1={model.y(model.latest.value) - 5} y2={Math.max(21, model.y(model.latest.value) - 19)} />
      <foreignObject className="growth-chart-final-avatar" height="38" width="38" x={model.x(model.latest.age) - 19} y={Math.max(2, model.y(model.latest.value) - 53)}>
        <button aria-label="查看最新测量点" className="growth-chart-avatar-button" onClick={(event) => stopAndToggle(event, model.latest.record.id)} type="button"><Avatar name={member.name} size="sm" src={member.avatar} /></button>
      </foreignObject>
    </svg>
    {selected && <button aria-label="关闭测量点详情" className="growth-chart-tooltip" onClick={() => setSelectedId('')} style={{ '--point-x': `${model.x(selected.age) / 3.4}%`, '--point-y': `${model.y(selected.value) / 2.86}%` } as CSSProperties} type="button">
      <strong>{selected.record.measuredAt} · {ageText(selected.age)}</strong>
      <span>{displayValue(measure, selected.value)} {displayUnit(measure)}{selectedPosition ? ` · ${selectedPosition.percentileLabel}` : ''}</span>
      {previous && <small>较上次 {selected.value - previous.value >= 0 ? '+' : ''}{(selected.value - previous.value).toFixed(1)} {displayUnit(measure)}</small>}
    </button>}
    <p className="growth-chart-footnote">横轴：月龄 · 纵轴：{displayUnit(measure)}。浅线为 WHO 参考曲线，深色线和圆点为已保存记录。</p>
  </div>
}
