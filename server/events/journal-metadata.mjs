import { TimeResolverService } from '../ai/time-resolver-service.mjs'
import { HealthEventRecordError } from './health-event-record-error.mjs'

const categories = new Set(['diet', 'sleep', 'elimination', 'activity', 'emotion', 'social', 'symptom', 'measurement', 'growth', 'injury', 'medication', 'care', 'vaccination', 'environment', 'visit', 'examination', 'other'])
const resolver = new TimeResolverService()

export function validateJournal(value) {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'object' || !Array.isArray(value.categories) || value.categories.some((category) => !categories.has(category))) {
    throw new HealthEventRecordError('记录分类无效', 400, 'INVALID_JOURNAL_CATEGORY')
  }
  return { categories: [...new Set(value.categories)] }
}

// Read-only presentation: never backfill guessed timestamps into historical records.
export function projectJournalRecord(record, timezone = 'Asia/Shanghai') {
  const selected = ['user_record', 'measurement', 'doctor_confirmation'].includes(record.sourceType)
  let journal = { ...record.journal, timePrecision: selected ? 'exact' : 'unknown', occurredAt: record.occurredAt }
  if (!selected) {
    const text = record.sourceText || record.content || ''
    const clocks = text.match(/[一二两三四五六七八九十\d]{1,3}(?:点(?:半|[一二两三四五六七八九十\d]{1,3}分?)?|[:：]\d{1,2})/g) ?? []
    const days = text.match(/今天|昨天|前天|昨晚|\d{1,2}月\d{1,2}[日号]/g) ?? []
    const periods = text.match(/凌晨|半夜|今早|早上|上午|中午|下午|晚上|昨晚|夜里|夜间/g) ?? []
    // A degree such as “有一点痒” is not a clock. Only unambiguous clock context
    // may enter the existing resolver; leave uncertain originals untouched.
    const clock = clocks[0]
    const clockIndex = clock ? text.indexOf(clock) : -1
    const clockContext = !clock || clock.includes(':') || clock.includes('：') || clockIndex === 0 || /(?:今天|昨天|前天|凌晨|半夜|早上|上午|中午|下午|晚上|昨晚|夜里|夜间|在|于|到|[，,。\s])$/.test(text.slice(0, clockIndex))
    if (clockContext && !/一点(?:点|儿|痒|疼|痛)|明天|后天|下周|下个月/.test(text) && clocks.length <= 1 && new Set(days).size <= 1 && new Set(periods).size <= 1) {
      try {
        const time = resolver.resolve(text.replaceAll('：', ':'), { timezone, referenceNow: new Date(record.createdAt) })
        if (time.resolvedStart && ['exact', 'period', 'day'].includes(time.precision) && Date.parse(time.resolvedStart) <= Date.parse(record.createdAt)) {
          journal = { ...journal, occurredAt: time.resolvedStart, timePrecision: time.precision, ...(time.precision === 'period' ? { timeLabel: periods[0] === '昨晚' ? '晚上' : periods[0] } : {}) }
        }
      } catch { /* Invalid or ambiguous legacy input keeps its raw content and unknown precision. */ }
    }
  }
  return { ...record, journal }
}
