import { useEffect, useId, useMemo, useState, type CSSProperties } from 'react'
import { Avatar } from '../../components/common'
import { calculateGrowthPosition, exactAgeInMonths, growthValueAtZScore } from '../../features/health-profile/utils/childGrowthReference'
import type { GrowthMeasurementApiDto, Member } from '../../types'

const percentiles = [{ label: 'P3', z: -1.8808 }, { label: 'P15', z: -1.0364 }, { label: 'P50', z: 0 }, { label: 'P85', z: 1.0364 }, { label: 'P97', z: 1.8808 }]
type Measure = 'height' | 'weight'

export function GrowthCurveChart({ compact = false, measure, member, records, replayKey = 0 }: { compact?: boolean; measure: Measure; member: Member; records: GrowthMeasurementApiDto[]; replayKey?: number }) {
  const rawId = useId(), pathId = `growth-journey-${rawId.replace(/:/g, '')}`
  const [reduced, setReduced] = useState(false), [selectedId, setSelectedId] = useState(''), [animationDone, setAnimationDone] = useState(false)
  const latestRecordId = records[0]?.id ?? ''
  useEffect(() => { const query = matchMedia('(prefers-reduced-motion: reduce)'); const update = () => setReduced(query.matches); update(); query.addEventListener('change', update); return () => query.removeEventListener('change', update) }, [])
  useEffect(() => {
    const key = `hoho-growth-animation:${member.id}:${measure}`
    const previousLatest = sessionStorage.getItem(key)
    const shouldAnimate = !reduced && (replayKey > 0 || previousLatest !== latestRecordId)
    setAnimationDone(!shouldAnimate)
    if (!shouldAnimate) return
    sessionStorage.setItem(key, latestRecordId)
    const timer = window.setTimeout(() => setAnimationDone(true), 2200)
    return () => window.clearTimeout(timer)
  }, [latestRecordId, measure, member.id, reduced, replayKey])
  const model = useMemo(() => {
    const points = records.flatMap((record) => {
      const value = measure === 'height' ? record.heightCm : record.weightKg
      const age = exactAgeInMonths(member.birthday, record.measuredAt)
      return value == null || age == null || age > 60 ? [] : [{ record, age, value }]
    }).sort((a, b) => a.age - b.age)
    if (!points.length) return null
    const latest = points.at(-1)!, maxAge = Math.min(60, Math.max(12, Math.ceil((latest.age + 3) / 6) * 6))
    const sampleAges = Array.from({ length: 25 }, (_, index) => maxAge * index / 24)
    const referenceValues = percentiles.flatMap(({ z }) => sampleAges.map((age) => growthValueAtZScore({ ageInMonths: age, gender: member.gender ?? '', measure, zScore: z })).filter((value): value is number => value != null))
    const rawMin = Math.min(...referenceValues, ...points.map((point) => point.value)), rawMax = Math.max(...referenceValues, ...points.map((point) => point.value)), padding = Math.max(1, (rawMax - rawMin) * .08)
    const min = Math.floor(rawMin - padding), max = Math.ceil(rawMax + padding)
    const x = (age: number) => 42 + Math.min(maxAge, age) / maxAge * 258, y = (value: number) => 244 - (value - min) / Math.max(1, max - min) * 208
    const linePoints = (z: number) => sampleAges.flatMap((age) => { const value = growthValueAtZScore({ ageInMonths: age, gender: member.gender ?? '', measure, zScore: z }); return value == null ? [] : [{ age, value }] })
    const pathFor = (values: Array<{ age: number; value: number }>) => values.map((point, index) => `${index ? 'L' : 'M'}${x(point.age).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ')
    const referencePaths = percentiles.map((line) => ({ ...line, values: linePoints(line.z), path: pathFor(linePoints(line.z)) }))
    const upper = referencePaths.at(-1)!.values, lower = [...referencePaths[0].values].reverse()
    const bandPath = `${pathFor(upper)} ${lower.map((point) => `L${x(point.age).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ')} Z`
    const actualPath = pathFor(points)
    const startAtBirth = replayKey > 0 || points.length === 1
    const animationPoints = startAtBirth ? [{ age: 0, value: growthValueAtZScore({ ageInMonths: 0, gender: member.gender ?? '', measure, zScore: 0 }) ?? points[0].value }, ...points] : points.slice(-2)
    const animationPath = pathFor(animationPoints)
    const xTicks = [0, .25, .5, .75, 1].map((ratio) => Math.round(maxAge * ratio))
    const yTicks = [0, .25, .5, .75, 1].map((ratio) => Math.round((min + (max - min) * ratio) * 10) / 10)
    return { points, latest, min, max, maxAge, x, y, referencePaths, bandPath, actualPath, animationPath, xTicks, yTicks }
  }, [measure, member.birthday, member.gender, records, replayKey])
  if (!model) return <div className="growth-chart-empty">记录一次{measure === 'height' ? '身长或身高' : '体重'}后查看曲线</div>
  const selected = model.points.find((item) => item.record.id === selectedId) ?? model.latest
  const selectedPosition = calculateGrowthPosition({ birthday: member.birthday, gender: member.gender, measuredAt: selected.record.measuredAt, measure, value: selected.value })
  return <div className={`growth-curve-chart ${compact ? 'growth-curve-chart--compact' : ''}`} data-reduced-motion={reduced}>
    <svg aria-label={`${measure === 'height' ? '身长身高' : '体重'}成长曲线`} role="img" viewBox="0 0 340 286">
      <path className="growth-chart-band" d={model.bandPath} />
      {model.yTicks.map((value) => <g key={value}><line className="growth-chart-grid" x1="42" x2="300" y1={model.y(value)} y2={model.y(value)} /><text className="growth-chart-axis growth-chart-axis--y" x="36" y={model.y(value) + 3}>{value}</text></g>)}
      {model.xTicks.map((month) => <g key={month}><line className="growth-chart-grid" x1={model.x(month)} x2={model.x(month)} y1="36" y2="244" /><text className="growth-chart-axis" x={model.x(month)} y="266">{month}</text></g>)}
      {model.referencePaths.map((line, index) => <g key={line.label}><path className={`growth-chart-reference growth-chart-reference--${index}`} d={line.path} /><text className="growth-chart-percentile" x="306" y={model.y(line.values.at(-1)?.value ?? 0) + 3}>{line.label}</text></g>)}
      {model.points.length > 1 && <path className="growth-chart-actual" d={model.actualPath} />}
      {!animationDone && <path className="growth-chart-journey" d={model.animationPath} id={pathId} />}
      {model.points.map((point, index) => <g aria-label={`${point.record.measuredAt}，${point.value}${measure === 'height' ? '厘米' : '千克'}`} className="growth-chart-record" key={point.record.id} onClick={() => setSelectedId(point.record.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedId(point.record.id) }} role="button" style={{ '--record-index': index } as CSSProperties} tabIndex={0}><circle className={point.record.dataStatus === 'pending_confirmation' ? 'pending' : ''} cx={model.x(point.age)} cy={model.y(point.value)} r="6" /><title>{point.record.measuredAt} · {point.value}{measure === 'height' ? ' cm' : ' kg'}</title></g>)}
      {!reduced && !animationDone && <foreignObject height="38" width="38" x="-19" y="-19"><div className="growth-chart-moving-avatar"><Avatar name={member.name} size="sm" src={member.avatar} /></div><animateMotion begin="0s" dur="2.2s" fill="freeze" key={`${replayKey}-${measure}-${latestRecordId}`} path={model.animationPath} /></foreignObject>}
      <circle className="growth-chart-current-halo" cx={model.x(model.latest.age)} cy={model.y(model.latest.value)} r="12" />
      {animationDone && <foreignObject className="growth-chart-final-avatar" height="38" width="38" x={model.x(model.latest.age) - 19} y={model.y(model.latest.value) - 19}><div className="growth-chart-moving-avatar"><Avatar name={member.name} size="sm" src={member.avatar} /></div></foreignObject>}
    </svg>
    <div className="growth-chart-selected"><strong>{selected.record.measuredAt} · {selected.value} {measure === 'height' ? 'cm' : 'kg'}</strong><span>{Math.floor(selected.age / 12)}岁{Math.floor(selected.age % 12)}个月 · {selectedPosition?.percentileLabel ?? '暂无百分位'}{selected.record.dataStatus === 'pending_confirmation' ? ' · 待确认' : ''}</span></div>
    <p className="growth-chart-footnote">横轴：年龄（月） · 纵轴：{measure === 'height' ? 'cm' : 'kg'}。深色线和圆点仅代表真实测量记录。</p>
  </div>
}
