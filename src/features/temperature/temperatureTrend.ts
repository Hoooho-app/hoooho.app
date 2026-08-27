export type TemperatureLevel =
  | 'marked-low'
  | 'low'
  | 'normal'
  | 'low-fever'
  | 'moderate-fever'
  | 'high-fever'
  | 'hyperpyrexia'
  | 'site-specific'

export interface TemperatureClassification {
  level: TemperatureLevel
  label: string
  color: string
  isAbnormal: boolean
  emphasis: 'standard' | 'elevated' | 'critical'
}

export const AXILLARY_TEMPERATURE_REFERENCE = {
  label: '按腋温参考',
  normalMin: 36,
  normalMax: 37.2
} as const

export const TEMPERATURE_LEVELS = [
  { level: 'marked-low', upperExclusive: 35, label: '明显偏低', color: 'color-mix(in srgb, rgb(var(--hoho-color-secondary)) 42%, rgb(var(--hoho-color-error)))', emphasis: 'critical' },
  { level: 'low', upperExclusive: 36, label: '体温偏低', color: 'rgb(var(--hoho-color-secondary))', emphasis: 'elevated' },
  { level: 'normal', upperExclusive: 37.3, label: '正常', color: 'rgb(var(--hoho-color-primary))', emphasis: 'standard' },
  { level: 'low-fever', upperExclusive: 38.1, label: '低热', color: 'rgb(var(--hoho-color-warning))', emphasis: 'elevated' },
  { level: 'moderate-fever', upperExclusive: 39.1, label: '中等发热', color: 'color-mix(in srgb, rgb(var(--hoho-color-warning)) 38%, rgb(var(--hoho-color-error)))', emphasis: 'elevated' },
  { level: 'high-fever', upperExclusive: 41.1, label: '高热', color: 'rgb(var(--hoho-color-error))', emphasis: 'critical' },
  { level: 'hyperpyrexia', upperExclusive: Number.POSITIVE_INFINITY, label: '超高热', color: 'color-mix(in srgb, rgb(var(--hoho-color-error)) 78%, rgb(var(--hoho-color-text-primary)))', emphasis: 'critical' }
] as const satisfies readonly (Omit<TemperatureClassification, 'isAbnormal'> & { upperExclusive: number })[]

export interface ChartPoint {
  x: number
  y: number
}

export interface CubicSegment {
  start: ChartPoint
  control1: ChartPoint
  control2: ChartPoint
  end: ChartPoint
}

export function isValidTemperature(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 20 && value <= 50
}

export function roundTemperature(value: number) {
  return Math.round(value * 10) / 10
}

export function classifyAxillaryTemperature(value: number): TemperatureClassification {
  const rounded = roundTemperature(value)
  const level = TEMPERATURE_LEVELS.find((candidate) => rounded < candidate.upperExclusive) ?? TEMPERATURE_LEVELS.at(-1)!
  return {
    level: level.level,
    label: level.label,
    color: level.color,
    isAbnormal: level.level !== 'normal',
    emphasis: level.emphasis
  }
}

export function classifyTemperatureForSite(value: number, site?: string): TemperatureClassification {
  if (getMeasurementSiteKey(site) === 'axillary') return classifyAxillaryTemperature(value)
  return {
    level: 'site-specific',
    label: '按部位参考',
    color: 'rgb(var(--hoho-color-secondary))',
    isAbnormal: false,
    emphasis: 'standard'
  }
}

export function formatTemperatureValue(value: number) {
  return `${roundTemperature(value).toFixed(1)}℃`
}

export function formatTemperatureClock(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间未知'
  const hour = date.getHours()
  const period = hour < 6 ? '凌晨' : hour < 9 ? '早上' : hour < 12 ? '上午' : hour < 13 ? '中午' : hour < 18 ? '下午' : hour < 21 ? '晚上' : '夜间'
  const time = `${String(hour).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  return `${period} ${time}`
}

export function formatTemperatureDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '日期未知'
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export function getTemperatureDomain(values: number[]) {
  const validValues = values.filter(isValidTemperature)
  const rawMin = Math.min(AXILLARY_TEMPERATURE_REFERENCE.normalMin, ...validValues)
  const rawMax = Math.max(AXILLARY_TEMPERATURE_REFERENCE.normalMax, ...validValues)
  const midpoint = (rawMin + rawMax) / 2
  const span = Math.max(4, rawMax - rawMin + 1.2)
  return { min: midpoint - span / 2, max: midpoint + span / 2 }
}

export function getMeasurementSiteKey(site?: string) {
  const normalized = site?.trim()
  if (!normalized || /腋|腋下/.test(normalized)) return 'axillary'
  return normalized
}

export function getMeasurementSiteLabel(site?: string) {
  const normalized = site?.trim()
  return normalized || '腋温（默认）'
}

export function buildMonotoneCurve(points: ChartPoint[]) {
  if (points.length < 2) return { path: '', segments: [] as CubicSegment[] }

  if (points.length === 2) {
    const [start, end] = points
    const third = (end.x - start.x) / 3
    const segment = {
      start,
      control1: { x: start.x + third, y: start.y },
      control2: { x: end.x - third, y: end.y },
      end
    }
    return { path: segmentPath(segment, true), segments: [segment] }
  }

  const slopes = points.slice(0, -1).map((point, index) => {
    const next = points[index + 1]
    return (next.y - point.y) / (next.x - point.x)
  })
  const tangents = points.map((_, index) => {
    if (index === 0) return slopes[0]
    if (index === points.length - 1) return slopes.at(-1)!
    const previous = slopes[index - 1]
    const next = slopes[index]
    if (previous === 0 || next === 0 || Math.sign(previous) !== Math.sign(next)) return 0
    return (2 * previous * next) / (previous + next)
  })

  for (let index = 0; index < slopes.length; index += 1) {
    const slope = slopes[index]
    if (slope === 0) {
      tangents[index] = 0
      tangents[index + 1] = 0
      continue
    }
    const leftRatio = tangents[index] / slope
    const rightRatio = tangents[index + 1] / slope
    const magnitude = Math.hypot(leftRatio, rightRatio)
    if (magnitude > 3) {
      const scale = 3 / magnitude
      tangents[index] = scale * leftRatio * slope
      tangents[index + 1] = scale * rightRatio * slope
    }
  }

  const segments = points.slice(0, -1).map((start, index): CubicSegment => {
    const end = points[index + 1]
    const third = (end.x - start.x) / 3
    return {
      start,
      control1: { x: start.x + third, y: start.y + tangents[index] * third },
      control2: { x: end.x - third, y: end.y - tangents[index + 1] * third },
      end
    }
  })

  return {
    path: segments.map((segment, index) => segmentPath(segment, index === 0)).join(' '),
    segments
  }
}

function segmentPath(segment: CubicSegment, includeMove: boolean) {
  const move = includeMove ? `M ${segment.start.x} ${segment.start.y} ` : ''
  return `${move}C ${segment.control1.x} ${segment.control1.y}, ${segment.control2.x} ${segment.control2.y}, ${segment.end.x} ${segment.end.y}`
}

export function sampleCubicSegment(segment: CubicSegment, progress: number) {
  const t = Math.max(0, Math.min(1, progress))
  const inverse = 1 - t
  return {
    x: inverse ** 3 * segment.start.x + 3 * inverse ** 2 * t * segment.control1.x + 3 * inverse * t ** 2 * segment.control2.x + t ** 3 * segment.end.x,
    y: inverse ** 3 * segment.start.y + 3 * inverse ** 2 * t * segment.control1.y + 3 * inverse * t ** 2 * segment.control2.y + t ** 3 * segment.end.y
  }
}
