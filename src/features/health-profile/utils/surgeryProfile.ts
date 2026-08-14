// @ts-expect-error Node's native TypeScript test runner requires an explicit extension; Vite supports it at runtime.
import { normalizeBodyLocationSelection } from '../../body-location/bodyLocationCatalog.ts'
// @ts-expect-error Node's native TypeScript test runner requires an explicit extension; Vite supports it at runtime.
import { normalizeSmartTags } from './smartTags.ts'
import type { BodyLocationSelection } from '../../body-location/types'

export interface SurgeryProfileRecord {
  id: string
  sequence: number
  name: string
  date: string
  hospital: string
  locations: BodyLocationSelection[]
  postoperativeStatusTags: string[]
  implantTags: string[]
  /** Legacy fields remain serializable so editing a record never destroys old data. */
  reason: string
  legacyNote?: string
  legacyImplantNote?: string
  legacyAttachment?: unknown
  _savedAt?: string
}

type StoredSurgeryRecord = Partial<SurgeryProfileRecord> & {
  note?: unknown
  recovery?: unknown
  remainingImpact?: unknown
  impact?: unknown
  hasImplant?: unknown
  implant?: unknown
  implantName?: unknown
  implantDetail?: unknown
  attachment?: unknown
  [key: string]: unknown
}

const RECOVERY_ALIASES: Record<string, string> = {
  '仍有一些影响': '仍有影响',
  '有长期影响': '长期影响'
}

function asText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizePostoperativeTags(record: StoredSurgeryRecord) {
  const legacyRecovery = asText(record.recovery)
  return normalizeSmartTags([
    ...(Array.isArray(record.postoperativeStatusTags) ? record.postoperativeStatusTags : []),
    legacyRecovery ? (RECOVERY_ALIASES[legacyRecovery] ?? legacyRecovery) : '',
    asText(record.remainingImpact),
    asText(record.impact)
  ])
}

function normalizeImplantTags(record: StoredSurgeryRecord) {
  const current = normalizeSmartTags(Array.isArray(record.implantTags) ? record.implantTags : [])
  const implantValue = record.hasImplant ?? record.implant
  const implantName = asText(record.implantName ?? record.implantDetail)
  const explicitNone = implantValue === false || implantValue === '无' || implantValue === 'false'
  const explicitImplant = implantValue === true || implantValue === '有' || implantValue === 'true'
  const combined = normalizeSmartTags([
    ...current,
    explicitNone ? '无' : '',
    implantName
  ])

  if (combined.some((tag) => tag !== '无')) return combined.filter((tag) => tag !== '无')
  if (combined.length) return combined
  if (explicitImplant && !implantName) return []
  return []
}

export function emptySurgeryRecord(sequence: number): SurgeryProfileRecord {
  return {
    id: `surgery-${Date.now()}-${sequence}`,
    sequence,
    name: '',
    date: '',
    hospital: '',
    locations: [],
    postoperativeStatusTags: [],
    implantTags: [],
    reason: ''
  }
}

export function normalizeSurgeryRecords(records: readonly StoredSurgeryRecord[]): SurgeryProfileRecord[] {
  return records.map((record, index) => {
    const implantValue = record.hasImplant ?? record.implant
    const implantName = asText(record.implantName ?? record.implantDetail)
    const explicitImplant = implantValue === true || implantValue === '有' || implantValue === 'true'

    return {
      id: typeof record.id === 'string' && record.id ? record.id : `legacy-surgery-${index + 1}`,
      sequence: typeof record.sequence === 'number' && record.sequence > 0 ? record.sequence : index + 1,
      name: String(record.name ?? ''),
      date: String(record.date ?? ''),
      hospital: String(record.hospital ?? ''),
      locations: Array.isArray(record.locations)
        ? record.locations.flatMap((value, locationIndex) => normalizeBodyLocationSelection(value, locationIndex) ?? [])
        : [],
      postoperativeStatusTags: normalizePostoperativeTags(record),
      implantTags: normalizeImplantTags(record),
      reason: String(record.reason ?? ''),
      legacyNote: asText(record.legacyNote ?? record.note) || undefined,
      legacyImplantNote: asText(record.legacyImplantNote) || (explicitImplant && !implantName ? '有植入物，名称未记录' : undefined),
      legacyAttachment: record.legacyAttachment ?? record.attachment,
      _savedAt: typeof record._savedAt === 'string' ? record._savedAt : undefined
    }
  }).sort((left, right) => left.sequence - right.sequence)
}

export function nextSurgerySequence(records: readonly SurgeryProfileRecord[]) {
  return records.reduce((maximum, record) => Math.max(maximum, record.sequence), 0) + 1
}

function compact(values: readonly string[], fallback: string) {
  return values.length ? values.join('、') : fallback
}

export function surgerySummary(record: SurgeryProfileRecord) {
  return {
    context: [record.date, record.hospital].filter(Boolean).join(' · ') || '时间与医院未填写',
    locations: compact(record.locations.map((location) => location.label), '手术部位未填写'),
    postoperative: compact(record.postoperativeStatusTags, '术后情况未填写'),
    implant: record.implantTags.includes('无')
      ? '无植入物'
      : compact(record.implantTags, record.legacyImplantNote || '植入物未填写')
  }
}
