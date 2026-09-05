import { HealthEventRepository } from './repositories/health-event-repository.mjs'
import { HealthEventRecordRepository } from './repositories/health-event-record-repository.mjs'
import { HealthRecordOrganizationService } from '../ai/health-record-organization-service.mjs'
import { HealthChangeAnnotationService } from './health-change-annotation-service.mjs'
import { HealthEventRecordError } from './health-event-record-error.mjs'
import { projectJournalRecord, validateJournal } from './journal-metadata.mjs'

export { HealthEventRecordError } from './health-event-record-error.mjs'

const recordTypes = new Set(['note', 'symptom', 'medication', 'visit', 'examination', 'other'])
const editableFields = new Set(['type', 'content', 'occurredAt', 'sourceType', 'sourceText', 'measurementMethod', 'measurementDevice', 'note'])
const immutableFields = new Set(['id', 'accountId', 'eventId', 'createdAt', 'updatedAt'])
const sourceTypes = new Set(['user_record', 'voice_record', 'text_record', 'measurement', 'medical_file', 'doctor_confirmation', 'other'])
const measurementMethods = new Set(['unspecified', 'oral', 'axillary', 'ear', 'forehead', 'other'])

function validateType(value) {
  if (!recordTypes.has(value)) {
    throw new HealthEventRecordError(
      '记录类型必须是 note、symptom、medication、visit、examination 或 other',
      400,
      'INVALID_RECORD_TYPE'
    )
  }
  return value
}

function validateContent(value) {
  const content = typeof value === 'string' ? value.trim() : ''
  if (!content) throw new HealthEventRecordError('记录内容不能为空', 400, 'EMPTY_RECORD_CONTENT')
  if (content.length > 5000) throw new HealthEventRecordError('记录内容不能超过 5000 个字符', 400, 'RECORD_CONTENT_TOO_LONG')
  return content
}

function validateSourceType(value) {
  if (!sourceTypes.has(value)) throw new HealthEventRecordError('记录来源类型无效', 400, 'INVALID_RECORD_SOURCE_TYPE')
  return value
}

function validateMeasurementMethod(value) {
  if (value === null || value === undefined || value === '') return null
  if (!measurementMethods.has(value)) throw new HealthEventRecordError('测量方式无效', 400, 'INVALID_MEASUREMENT_METHOD')
  return value === 'unspecified' ? null : value
}

function validateOptionalText(value, fieldName, maxLength = 5000) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') throw new HealthEventRecordError(`${fieldName}格式无效`, 400, 'INVALID_RECORD_METADATA')
  const text = value.trim()
  if (text.length > maxLength) throw new HealthEventRecordError(`${fieldName}内容过长`, 400, 'RECORD_METADATA_TOO_LONG')
  return text || null
}

export function validateOccurredAt(value, now = new Date()) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    throw new HealthEventRecordError('发生时间必须是 ISO 8601 日期时间', 400, 'INVALID_OCCURRED_AT')
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new HealthEventRecordError('发生时间格式错误', 400, 'INVALID_OCCURRED_AT')
  }
  if (parsed.getTime() > now.getTime()) {
    throw new HealthEventRecordError('发生时间不能晚于现在', 400, 'FUTURE_OCCURRED_AT')
  }
  return parsed.toISOString()
}

function rejectImmutableFields(input) {
  const field = Object.keys(input).find((key) => immutableFields.has(key))
  if (field) {
    throw new HealthEventRecordError(`${field} 由服务端管理，不能由客户端提交`, 400, 'IMMUTABLE_RECORD_FIELD')
  }
}

export class HealthEventRecordService {
  constructor(options = {}) {
    this.repository = options.repository ?? new HealthEventRecordRepository(options.dataDirectory)
    this.events = options.events ?? new HealthEventRepository(options.dataDirectory)
    this.organizations = options.organizations ?? new HealthRecordOrganizationService(options)
    this.changeAnnotations = options.changeAnnotations ?? new HealthChangeAnnotationService({ repository: this.repository, events: this.events })
  }

  async recomputeAfterMutation(accountId, eventId, now, options = {}) {
    try {
      await this.organizations.invalidateAndRecompute(accountId, eventId, now, options)
    } catch (error) {
      console.warn('[Hoooho AI] record saved but organization recompute failed', eventId, error?.code ?? error?.message)
    }
    try {
      await this.changeAnnotations.recompute(accountId, eventId, now)
    } catch (error) {
      console.warn('[Hoooho] record saved but change annotation recompute failed', eventId, error?.code ?? error?.message)
    }
  }

  async assertEventOwnership(accountId, eventId) {
    const event = await this.events.findById(eventId)
    if (!event || event.accountId !== accountId) {
      throw new HealthEventRecordError('未找到这条健康随记', 404, 'HEALTH_EVENT_NOT_FOUND')
    }
    return event
  }

  async getOwnedRecord(accountId, id) {
    const record = await this.repository.findById(id)
    if (!record || record.accountId !== accountId) {
      throw new HealthEventRecordError('未找到这条随记内容', 404, 'HEALTH_EVENT_RECORD_NOT_FOUND')
    }
    await this.assertEventOwnership(accountId, record.eventId)
    return record
  }

  async create(accountId, eventId, input, now = new Date()) {
    await this.assertEventOwnership(accountId, eventId)
    rejectImmutableFields(input)
    const occurredAt = validateOccurredAt(input.occurredAt, now)
    const created = await this.repository.create({
      accountId,
      eventId,
      type: validateType(input.type),
      ...(input.journal === undefined ? {} : { journal: validateJournal(input.journal) }),
      content: validateContent(input.content),
      occurredAt,
      sourceType: input.sourceType === undefined ? 'user_record' : validateSourceType(input.sourceType),
      sourceText: validateOptionalText(input.sourceText, '原始记录'),
      measurementMethod: validateMeasurementMethod(input.measurementMethod),
      measurementDevice: validateOptionalText(input.measurementDevice, '测量设备', 200),
      note: validateOptionalText(input.note, '备注', 1000)
    }, now)
    const bodyLocations = Array.isArray(input.bodyLocations)
      ? [...new Set(input.bodyLocations.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean))].slice(0, 12)
      : []
    await this.recomputeAfterMutation(accountId, eventId, now, bodyLocations.length
      ? { bodyLocationsByRecord: { [created.id]: bodyLocations } }
      : {})
    return this.repository.findById(created.id)
  }

  async list(accountId, eventId) {
    await this.assertEventOwnership(accountId, eventId)
    return this.repository.findByEventId(eventId)
  }

  async listJournal(accountId, eventId, timezone) {
    return (await this.list(accountId, eventId)).map((record) => projectJournalRecord(record, timezone))
  }

  async update(accountId, id, input, now = new Date()) {
    const record = await this.getOwnedRecord(accountId, id)
    rejectImmutableFields(input)
    const changes = {}
    for (const key of Object.keys(input)) {
      if (!editableFields.has(key)) continue
      if (key === 'type') changes.type = validateType(input.type)
      if (key === 'content') changes.content = validateContent(input.content)
      if (key === 'occurredAt') changes.occurredAt = validateOccurredAt(input.occurredAt, now)
      if (key === 'sourceType') changes.sourceType = validateSourceType(input.sourceType)
      if (key === 'sourceText') changes.sourceText = validateOptionalText(input.sourceText, '原始记录')
      if (key === 'measurementMethod') changes.measurementMethod = validateMeasurementMethod(input.measurementMethod)
      if (key === 'measurementDevice') changes.measurementDevice = validateOptionalText(input.measurementDevice, '测量设备', 200)
      if (key === 'note') changes.note = validateOptionalText(input.note, '备注', 1000)
    }
    if (!Object.keys(changes).length) {
      throw new HealthEventRecordError('没有可更新的记录字段', 400, 'NO_RECORD_CHANGES')
    }
    const updated = await this.repository.update(id, changes, now)
    await this.recomputeAfterMutation(accountId, record.eventId, now)
    return this.repository.findById(updated.id)
  }

  async delete(accountId, id) {
    const record = await this.getOwnedRecord(accountId, id)
    await this.repository.delete(id)
    await this.recomputeAfterMutation(accountId, record.eventId, new Date())
    return { success: true }
  }

  updateChangeAnnotation(accountId, recordId, annotationId, input) {
    return this.changeAnnotations.update(accountId, recordId, annotationId, input)
  }

  deleteChangeAnnotation(accountId, recordId, annotationId) {
    return this.changeAnnotations.delete(accountId, recordId, annotationId)
  }
}
