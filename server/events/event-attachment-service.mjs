import { HealthEventRepository } from './repositories/health-event-repository.mjs'
import { EventAttachmentRepository } from './repositories/event-attachment-repository.mjs'
import { HealthEventRecordRepository } from './repositories/health-event-record-repository.mjs'
import { ImageAnalysisService } from '../ai/image-analysis-service.mjs'
import { validateHealthImage } from './image-attachment-policy.mjs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const publicAttachment = ({ storageKey: _storageKey, ...attachment }) => attachment

export class EventAttachmentError extends Error {
  constructor(message, status = 400, code = 'EVENT_ATTACHMENT_ERROR') {
    super(message)
    this.status = status
    this.code = code
  }
}

export class EventAttachmentService {
  constructor(options = {}) {
    this.dataDirectory = options.dataDirectory
    this.events = options.events ?? new HealthEventRepository(options.dataDirectory)
    this.records = options.records ?? new HealthEventRecordRepository(options.dataDirectory)
    this.repository = options.repository ?? new EventAttachmentRepository(options.dataDirectory)
    this.imageAnalysis = options.imageAnalysis ?? new ImageAnalysisService(options)
    this.drafts = new Map()
    this.draftTtlMs = options.draftTtlMs ?? 10 * 60_000
  }

  draftKey(accountId, eventId, contentHash) { return `${accountId}:${eventId}:${contentHash}` }

  async assertEventOwnership(accountId, eventId) {
    const event = await this.events.findById(eventId)
    if (!event || event.accountId !== accountId) throw new EventAttachmentError('未找到这条健康随记', 404, 'HEALTH_EVENT_NOT_FOUND')
  }

  async preview(accountId, eventId, input, now = new Date()) {
    await this.assertEventOwnership(accountId, eventId)
    let prepared
    try { prepared = await validateHealthImage(input) } catch (error) { throw new EventAttachmentError(error.message, error.status, error.code) }
    const analysis = await this.imageAnalysis.analyze({ id: `draft:${prepared.contentHash}`, ...prepared, createdAt: now.toISOString() }, now)
    const draft = { status: analysis.status, analysis, contentHash: prepared.contentHash, width: prepared.width, height: prepared.height,
      canConfirm: analysis.status === 'completed' || analysis.status === 'needs_confirmation' }
    if (draft.canConfirm) this.drafts.set(this.draftKey(accountId, eventId, prepared.contentHash), { ...draft, expiresAt: now.getTime() + this.draftTtlMs })
    return draft
  }

  async create(accountId, eventId, input, now = new Date()) {
    await this.assertEventOwnership(accountId, eventId)
    let prepared
    try { prepared = await validateHealthImage(input) } catch (error) { throw new EventAttachmentError(error.message, error.status, error.code) }
    const key = this.draftKey(accountId, eventId, prepared.contentHash)
    const cached = this.drafts.get(key)
    if (cached && cached.expiresAt <= now.getTime()) this.drafts.delete(key)
    const preview = cached && cached.expiresAt > now.getTime() ? cached : await this.preview(accountId, eventId, input, now)
    if (!preview.canConfirm) {
      const messages = {
        unavailable: '图片识别服务尚未配置，本次未创建记录', failed: '图片识别暂时不可用，本次未创建记录',
        irrelevant: '未检测到健康相关内容，本次未创建记录', unsafe: '图片包含不安全指令，本次未创建记录'
      }
      throw new EventAttachmentError(messages[preview.status] ?? '图片暂时无法形成健康记录', 422, `IMAGE_${String(preview.status).toUpperCase()}`)
    }
    if (preview.status === 'needs_confirmation' && input?.confirmed !== true) {
      throw new EventAttachmentError('图片识别结果需要确认后才能保存', 409, 'IMAGE_CONFIRMATION_REQUIRED')
    }
    const recordId = typeof input?.recordId === 'string' ? input.recordId.trim() : ''
    if (recordId) {
      const record = await this.records.findById(recordId)
      if (!record || record.accountId !== accountId || record.eventId !== eventId) {
        throw new EventAttachmentError('未找到这条随记内容', 404, 'HEALTH_EVENT_RECORD_NOT_FOUND')
      }
    }
    const result = await this.repository.createUnique({ accountId, eventId, recordId: recordId || null, ...prepared, analysis: preview.analysis }, now)
    this.drafts.delete(key)
    return { ...publicAttachment(result.attachment), duplicate: result.duplicate }
  }

  async list(accountId, eventId) {
    await this.assertEventOwnership(accountId, eventId)
    return (await this.repository.findByEventId(eventId)).map(publicAttachment)
  }

  async read(accountId, eventId, attachmentId) {
    await this.assertEventOwnership(accountId, eventId)
    const attachment = await this.repository.findById(attachmentId)
    if (!attachment || attachment.accountId !== accountId || attachment.eventId !== eventId || !attachment.storageKey) {
      throw new EventAttachmentError('未找到这张照片', 404, 'EVENT_ATTACHMENT_NOT_FOUND')
    }
    return { mimeType: attachment.mimeType, buffer: await readFile(path.join(this.dataDirectory, 'quick-record-photo-files', path.basename(attachment.storageKey))) }
  }
}
