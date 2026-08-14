// @ts-expect-error Node's native TypeScript test runner requires an explicit extension; Vite supports it at runtime.
import { normalizeSmartTags } from './smartTags.ts'

export interface FamilyHealthIssue {
  id: string
  name: string
  onset: string
  certainty: string
}

export interface FamilyHistoryRecord {
  id: string
  sequence: number
  relationship: string
  customRelationship: string
  healthIssues: FamilyHealthIssue[]
  note: string
  legacy?: {
    sharedOnset?: string
    sharedCertainty?: string
    similar?: string
    unmapped?: Record<string, unknown>
  }
  _savedAt?: string
}

type StoredFamilyRecord = Partial<FamilyHistoryRecord> & {
  disease?: unknown
  conditions?: unknown
  age?: unknown
  onset?: unknown
  diagnosed?: unknown
  diagnosisStatus?: unknown
  similar?: unknown
  [key: string]: unknown
}

export const UNIQUE_RELATIONSHIPS = ['父亲', '母亲', '祖父', '祖母', '外祖父', '外祖母'] as const

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function certainty(value: unknown) {
  const normalized = text(value)
  if (normalized === '是' || normalized === '明确诊断') return '明确诊断'
  if (normalized === '不确定') return '不确定'
  return normalized
}

function issueId(recordIndex: number, issueIndex: number) {
  return `family-issue-${recordIndex + 1}-${issueIndex + 1}`
}

function normalizeIssues(record: StoredFamilyRecord, recordIndex: number) {
  if (Array.isArray(record.healthIssues)) {
    return record.healthIssues.flatMap((value, issueIndex) => {
      if (!value || typeof value !== 'object') return []
      const issue = value as Partial<FamilyHealthIssue>
      const name = text(issue.name)
      if (!name) return []
      return [{
        id: text(issue.id) || issueId(recordIndex, issueIndex),
        name,
        onset: text(issue.onset),
        certainty: certainty(issue.certainty)
      }]
    })
  }

  const names = normalizeSmartTags([
    ...(Array.isArray(record.conditions) ? record.conditions : []),
    text(record.disease)
  ])
  const sharedOnset = text(record.age ?? record.onset)
  const sharedCertainty = certainty(record.diagnosed ?? record.diagnosisStatus)

  return names.map((name, issueIndex) => ({
    id: issueId(recordIndex, issueIndex),
    name,
    onset: issueIndex === 0 ? sharedOnset : '',
    certainty: issueIndex === 0 ? sharedCertainty : ''
  }))
}

export function emptyFamilyHistoryRecord(sequence: number): FamilyHistoryRecord {
  return {
    id: `family-history-${Date.now()}-${sequence}`,
    sequence,
    relationship: '',
    customRelationship: '',
    healthIssues: [],
    note: ''
  }
}

export function normalizeFamilyHistoryRecords(records: readonly StoredFamilyRecord[]): FamilyHistoryRecord[] {
  return records.map((record, recordIndex) => {
    const healthIssues = normalizeIssues(record, recordIndex)
    const legacyOnset = text(record.age ?? record.onset)
    const legacyCertainty = certainty(record.diagnosed ?? record.diagnosisStatus)
    const legacySimilar = text(record.similar)
    const existingLegacy = record.legacy && typeof record.legacy === 'object' ? record.legacy : undefined
    const relationship = text(record.relationship)
    const knownKeys = new Set([
      'id', 'sequence', 'relationship', 'customRelationship', 'healthIssues', 'note',
      'disease', 'conditions', 'age', 'onset', 'diagnosed', 'diagnosisStatus',
      'similar', 'legacy', '_savedAt'
    ])
    const unmapped = Object.fromEntries(Object.entries(record).filter(([key, value]) => !knownKeys.has(key) && value != null && value !== ''))

    return {
      id: text(record.id) || `legacy-family-history-${recordIndex + 1}`,
      sequence: typeof record.sequence === 'number' && record.sequence > 0 ? record.sequence : recordIndex + 1,
      relationship: relationship === '其他' || relationship ? relationship : '',
      customRelationship: text(record.customRelationship),
      healthIssues,
      note: text(record.note),
      legacy: {
        ...existingLegacy,
        ...(healthIssues.length > 1 && legacyOnset ? { sharedOnset: legacyOnset } : {}),
        ...(healthIssues.length > 1 && legacyCertainty ? { sharedCertainty: legacyCertainty } : {}),
        ...(legacySimilar ? { similar: legacySimilar } : {}),
        ...(Object.keys(unmapped).length ? { unmapped: { ...existingLegacy?.unmapped, ...unmapped } } : {})
      },
      _savedAt: text(record._savedAt) || undefined
    }
  }).sort((left, right) => left.sequence - right.sequence)
}

export function nextFamilyHistorySequence(records: readonly FamilyHistoryRecord[]) {
  return records.reduce((maximum, record) => Math.max(maximum, record.sequence), 0) + 1
}

export function setFamilyHealthIssueNames(record: FamilyHistoryRecord, names: readonly string[]) {
  const normalized = normalizeSmartTags(names)
  return {
    ...record,
    healthIssues: normalized.map((name, index) => {
      const existing = record.healthIssues.find((issue) => issue.name === name)
      return existing ?? {
        id: `family-issue-${Date.now()}-${index + 1}`,
        name,
        onset: '',
        certainty: ''
      }
    })
  }
}

export function familyHistorySummary(record: FamilyHistoryRecord) {
  const relationship = record.relationship === '其他'
    ? record.customRelationship || '其他亲属'
    : record.relationship || `亲属 ${record.sequence}`
  const issues = record.healthIssues.map((issue) => {
    const onset = issue.onset
      ? /^(约|大约)/.test(issue.onset) || issue.onset.includes('多') ? issue.onset : `约${issue.onset}`
      : ''
    return [issue.name, onset].filter(Boolean).join(' · ')
  })
  return { relationship, issues }
}

export function findExistingUniqueRelationship(records: readonly FamilyHistoryRecord[], relationship: string) {
  if (!UNIQUE_RELATIONSHIPS.includes(relationship as typeof UNIQUE_RELATIONSHIPS[number])) return -1
  return records.findIndex((record) => record.relationship === relationship)
}
