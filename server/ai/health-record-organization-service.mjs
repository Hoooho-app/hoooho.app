import { AIService } from './ai-service.mjs'
import { HealthEventRepository } from '../events/repositories/health-event-repository.mjs'
import { HealthEventRecordRepository } from '../events/repositories/health-event-record-repository.mjs'
import { HealthRecordOrganizationRepository } from './repositories/health-record-organization-repository.mjs'
import { hasHealthFacts, normalizeHealthAIOutput, projectOrganizedHealthData } from './ai-types.mjs'
import { buildHealthEventSummary } from '../events/health-event-summary.mjs'

function normalizeBodyLocations(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean))].slice(0, 12)
}

function readBodyLocations(input) {
  const explicit = normalizeBodyLocations(input?.bodyLocations)
  if (explicit.length) return explicit
  const context = typeof input?.context === 'string' ? input.context.trim().slice(0, 240) : ''
  return context.startsWith('身体部位：')
    ? normalizeBodyLocations(context.slice('身体部位：'.length).split('、'))
    : []
}

function mergeStructuredHealthFacts(healthAIOutput, { bodyLocations, rawInput, occurredAt }) {
  if (!bodyLocations.length) return healthAIOutput
  const firstSymptomIndex = healthAIOutput.facts.findIndex((fact) => fact.type === 'symptom')
  if (firstSymptomIndex >= 0) {
    return normalizeHealthAIOutput({
      ...healthAIOutput,
      facts: healthAIOutput.facts.map((fact, index) => index === firstSymptomIndex && !fact.bodyPart
        ? { ...fact, bodyPart: bodyLocations.join('、') }
        : fact)
    })
  }

  const description = typeof rawInput === 'string' && rawInput.trim()
    ? rawInput.trim()
    : `${bodyLocations.join('、')}不舒服`
  return normalizeHealthAIOutput({
    ...healthAIOutput,
    facts: [
      ...healthAIOutput.facts,
      {
        id: `structured-body-part-${healthAIOutput.facts.length + 1}`,
        type: 'symptom',
        name: description,
        bodyPart: bodyLocations.join('、'),
        sourceText: description,
        time: {
          raw: null,
          resolvedStart: occurredAt || null,
          resolvedEnd: null,
          precision: occurredAt ? 'exact' : 'unknown',
          source: 'selected_time'
        },
        confidence: 1
      }
    ]
  })
}

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
    const event = await this.assertEventOwnership(accountId, eventId)
    const recordId = typeof input?.recordId === 'string' ? input.recordId : ''
    const record = recordId ? await this.records.findById(recordId) : null
    if (!record || record.accountId !== accountId || record.eventId !== eventId) {
      throw new HealthRecordOrganizationError('健康事件记录不存在', 404, 'HEALTH_EVENT_RECORD_NOT_FOUND')
    }

    const organized = await this.ai.organizeHealthRecord(record.content, {
      selectedOccurredAt: record.occurredAt,
      timezone: input?.timezone
    })
    const healthAIOutput = mergeStructuredHealthFacts(organized.healthAIOutput, {
      bodyLocations: readBodyLocations(input),
      rawInput: record.content,
      occurredAt: record.occurredAt
    })
    const saved = await this.repository.upsert({
      accountId,
      eventId,
      recordId: record.id,
      rawInput: record.content,
      healthAIOutput,
      organizedHealthData: projectOrganizedHealthData(healthAIOutput),
      status: 'completed',
      provider: organized.provider
    }, now)
    await this.refreshEventSummary(eventId, now, event)
    return saved
  }

  async preview(accountId, eventId, input) {
    await this.assertEventOwnership(accountId, eventId)
    const organized = await this.ai.organizeHealthRecord(input?.rawInput, {
      selectedOccurredAt: input?.selectedOccurredAt,
      timezone: input?.timezone
    })
    const healthAIOutput = mergeStructuredHealthFacts(organized.healthAIOutput, {
      bodyLocations: readBodyLocations(input),
      rawInput: input?.rawInput,
      occurredAt: input?.selectedOccurredAt
    })
    return {
      hasHealthFacts: hasHealthFacts(healthAIOutput),
      healthAIOutput,
      organizedHealthData: projectOrganizedHealthData(healthAIOutput),
      provider: organized.provider
    }
  }

  async list(accountId, eventId) {
    const event = await this.assertEventOwnership(accountId, eventId)
    const organizations = await this.repository.findByEventId(eventId)
    const legacyOrganizations = organizations.filter((organization) => organization.schemaVersion !== 5)
    if (!legacyOrganizations.length) {
      if (!event.eventSummary && organizations.length) await this.refreshEventSummary(eventId, new Date(), event)
      return organizations
    }

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

    const refreshed = await this.repository.findByEventId(eventId)
    await this.refreshEventSummary(eventId, new Date(), event)
    return refreshed
  }

  async refreshEventSummary(eventId, now = new Date(), knownEvent = null) {
    const event = knownEvent ?? await this.events.findById(eventId)
    if (!event) return null
    const [records, organizations] = await Promise.all([
      this.records.findByEventId(eventId),
      this.repository.findByEventId(eventId)
    ])
    const eventSummary = buildHealthEventSummary({ event, records, organizations, now })
    if (!eventSummary) return null
    if (event.title === eventSummary.displayedResult.title
      && JSON.stringify(event.eventSummary) === JSON.stringify(eventSummary)) return event
    return this.events.update(eventId, {
      title: eventSummary.displayedResult.title,
      eventSummary
    }, now)
  }
}
