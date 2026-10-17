import type { RecognitionJob } from '../ai-business/recognitionJobs'
import type { LocalVisitDocument, VisitMaterialBlock, VisitMaterialSource } from './types'

interface ReviewSource { sourceId?: string; page?: number; quote: string }
interface Review {
  items: { id: string; category: string; title: string; timeText?: string; time?: { resolvedStart?: string | null; precision?: string; defaulted?: boolean }; fields: { name: string; value: string; sources: ReviewSource[] }[] }[]
  sources?: { id: string; page: number; text: string; status: string }[]
  documentWarnings?: string[]
}
const titles: Record<string, string> = { visit: '病历与医生交代', examination: '检查资料', medication: '处方记载', symptom: '资料中的情况描述', other: '资料要点' }
export function visitDocumentKey(file: Pick<File, 'name' | 'type' | 'size' | 'lastModified'>) {
  return JSON.stringify([file.name, file.type, file.size, file.lastModified])
}
export async function visitContentHash(dataUrl: string) {
  const bytes = new TextEncoder().encode(JSON.stringify(dataUrl))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('')
}
export function materialReview(document: LocalVisitDocument, job: RecognitionJob, source: VisitMaterialSource) {
  const review = job.review as unknown as Review | null
  const pages = review?.sources?.filter(page => page.id !== 'input') ?? []
  const recognizedText = pages.map(page => '第' + page.page + '页\n' + page.text).join('\n\n')
  const blocks: VisitMaterialBlock[] = (review?.items ?? []).flatMap(item => {
    const fields = item.fields.filter(field => field.value?.trim() && field.sources?.some(reference => reference.quote?.trim()))
    if (!fields.length) return []
    const references = fields.flatMap(field => field.sources).filter(reference => reference.quote?.trim())
    const quote = [...new Set(references.map(reference => reference.quote.trim()))].join('\n')
    // An extracted candidate is only a reading aid. It is never passed to the
    // business-draft save path that may create medication or profile records.
    return [{
      id: document.id + ':' + item.id,
      title: source === 'external_ai' ? 'AI 对话资料' : titles[item.category] ?? '资料要点',
      text: [...new Set(fields.map(field => field.value.trim()))].join('\n'),
      documentId: document.id, page: references[0]?.page ?? 1, quote
    }]
  })
  if (!blocks.length && (recognizedText || document.originalText)) {
    const raw = recognizedText || document.originalText || ''
    blocks.push({ id: document.id + ':original', title: source === 'external_ai' ? 'AI 对话原文' : '识别原文', text: raw, documentId: document.id, page: 1, quote: raw })
  }
  const institution = source === 'external_ai' ? '' : review?.items.flatMap(item => item.fields).find(field => field.name === 'institution' && field.sources?.some(reference => reference.quote?.includes(field.value)))?.value ?? ''
  const timed = source === 'external_ai' ? undefined : review?.items.find(item => item.category === 'visit' && item.time?.precision === 'exact' && !item.time.defaulted && item.time.resolvedStart && Date.parse(item.time.resolvedStart) <= Date.now() && /\d{4}|\d{1,2}月/.test(item.timeText ?? '') && /\d{1,2}[:：点]/.test(item.timeText ?? ''))
  return { blocks, recognizedText, institution, occurredAt: timed?.time?.resolvedStart, warnings: review?.documentWarnings ?? [] }
}
export function mergeMaterialBlocks(previous: VisitMaterialBlock[], documentId: string, next: VisitMaterialBlock[]) {
  const own = previous.filter(block => block.documentId === documentId)
  const matched = next.map(block => {
    const edited = own.find(old => old.id === block.id && old.edited || old.quote === block.quote && old.edited)
    return edited ? { ...block, text: edited.text, edited: true } : block
  })
  return [...previous.filter(block => block.documentId !== documentId), ...matched]
}
export function materialRecordText(title: string, blocks: VisitMaterialBlock[], supplement: string, originalsOnly: boolean) {
  if (originalsOnly) return title + '\n原件已保存，尚未确认整理结果。' + (supplement ? '\n' + supplement : '')
  const content = [title, ...blocks.map(block => block.title + '：' + block.text), supplement].filter(Boolean).join('\n')
  // Full edited paragraphs remain in journal.visit.materials even when the
  // ordinary calendar record's bounded text cannot carry the entire document.
  return content.length <= 5000 ? content : title + '\n已保存核对内容与原件，请打开就诊资料查看全文。'
}
