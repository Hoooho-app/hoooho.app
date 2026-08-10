import { AIService } from './ai-service.mjs'
import { HealthEventRepository } from '../events/repositories/health-event-repository.mjs'
import { HealthEventRecordRepository } from '../events/repositories/health-event-record-repository.mjs'
import { HealthRecordOrganizationRepository } from './repositories/health-record-organization-repository.mjs'
import { hasHealthFacts, normalizeHealthAIOutput, projectOrganizedHealthData } from './ai-types.mjs'

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
    const organized = await this.ai.organizeHealthRecord(record.content, {
      selectedOccurredAt: record.occurredAt,
      timezone: input?.timezone
    })
    const bodyLocations = context.startsWith('身体部位：')
      ? context.slice('身体部位：'.length).split('、').map((item) => item.trim()).filter(Boolean)
      : []
    const firstSymptomIndex = organized.healthAIOutput.facts.findIndex((fact) => fact.type === 'symptom')
    const healthAIOutput = bodyLocations.length && firstSymptomIndex >= 0
      ? normalizeHealthAIOutput({
          ...organized.healthAIOutput,
          facts: organized.healthAIOutput.facts.map((fact, index) => index === firstSymptomIndex && !fact.bodyPart
            ? { ...fact, bodyPart: bodyLocations.join('、') }
            : fact)
        })
      : organized.healthAIOutput
    return this.repository.upsert({
      accountId,
      eventId,
      recordId: record.id,
      rawInput: record.content,
      healthAIOutput,
      organizedHealthData: projectOrganizedHealthData(healthAIOutput),
      status: 'completed',
      provider: organized.provider
    }, now)
  }

  async preview(accountId, eventId, input) {
    await this.assertEventOwnership(accountId, eventId)
    const organized = await this.ai.organizeHealthRecord(input?.rawInput, {
      selectedOccurredAt: input?.selectedOccurredAt,
      timezone: input?.timezone
    })
    return {
      hasHealthFacts: hasHealthFacts(organized.healthAIOutput),
      healthAIOutput: organized.healthAIOutput,
      organizedHealthData: organized.organizedHealthData,
      provider: organized.provider
    }
  }

  async list(accountId, eventId) {
    await this.assertEventOwnership(accountId, eventId)
    const organizations = await this.repository.findByEventId(eventId)
    const legacyOrganizations = organizations.filter((organization) => organization.schemaVersion !== 5)
    if (!legacyOrganizations.length) return organizations

    await Promise.all(legacyOrganizations.map(async (organization) => {
      try {
        const record = await this.records.findById(organization.recordId)
        const organized = await this.ai.organizeHealthRecord(organization.rawInput, {
          selectedOccurredAt: record?.occurredAt
        })
        await this.repository.upsert({
          accountId,
          eventId,
          recordId: organization.recordId,
          rawInput: organization.rawInput,
          healthAIOutput: organized.healthAIOutput,
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
