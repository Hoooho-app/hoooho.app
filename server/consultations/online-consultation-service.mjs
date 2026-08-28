import { randomUUID } from 'node:crypto'
import { HealthEventRepository } from '../events/repositories/health-event-repository.mjs'
import { HealthEventRecordService } from '../events/health-event-record-service.mjs'
import { OnlineConsultationRepository } from './repositories/online-consultation-repository.mjs'

const statuses = new Set(['preparing', 'waiting', 'doctor_questions', 'completed'])

export class OnlineConsultationError extends Error {
  constructor(message, status = 400, code = 'ONLINE_CONSULTATION_ERROR') {
    super(message)
    this.status = status
    this.code = code
  }
}

function text(value, field, maxLength = 5000) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) throw new OnlineConsultationError(`${field}不能为空`, 400, 'EMPTY_CONTENT')
  if (normalized.length > maxLength) throw new OnlineConsultationError(`${field}内容过长`, 400, 'CONTENT_TOO_LONG')
  return normalized
}

function stringList(value, limit = 20) {
  if (!Array.isArray(value)) return []
  return value.slice(0, limit).map((item) => String(item).trim()).filter(Boolean).map((item) => item.slice(0, 500))
}

export class OnlineConsultationService {
  constructor(options = {}) {
    this.events = options.events ?? new HealthEventRepository(options.dataDirectory)
    this.records = options.records ?? new HealthEventRecordService(options)
    this.repository = options.repository ?? new OnlineConsultationRepository(options.dataDirectory)
  }

  async assertEventOwnership(accountId, eventId) {
    const event = await this.events.findById(eventId)
    if (!event || event.accountId !== accountId) throw new OnlineConsultationError('健康事件不存在', 404, 'HEALTH_EVENT_NOT_FOUND')
    return event
  }

  async get(accountId, eventId, now = new Date()) {
    await this.assertEventOwnership(accountId, eventId)
    const existing = await this.repository.findByEventId(eventId)
    if (existing) return existing
    return this.repository.getOrCreate({ accountId, eventId }, now)
  }

  async updateStatus(accountId, eventId, input, now = new Date()) {
    const consultation = await this.get(accountId, eventId, now)
    const status = typeof input?.status === 'string' ? input.status : ''
    if (!statuses.has(status)) throw new OnlineConsultationError('问诊状态无效', 400, 'INVALID_STATUS')
    return this.repository.update(consultation.id, { status }, now)
  }

  async addQuestion(accountId, eventId, input, now = new Date()) {
    const consultation = await this.get(accountId, eventId, now)
    const entry = {
      id: randomUUID(),
      question: text(input?.question, '医生问题'),
      reply: text(input?.reply, '准备回复'),
      missing: stringList(input?.missing),
      sources: stringList(input?.sources),
      supplements: stringList(input?.supplements),
      createdAt: now.toISOString()
    }
    return this.repository.update(consultation.id, {
      status: 'doctor_questions',
      questions: [...consultation.questions, entry].slice(-50)
    }, now)
  }

  async touchWaiting(accountId, eventId, now = new Date()) {
    const consultation = await this.get(accountId, eventId, now)
    return this.repository.update(consultation.id, { status: 'waiting' }, now)
  }

  async complete(accountId, eventId, input, now = new Date()) {
    let consultation = await this.get(accountId, eventId, now)
    const finalDoctorInstructions = text(input?.finalDoctorInstructions, '医生交代')
    let finalRecordId = consultation.finalDoctorInstructions === finalDoctorInstructions ? consultation.finalRecordId : null
    if (!finalRecordId) {
      const record = await this.records.create(accountId, eventId, {
        type: 'note',
        content: `在线医生回复：${finalDoctorInstructions}`,
        occurredAt: now.toISOString()
      }, now)
      finalRecordId = record.id
      consultation = await this.repository.update(consultation.id, { finalDoctorInstructions, finalRecordId }, now)
    }
    return this.repository.update(consultation.id, { status: 'completed', finalDoctorInstructions, finalRecordId }, now)
  }
}
