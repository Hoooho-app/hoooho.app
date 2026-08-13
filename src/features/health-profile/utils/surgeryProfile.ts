export interface SurgeryProfileRecord {
  id: string
  sequence: number
  name: string
  date: string
  hospital: string
  reason: string
  locations: string[]
  recovery: string
  remainingImpact: string
  hasImplant: string
  implantName: string
  legacyNote?: string
  _savedAt?: string
}

export interface SurgeryReport {
  id: string
  name: string
  date: string
  dataUrl: string
  mimeType: string
  parsingStatus: '待人工整理'
}

type StoredSurgeryRecord = Partial<SurgeryProfileRecord> & { note?: unknown; attachment?: unknown; [key: string]: unknown }

export function emptySurgeryRecord(sequence: number): SurgeryProfileRecord {
  return { id: `surgery-${Date.now()}-${sequence}`, sequence, name: '', date: '', hospital: '', reason: '', locations: [], recovery: '', remainingImpact: '', hasImplant: '', implantName: '' }
}

export function normalizeSurgeryRecords(records: readonly StoredSurgeryRecord[]): SurgeryProfileRecord[] {
  return records.map((record, index) => ({
    id: typeof record.id === 'string' && record.id ? record.id : `legacy-surgery-${index + 1}`,
    sequence: typeof record.sequence === 'number' && record.sequence > 0 ? record.sequence : index + 1,
    name: String(record.name ?? ''),
    date: String(record.date ?? ''),
    hospital: String(record.hospital ?? ''),
    reason: String(record.reason ?? ''),
    locations: Array.isArray(record.locations) ? record.locations.map(String) : [],
    recovery: String(record.recovery ?? ''),
    remainingImpact: String(record.remainingImpact ?? ''),
    hasImplant: String(record.hasImplant ?? ''),
    implantName: String(record.implantName ?? ''),
    legacyNote: String(record.legacyNote ?? record.note ?? ''),
    _savedAt: typeof record._savedAt === 'string' ? record._savedAt : undefined
  })).sort((left, right) => left.sequence - right.sequence)
}

export function nextSurgerySequence(records: readonly SurgeryProfileRecord[]) { return records.reduce((maximum, record) => Math.max(maximum, record.sequence), 0) + 1 }

export function surgerySummary(record: SurgeryProfileRecord) {
  return {
    context: [record.date ? record.date.slice(0, 7).replace('-', '/') : '', record.hospital].filter(Boolean).join(' · '),
    reason: record.reason,
    status: record.recovery || '术后情况未填',
    implant: record.hasImplant === '有' ? [record.locations[0], record.implantName].filter(Boolean).join(' · ') : ''
  }
}

export function normalizeSurgeryReports(value: unknown): SurgeryReport[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const report = item as Partial<SurgeryReport>
    if (!report.id || !report.name || !report.dataUrl) return []
    return [{ id: String(report.id), name: String(report.name), date: String(report.date ?? ''), dataUrl: String(report.dataUrl), mimeType: String(report.mimeType ?? ''), parsingStatus: '待人工整理' as const }]
  })
}
