import { getLocalDateKey } from '../../utils/localCalendarDate'
import type { ActivityProjectionPoint } from './timeGridModel'

// Display projections only: one stored sleep retains its identity across both endpoints.
// Do not clip to midnight or emit hourly/current-time continuation records.
export function projectSleepEndpoints(startValue: string | Date, endValue: string | Date | undefined, day: string): ActivityProjectionPoint[] {
  const start = new Date(startValue)
  if (!Number.isFinite(start.getTime())) return []
  const points: ActivityProjectionPoint[] = []
  const add = (at: Date, kind: 'start' | 'end') => {
    if (getLocalDateKey(at) === day) points.push({ at, hour: at.getHours(), minute: at.getMinutes(), kind, key: `${kind}:${at.toISOString()}` })
  }
  add(start, 'start')
  if (endValue !== undefined) {
    const end = new Date(endValue)
    if (Number.isFinite(end.getTime()) && end > start) add(end, 'end')
  }
  return points
}

export function sleepEndpointStatus(projection: 'start' | 'end' | 'open', ongoing: boolean, durationMinutes: number, startValue?: string | Date) {
  if (projection !== 'end') {
    if (ongoing) return '开始入睡 · 持续'
    const start = startValue === undefined ? null : new Date(startValue)
    return start && Number.isFinite(start.getTime()) ? `开始于${start.getHours()}点${String(start.getMinutes()).padStart(2, '0')}分入睡` : '开始入睡'
  }
  const minutes = Math.max(0, Math.round(durationMinutes))
  const hours = Math.floor(minutes / 60)
  return `醒了 · 共${hours > 0 ? `${hours}小时` : ''}${minutes % 60}分钟`
}
