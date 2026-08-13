import { HealthEventRepository } from './repositories/health-event-repository.mjs'
import { EventAttachmentRepository } from './repositories/event-attachment-repository.mjs'
import { HealthEventRecordRepository } from './repositories/health-event-record-repository.mjs'
import { ImageAnalysisService } from '../ai/image-analysis-service.mjs'

export class EventAttachmentError extends Error {
  constructor(message, status = 400, code = 'EVENT_ATTACHMENT_ERROR') {
    super(message)
    this.status = status
    this.code = code
  }
}

export class EventAttachmentService {
  constructor(options = {}) {
    this.events = options.events ?? new HealthEventRepository(options.dataDirectory)
    this.records = options.records ?? new HealthEventRecordRepository(options.dataDirectory)
    this.repository = options.repository ?? new EventAttachmentRepository(options.dataDirectory)
    this.imageAnalysis = options.imageAnalysis ?? new ImageAnalysisService(options)
  }

  async assertEventOwnership(accountId, eventId) {
    const event = await this.events.findById(eventId)
    if (!event || event.accountId !== accountId) throw new EventAttachmentError('健康事件不存在', 404, 'HEALTH_EVENT_NOT_FOUND')
  }

  async create(accountId, eventId, input, now = new Date()) {
    await this.assertEventOwnership(accountId, eventId)
    const name = typeof input?.name === 'string' ? input.name.trim().slice(0, 160) : ''
    const mimeType = typeof input?.mimeType === 'string' ? input.mimeType : ''
    const dataUrl = typeof input?.dataUrl === 'string' ? input.dataUrl : ''
    const recordId = typeof input?.recordId === 'string' ? input.recordId.trim() : ''
    if (!name) throw new EventAttachmentError('附件名称不能为空', 400, 'INVALID_ATTACHMENT_NAME')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) throw new EventAttachmentError('仅支持 JPG、PNG 或 WebP 图片', 400, 'INVALID_ATTACHMENT_TYPE')
    if (!dataUrl.startsWith(`data:${mimeType};base64,`)) throw new EventAttachmentError('附件内容格式错误', 400, 'INVALID_ATTACHMENT_DATA')
    if (dataUrl.length > 7_000_000) throw new EventAttachmentError('单张图片不能超过 5MB', 413, 'ATTACHMENT_TOO_LARGE')
    if (recordId) {
      const record = await this.records.findById(recordId)
      if (!record || record.accountId !== accountId || record.eventId !== eventId) {
        throw new EventAttachmentError('健康事件记录不存在', 404, 'HEALTH_EVENT_RECORD_NOT_FOUND')
      }
    }
    const attachment = await this.repository.create({ accountId, eventId, recordId: recordId || null, name, mimeType, dataUrl }, now)
    const analysis = await this.imageAnalysis.analyze(attachment, now)
    return this.repository.updateAnalysis(attachment.id, analysis)
  }

  async list(accountId, eventId) {
    await this.assertEventOwnership(accountId, eventId)
    return this.repository.findByEventId(eventId)
  }
}
