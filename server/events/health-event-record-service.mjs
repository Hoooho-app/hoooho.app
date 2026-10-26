import { HealthEventRepository } from './repositories/health-event-repository.mjs'
import { HealthEventRecordRepository } from './repositories/health-event-record-repository.mjs'
import { HealthRecordOrganizationService } from '../ai/health-record-organization-service.mjs'
import { HealthChangeAnnotationService } from './health-change-annotation-service.mjs'
import { HealthEventRecordError } from './health-event-record-error.mjs'
import { projectJournalRecord, validateJournal } from './journal-metadata.mjs'
import { journalOccurrenceAt } from '../../shared/journal-occurrence.mjs'
import { accountTransaction, withStorageLock } from '../auth/storage/transaction.mjs'
import { JsonStore } from '../auth/storage/json-store.mjs'
import { parseStrictInstant } from '../time/strict-date.mjs'
import path from 'node:path'

export { HealthEventRecordError } from './health-event-record-error.mjs'

const recordTypes = new Set(['note', 'symptom', 'medication', 'visit', 'examination', 'other'])
const editableFields = new Set(['type', 'content', 'occurredAt', 'sourceType', 'sourceText', 'measurementMethod', 'measurementDevice', 'note', 'journal'])
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
  const parsed = parseStrictInstant(value)
  if (!parsed) {
    throw new HealthEventRecordError('发生时间格式错误', 400, 'INVALID_OCCURRED_AT')
  }
  if (parsed.getTime() > now.getTime()) {
    throw new HealthEventRecordError('发生时间不能晚于现在', 400, 'FUTURE_OCCURRED_AT')
  }
  return parsed.toISOString()
}

function assertRecordInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HealthEventRecordError('记录内容格式无效', 400, 'INVALID_RECORD_INPUT')
}

function rejectImmutableFields(input) {
  assertRecordInput(input)
  const field = Object.keys(input).find((key) => immutableFields.has(key))
  if (field) {
    throw new HealthEventRecordError(`${field} 由服务端管理，不能由客户端提交`, 400, 'IMMUTABLE_RECORD_FIELD')
  }
}

export class HealthEventRecordService {
  constructor(options = {}) {
    this.directory = options.dataDirectory
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

  async validateSymptomLinks(accountId, event, journal) {
    const groups = { ...(journal?.symptom?.linkedRecordIds ?? {}) }
    const add = (category, ids) => { if (ids?.length) groups[category] = [...(groups[category] ?? []), ...ids] }
    add('symptom', journal?.medication?.linkedSymptomRecordIds)
    add('symptom', journal?.vaccination?.linkedSymptomRecordIds)
    for (const [key, category] of [['linkedSymptomRecordIds', 'symptom'], ['linkedMedicationRecordIds', 'medication'], ['linkedExaminationRecordIds', 'examination'], ['linkedInjuryRecordIds', 'injury'], ['linkedVaccinationRecordIds', 'vaccination']]) add(category, journal?.visit?.[key])
    if (journal?.visit?.linkedVisitRecordId) add('visit', [journal.visit.linkedVisitRecordId])
    for (const [category, recordIds] of Object.entries(groups)) {
      for (const id of new Set(recordIds)) {
        const related = await this.repository.findById(id)
        if (!related || related.accountId !== accountId) throw new HealthEventRecordError('关联记录不存在', 400, 'INVALID_RELATED_RECORD')
        const relatedEvent = await this.events.findById(related.eventId)
        if (!relatedEvent || relatedEvent.accountId !== accountId || relatedEvent.memberId !== event.memberId) throw new HealthEventRecordError('只能关联当前记录对象的内容', 400, 'INVALID_RELATED_RECORD')
        const categories = related.journal?.categories?.length ? related.journal.categories : [related.type]
        if (!categories.includes(category)) throw new HealthEventRecordError('关联记录类型不匹配', 400, 'INVALID_RELATED_RECORD')
      }
    }
  }

  async create(accountId, eventId, input, now = new Date()) {
    assertRecordInput(input)
    if (!input.journal?.aiNurse) return this.createRecord(accountId, eventId, input, now)
    return accountTransaction(this.directory, async () => {
      const event = await this.assertEventOwnership(accountId, eventId)
      const metadata = validateJournal(input.journal).aiNurse
      const store = new JsonStore(path.join(this.directory, 'nurse-drafts.json'), { drafts: [], usage: [] })
      const draft = (await store.read()).drafts.find(d => d.id === metadata.draftId && d.accountId === accountId && d.memberId === event.memberId && !d.discarded)
      if (!draft || JSON.stringify(draft.turns) !== JSON.stringify(metadata.turns)) throw new HealthEventRecordError('智能记录原话未同步或来源不属于当前人物', 409, 'NURSE_SOURCE_CONFLICT')
      if (draft.saved) {
        if (draft.saved.eventId !== eventId) throw new HealthEventRecordError('这份智能记录已保存，请查看原记录', 409, 'NURSE_ALREADY_SAVED')
        return this.getOwnedRecord(accountId, draft.saved.recordId)
      }
      const record = await this.createRecord(accountId, eventId, input, now)
      await store.update(data => ({ ...data, drafts: data.drafts.map(d => d.id === draft.id ? { ...d, saved: { eventId, recordId: record.id }, step: 'saved', updatedAt: now.toISOString() } : d) }))
      return record
    })
  }

  async createRecord(accountId, eventId, input, now = new Date()) {
    const created = await withStorageLock(async () => {
      const event = await this.assertEventOwnership(accountId, eventId)
      rejectImmutableFields(input)
      const journal = input.journal === undefined ? undefined : validateJournal(input.journal, { now })
      const occurredAt = validateOccurredAt(journalOccurrenceAt(journal, input.occurredAt), now)
      if (journal?.sleep?.sleepAt) validateOccurredAt(journal.sleep.sleepAt, now)
      if (journal?.diet?.startedAt) validateOccurredAt(journal.diet.startedAt, now)
      await this.validateSymptomLinks(accountId, event, journal)
      return this.repository.create({
        accountId,
        eventId,
        type: validateType(input.type),
        ...(input.caseIdentity ? { caseContext: { identity: ['parent','medical_consultation','examination_report','external_ai','pending'].includes(input.caseIdentity) ? input.caseIdentity : 'pending', confirmed: false, attachmentIds: [] } } : {}),
        ...(journal === undefined ? {} : { journal }),
        content: validateContent(input.content),
        occurredAt,
        sourceType: input.sourceType === undefined ? 'user_record' : validateSourceType(input.sourceType),
        sourceText: validateOptionalText(input.sourceText, '原始记录', 15000),
        measurementMethod: validateMeasurementMethod(input.measurementMethod),
        measurementDevice: validateOptionalText(input.measurementDevice, '测量设备', 200),
        note: validateOptionalText(input.note, '备注', 1000)
      }, now)
    })
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
    const event = await this.assertEventOwnership(accountId, record.eventId)
    rejectImmutableFields(input)
    const changes = {}
    for (const key of Object.keys(input)) {
      if (!editableFields.has(key)) continue
      if (key === 'type') changes.type = validateType(input.type)
      if (key === 'content') changes.content = validateContent(input.content)
      if (key === 'occurredAt') changes.occurredAt = validateOccurredAt(input.occurredAt, now)
      if (key === 'sourceType') changes.sourceType = validateSourceType(input.sourceType)
      if (key === 'sourceText') changes.sourceText = validateOptionalText(input.sourceText, '原始记录', 15000)
      if (key === 'measurementMethod') changes.measurementMethod = validateMeasurementMethod(input.measurementMethod)
      if (key === 'measurementDevice') changes.measurementDevice = validateOptionalText(input.measurementDevice, '测量设备', 200)
      if (key === 'note') changes.note = validateOptionalText(input.note, '备注', 1000)
      if (key === 'journal') {
        changes.journal = validateJournal(input.journal, { now })
        if (record.journal?.aiNurse) {
          const original = record.journal.aiNurse
          const requested = changes.journal?.aiNurse
          if (requested && (requested.draftId !== original.draftId || JSON.stringify(requested.turns) !== JSON.stringify(original.turns))) throw new HealthEventRecordError('对话原文只读，请在确认内容中更正', 400, 'NURSE_TRANSCRIPT_IMMUTABLE')
          changes.journal = { ...changes.journal, aiNurse: requested ?? original }
        }
        await this.validateSymptomLinks(accountId, event, changes.journal)
      }
    }
    if (Object.hasOwn(changes, 'journal') && record.journal?.visit?.materials && !changes.journal?.visit?.materials) {
      throw new HealthEventRecordError('已保存的原件与原话需保留，后续资料请追加', 400, 'VISIT_ORIGINAL_IMMUTABLE')
    }
    if (changes.journal?.visit?.materials) {
      const previous = record.journal?.visit?.materials, next = changes.journal.visit.materials
      if (!previous) throw new HealthEventRecordError('请通过就诊资料上传原件', 400, 'VISIT_ORIGINAL_MISMATCH')
      for (const original of previous.documents) {
        const retained = next.documents.find(document => document.id === original.id)
        if (!retained || retained.kind !== original.kind || retained.originalText !== original.originalText || retained.contentHash !== original.contentHash) throw new HealthEventRecordError('已保存的原件与原话需保留，后续资料请追加', 400, 'VISIT_ORIGINAL_IMMUTABLE')
      }
      if (previous.source === 'external_ai' && next.source !== 'external_ai') throw new HealthEventRecordError('AI资料需保留AI来源', 400, 'VISIT_AI_SOURCE_IMMUTABLE')
      for (const document of next.documents.filter(document => document.kind === 'file')) {
        const owned = previous.documents.find(original => original.id === document.id && original.contentHash === document.contentHash && record.caseContext?.attachmentIds?.includes(original.attachmentId))
        if (!owned) throw new HealthEventRecordError('资料原件不属于这次就诊，请通过补充资料添加', 400, 'VISIT_ORIGINAL_MISMATCH')
        document.attachmentId = owned.attachmentId
      }
      changes.caseContext = { ...record.caseContext, timeUnknown: !next.occurredAt, identity: next.source === 'external_ai' ? 'external_ai' : 'medical_consultation', confirmed: next.status === 'reviewed' }
      changes.journal.timePrecision = next.occurredAt ? 'exact' : 'unknown'
      if (next.occurredAt) changes.occurredAt = validateOccurredAt(next.occurredAt, now)
    }
    const effectiveJournal = Object.hasOwn(changes, 'journal') ? changes.journal : record.journal
    if (changes.journal || (Object.hasOwn(changes, 'occurredAt') && effectiveJournal)) {
      const canonicalTime = validateOccurredAt(journalOccurrenceAt(effectiveJournal, changes.occurredAt ?? record.occurredAt), now)
      if (!Object.hasOwn(changes, 'journal') && changes.occurredAt !== canonicalTime) throw new HealthEventRecordError('发生时间需与实际起止时间保持一致，请修改对应的开始或结束时间', 400, 'INCONSISTENT_OCCURRED_AT')
      changes.occurredAt = canonicalTime
      if (effectiveJournal.sleep?.sleepAt) validateOccurredAt(effectiveJournal.sleep.sleepAt, now)
      if (effectiveJournal.diet?.startedAt) validateOccurredAt(effectiveJournal.diet.startedAt, now)
    }
    // An explicitly supplied, validated occurrence time supersedes unknown or
    // defaulted provenance. Content-only edits leave the original time untouched.
    // Use the canonical validated date (e.g. a sleep endpoint), never the raw input.
    if (Object.hasOwn(input, 'occurredAt')) {
      if (record.aiProvenance) changes.aiProvenance = { ...record.aiProvenance, time: { ...record.aiProvenance.time, resolvedStart: changes.occurredAt, precision: 'exact', defaulted: false } }
      if (record.caseContext || changes.caseContext) changes.caseContext = { ...(changes.caseContext ?? record.caseContext), timeUnknown: false }
    }
    if (!Object.keys(changes).length) {
      throw new HealthEventRecordError('没有可更新的记录字段', 400, 'NO_RECORD_CHANGES')
    }
    const revisions = [...(record.revisions ?? []), { at: now.toISOString(), before: Object.fromEntries(Object.keys(changes).map(key => [key, record[key] ?? null])), after: changes }]
    const updated = await this.repository.update(id, { ...changes, revisions }, now)
    await this.recomputeAfterMutation(accountId, record.eventId, now)
    return this.repository.findById(updated.id)
  }

  async endSleep(accountId, id, input = {}, now = new Date()) {
    assertRecordInput(input)
    const record = await this.getOwnedRecord(accountId, id)
    const current = record.journal?.sleep
    if (!current) throw new HealthEventRecordError('这不是睡眠记录', 400, 'NOT_SLEEP_RECORD')
    if (current.status !== 'ongoing') return record

    const sleepAt = validateOccurredAt(input.sleepAt ?? current.sleepAt, now)
    const wakeAt = validateOccurredAt(input.wakeAt ?? now.toISOString(), now)
    const elapsedMilliseconds = Date.parse(wakeAt) - Date.parse(sleepAt)
    const durationMinutes = Math.max(1, Math.round(elapsedMilliseconds / 60_000))
    if (elapsedMilliseconds <= 0 || (durationMinutes > 1440 && !input.wakeAt)) {
      throw new HealthEventRecordError('这次睡眠记录尚未结束，请核对时间。', 409, 'SLEEP_TIME_CORRECTION_REQUIRED')
    }
    const journal = validateJournal({
      ...record.journal,
      sleep: { ...current, sleepAt, wakeAt, durationMinutes, status: 'completed' }
    })
    const result = await this.repository.updateIfSleepOngoing(id, { journal, occurredAt: wakeAt }, now)
    if (result.updated) await this.recomputeAfterMutation(accountId, record.eventId, now)
    return result.record ?? this.repository.findById(id)
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
