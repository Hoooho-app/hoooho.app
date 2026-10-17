import { HealthEventRecordError } from './health-event-record-error.mjs'
const invalid = message => { throw new HealthEventRecordError(message, 400, 'INVALID_VISIT_MATERIALS') }
const text = (value, limit, empty = false) => {
  if (typeof value !== 'string' || value.length > limit || !empty && !value.trim()) invalid('就诊资料内容格式或长度无效')
  return value.trim()
}
export function validateVisitMaterials(value) {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(value).length > 300000) invalid('就诊资料格式无效或内容过长')
  if (!['hospital', 'online_doctor', 'external_ai'].includes(value.source) || !['originals_only', 'reviewed'].includes(value.status)) invalid('就诊资料来源或核对状态无效')
  if (!Array.isArray(value.documents) || !value.documents.length || value.documents.length > 24 || !Array.isArray(value.blocks) || value.blocks.length > 100) invalid('就诊资料数量无效')
  const ids = new Set()
  const documents = value.documents.map(document => {
    if (!document || !['file', 'text', 'link'].includes(document.kind) || !['preparing', 'uploading', 'queued', 'recognizing', 'organizing', 'ready', 'failed'].includes(document.status)) invalid('资料原件格式无效')
    const id = text(document.id, 100)
    if (ids.has(id)) invalid('资料标识不能重复')
    ids.add(id)
    const result = { id, name: text(document.name, 120), kind: document.kind, status: document.status }
    for (const [key, limit] of [['originalText', 15000], ['recognizedText', 60000], ['error', 500], ['jobId', 180]]) if (document[key] !== undefined) result[key] = text(document[key], limit, true)
    if (document.kind === 'file') {
      if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(document.mimeType) || !/^[a-f0-9]{64}$/.test(document.contentHash ?? '')) invalid('资料原件校验信息无效')
      result.mimeType = document.mimeType; result.contentHash = document.contentHash
    } else if (!result.originalText) invalid('请保留粘贴的原文')
    // Attachment IDs are resolved from the submitted owned bytes at capture,
    // never trusted from a client-provided foreign record.
    return result
  })
  const blocks = value.status === 'originals_only' ? [] : value.blocks.map(block => {
    if (!block || !ids.has(block.documentId) || !Number.isInteger(block.page) || block.page < 1 || block.page > 12 || block.edited !== undefined && typeof block.edited !== 'boolean') invalid('整理内容的原件出处无效')
    return { id: text(block.id, 200), title: text(block.title, 120), text: text(block.text, 60000, true), documentId: block.documentId, page: block.page, quote: text(block.quote, 60000, true), ...(block.edited ? { edited: true } : {}) }
  })
  const result = { source: value.source, status: value.status, title: text(value.title, 120), documents, blocks }
  for (const [key, limit] of [['institution', 120], ['supplement', 1000]]) if (value[key] !== undefined) result[key] = text(value[key], limit, true)
  if (value.occurredAt) {
    const time = Date.parse(value.occurredAt)
    if (!Number.isFinite(time) || time > Date.now()) invalid('就诊时间不能晚于现在')
    result.occurredAt = new Date(time).toISOString()
  }
  return result
}
