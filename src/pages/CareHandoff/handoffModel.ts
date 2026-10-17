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

export interface HandoffScheduleRow { key: string; time: string; description: string; minute: number }
const clockPattern = '(?:[01]?\\d|2[0-3]):[0-5]\\d'
const clockLabel = (clock: string) => clock.padStart(5, '0')
const minute = (clock: string) => Number(clock.split(':')[0]) * 60 + Number(clock.split(':')[1])
/** Only standalone schedule fields are split. Clocks inside instructions remain verbatim. */
export function handoffSchedule(rows: HandoffRow[]): HandoffScheduleRow[] {
  const listPattern = new RegExp(`^${clockPattern}(?:[、，,]\\s*${clockPattern})*$`)
  const rangePattern = new RegExp(`^(${clockPattern})\\s*[—–~～-]\\s*(次日)?(${clockPattern})$`)
  return rows.flatMap((row, index) => {
    const titlePrefix = new RegExp(`^(${clockPattern})\\s+(.+)$`).exec(row.title)
    const parts = row.detail.split(/\s*·\s*/)
    const raw = [row.title, row.detail].filter(Boolean).join(' · ')
    const interval = /每\s*(\d+)\s*小时/.exec(raw)
    if (interval) return [{ key: `${index}:interval`, time: `每${interval[1]}小时`, description: raw.replace(/\s*·\s*北京时间/g, ''), minute: Infinity }]
    const candidates = parts.map((value, i) => ({ value: value.trim(), i })).filter(p => listPattern.test(p.value) || rangePattern.test(p.value))
    // Multiple schedule fields, or a clock prefix plus another schedule, are ambiguous.
    if (candidates.length > 1 || titlePrefix && candidates.length) return [{ key: `${index}:complex`, time: '时间见说明', description: raw, minute: Infinity }]
    const selected = candidates[0], schedule = selected?.value ?? titlePrefix?.[1]
    const description = [titlePrefix ? titlePrefix[2] : row.title, ...parts.filter((value, i) => i !== selected?.i && value.trim() !== '北京时间')].filter(Boolean).join(' · ')
    if (!schedule) return [{ key: `${index}:unspecified`, time: new RegExp(clockPattern).test(raw) ? '时间见说明' : '时间未定', description: raw, minute: Infinity }]
    const range = rangePattern.exec(schedule)
    if (range) return [{ key: `${index}:range`, time: `${clockLabel(range[1])}—${range[2] || minute(range[3]) < minute(range[1]) ? '次日' : ''}${clockLabel(range[3])}`, description, minute: minute(range[1]) }]
    return [...new Set(schedule.split(/[、，,]\s*/))].map((time, i) => ({ key: `${index}:${i}`, time: clockLabel(time), description, minute: minute(time) }))
  }).sort((a, b) => a.minute - b.minute)
}
