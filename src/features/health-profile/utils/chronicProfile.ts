export interface ChronicProfileRecord {
  id: string
  sequence: number
  knowledge: string
  name: string
  locations: string[]
  symptoms: string[]
  otherSymptom: string
  description: string
  patterns: string[]
  otherPattern: string
  duration: string
  lifeImpact: string
  handling: string
  legacy?: { firstFoundAt?: string; status?: string; note?: string }
  _savedAt?: string
}

export interface ChronicProfileReport {
  id: string
  name: string
  date: string
  dataUrl: string
  mimeType: string
  parsingStatus: '待人工整理'
}

type StoredChronicRecord = Partial<ChronicProfileRecord> & {
  firstFoundAt?: unknown
  status?: unknown
  impact?: unknown
  management?: unknown
  note?: unknown
  [key: string]: unknown
}

export function emptyChronicRecord(sequence: number): ChronicProfileRecord {
  return {
    id: `chronic-${Date.now()}-${sequence}`,
    sequence,
    knowledge: '',
    name: '',
    locations: [],
    symptoms: [],
    otherSymptom: '',
    description: '',
    patterns: [],
    otherPattern: '',
    duration: '',
    lifeImpact: '',
    handling: ''
  }
}

export function normalizeChronicRecords(records: readonly StoredChronicRecord[]): ChronicProfileRecord[] {
  return records.map((record, index) => ({
    id: typeof record.id === 'string' && record.id ? record.id : `legacy-chronic-${index + 1}`,
    sequence: typeof record.sequence === 'number' && record.sequence > 0 ? record.sequence : index + 1,
    knowledge: String(record.knowledge ?? (record.name ? '已有明确名称' : '')),
    name: String(record.name ?? ''),
    locations: Array.isArray(record.locations) ? record.locations.map(String) : [],
    symptoms: Array.isArray(record.symptoms) ? record.symptoms.map(String) : [],
    otherSymptom: String(record.otherSymptom ?? ''),
    description: String(record.description ?? record.impact ?? ''),
    patterns: Array.isArray(record.patterns) ? record.patterns.map(String) : [],
    otherPattern: String(record.otherPattern ?? ''),
    duration: String(record.duration ?? ''),
    lifeImpact: String(record.lifeImpact ?? ''),
    handling: String(record.handling ?? record.management ?? ''),
    legacy: record.legacy ?? {
      firstFoundAt: String(record.firstFoundAt ?? ''),
      status: String(record.status ?? ''),
      note: String(record.note ?? '')
    },
    _savedAt: typeof record._savedAt === 'string' ? record._savedAt : undefined
  })).sort((left, right) => left.sequence - right.sequence)
}

export function nextChronicSequence(records: readonly ChronicProfileRecord[]) {
  return records.reduce((maximum, record) => Math.max(maximum, record.sequence), 0) + 1
}

function compactList(values: readonly string[]) {
  if (values.length <= 2) return values.join('、')
  return `${values.slice(0, 2).join('、')}等 ${values.length} 项`
}

export function chronicSummary(record: ChronicProfileRecord) {
  return {
    detail: [record.knowledge || '了解程度未填', compactList(record.locations), compactList([...record.symptoms, record.otherSymptom].filter(Boolean))].filter(Boolean).join(' · '),
    pattern: compactList([...record.patterns, record.otherPattern].filter(Boolean)),
    impact: record.lifeImpact || '程度未知'
  }
}

export function normalizeChronicReports(value: unknown): ChronicProfileReport[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const report = item as Partial<ChronicProfileReport>
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
