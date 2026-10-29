export type HelpLesson = 'symptom' | 'sleep' | 'medication' | 'diet' | 'elimination'
export const HELP_LESSON_LABELS: Record<HelpLesson, string> = { symptom: '手动记事', sleep: '睡眠', medication: '用药', diet: '喂养与饮食', elimination: '排便' }
export interface HelpLessonReceipt { eventId: string; recordId: string; savedAt: string }
const receipts = new Map<string, HelpLessonReceipt | null>()
const sleepDrafts = new Map<string, import('../../pages/HealthEvents/SleepRecordFlow').SleepDraft | null>()
const key = (account: string, member: string, lesson: HelpLesson) => `hoooho-help-record:${encodeURIComponent(account)}:${encodeURIComponent(member)}:${lesson}`
export function helpLessonFromSearch(search: string): HelpLesson | null {
  const value = new URLSearchParams(search).get('helpTutorial')
  return value === 'symptom' || value === 'sleep' || value === 'medication' || value === 'diet' || value === 'elimination' ? value : null
}
export const helpLessonUrl = (lesson: HelpLesson) => `/health-events?helpTutorial=${lesson}`
export const helpLessonArticleUrl = (lesson: HelpLesson) => '/help?article=' + (lesson === 'diet' || lesson === 'elimination' ? 'daily' : lesson)
export function helpLessonFromReturnPath(value: unknown): HelpLesson | null {
  if (typeof value !== 'string' || !value.startsWith('/health-events?')) return null
  return helpLessonFromSearch(value.slice(value.indexOf('?')).split('#')[0])
}
export function readHelpLessonReceipt(account: string, member: string, lesson: HelpLesson): HelpLessonReceipt | null {
  if (!account || !member) return null
  const scope = key(account, member, lesson)
  if (receipts.has(scope)) return receipts.get(scope) ?? null
  try {
    const value = JSON.parse(sessionStorage.getItem(key(account, member, lesson)) ?? 'null')
    return value && typeof value.eventId === 'string' && value.eventId && typeof value.recordId === 'string' && value.recordId && typeof value.savedAt === 'string' ? value : null
  } catch { return null }
}
export function saveHelpLessonReceipt(account: string, member: string, lesson: HelpLesson, receipt: HelpLessonReceipt) {
  if (!account || !member) return
  receipts.set(key(account, member, lesson), receipt)
  const guide = readHelpGuideState(account, member, lesson)
  writeHelpGuideState(account, member, lesson, { ...guide, step: 0, phase: 'saved' })
  if (lesson === 'sleep') sleepDrafts.set(key(account, member, lesson), null)
  try { sessionStorage.setItem(key(account, member, lesson), JSON.stringify(receipt)); sessionStorage.removeItem(key(account, member, lesson) + ':draft') } catch { /* Saving a record must not depend on tutorial storage. */ }
}
export function clearHelpLessonReceipt(account: string, member: string, lesson: HelpLesson) {
  receipts.set(key(account, member, lesson), null)
  try { sessionStorage.removeItem(key(account, member, lesson)) } catch { /* Optional progress only. */ }
}
export function helpLessonRecordUrl(member: string, receipt: HelpLessonReceipt) {
  return '/health-events?' + new URLSearchParams({ memberId: member, eventId: receipt.eventId, recordId: receipt.recordId })
}
export function readHelpSleepDraft(account: string, member: string): import('../../pages/HealthEvents/SleepRecordFlow').SleepDraft | null {
  if (!account || !member) return null
  const scope = key(account, member, 'sleep')
  if (sleepDrafts.has(scope)) return sleepDrafts.get(scope) ?? null
  try {
    const value = JSON.parse(sessionStorage.getItem(key(account, member, 'sleep') + ':draft') ?? 'null')
    return value && Number.isFinite(Date.parse(value.sleepAt)) && Number.isFinite(Date.parse(value.wakeAt)) && Array.isArray(value.observations) ? value : null
  } catch { return null }
}
export function saveHelpSleepDraft(account: string, member: string, draft: import('../../pages/HealthEvents/SleepRecordFlow').SleepDraft) {
  if (!account || !member) return
  sleepDrafts.set(key(account, member, 'sleep'), draft)
  try { sessionStorage.setItem(key(account, member, 'sleep') + ':draft', JSON.stringify(draft)) } catch { /* Current form remains usable. */ }
}

export interface HelpGuideState { step: number; paused: boolean; phase: 'editing' | 'saved' | 'viewed' }
const guideMemory = new Map<string, HelpGuideState>()
export function readHelpGuideState(account: string, member: string, lesson: HelpLesson): HelpGuideState {
  const scope = key(account, member, lesson) + ':guide'
  if (guideMemory.has(scope)) return guideMemory.get(scope)!
  try {
    const value = JSON.parse(sessionStorage.getItem(scope) ?? 'null')
    if (value && Number.isInteger(value.step) && value.step >= 0 && value.step < 10 && typeof value.paused === 'boolean' && ['editing','saved','viewed'].includes(value.phase)) return value
  } catch { /* Optional current-session guidance. */ }
  return { step: 0, paused: false, phase: 'editing' }
}
export function writeHelpGuideState(account: string, member: string, lesson: HelpLesson, state: HelpGuideState) {
  const scope = key(account, member, lesson) + ':guide'
  guideMemory.set(scope, state)
  try { sessionStorage.setItem(scope, JSON.stringify(state)) } catch { /* Keep the current guide usable. */ }
}
export function beginHelpGuide(account: string, member: string, lesson: HelpLesson, restart = false) {
  const prior = readHelpGuideState(account, member, lesson)
  writeHelpGuideState(account, member, lesson, restart || prior.phase !== 'editing' ? { step: 0, paused: false, phase: 'editing' } : { ...prior, paused: false })
}
