export interface HandoffRow { title: string; detail: string; source: string }
export interface HandoffDraft { routines: HandoffRow[]; cautions: HandoffRow[]; parentNote: string }
export interface HandoffData {
  fingerprint: string
  asOf: string
  member: { name: string; birthday?: string; gender?: string; heightCm?: number | null; weightKg?: number | null; bloodType?: string | null }
  sections: { id: string; title: string; empty: string; rows: HandoffRow[] }[]
  handoffDraft?: HandoffDraft
}
export function handoffDraft(data: HandoffData): HandoffDraft {
  if (data.handoffDraft) return data.handoffDraft
  const routines: HandoffRow[] = [], cautions: HandoffRow[] = []
  for (const section of data.sections) for (const row of section.rows) {
    if (section.id === 'routine' || row.source.startsWith('家长已设置的每天') || row.source === '家长已设置的用药安排') routines.push(row)
    else if (['restrictions', 'attention', 'observations', 'medication', 'chronic', 'surgery'].includes(section.id)) cautions.push(row)
  }
  return { routines, cautions, parentNote: '' }
}
