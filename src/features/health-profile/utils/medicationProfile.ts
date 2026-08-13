export interface MedicationProfileRecord {
  id: string
  sequence: number
  name: string
  reason: string
  dose: string
  frequency: string
  route: string
  startedAt: string
  endedAt: string
  imageName: string
  imageDataUrl: string
  _savedAt?: string
}

type StoredMedicationRecord = Partial<MedicationProfileRecord> & Record<string, unknown>

export function emptyMedicationRecord(sequence: number): MedicationProfileRecord {
  return {
    id: `medication-${Date.now()}-${sequence}`,
    sequence,
    name: '',
    reason: '',
    dose: '',
    frequency: '',
    route: '',
    startedAt: '',
    endedAt: '',
    imageName: '',
    imageDataUrl: ''
  }
}

export function normalizeMedicationRecords(records: readonly StoredMedicationRecord[]): MedicationProfileRecord[] {
  return records.map((record, index) => ({
    id: typeof record.id === 'string' && record.id ? record.id : `legacy-medication-${index + 1}`,
    sequence: typeof record.sequence === 'number' && record.sequence > 0 ? record.sequence : index + 1,
    name: String(record.name ?? ''),
    reason: String(record.reason ?? ''),
    dose: String(record.dose ?? record.dosage ?? ''),
    frequency: String(record.frequency ?? ''),
    route: String(record.route ?? ''),
    startedAt: String(record.startedAt ?? ''),
    endedAt: String(record.endedAt ?? ''),
    imageName: String(record.imageName ?? ''),
    imageDataUrl: String(record.imageDataUrl ?? ''),
    _savedAt: typeof record._savedAt === 'string' ? record._savedAt : undefined
  })).sort((left, right) => left.sequence - right.sequence)
}

export function nextMedicationSequence(records: readonly MedicationProfileRecord[]) {
  return records.reduce((maximum, record) => Math.max(maximum, record.sequence), 0) + 1
}

export function medicationDetailSummary(record: MedicationProfileRecord) {
  return [record.dose, record.frequency, record.route].filter(Boolean).join(' · ')
}

function displayMonth(value: string) {
  return /^\d{4}-\d{2}/.test(value) ? value.slice(0, 7).replace('-', '/') : value
}

export function medicationDateSummary(record: MedicationProfileRecord) {
  if (!record.startedAt && !record.endedAt) return ''
  if (!record.startedAt) return `截至 ${displayMonth(record.endedAt)}`
  return `${displayMonth(record.startedAt)} — ${record.endedAt ? displayMonth(record.endedAt) : '至今'}`
}
