// @ts-expect-error Node's native TypeScript test runner requires an explicit extension; Vite supports it at runtime.
import { normalizeBodyLocationSelection } from '../../body-location/bodyLocationCatalog.ts'
import type { BodyLocationSelection } from '../../body-location/types'
// @ts-expect-error Node's native TypeScript test runner requires an explicit extension; Vite supports it at runtime.
import { normalizeSmartTags } from './smartTags.ts'

export interface ChronicProfileRecord {
  id: string
  sequence: number
  knowledge: string
  name: string
  bodyLocations: BodyLocationSelection[]
  legacyLocationNotes: string[]
  manifestations: string[]
  frequency: string
  duration: string
  customDuration: string
  triggers: string[]
  lifeImpacts: string[]
  handling: string
  legacy?: {
    firstFoundAt?: string
    status?: string
    note?: string
    patternNote?: string
  }
  _savedAt?: string
}

type StoredChronicRecord = Partial<ChronicProfileRecord> & {
  locations?: unknown
  symptoms?: unknown
  otherSymptom?: unknown
  description?: unknown
  patterns?: unknown
  otherPattern?: unknown
  lifeImpact?: unknown
  firstFoundAt?: unknown
  status?: unknown
  impact?: unknown
  management?: unknown
  note?: unknown
  [key: string]: unknown
}

const FREQUENCIES = ['每天', '每周', '每月', '每季度', '每年', '没有固定频率'] as const
const LEGACY_TRIGGER_VALUES = ['久站', '久坐', '运动后', '劳累后', '睡眠不足', '受凉', '压力大', '饮食后', '早晨', '晚上', '天气变化'] as const
const LEGACY_TRIGGER_ALIASES: Record<string, string> = {
  久站后: '久站',
  久坐后: '久坐',
  睡眠不足时: '睡眠不足',
  天冷时: '受凉',
  季节相关: '天气变化'
}

export function emptyChronicRecord(sequence: number): ChronicProfileRecord {
  return {
    id: `chronic-${Date.now()}-${sequence}`,
    sequence,
    knowledge: '',
    name: '',
    bodyLocations: [],
    legacyLocationNotes: [],
    manifestations: [],
    frequency: '',
    duration: '',
    customDuration: '',
    triggers: [],
    lifeImpacts: [],
    handling: ''
  }
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? normalizeSmartTags(value) : []
}

function normalizeLocations(record: StoredChronicRecord) {
  const source = Array.isArray(record.bodyLocations)
    ? record.bodyLocations
    : Array.isArray(record.locations)
      ? record.locations
      : []
  const bodyLocations: BodyLocationSelection[] = []
  const legacyLocationNotes: string[] = stringArray(record.legacyLocationNotes)

  source.forEach((value, index) => {
    const normalized = normalizeBodyLocationSelection(value, index)
    if (!normalized) return
    if (normalized.id.startsWith('legacy_location_')) legacyLocationNotes.push(normalized.label)
    else bodyLocations.push(normalized)
  })

  return {
    bodyLocations,
    legacyLocationNotes: normalizeSmartTags(legacyLocationNotes)
  }
}

function normalizeLegacyPatterns(record: StoredChronicRecord) {
  const patterns = stringArray(record.patterns)
  const otherPattern = String(record.otherPattern ?? '').trim()
  const frequency = String(record.frequency ?? '')
  const mappedFrequency = FREQUENCIES.includes(frequency as (typeof FREQUENCIES)[number])
    ? frequency
    : patterns.find((value) => FREQUENCIES.includes(value as (typeof FREQUENCIES)[number])) ?? ''
  const mappedTriggers = patterns.flatMap((value) => {
    if (LEGACY_TRIGGER_VALUES.includes(value as (typeof LEGACY_TRIGGER_VALUES)[number])) return [value]
    return LEGACY_TRIGGER_ALIASES[value] ? [LEGACY_TRIGGER_ALIASES[value]] : []
  })
  const triggers = normalizeSmartTags([...stringArray(record.triggers), ...mappedTriggers])
  const unmapped = normalizeSmartTags([
    ...patterns.filter((value) => value !== mappedFrequency && !triggers.includes(value) && !LEGACY_TRIGGER_ALIASES[value]),
    otherPattern
  ])

  return { frequency: mappedFrequency, triggers, patternNote: unmapped.join('、') }
}

export function normalizeChronicRecords(records: readonly StoredChronicRecord[]): ChronicProfileRecord[] {
  return records.map((record, index) => {
    const locations = normalizeLocations(record)
    const patterns = normalizeLegacyPatterns(record)
    const manifestations = normalizeSmartTags([
      ...stringArray(record.manifestations),
      ...stringArray(record.symptoms),
      String(record.otherSymptom ?? ''),
      String(record.description ?? record.impact ?? '')
    ])
    const legacyLifeImpact = String(record.lifeImpact ?? '').trim()

    return {
      id: typeof record.id === 'string' && record.id ? record.id : `legacy-chronic-${index + 1}`,
      sequence: typeof record.sequence === 'number' && record.sequence > 0 ? record.sequence : index + 1,
      knowledge: String(record.knowledge ?? (record.name ? '已有明确名称' : '')),
      name: String(record.name ?? ''),
      ...locations,
      manifestations,
      frequency: patterns.frequency,
      duration: String(record.duration ?? ''),
      customDuration: String(record.customDuration ?? ''),
      triggers: patterns.triggers,
      lifeImpacts: normalizeSmartTags([...stringArray(record.lifeImpacts), legacyLifeImpact]),
      handling: String(record.handling ?? record.management ?? ''),
      legacy: {
        ...(record.legacy ?? {}),
        firstFoundAt: String(record.legacy?.firstFoundAt ?? record.firstFoundAt ?? ''),
        status: String(record.legacy?.status ?? record.status ?? ''),
        note: String(record.legacy?.note ?? record.note ?? ''),
        patternNote: record.legacy?.patternNote ?? patterns.patternNote
      },
      _savedAt: typeof record._savedAt === 'string' ? record._savedAt : undefined
    }
  }).sort((left, right) => left.sequence - right.sequence)
}

export function nextChronicSequence(records: readonly ChronicProfileRecord[]) {
  return records.reduce((maximum, record) => Math.max(maximum, record.sequence), 0) + 1
}

function compactList(values: readonly string[]) {
  if (!values.length) return ''
  if (values.length <= 2) return values.join('、')
  return `${values.slice(0, 2).join('、')}等 ${values.length} 项`
}

export function chronicSummary(record: ChronicProfileRecord) {
  const locations = normalizeSmartTags([
    ...record.bodyLocations.map((item) => item.label),
    ...record.legacyLocationNotes
  ])
  const duration = record.duration === '其他' ? record.customDuration : record.duration

  return {
    locations: compactList(locations) || '位置未填',
    manifestations: compactList(record.manifestations) || '表现未填',
    rhythm: [record.frequency, duration].filter(Boolean).join(' · ') || '规律未填'
  }
}
