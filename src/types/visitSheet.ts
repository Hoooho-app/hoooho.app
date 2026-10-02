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
  code?: string
  locations?: string[]
  symptomCategory?: string | null
  relatedSourceIds?: string[]
  narrative?: string
  impactLevel?: string | null
  timePrecision?: string
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
  contentPath?: string
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
  secondary?: boolean
  related?: boolean
  chartMode?: 'scatter'
  distributionNote?: string
  entries?: Array<{ title: string; lines: string[]; sourceIds: string[] }>
}
export interface VisitPhoto {
  sourceId: string
  relatedSourceIds: string[]
  title: string
  location: string
  capturedAt: string | null
  uploadedAt: string | null
  timeKind: string
  mimeType: string
  capturePrecision?: 'unknown' | 'day' | 'exact'
  annotated?: boolean
}
export interface VisitPhotoDetail { label?: string; location?: string; capturedAt?: string | null; capturePrecision?: 'unknown' | 'day' | 'exact' }
export interface VisitMedicationSnapshot {
  id: string
  status: string
  plan: { medicationName: string; amount?: number; unit?: string; route?: string; mode: string; times: string[]; intervalHours?: number; startDate: string; endDate?: string | null; timezone: string }
  totalDays: number | null
  occurrences: Array<{id: string; scheduledAt: string; day: string; dayIndex: number; weekIndex: number; slotIndex: number; completed: boolean; sourceId?: string}>
  sourceIds: string[]
}
export interface VisitChapter {
  id: VisitChapterId
  title: string
  summary: string
  blocks: VisitBlock[]
  overview?: { lines: string[]; items: Array<{title: string; detail: string; sourceIds: string[]; at?: string; timeKind?: string}> }
}
export interface VisitSheet {
  aiSummary?: { overview: string; keyPoints: string[]; keyPointEvidence?:Array<{text:string;quote:string;sourceId:string|null;sectionId:string}>; missingInformation: string[]; provider: 'openai' | 'bailian'; model: string; generatedAt: string }
  aiSummaryStale?: boolean
  aiSourceFingerprint?: string
  aiSourceIds?: string[]
  id: string
  memberId: string
  version: number
  generatedAt: string
  editedAt?: string
  schemaVersion?: number
  scope?: string
  photoKey?: string
  photos?: VisitPhoto[]
  photoCandidates?: string[]
  selectedPhotoIds?: string[]
  photoSelections?: Record<string, string[]>
  photoDetails?: Record<string, VisitPhotoDetail>
  medicationReminders?: VisitMedicationSnapshot[]
  gaps?: string[]
  questionEdited?: boolean
  questionOrigin?: string
  questionSourceIds?: string[]
  sourceGroups?: Array<{category: string; sourceIds: string[]}>
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
    sourceIds?: string[]
    before: string
    after: string
    at: string
  }>
}
export interface VisitSheetState {
  aiCandidate?: {id:string;summary:NonNullable<VisitSheet['aiSummary']>}
  report: VisitSheet | null
  stale: boolean
  warnings: string[]
  hasLegacy: boolean
}
