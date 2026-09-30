// Default matches server/routines; persisted records carry their own timezone.
export const SLEEP_CLOCK = {
  timeZone: 'Asia/Shanghai', offsetMinutes: 480, minutesPerTurn: 720,
  dayStart: 360, nightStart: 1080,
  day: { accent: '#E7953B', background: '#FFF2E2', label: '白天' },
  night: { accent: '#669AC7', background: '#EDF5FC', label: '夜间' },
  adjusted: { accent: '#9876C7', background: '#F3EDFA' }
} as const
export function sleepLocal(value: string | Date, timeZone: string = SLEEP_CLOCK.timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value))
  const part = (key: string) => parts.find(part => part.type === key)!.value
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`
}
export function sleepInstant(local: string, timeZone: string = SLEEP_CLOCK.timeZone) {
  const target = Date.parse(`${local}:00Z`)
  let instant = target
  for (let attempt = 0; attempt < 3; attempt++) instant += target - Date.parse(`${sleepLocal(new Date(instant), timeZone)}:00Z`)
  return new Date(instant).toISOString()
}
export function sleepMinute(value: string, timeZone: string = SLEEP_CLOCK.timeZone) { const local = sleepLocal(value, timeZone); return Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16)) }
export function sleepPeriod(value: string, timeZone: string = SLEEP_CLOCK.timeZone) { const m = sleepMinute(value, timeZone); return m >= SLEEP_CLOCK.dayStart && m < SLEEP_CLOCK.nightStart ? SLEEP_CLOCK.day : SLEEP_CLOCK.night }
export function sleepAngle(value: string, timeZone: string = SLEEP_CLOCK.timeZone) { return (sleepMinute(value, timeZone) % SLEEP_CLOCK.minutesPerTurn) / SLEEP_CLOCK.minutesPerTurn * 360 }
export function pointerAngle(x: number, y: number) { return (Math.atan2(y, x) * 180 / Math.PI + 450) % 360 }
export function angleDelta(previous: number, next: number) { return ((next - previous + 540) % 360) - 180 }
export function draggedSleepInstant(initial: string, degrees: number) { return new Date(Date.parse(initial) + Math.round(degrees * SLEEP_CLOCK.minutesPerTurn / 360) * 60000).toISOString() }
export function sleepDateLabel(value: string, reference: string, timeZone: string = SLEEP_CLOCK.timeZone) {
  const local = sleepLocal(value, timeZone)
  const days = Math.round((Date.parse(`${local.slice(0, 10)}T00:00:00Z`) - Date.parse(`${sleepLocal(reference, timeZone).slice(0, 10)}T00:00:00Z`)) / 86400000)
  return `${local.slice(0, 10)}${days === 1 ? ' · 次日' : days > 1 ? ` · ${days}天后` : days < 0 ? ` · ${-days}天前` : ''} · ${sleepPeriod(value, timeZone).label}`
}
