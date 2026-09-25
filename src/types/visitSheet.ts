export type VisitChapterId =
  | 'overview'
  | 'course'
  | 'temperature'
  | 'allergy'
  | 'medication'
  | 'growth'
  | 'history'
  | 'visits'
  | 'sources'
export interface VisitFocus {
  mode: 'auto' | 'source' | 'custom'
  sourceId?: string
  text?: string
}
export interface VisitSource {
  id: string
  category: string
  title: string
  text: string
  occurredAt: string | null
  createdAt: string | null
  updatedAt: string | null
  identity: string
  eventId?: string
  recordId?: string
  attachmentId?: string
  mimeType?: string
  profileSection?: string
  taskId?: string
  destinations: VisitChapterId[]
}
export interface VisitPoint {
  value: number
  at: string
  sourceId: string
  detail?: string
}
export interface VisitBlock {
  title: string
  lines: string[]
  sourceIds: string[]
  locations?: string[]
  distribution?: Array<{ label: string; count: number }>
  unit?: string
  points?: VisitPoint[]
}
export interface VisitChapter {
  id: VisitChapterId
  title: string
  summary: string
  blocks: VisitBlock[]
}
export interface VisitSheet {
  id: string
  memberId: string
  version: number
  generatedAt: string
  dataAsOf: string
  timezone: string
  fingerprint: string
  member: { name: string; gender: string | null; birthday: string | null }
  focus: VisitFocus
  complaint: string
  complaintSourceId: string | null
  focusSourceIds: string[]
  range: { from: string | null; to: string | null }
  question: string
  notes: Partial<Record<VisitChapterId, string>>
  chapters: VisitChapter[]
  sources: VisitSource[]
  warnings: string[]
  candidates: Array<{
    sourceId: string
    text: string
    at: string | null
    timeKind: string
  }>
  changes: Array<{
    sourceId: string
    before: string
    after: string
    at: string
  }>
}
export interface VisitSheetState {
  report: VisitSheet | null
  stale: boolean
  warnings: string[]
  hasLegacy: boolean
}
