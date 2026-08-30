import { AIService } from './ai-service.mjs'
import { HealthEventRepository } from '../events/repositories/health-event-repository.mjs'
import { HealthEventRecordRepository } from '../events/repositories/health-event-record-repository.mjs'
import { HealthRecordOrganizationRepository } from './repositories/health-record-organization-repository.mjs'
import { HealthOrganizationStateRepository } from './repositories/health-organization-state-repository.mjs'
import { emptyHealthAIOutput, normalizeHealthAIOutput, projectOrganizedHealthData } from './ai-types.mjs'
import { classifyExtractedHealthInput, classifyHealthInputBeforeExtraction, eligibleHealthFacts } from './health-input-intent.mjs'
import { buildHealthEventSummary, healthEventSummaryAggregationVersion } from '../events/health-event-summary.mjs'

function normalizeBodyLocations(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean))].slice(0, 12)
}

function readBodyLocations(input) {
  const explicit = normalizeBodyLocations(input?.bodyLocations)
  if (explicit.length) return explicit
  const context = typeof input?.context === 'string' ? input.context.trim().slice(0, 240) : ''
  return context.startsWith('身体部位：') ? normalizeBodyLocations(context.slice('身体部位：'.length).split('、')) : []
}

function mergeStructuredHealthFacts(healthAIOutput, { bodyLocations, rawInput, occurredAt }) {
  if (!bodyLocations.length) return healthAIOutput
  const firstSymptomIndex = healthAIOutput.facts.findIndex((fact) => fact.type === 'symptom')
  if (firstSymptomIndex >= 0) return normalizeHealthAIOutput({ ...healthAIOutput,
    facts: healthAIOutput.facts.map((fact, index) => index === firstSymptomIndex && !fact.bodyPart ? { ...fact, bodyPart: bodyLocations.join('、') } : fact) })
  const description = typeof rawInput === 'string' && rawInput.trim() ? rawInput.trim() : `${bodyLocations.join('、')}不舒服`
  return normalizeHealthAIOutput({ ...healthAIOutput, facts: [...healthAIOutput.facts, {
    id: `structured-body-part-${healthAIOutput.facts.length + 1}`, type: 'symptom', category: 'symptom', concept: description,
    name: description, bodyPart: bodyLocations.join('、'), originalText: description, sourceText: description,
    polarity: 'affirmed', temporality: 'current', status: 'active', subject: 'event_subject', source: 'structured_input',
    time: { raw: null, resolvedStart: occurredAt || null, resolvedEnd: null, precision: occurredAt ? 'exact' : 'unknown', source: 'selected_time' }, confidence: 1
  }] })
}

function withProvenance(output, record, revision) {
  return normalizeHealthAIOutput({ ...output, facts: output.facts.map((fact) => ({ ...fact,
    sourceRecordId: record.id, organizationRevision: revision, originalText: fact.originalText || fact.sourceText || record.content })) })
}

export class HealthRecordOrganizationError extends Error {
  constructor(message, status = 400, code = 'HEALTH_RECORD_ORGANIZATION_ERROR') { super(message); this.status = status; this.code = code }
}

export class HealthRecordOrganizationService {
  constructor(options = {}) {
    this.ai = options.ai ?? new AIService(options)
    this.events = options.events ?? new HealthEventRepository(options.dataDirectory)
    this.records = options.records ?? new HealthEventRecordRepository(options.dataDirectory)
    this.repository = options.repository ?? new HealthRecordOrganizationRepository(options.dataDirectory)
    this.state = options.state ?? (options.dataDirectory ? new HealthOrganizationStateRepository(options.dataDirectory) : null)
  }

  async assertEventOwnership(accountId, eventId) {
    const event = await this.events.findById(eventId)
    if (!event || event.accountId !== accountId) throw new HealthRecordOrganizationError('健康事件不存在', 404, 'HEALTH_EVENT_NOT_FOUND')
    return event
  }

  async invalidate(eventId, now = new Date()) {
    if (!this.state) return { eventId, revision: 1, status: 'stale', updatedAt: now.toISOString() }
    return this.state.invalidate(eventId, now)
  }

  async recomputeEvent(accountId, eventId, options = {}, now = new Date()) {
    const event = await this.assertEventOwnership(accountId, eventId)
    let state = this.state ? await this.state.get(eventId) : null
    if (!state) state = await this.invalidate(eventId, now)
    const revision = options.revision ?? state.revision
    if (state.revision !== revision) return { stale: true, revision }
    if (this.state) {
      const processing = await this.state.transition(eventId, revision, { status: 'processing', errorCode: null }, now)
      if (!processing) return { stale: true, revision }
      await this.events.update(eventId, { organizationState: { revision, status: 'processing', errorCode: null } }, now)
    }
    try {
      const records = await this.records.findByEventId(eventId)
      const previous = await this.repository.findByEventId(eventId)
      const previousByRecord = new Map(previous.map((item) => [item.recordId, item]))
      const inputs = []
      for (const record of records) {
        const organized = await this.ai.organizeHealthRecord(record.content, { selectedOccurredAt: record.occurredAt, timezone: options.timezone })
        const bodyLocations = options.bodyLocationsByRecord?.[record.id] ?? previousByRecord.get(record.id)?.bodyLocations ?? []
        const merged = mergeStructuredHealthFacts(organized.healthAIOutput, { bodyLocations, rawInput: record.content, occurredAt: record.occurredAt })
        inputs.push({ accountId, eventId, recordId: record.id, rawInput: record.content,
          healthAIOutput: withProvenance(merged, record, revision), provider: organized.provider, bodyLocations,
          sourceRecordUpdatedAt: record.updatedAt })
      }
      const latest = this.state ? await this.state.get(eventId) : state
      if (!latest || latest.revision !== revision) return { stale: true, revision }
      const organizations = await this.repository.replaceEvent(eventId, inputs, revision, now)
      const latestAfterWrite = this.state ? await this.state.get(eventId) : state
      if (!latestAfterWrite || latestAfterWrite.revision !== revision) return { stale: true, revision }
      await this.refreshEventSummary(eventId, now, event, organizations, records)
      if (this.state) {
        await this.state.transition(eventId, revision, { status: 'completed', errorCode: null, completedAt: now.toISOString() }, now)
        await this.events.update(eventId, { organizationState: { revision, status: 'completed', errorCode: null } }, now)
      }
      return { stale: false, revision, organizations }
    } catch (error) {
      if (this.state) {
        const errorCode = error?.code ?? 'ORGANIZATION_FAILED'
        const failed = await this.state.transition(eventId, revision, { status: 'failed', errorCode }, now)
        if (failed) await this.events.update(eventId, { eventSummary: event.eventSummary ?? null, organizationState: { revision, status: 'failed', errorCode } }, now)
      }
      throw error
    }
  }

  async invalidateAndRecompute(accountId, eventId, now = new Date(), options = {}) {
    const state = await this.invalidate(eventId, now)
    await this.events.update(eventId, { organizationState: { revision: state.revision, status: 'stale', errorCode: null } }, now)
    return this.recomputeEvent(accountId, eventId, { ...options, revision: state.revision }, now)
  }

  async organize(accountId, eventId, input, now = new Date()) {
    await this.assertEventOwnership(accountId, eventId)
    const recordId = typeof input?.recordId === 'string' ? input.recordId : ''
    const record = recordId ? await this.records.findById(recordId) : null
    if (!record || record.accountId !== accountId || record.eventId !== eventId) throw new HealthRecordOrganizationError('健康事件记录不存在', 404, 'HEALTH_EVENT_RECORD_NOT_FOUND')
    const bodyLocations = readBodyLocations(input)
    const result = await this.invalidateAndRecompute(accountId, eventId, now, {
      bodyLocationsByRecord: bodyLocations.length ? { [recordId]: bodyLocations } : undefined
    })
    return result.organizations?.find((item) => item.recordId === recordId) ?? null
  }

  async preview(accountId, eventId, input) {
    await this.assertEventOwnership(accountId, eventId)
    const intentBeforeExtraction = classifyHealthInputBeforeExtraction(input?.rawInput)
    if (intentBeforeExtraction) {
      const healthAIOutput = emptyHealthAIOutput()
      return { hasHealthFacts: false, intent: intentBeforeExtraction, healthAIOutput,
        organizedHealthData: projectOrganizedHealthData(healthAIOutput), provider: 'intent-gate' }
    }
    const organized = await this.ai.organizeHealthRecord(input?.rawInput, { selectedOccurredAt: input?.selectedOccurredAt, timezone: input?.timezone })
    const extracted = mergeStructuredHealthFacts(organized.healthAIOutput, {
      bodyLocations: readBodyLocations(input), rawInput: input?.rawInput, occurredAt: input?.selectedOccurredAt })
    const intent = classifyExtractedHealthInput(input?.rawInput, extracted)
    const healthAIOutput = normalizeHealthAIOutput({ ...extracted, facts: eligibleHealthFacts(extracted) })
    const hasHealthFacts = ['health_fact', 'uncertain_health_fact'].includes(intent) && healthAIOutput.facts.length > 0
    return { hasHealthFacts, intent, healthAIOutput,
      organizedHealthData: projectOrganizedHealthData(healthAIOutput), provider: organized.provider }
  }

  async list(accountId, eventId) {
    const event = await this.assertEventOwnership(accountId, eventId)
    if (!this.state) return this.repository.findByEventId(eventId)
    let state = await this.state.get(eventId)
    const records = await this.records.findByEventId(eventId)
    let organizations = state?.status === 'completed' ? await this.repository.findByEventId(eventId, { revision: state.revision }) : []
    const current = organizations.length === records.length && organizations.every((item) => records.some((record) => record.id === item.recordId && record.updatedAt === item.sourceRecordUpdatedAt))
    if (!state || state.status !== 'completed' || !current) {
      const result = await this.invalidateAndRecompute(accountId, eventId)
      state = await this.state.get(eventId); organizations = result.organizations ?? []
    } else if (event.eventSummary && event.eventSummary.aggregationVersion !== healthEventSummaryAggregationVersion) {
      await this.refreshEventSummary(eventId, new Date(), event, organizations, records)
    }
    return state?.status === 'completed' ? organizations.filter((item) => item.sourceRevision === state.revision) : []
  }

  async ensureSummaryCurrent(accountId, eventId, now = new Date()) {
    const event = await this.assertEventOwnership(accountId, eventId)
    if (!event.eventSummary || event.eventSummary.aggregationVersion === healthEventSummaryAggregationVersion) return event
    if (!this.state) return this.refreshEventSummary(eventId, now, event)
    const state = await this.state.get(eventId)
    if (state?.status !== 'completed') return event
    const records = await this.records.findByEventId(eventId)
    const organizations = await this.repository.findByEventId(eventId, { revision: state.revision })
    const current = organizations.length === records.length && organizations.every((item) => records.some((record) => (
      record.id === item.recordId && record.updatedAt === item.sourceRecordUpdatedAt
    )))
    return current ? this.refreshEventSummary(eventId, now, event, organizations, records) : event
  }

  async refreshEventSummary(eventId, now = new Date(), knownEvent = null, knownOrganizations = null, knownRecords = null) {
    const event = knownEvent ?? await this.events.findById(eventId)
    if (!event) return null
    const records = knownRecords ?? await this.records.findByEventId(eventId)
    const organizations = knownOrganizations ?? await this.repository.findByEventId(eventId)
    const eventSummary = buildHealthEventSummary({ event, records, organizations, now })
    if (!eventSummary) {
      if (!event.eventSummary && !event.title) return event
      return this.events.update(eventId, { title: '', eventSummary: null }, now)
    }
    if (event.title === eventSummary.displayedResult.title && JSON.stringify(event.eventSummary) === JSON.stringify(eventSummary)) return event
    return this.events.update(eventId, { title: eventSummary.displayedResult.title, eventSummary }, now)
  }
}
