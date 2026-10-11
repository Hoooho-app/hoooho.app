import type { JournalCategory, JournalMetadata } from '../../types/journal'
import type { JournalEntry } from '../HealthEvents/timeViewModel'
import { compactDuration } from '../../../shared/journal-occurrence.mjs'

export const calendarCategories = ['feeding', 'daily', 'medication', 'symptom', 'materials'] as const
export type PresentationGroup = typeof calendarCategories[number]
export const calendarGroupLabels: Record<PresentationGroup, string> = { feeding: '喂养', daily: '日常', medication: '用药', symptom: '症状', materials: '就诊资料' }
export const calendarCategoryLabels: Record<JournalCategory, string> = {
  symptom: '症状', medication: '用药', sleep: '睡眠', diet: '喂养', elimination: '排便', care: '涂抹',
  vaccination: '疫苗', visit: '就医', examination: '检查', growth: '成长', injury: '受伤', activity: '活动',
  emotion: '情绪', other: '未分类', measurement: '测量', environment: '环境', social: '社交',
}
type Presentable = JournalMetadata & Partial<Pick<JournalEntry, 'content' | 'sourceType' | 'caseContext' | 'sourceText' | 'aiProvenance'>>
const dailyCategories: readonly JournalCategory[] = ['sleep', 'elimination', 'care', 'growth', 'activity', 'emotion', 'environment', 'social']
// Presentation only: persisted category/kind/source and originals are never rewritten.
export function presentationGroup(record: Presentable): PresentationGroup | null {
  const categories = record.categories ?? []
  if (record.sourceType === 'medical_file' || ['medical_consultation', 'examination_report', 'external_ai'].includes(record.caseContext?.identity ?? '')) return 'materials'
  if (record.vaccination || record.visit || categories.some(c => ['vaccination', 'visit', 'examination'].includes(c))) return 'materials'
  if (record.medication || categories.includes('medication')) return 'medication'
  if (record.symptom || categories.some(c => ['symptom', 'injury'].includes(c))) return 'symptom'
  if (record.diet || categories.includes('diet')) return 'feeding'
  if (record.sleep || record.bowel || record.topical || categories.some(c => dailyCategories.includes(c))) return 'daily'
  if (categories.includes('measurement') && /(?:身高|身长|体重)\s*[:：]?\s*\d+(?:\.\d+)?\s*(?:cm|厘米|kg|公斤|千克)/i.test(record.content ?? '')) return 'daily'
  return null
}
export function matchesCalendarGroup(record: Presentable, selected: string) { return !selected || presentationGroup(record) === selected }
export function normalizeCalendarCategory(category: string) {
  if (calendarCategories.includes(category as PresentationGroup)) return category
  const legacy: Partial<Record<JournalCategory, PresentationGroup>> = { diet: 'feeding', sleep: 'daily', elimination: 'daily', care: 'daily', growth: 'daily', activity: 'daily', emotion: 'daily', environment: 'daily', social: 'daily', injury: 'symptom', vaccination: 'materials', visit: 'materials', examination: 'materials' }
  return legacy[category as JournalCategory] ?? ''
}
export function calendarRecordTone(record: Presentable) { return presentationGroup(record) ?? 'neutral' }
export function presentationSubtype(record: Presentable) {
  if (record.caseContext?.identity === 'external_ai') return 'AI问诊资料'
  if (record.sourceType === 'medical_file') return '上传资料'
  if (record.diet) return ({ feeding: '奶类', complementary: '辅食', meal: '正餐', snack: '零食', supplement: '补剂' })[record.diet.kind]
  if (record.categories?.includes('measurement') && presentationGroup(record) === 'daily') return '成长'
  return calendarCategoryLabels[record.categories?.[0] ?? 'other']
}
function positive(value: number | undefined) { return typeof value === 'number' && Number.isFinite(value) && value > 0 }
function minutesBetween(start?: string, end?: string) { return start && end ? (Date.parse(end) - Date.parse(start)) / 60_000 : NaN }
// Keep an entire bounded saved core, never an arbitrary prose prefix or isolated symptom keyword.
function savedShortCore(value?: string) { const text = value?.trim() ?? ''; return text && text.length <= 20 && !/[\n。；;，,]/.test(text) ? text : '' }
function qualifier(value?: string) { return value?.trim().match(/^(未服药|未用药|待确认|疑似|无|未见|否认)/)?.[1] ?? '' }
function structuredValues(value: unknown, path = ''): string[] {
  if (value === undefined || value === null || value === '') return []
  if (Array.isArray(value)) return value.flatMap((item, index) => structuredValues(item, `${path}${index + 1}`))
  if (typeof value === 'object') return Object.entries(value).flatMap(([key, item]) => structuredValues(item, path ? `${path} / ${key}` : key))
  return [`${path}：${String(value)}`]
}
export function presentCalendarRecord(record: Presentable) {
  const group = presentationGroup(record), subtype = presentationSubtype(record)
  let coreSummary = `${group ? calendarGroupLabels[group] : '未分类'}记录`, monthSummary = coreSummary
  if (record.sleep) {
    const sleep = record.sleep, minutes = minutesBetween(sleep.sleepAt, sleep.wakeAt)
    coreSummary = sleep.status === 'ongoing' ? '睡眠 · 持续中' : ['睡眠', '已醒', compactDuration(minutes)].filter(Boolean).join(' · ')
    monthSummary = sleep.status === 'ongoing' ? '睡眠持续中' : positive(minutes) ? `睡${compactDuration(minutes).replace(/^约/, '')}` : '睡眠已醒'
  } else if (record.diet) {
    const diet = record.diet, title = diet.name?.trim() || diet.meal || (diet.kind === 'feeding' ? '喂养' : subtype)
    const minutes = diet.startedAt ? minutesBetween(diet.startedAt, diet.endedAt) : (diet.breastSeconds?.total ?? 0) / 60
    if (diet.status === 'ongoing') { coreSummary = `${title} · 持续中`; monthSummary = `${title}持续中` }
    else if (positive(minutes)) { coreSummary = `${title} · ${minutes < 60 ? '共' : ''}${compactDuration(minutes)}`; monthSummary = `${title}${compactDuration(minutes)}` }
    else if (positive(diet.bottleMl)) { coreSummary = `${title} · ${diet.bottleMl}mL`; monthSummary = `奶${diet.bottleMl}ml` }
    else if (diet.kind === 'supplement') { coreSummary = [diet.supplementNames?.join('、') || '补剂', diet.supplementAmount && `${diet.supplementAmount}${diet.supplementUnit ?? ''}`].filter(Boolean).join(' · '); monthSummary = coreSummary }
    else if (diet.foods?.length) { coreSummary = `${diet.foods.join('、')}${diet.amount ?? ''}`; monthSummary = `${diet.foods[0]}${diet.amount ?? ''}` }
    else { coreSummary = title; monthSummary = title }
  } else if (record.medication) {
    const drug = record.medication, names = drug.medications?.map(item => item.medicationName) ?? [drug.medicationName]
    const savedName = savedShortCore(drug.genericName) || savedShortCore(names.length === 1 ? names[0] : '')
    const reliable = savedName.length <= 6 ? savedName : ''
    const state = qualifier(drug.note) || qualifier(record.content)
    coreSummary = state ? savedShortCore(drug.note) || savedShortCore(record.content) || `${state}用药记录` : reliable || '用药记录'; monthSummary = state ? coreSummary : reliable && reliable.length <= 6 ? reliable : '用药记录'
  } else if (record.symptom) {
    const safe = savedShortCore(record.symptom.narrative) || savedShortCore(record.symptom.shortNote)
    coreSummary = safe || `${qualifier(record.symptom.narrative)}症状记录`; monthSummary = coreSummary
  } else if (record.vaccination) {
    coreSummary = record.vaccination.items.map(item => item.vaccineName).filter(Boolean).join('、') || '疫苗记录'
    monthSummary = record.vaccination.items.length === 1 ? record.vaccination.items[0].commonAbbreviation || coreSummary : '疫苗资料'
  } else if (record.visit) {
    coreSummary = record.visit.examinationTypes?.join('、') || record.visit.reasonText?.trim() || '就医资料'
    monthSummary = savedShortCore(record.visit.examinationTypes?.[0]) || '就医资料'
  } else if (!group) { coreSummary = '未分类'; monthSummary = '未分类' }
  else { coreSummary = savedShortCore(record.content) || `${subtype}记录`; monthSummary = coreSummary }
  const fullDetail = [...new Set([record.content, record.sourceText, record.caseContext?.originalText].filter(Boolean)), ...structuredValues({ 喂养: record.diet, 睡眠: record.sleep, 症状: record.symptom, 用药: record.medication, 疫苗: record.vaccination, 就医: record.visit, 排便: record.bowel, 涂抹: record.topical, 户外活动: record.outdoorActivity, 来源: record.caseContext?.identity ?? record.sourceType, 原文出处: record.aiProvenance?.sources, 原文版本: record.aiProvenance?.originalVersions })].filter(Boolean).join('\n')
  return { group, subtype, coreSummary, monthSummary, fullDetail }
}
