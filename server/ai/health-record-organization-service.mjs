import { AIService } from './ai-service.mjs'
import { HealthEventRepository } from '../events/repositories/health-event-repository.mjs'
import { HealthEventRecordRepository } from '../events/repositories/health-event-record-repository.mjs'
import { HealthRecordOrganizationRepository } from './repositories/health-record-organization-repository.mjs'
import { hasOrganizedHealthFacts } from './ai-types.mjs'

export class HealthRecordOrganizationError extends Error {
  constructor(message, status = 400, code = 'HEALTH_RECORD_ORGANIZATION_ERROR') {
    super(message)
    this.status = status
    this.code = code
  }
}

export class HealthRecordOrganizationService {
  constructor(options = {}) {
    this.ai = options.ai ?? new AIService(options)
    this.events = options.events ?? new HealthEventRepository(options.dataDirectory)
    this.records = options.records ?? new HealthEventRecordRepository(options.dataDirectory)
    this.repository = options.repository ?? new HealthRecordOrganizationRepository(options.dataDirectory)
  }

  async assertEventOwnership(accountId, eventId) {
    const event = await this.events.findById(eventId)
    if (!event || event.accountId !== accountId) {
      throw new HealthRecordOrganizationError('健康事件不存在', 404, 'HEALTH_EVENT_NOT_FOUND')
    }
    return event
  }

  async organize(accountId, eventId, input, now = new Date()) {
    await this.assertEventOwnership(accountId, eventId)
    const recordId = typeof input?.recordId === 'string' ? input.recordId : ''
    const record = recordId ? await this.records.findById(recordId) : null
    if (!record || record.accountId !== accountId || record.eventId !== eventId) {
      throw new HealthRecordOrganizationError('健康事件记录不存在', 404, 'HEALTH_EVENT_RECORD_NOT_FOUND')
    }

    const context = typeof input?.context === 'string' ? input.context.trim().slice(0, 240) : ''
    const organized = await this.ai.organizeHealthRecord(record.content)
    const bodyLocations = context.startsWith('身体部位：')
      ? context.slice('身体部位：'.length).split('、').map((item) => item.trim()).filter(Boolean)
      : []
    const organizedHealthData = bodyLocations.length && organized.organizedHealthData.symptoms.length
      ? {
          ...organized.organizedHealthData,
          symptoms: organized.organizedHealthData.symptoms.map((symptom, index) => index === 0
            ? { ...symptom, keywords: [...new Set([...symptom.keywords, ...bodyLocations])] }
            : symptom)
        }
      : organized.organizedHealthData
    return this.repository.upsert({
      accountId,
      eventId,
      recordId: record.id,
      rawInput: record.content,
      organizedHealthData,
      status: 'completed',
      provider: organized.provider
    }, now)
  }

  async preview(accountId, eventId, input) {
    await this.assertEventOwnership(accountId, eventId)
    const organized = await this.ai.organizeHealthRecord(input?.rawInput)
    return {
      hasHealthFacts: hasOrganizedHealthFacts(organized.organizedHealthData),
      organizedHealthData: organized.organizedHealthData,
      provider: organized.provider
    }
  }

  async list(accountId, eventId) {
    await this.assertEventOwnership(accountId, eventId)
    const organizations = await this.repository.findByEventId(eventId)
    const legacyOrganizations = organizations.filter((organization) => organization.schemaVersion !== 2)
    if (!legacyOrganizations.length) return organizations

    await Promise.all(legacyOrganizations.map(async (organization) => {
      try {
        const organized = await this.ai.organizeHealthRecord(organization.rawInput)
        await this.repository.upsert({
          accountId,
          eventId,
          recordId: organization.recordId,
          rawInput: organization.rawInput,
          organizedHealthData: organized.organizedHealthData,
          status: 'completed',
          provider: organized.provider
        })
      } catch (error) {
        console.warn('[Hoooho AI] legacy organization refresh failed', organization.id, error?.code ?? error?.message)
      }
    }))

    return this.repository.findByEventId(eventId)
  }
}
