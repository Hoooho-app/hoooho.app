import { HealthEventError, HealthEventService } from './health-event-service.mjs'
import { HealthEventRecordService } from './health-event-record-service.mjs'
import { JsonStore } from '../auth/storage/json-store.mjs'
import path from 'node:path'

const keyPattern = /^[A-Za-z0-9_-]{8,128}$/

class QuickRecordRequestRepository {
  constructor(dataDirectory) {
    this.store = new JsonStore(path.join(dataDirectory, 'quick-record-requests.json'), { requests: [] })
  }

  async find(accountId, idempotencyKey) {
    const data = await this.store.read()
    return data.requests.find((item) => item.accountId === accountId && item.idempotencyKey === idempotencyKey) ?? null
  }

  async save(input, now = new Date()) {
    let saved
    await this.store.update((data) => {
      const previous = data.requests.find((item) => item.accountId === input.accountId && item.idempotencyKey === input.idempotencyKey)
      saved = { ...previous, ...input, updatedAt: now.toISOString(), createdAt: previous?.createdAt ?? now.toISOString() }
      return {
        ...data,
        requests: previous
          ? data.requests.map((item) => item === previous ? saved : item)
          : [...data.requests, saved]
      }
    })
    return saved
  }
}

function validateInput(input) {
  const idempotencyKey = typeof input.idempotencyKey === 'string' ? input.idempotencyKey.trim() : ''
  const content = typeof input.content === 'string' ? input.content.trim() : ''
  const memberId = typeof input.memberId === 'string' ? input.memberId.trim() : ''
  const title = typeof input.title === 'string' ? input.title.trim() : ''
  if (!keyPattern.test(idempotencyKey)) throw new HealthEventError('幂等键格式无效', 400, 'INVALID_IDEMPOTENCY_KEY')
  if (!memberId) throw new HealthEventError('请选择记录人物', 400, 'MEMBER_REQUIRED')
  if (!content) throw new HealthEventError('记录内容不能为空', 400, 'EMPTY_RECORD_CONTENT')
  if (!title) throw new HealthEventError('记录标题不能为空', 400, 'INVALID_EVENT_TITLE')
  if (input.inputChannel !== 'voice' && input.inputChannel !== 'text') throw new HealthEventError('记录来源无效', 400, 'INVALID_INPUT_CHANNEL')
  const photoIds = Array.isArray(input.photoIds) ? input.photoIds.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim()) : []
  const photoDraftId = typeof input.photoDraftId === 'string' ? input.photoDraftId.trim() : ''
  if (photoIds.length && !photoDraftId) throw new HealthEventError('照片草稿标识不能为空', 400, 'PHOTO_DRAFT_REQUIRED')
  return { idempotencyKey, content, memberId, title, occurredAt: input.occurredAt, inputChannel: input.inputChannel, photoDraftId, photoIds }
}

export function classifyChildRecord(content) {
  const originalText = String(content).trim()
  const text = originalText.toLowerCase()
  const rules = [
    ['reaction', /过敏|皮疹|红疹|荨麻疹|吃了.*反应|接触.*反应|牛奶|鸡蛋|花生/],
    ['growth', /身高|体重|头围|bmi|长高|增重/],
    ['nutrition', /挑食|进食|吃饭|食欲|喂养|饮食/],
    ['medication', /吃药|用药|药物|药名|剂量|退烧药/],
    ['visit', /就诊|看医生|检查|化验|报告|医院|体检/],
    ['discomfort', /咳嗽|发烧|发热|体温|疼|痛|呕吐|腹泻|鼻塞|不舒服|症状/]
  ]
  const category = rules.find(([, pattern]) => pattern.test(text))?.[0] ?? 'other'
  const anchors = ['牛奶', '鸡蛋', '花生', '皮疹', '咳嗽', '发热', '腹泻', '呕吐', '身高', '体重', '头围', '食欲']
  const anchor = anchors.find((item) => text.includes(item)) ?? category
  const structuredData = {}
  const uncertainFields = []
  const captureNumber = (pattern) => {
    const matched = originalText.match(pattern)
    return matched ? Number(matched[1]) : null
  }
  const assignNumber = (key, pattern) => {
    const value = captureNumber(pattern)
    if (Number.isFinite(value)) structuredData[key] = value
  }

  if (category === 'growth') {
    assignNumber('heightCm', /身高\s*(?:是|约|大约)?\s*(\d+(?:\.\d+)?)\s*(?:cm|厘米|公分)/i)
    assignNumber('weightKg', /体重\s*(?:是|约|大约)?\s*(\d+(?:\.\d+)?)\s*(?:kg|公斤|千克)/i)
    assignNumber('headCircumferenceCm', /头围\s*(?:是|约|大约)?\s*(\d+(?:\.\d+)?)\s*(?:cm|厘米|公分)/i)
    if (!Object.keys(structuredData).length) uncertainFields.push('测量数值或单位')
  }
  if (category === 'discomfort') {
    assignNumber('temperatureC', /(?:体温|温度)\s*(?:是|约|大约)?\s*(\d+(?:\.\d+)?)\s*(?:℃|°c|度)?/i)
  }
  if (category === 'reaction') {
    const exposure = originalText.match(/(?:吃了|喝了|接触(?:了|到)?)([^，。,.；;\s后]{1,16})/)
    if (exposure) structuredData.exposure = exposure[1]
    else uncertainFields.push('可能相关的食物或接触物')
  }
  if (category === 'medication') {
    const medication = originalText.match(/(?:吃了|服用|用了|使用)([^，。,.；;\s\d]{1,16})/)
    const dose = originalText.match(/(\d+(?:\.\d+)?)\s*(毫升|ml|毫克|mg|片|袋|滴)/i)
    if (medication) structuredData.medication = medication[1]
    else uncertainFields.push('药物名称')
    if (dose) structuredData.dose = `${dose[1]}${dose[2]}`
    else uncertainFields.push('剂量')
  }
  if (category === 'other') uncertainFields.push('记录类型')
  return { category, trackingKey: `${category}:${anchor}`, structuredData, uncertainFields }
}

export class QuickRecordService {
  constructor(options = {}) {
    this.events = options.events ?? new HealthEventService(options)
    this.records = options.records ?? new HealthEventRecordService(options)
    this.requests = options.requests ?? new QuickRecordRequestRepository(options.dataDirectory)
    this.photos = options.photos ?? null
    this.inFlight = new Map()
  }

  async findExisting(accountId, idempotencyKey, marker, now) {
    const request = await this.requests.find(accountId, idempotencyKey)
    if (request) {
      const [event, record] = await Promise.all([
        this.events.repository.findById(request.eventId),
        this.records.repository.findById(request.recordId)
      ])
      if (event?.accountId === accountId && record?.accountId === accountId && record.eventId === event.id) {
        if (record.note === marker) await this.records.repository.update(record.id, { note: null }, now)
        return { eventId: event.id, recordId: record.id, idempotent: true }
      }
    }
    const records = await this.records.repository.findByAccountId(accountId)
    const record = records.find((item) => item.note === marker)
    if (!record) return null
    const event = await this.events.repository.findById(record.eventId)
    if (!event || event.accountId !== accountId) return null
    await this.requests.save({ accountId, idempotencyKey, eventId: event.id, recordId: record.id }, now)
    await this.records.repository.update(record.id, { note: null }, now)
    return { eventId: event.id, recordId: record.id, idempotent: true }
  }

  async create(accountId, rawInput, now = new Date()) {
    const input = validateInput(rawInput ?? {})
    const marker = `quick-record:${input.idempotencyKey}`
    const lockKey = `${accountId}:${input.idempotencyKey}`
    const existingWork = this.inFlight.get(lockKey)
    if (existingWork) return existingWork
    const work = this.createLocked(accountId, input, marker, now)
    this.inFlight.set(lockKey, work)
    try {
      return await work
    } finally {
      this.inFlight.delete(lockKey)
    }
  }

  async createLocked(accountId, input, marker, now) {
    const existing = await this.findExisting(accountId, input.idempotencyKey, marker, now)
    if (existing) return existing
    const photos = input.photoIds.length
      ? await this.photos?.prepareForSave(accountId, input.memberId, input.photoDraftId, input.photoIds)
      : []
    if (input.photoIds.length && !this.photos) throw new HealthEventError('照片服务暂不可用', 503, 'PHOTO_SERVICE_UNAVAILABLE')
    const classification = classifyChildRecord(input.content)
    const allEvents = typeof this.events.repository.findByAccountId === 'function'
      ? await this.events.repository.findByAccountId(accountId)
      : []
    let event = allEvents.find((item) => item.memberId === input.memberId && item.trackingKey === classification.trackingKey && !['ended', 'recovered'].includes(item.status)) ?? null
    const createdEvent = !event
    if (!event) event = await this.events.create(accountId, {
      memberId: input.memberId,
      title: input.title,
      category: classification.category,
      trackingKey: classification.trackingKey,
      startTime: input.occurredAt
    }, now)
    let createdRecord = null
    let attachedPhotos = []
    try {
      const record = await this.records.create(accountId, event.id, {
        type: 'note',
        content: input.content,
        occurredAt: input.occurredAt,
        sourceType: input.inputChannel === 'voice' ? 'voice_record' : 'text_record',
        sourceText: input.content,
        note: marker
        , category: classification.category
        , structuredData: classification.structuredData
        , uncertainFields: classification.uncertainFields
      }, now)
      createdRecord = record
      await this.requests.save({ accountId, idempotencyKey: input.idempotencyKey, eventId: event.id, recordId: record.id }, now)
      attachedPhotos = await this.photos?.attach(accountId, event.id, record.id, input.memberId, photos, now) ?? []
      await this.records.repository.update(record.id, { note: null }, now)
      await this.photos?.consume(accountId, input.photoDraftId, photos, now)
      return { eventId: event.id, recordId: record.id, photoCount: attachedPhotos.length, idempotent: false }
    } catch (error) {
      if (attachedPhotos.length) await this.photos?.rollback(photos).catch(() => undefined)
      if (createdRecord) await this.records.repository.delete(createdRecord.id).catch(() => undefined)
      if (createdEvent) await this.events.delete(accountId, event.id).catch(() => undefined)
      throw error
    }
  }
}
