const DEFAULT_TIMEZONE = 'Asia/Shanghai'

const periodDefinitions = [
  { names: ['凌晨', '半夜'], startHour: 0, endHour: 6 },
  { names: ['今早', '早上'], startHour: 6, endHour: 9 },
  { names: ['上午'], startHour: 9, endHour: 12 },
  { names: ['中午'], startHour: 12, endHour: 13 },
  { names: ['下午'], startHour: 14, endHour: 18 },
  { names: ['晚上'], startHour: 18, endHour: 24 },
  { names: ['夜里', '夜间'], startHour: 21, endHour: 24 }
]

function validTimezone(value) {
  const timezone = typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_TIMEZONE
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date())
    return timezone
  } catch {
    return DEFAULT_TIMEZONE
  }
}

function zonedParts(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date)
  const value = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]))
  return { year: value.year, month: value.month, day: value.day, hour: value.hour, minute: value.minute, second: value.second }
}

function offsetMinutes(date, timezone) {
  const parts = zonedParts(date, timezone)
  const representedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return Math.round((representedAsUtc - date.getTime()) / 60_000)
}

function localDateToInstant(parts, timezone) {
  const targetUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour ?? 0, parts.minute ?? 0, parts.second ?? 0)
  let instant = new Date(targetUtc)
  for (let index = 0; index < 2; index += 1) {
    instant = new Date(targetUtc - offsetMinutes(instant, timezone) * 60_000)
  }
  return instant
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function isoInTimezone(parts, timezone) {
  const instant = localDateToInstant(parts, timezone)
  const offset = offsetMinutes(instant, timezone)
  const sign = offset >= 0 ? '+' : '-'
  const absolute = Math.abs(offset)
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour ?? 0)}:${pad(parts.minute ?? 0)}:${pad(parts.second ?? 0)}${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`
}

function addDays(parts, amount) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount))
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

function startOfWeek(parts) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  const weekday = date.getUTCDay() || 7
  return addDays(parts, 1 - weekday)
}

function parseSelectedTime(value, timezone) {
  if (typeof value !== 'string' || !value.trim()) return null
  const raw = value.trim()
  const yearOnly = /^(\d{4})年?$/.exec(raw)
  if (yearOnly) return { raw, year: Number(yearOnly[1]), date: null, precision: 'year' }
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  const parts = zonedParts(parsed, timezone)
  return { raw, year: parts.year, date: parsed, parts, precision: 'exact' }
}

function emptyResolvedTime(raw = null, source = 'user_text') {
  return { raw, resolvedStart: null, resolvedEnd: null, precision: 'unknown', source }
}

function rangeForDay(parts, timezone, raw, precision = 'day', source = 'user_text') {
  const next = addDays(parts, 1)
  return {
    raw,
    resolvedStart: isoInTimezone({ ...parts, hour: 0, minute: 0, second: 0 }, timezone),
    resolvedEnd: isoInTimezone({ ...next, hour: 0, minute: 0, second: 0 }, timezone),
    precision,
    source
  }
}

function resolveExplicit(raw, timezone, referenceParts) {
  const fullDate = /(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日?/.exec(raw)
  if (fullDate) {
    const parts = { year: Number(fullDate[1]), month: Number(fullDate[2]), day: Number(fullDate[3]) }
    return resolveClockOrPeriod(raw, parts, timezone) ?? rangeForDay(parts, timezone, fullDate[0], 'day')
  }
  const monthDay = /(?<!\d)(\d{1,2})月\s*(\d{1,2})[日号]?/.exec(raw)
  if (monthDay) {
    const parts = { year: referenceParts.year, month: Number(monthDay[1]), day: Number(monthDay[2]) }
    return resolveClockOrPeriod(raw, parts, timezone) ?? rangeForDay(parts, timezone, monthDay[0], 'day')
  }
  const month = /(\d{4})年\s*(\d{1,2})月/.exec(raw)
  if (month) {
    const year = Number(month[1])
    const monthValue = Number(month[2])
    const next = monthValue === 12 ? { year: year + 1, month: 1 } : { year, month: monthValue + 1 }
    return {
      raw: month[0],
      resolvedStart: isoInTimezone({ year, month: monthValue, day: 1, hour: 0, minute: 0, second: 0 }, timezone),
      resolvedEnd: isoInTimezone({ ...next, day: 1, hour: 0, minute: 0, second: 0 }, timezone),
      precision: 'month',
      source: 'user_text'
    }
  }
  const year = /(\d{4})年/.exec(raw)
  if (year) {
    const value = Number(year[1])
    return {
      raw: year[0],
      resolvedStart: isoInTimezone({ year: value, month: 1, day: 1, hour: 0, minute: 0, second: 0 }, timezone),
      resolvedEnd: isoInTimezone({ year: value, month: 12, day: 31, hour: 23, minute: 59, second: 59 }, timezone),
      precision: 'year',
      source: 'user_text'
    }
  }
  return null
}

function resolveFuzzy(raw) {
  if (!/小时候|几年前|[一二两三四五六七八九十\d]+年前|前几个月|前两天|以前|从前|很久以前/.test(raw)) return null
  return { raw, resolvedStart: null, resolvedEnd: null, precision: 'fuzzy', source: 'user_text' }
}

function relativeDate(raw, referenceParts) {
  if (/昨晚/.test(raw)) return addDays(referenceParts, -1)
  if (/前天/.test(raw)) return addDays(referenceParts, -2)
  if (/昨天/.test(raw)) return addDays(referenceParts, -1)
  if (/今天|今早|今朝|目前|现在|刚才|刚刚/.test(raw)) return { year: referenceParts.year, month: referenceParts.month, day: referenceParts.day }
  return { year: referenceParts.year, month: referenceParts.month, day: referenceParts.day }
}

function resolveClockOrPeriod(raw, parts, timezone) {
  const chineseNumber = (value) => {
    if (/^\d+$/.test(value)) return Number(value)
    const digits = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
    if (value === '十') return 10
    if (value.startsWith('十')) return 10 + (digits[value[1]] ?? 0)
    if (value.endsWith('十')) return (digits[value[0]] ?? 0) * 10
    return digits[value] ?? Number.NaN
  }
  const exactTime = /([一二两三四五六七八九十\d]{1,3})(?:点(?:(半)|([一二两三四五六七八九十\d]{1,3})分?)?|:(\d{1,2}))/.exec(raw)
  if (exactTime) {
    let hour = chineseNumber(exactTime[1])
    if (/下午|晚上|昨晚|夜里|夜间/.test(raw) && hour < 12) hour += 12
    if (/凌晨|半夜/.test(raw) && hour === 12) hour = 0
    const minute = exactTime[2] ? 30 : exactTime[3] ? chineseNumber(exactTime[3]) : Number(exactTime[4] ?? 0)
    return {
      raw,
      resolvedStart: isoInTimezone({ ...parts, hour, minute, second: 0 }, timezone),
      resolvedEnd: null,
      precision: 'exact',
      source: 'user_text'
    }
  }

  const period = periodDefinitions.find((item) => item.names.some((name) => raw.includes(name)))
  if (!period) return null
  const endParts = period.endHour === 24 ? { ...addDays(parts, 1), hour: 0 } : { ...parts, hour: period.endHour }
  return {
    raw,
    resolvedStart: isoInTimezone({ ...parts, hour: period.startHour, minute: 0, second: 0 }, timezone),
    resolvedEnd: isoInTimezone({ ...endParts, minute: 0, second: 0 }, timezone),
    precision: 'period',
    source: 'user_text'
  }
}

function weekdayIndex(value) {
  return ({ 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 })[value] ?? null
}

function resolveRelative(raw, referenceParts, timezone) {
  const daysAgo = /([一二两三四五六七八九十\d]+)天前/.exec(raw)
  if (daysAgo) {
    const numbers = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
    const amount = Number(daysAgo[1]) || numbers[daysAgo[1]]
    if (amount) return rangeForDay(addDays(referenceParts, -amount), timezone, raw)
  }
  const monthStart = /(\d{1,2})月初/.exec(raw)
  if (monthStart) {
    const month = Number(monthStart[1])
    return {
      raw,
      resolvedStart: isoInTimezone({ year: referenceParts.year, month, day: 1, hour: 0, minute: 0, second: 0 }, timezone),
      resolvedEnd: isoInTimezone({ year: referenceParts.year, month, day: 10, hour: 23, minute: 59, second: 59 }, timezone),
      precision: 'month',
      source: 'user_text'
    }
  }
  if (/去年/.test(raw)) {
    const year = referenceParts.year - 1
    return {
      raw,
      resolvedStart: isoInTimezone({ year, month: 1, day: 1, hour: 0, minute: 0, second: 0 }, timezone),
      resolvedEnd: isoInTimezone({ year, month: 12, day: 31, hour: 23, minute: 59, second: 59 }, timezone),
      precision: 'year',
      source: 'user_text'
    }
  }
  if (/上周/.test(raw)) {
    const weekday = /(上周|本周|这周|周|星期)([一二三四五六日天])/.exec(raw)
    if (weekday) {
      const thisWeek = startOfWeek(referenceParts)
      const weekStart = weekday[1] === '上周' ? addDays(thisWeek, -7) : thisWeek
      const parts = addDays(weekStart, weekdayIndex(weekday[2]) - 1)
      return resolveClockOrPeriod(raw, parts, timezone) ?? rangeForDay(parts, timezone, raw)
    }
    const thisWeek = startOfWeek(referenceParts)
    const start = addDays(thisWeek, -7)
    return {
      raw,
      resolvedStart: isoInTimezone({ ...start, hour: 0, minute: 0, second: 0 }, timezone),
      resolvedEnd: isoInTimezone({ ...thisWeek, hour: 0, minute: 0, second: 0 }, timezone),
      precision: 'fuzzy',
      source: 'user_text'
    }
  }

  const weekday = /(本周|这周|周|星期)([一二三四五六日天])/.exec(raw)
  if (weekday) {
    const parts = addDays(startOfWeek(referenceParts), weekdayIndex(weekday[2]) - 1)
    return resolveClockOrPeriod(raw, parts, timezone) ?? rangeForDay(parts, timezone, raw)
  }

  const parts = relativeDate(raw, referenceParts)
  if (/昨晚/.test(raw) && !/[一二两三四五六七八九十\d]{1,3}(?:点|:)/.test(raw)) {
    return { ...resolveClockOrPeriod('晚上', parts, timezone), raw }
  }
  const clockOrPeriod = resolveClockOrPeriod(raw, parts, timezone)
  if (clockOrPeriod) return clockOrPeriod

  if (/今天|昨天|前天|今朝|目前|现在|刚才|刚刚/.test(raw)) return rangeForDay(parts, timezone, raw)
  return null
}

function conflictFor(rawTimes, selected) {
  if (!selected) return { hasConflict: false, conflict: null }
  const mentioned = rawTimes.map((raw) => /(\d{4})年/.exec(raw)).find(Boolean)
  if (!mentioned || Number(mentioned[1]) === selected.year) return { hasConflict: false, conflict: null }
  return {
    hasConflict: true,
    conflict: {
      type: 'time_conflict',
      selected: selected.raw,
      mentioned: mentioned[0]
    }
  }
}

export class TimeResolverService {
  resolve(rawTime, options = {}) {
    const timezone = validTimezone(options.timezone)
    const selected = parseSelectedTime(options.selectedOccurredAt, timezone)
    const referenceDate = selected?.date ?? (options.referenceNow instanceof Date ? options.referenceNow : new Date(options.referenceNow ?? Date.now()))
    const referenceParts = zonedParts(referenceDate, timezone)
    const raw = typeof rawTime === 'string' && rawTime.trim() ? rawTime.trim() : null

    if (!raw) {
      if (!selected?.date) return emptyResolvedTime()
      return {
        raw: selected.raw,
        resolvedStart: isoInTimezone(selected.parts, timezone),
        resolvedEnd: null,
        precision: 'exact',
        source: 'selected_time'
      }
    }

    if (/^(?:刚才|刚刚)$/.test(raw)) {
      const instant = selected?.date ?? referenceDate
      return { raw, resolvedStart: instant.toISOString(), resolvedEnd: null, precision: 'exact', source: 'user_text' }
    }

    return resolveExplicit(raw, timezone, referenceParts)
      ?? resolveFuzzy(raw)
      ?? resolveRelative(raw, referenceParts, timezone)
      ?? emptyResolvedTime(raw)
  }

  resolveHealthAIOutput(output, options = {}) {
    const facts = Array.isArray(output?.facts) ? output.facts : []
    const timeConflict = conflictFor(facts.map((fact) => fact?.time?.raw).filter(Boolean), parseSelectedTime(options.selectedOccurredAt, validTimezone(options.timezone)))
    return {
      ...output,
      facts: facts.map((fact) => ({ ...fact, time: this.resolve(fact?.time?.raw, options) })),
      timeConflict
    }
  }
}
