import { useEffect, useId, useMemo, useState, type CSSProperties } from 'react'
import { Avatar } from '../../components/common'
import { calculateGrowthPosition, exactAgeInMonths, growthValueAtZScore } from '../../features/health-profile/utils/childGrowthReference'
import type { GrowthMeasurementApiDto, Member } from '../../types'

const percentileLines = [{ label: 'P3', z: -1.8808 }, { label: 'P15', z: -1.0364 }, { label: 'P50', z: 0 }, { label: 'P85', z: 1.0364 }, { label: 'P97', z: 1.8808 }]
type Measure = 'height' | 'weight'

export function GrowthCurveChart({ compact = false, measure, member, records, replayKey = 0 }: { compact?: boolean; measure: Measure; member: Member; records: GrowthMeasurementApiDto[]; replayKey?: number }) {
  const rawId = useId(), pathId = `growth-journey-${rawId.replace(/:/g, '')}`
  const [reduced, setReduced] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [animationDone, setAnimationDone] = useState(false)
  useEffect(() => { const query = matchMedia('(prefers-reduced-motion: reduce)'); const update = () => setReduced(query.matches); update(); query.addEventListener('change', update); return () => query.removeEventListener('change', update) }, [])
  useEffect(() => { setAnimationDone(reduced); if (reduced) return; const timer = window.setTimeout(() => setAnimationDone(true), compact ? 1800 : 2200); return () => window.clearTimeout(timer) }, [compact, measure, reduced, replayKey])
  const model = useMemo(() => {
    const points = records.flatMap((record) => {
      const value = measure === 'height' ? record.heightCm : record.weightKg
      const age = exactAgeInMonths(member.birthday, record.measuredAt)
      return value == null || age == null || age > 60 ? [] : [{ record, age, value }]
    }).sort((a, b) => a.age - b.age)
    const allValues = percentileLines.flatMap(({ z }) => [0, 6, 12, 18, 24, 36, 48, 60].map((age) => growthValueAtZScore({ ageInMonths: age, gender: member.gender ?? '', measure, zScore: z })).filter((value): value is number => value != null))
    const min = Math.floor(Math.min(...allValues, ...points.map((point) => point.value)) * .9), max = Math.ceil(Math.max(...allValues, ...points.map((point) => point.value)) * 1.05)
    const x = (age: number) => 30 + Math.min(60, age) / 60 * 252, y = (value: number) => 190 - (value - min) / Math.max(1, max - min) * 155
    const referencePaths = percentileLines.map((line) => ({ ...line, path: Array.from({ length: 21 }, (_, index) => { const age = index * 3; const value = growthValueAtZScore({ ageInMonths: age, gender: member.gender ?? '', measure, zScore: line.z }); return value == null ? '' : `${index ? 'L' : 'M'}${x(age).toFixed(1)},${y(value).toFixed(1)}` }).join(' ') }))
    let journey = ''
    if (points.length) {
      const latest = points.at(-1)!
      const startingValue = growthValueAtZScore({ ageInMonths: 0, gender: member.gender ?? '', measure, zScore: 0 }) ?? latest.value
      journey = `M${x(0)},${y(startingValue)} ` + points.map((point) => `L${x(point.age)},${y(point.value)}`).join(' ')
    }
    return { points, min, max, x, y, referencePaths, journey }
  }, [measure, member.birthday, member.gender, records])
  if (!model.points.length) return <div className="growth-chart-empty">记录一次{measure === 'height' ? '身长或身高' : '体重'}后查看曲线</div>
  const latest = model.points.at(-1)!
  return <div className={`growth-curve-chart ${compact ? 'growth-curve-chart--compact' : ''}`} data-reduced-motion={reduced}>
    <svg aria-label={`${measure === 'height' ? '身长身高' : '体重'}成长曲线`} role="img" viewBox="0 0 320 220">
      {[0, 12, 24, 36, 48, 60].map((month) => <g key={month}><line className="growth-chart-grid" x1={model.x(month)} x2={model.x(month)} y1="28" y2="190" /><text className="growth-chart-axis" x={model.x(month)} y="210">{month}</text></g>)}
      {model.referencePaths.map((line, index) => <g key={line.label}><path className={`growth-chart-reference growth-chart-reference--${index}`} d={line.path} /><text className="growth-chart-percentile" x="286" y={model.y(growthValueAtZScore({ ageInMonths: 60, gender: member.gender ?? '', measure, zScore: line.z }) ?? 0) + 3}>{line.label}</text></g>)}
      <path className="growth-chart-journey" d={model.journey} id={pathId} />
      {model.points.map((point, index) => <g aria-label={`${point.record.measuredAt}，${point.value}${measure === 'height' ? '厘米' : '千克'}`} className="growth-chart-record" key={point.record.id} onClick={() => setSelectedId(point.record.id)} role="button" style={{ '--record-index': index } as CSSProperties} tabIndex={0}><circle className={point.record.dataStatus === 'pending_confirmation' ? 'pending' : ''} cx={model.x(point.age)} cy={model.y(point.value)} r="5" /><title>{point.record.measuredAt} · {point.value}{measure === 'height' ? ' cm' : ' kg'}{point.record.dataStatus === 'pending_confirmation' ? ' · 待确认' : ''}</title></g>)}
      {!reduced && !animationDone && <foreignObject className="growth-chart-travel-avatar" height="34" width="34" x="-17" y="-17"><div className="growth-chart-moving-avatar"><Avatar name={member.name} size="sm" src={member.avatar} /></div><animateMotion begin="0s" dur={compact ? '1.8s' : '2.2s'} fill="freeze" key={`${replayKey}-${measure}`} path={model.journey} /></foreignObject>}
      <circle className="growth-chart-current-halo" cx={model.x(latest.age)} cy={model.y(latest.value)} r="11" />
      {animationDone && <foreignObject className="growth-chart-final-avatar" height="34" width="34" x={model.x(latest.age) - 17} y={model.y(latest.value) - 17}><div className="growth-chart-moving-avatar"><Avatar name={member.name} size="sm" src={member.avatar} /></div></foreignObject>}
    </svg>
    {!compact && <><div className="growth-chart-selected">{(() => { const point = model.points.find((item) => item.record.id === selectedId) ?? latest; const position = calculateGrowthPosition({ birthday: member.birthday, gender: member.gender, measuredAt: point.record.measuredAt, measure, value: point.value }); return <><strong>{point.record.measuredAt} · {point.value} {measure === 'height' ? 'cm' : 'kg'}</strong><span>{Math.floor(point.age / 12)}岁{Math.floor(point.age % 12)}个月 · {position?.percentileLabel ?? '暂无百分位'}{point.record.dataStatus === 'pending_confirmation' ? ' · 待确认' : ''}</span></> })()}</div><p className="growth-chart-footnote">横轴：年龄（月） · 纵轴：{measure === 'height' ? 'cm' : 'kg'}。只有圆点代表真实测量记录。</p></>}
  </div>
}
