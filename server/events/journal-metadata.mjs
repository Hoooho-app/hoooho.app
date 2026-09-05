import { TimeResolverService } from '../ai/time-resolver-service.mjs'
import { HealthEventRecordError } from './health-event-record-error.mjs'

const categories = new Set(['diet', 'sleep', 'elimination', 'activity', 'emotion', 'social', 'symptom', 'measurement', 'growth', 'injury', 'medication', 'care', 'vaccination', 'environment', 'visit', 'examination', 'other'])
const dietKinds = new Set(['feeding', 'complementary', 'meal', 'snack'])
const feedingMethods = new Set(['breast', 'formula', 'expressed', 'mixed'])
const foodForms = new Set(['puree', 'minced', 'small-pieces', 'finger-food'])
const meals = new Set(['早餐', '午餐', '晚餐', '零食'])
const appetites = new Set(['比平时少', '和平时差不多', '比平时多'])
const resolver = new TimeResolverService()

function cleanStrings(value, field, limit = 12) {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > limit || value.some((item) => typeof item !== 'string' || !item.trim() || item.trim().length > 80)) {
    throw new HealthEventRecordError(`${field}无效`, 400, 'INVALID_JOURNAL_DIET')
  }
  return [...new Set(value.map((item) => item.trim()))]
}

function validateDiet(value) {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || !dietKinds.has(value.kind)) throw new HealthEventRecordError('饮食记录类型无效', 400, 'INVALID_JOURNAL_DIET')
  const result = { kind: value.kind }
  if (value.feedingMethod !== undefined) {
    if (!feedingMethods.has(value.feedingMethod)) throw new HealthEventRecordError('喂养方式无效', 400, 'INVALID_JOURNAL_DIET')
    result.feedingMethod = value.feedingMethod
  }
  if (value.breastSeconds !== undefined) {
    const { left, right, total } = value.breastSeconds ?? {}
    if (![left, right, total].every((item) => Number.isInteger(item) && item >= 0 && item <= 86_400) || total !== left + right) throw new HealthEventRecordError('喂养时长无效', 400, 'INVALID_JOURNAL_DIET')
    result.breastSeconds = { left, right, total }
  }
  if (value.bottleMl !== undefined) {
    if (!Number.isFinite(value.bottleMl) || value.bottleMl <= 0 || value.bottleMl > 5000) throw new HealthEventRecordError('喂奶量无效', 400, 'INVALID_JOURNAL_DIET')
    result.bottleMl = value.bottleMl
  }
  const foods = cleanStrings(value.foods, '食物')
  const firstTryFoods = cleanStrings(value.firstTryFoods, '首次尝试食物')
  const reactions = cleanStrings(value.reactions, '进食后观察', 8)
  const feedingStatuses = cleanStrings(value.feedingStatuses, '进食状态', 8)
  if (foods !== undefined) result.foods = foods
  if (firstTryFoods !== undefined) {
    if (firstTryFoods.some((food) => !foods?.includes(food))) throw new HealthEventRecordError('首次尝试食物必须来自本次食物', 400, 'INVALID_JOURNAL_DIET')
    result.firstTryFoods = firstTryFoods
  }
  if (reactions !== undefined) result.reactions = reactions
  if (feedingStatuses !== undefined) result.feedingStatuses = feedingStatuses
  if (value.foodForm !== undefined) {
    if (!foodForms.has(value.foodForm)) throw new HealthEventRecordError('食物形态无效', 400, 'INVALID_JOURNAL_DIET')
    result.foodForm = value.foodForm
  }
  if (value.meal !== undefined) {
    if (!meals.has(value.meal)) throw new HealthEventRecordError('餐次无效', 400, 'INVALID_JOURNAL_DIET')
    result.meal = value.meal
  }
  if (value.appetite !== undefined) {
    if (!appetites.has(value.appetite)) throw new HealthEventRecordError('食欲记录无效', 400, 'INVALID_JOURNAL_DIET')
    result.appetite = value.appetite
  }
  for (const key of ['amount', 'voiceTranscript']) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== 'string' || !value[key].trim() || value[key].trim().length > 1000) throw new HealthEventRecordError('饮食记录内容无效', 400, 'INVALID_JOURNAL_DIET')
      result[key] = value[key].trim()
    }
  }
  return result
}

function recordedClock(occurredAt, timezone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(occurredAt)).map(({ type, value }) => [type, value]))
  return `${parts.hour}:${parts.minute}`
}

export function validateJournal(value) {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'object' || !Array.isArray(value.categories) || value.categories.some((category) => !categories.has(category))) {
    throw new HealthEventRecordError('记录分类无效', 400, 'INVALID_JOURNAL_CATEGORY')
  }
  const diet = validateDiet(value.diet)
  if (diet && !value.categories.includes('diet')) throw new HealthEventRecordError('饮食详情必须归入喂养/饮食分类', 400, 'INVALID_JOURNAL_DIET')
  return { categories: [...new Set(value.categories)], ...(diet ? { diet } : {}) }
}

// Read-only presentation: never backfill guessed timestamps into historical records.
export function projectJournalRecord(record, timezone = 'Asia/Shanghai') {
  const selected = ['user_record', 'measurement', 'doctor_confirmation'].includes(record.sourceType)
  let journal = { ...record.journal, timePrecision: 'exact', occurredAt: record.occurredAt }
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
        let projected = time
        // A spoken day without a clock still belongs to that day, but its visible
        // minute is the moment the user made the record rather than midnight.
        if (time.precision === 'day' && time.resolvedStart) {
          projected = resolver.resolve(`${text.replaceAll('：', ':')} ${recordedClock(record.occurredAt, timezone)}`, { timezone, referenceNow: new Date(record.createdAt) })
        }
        if (projected.resolvedStart && ['exact', 'period'].includes(projected.precision) && Date.parse(projected.resolvedStart) <= Date.parse(record.createdAt)) {
          journal = { ...journal, occurredAt: projected.resolvedStart, timePrecision: projected.precision, ...(projected.precision === 'period' ? { timeLabel: periods[0] === '昨晚' ? '晚上' : periods[0] } : {}) }
        }
      } catch { /* Invalid or ambiguous legacy input keeps its raw content and unknown precision. */ }
    }
  }
  return { ...record, journal }
}
