export interface AllergyProfileRecord {
  id: string
  sequence: number
  certainty: string
  type: string
  subject: string
  reactions: string[]
  otherReaction: string
  impact: string
  handling: string
  _savedAt?: string
}

export interface AllergyReport {
  id: string
  name: string
  date: string
  dataUrl: string
  mimeType: string
  parsingStatus: '待人工整理'
}

type StoredAllergyRecord = Partial<AllergyProfileRecord> & {
  name?: unknown
  reaction?: unknown
  [key: string]: unknown
}

export function emptyAllergyRecord(sequence: number): AllergyProfileRecord {
  return {
    id: `allergy-${Date.now()}-${sequence}`,
    sequence,
    certainty: '',
    type: '',
    subject: '',
    reactions: [],
    otherReaction: '',
    impact: '',
    handling: ''
  }
}

export function normalizeAllergyRecords(records: readonly StoredAllergyRecord[]): AllergyProfileRecord[] {
  return records.map((record, index) => ({
    id: typeof record.id === 'string' && record.id ? record.id : `legacy-allergy-${index + 1}`,
    sequence: typeof record.sequence === 'number' && record.sequence > 0 ? record.sequence : index + 1,
    certainty: String(record.certainty ?? '已明确'),
    type: String(record.type ?? ''),
    subject: String(record.subject ?? record.name ?? ''),
    reactions: Array.isArray(record.reactions) ? record.reactions.map(String) : [],
    otherReaction: String(record.otherReaction ?? record.reaction ?? ''),
    impact: String(record.impact ?? ''),
    handling: String(record.handling ?? ''),
    _savedAt: typeof record._savedAt === 'string' ? record._savedAt : undefined
  })).sort((left, right) => left.sequence - right.sequence)
}

export function nextAllergySequence(records: readonly AllergyProfileRecord[]) {
  return records.reduce((maximum, record) => Math.max(maximum, record.sequence), 0) + 1
}

export function allergyReactionSummary(record: AllergyProfileRecord) {
  const reactions = [...record.reactions, record.otherReaction].filter(Boolean)
  if (reactions.length <= 2) return reactions.join('、')
  return `${reactions.slice(0, 2).join('、')}等 ${reactions.length} 项`
}

export function normalizeAllergyReports(value: unknown): AllergyReport[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const report = item as Partial<AllergyReport>
    if (!report.id || !report.name || !report.dataUrl) return []
    return [{
      id: String(report.id),
      name: String(report.name),
      date: String(report.date ?? ''),
      dataUrl: String(report.dataUrl),
      mimeType: String(report.mimeType ?? ''),
      parsingStatus: '待人工整理' as const
    }]
  })
}
