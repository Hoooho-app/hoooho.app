import { createHash } from 'node:crypto'
import { AIService } from './ai-service.mjs'
import { HealthEventRepository } from '../events/repositories/health-event-repository.mjs'
import { HealthEventRecordRepository } from '../events/repositories/health-event-record-repository.mjs'
import { HealthRecordOrganizationRepository } from './repositories/health-record-organization-repository.mjs'
import { HealthOrganizationStateRepository } from './repositories/health-organization-state-repository.mjs'
import { HealthRecordPreviewRepository } from './repositories/health-record-preview-repository.mjs'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { emptyHealthAIOutput, normalizeHealthAIOutput, projectOrganizedHealthData } from './ai-types.mjs'
import { classifyExtractedHealthInput, classifyHealthInputBeforeExtraction, eligibleHealthFacts } from './health-input-intent.mjs'
import { buildHealthEventSummary, healthEventSummaryAggregationVersion } from '../events/health-event-summary.mjs'
import { resolveFactSubjects } from './health-subject-resolver.mjs'
import { applyEventHealthContext } from './health-event-context.mjs'
import {
  isQuickRecordStructuredModeEnabled,
  readQuickRecordStructuredMode,
  redactUnconfirmedQuickRecordOrganization
} from './quick-record-structured-mode.mjs'

function assertPastOccurrence(value, now = new Date()) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new HealthRecordOrganizationError('发生时间格式错误', 400, 'INVALID_OCCURRED_AT')
  if (parsed.getTime() > now.getTime()) throw new HealthRecordOrganizationError('发生时间不能晚于现在，请修改后重试。', 400, 'FUTURE_OCCURRED_AT')
  return parsed.toISOString()
}

function checksumFor(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

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
    this.previews = options.previews ?? (options.dataDirectory ? new HealthRecordPreviewRepository(options.dataDirectory) : null)
    this.members = options.members ?? (options.dataDirectory ? new FamilyMemberRepository(options.dataDirectory) : null)
    this.structuredMode = readQuickRecordStructuredMode(options.structuredMode)
    this.confirming = new Map()
  }

  structuredModeStatus() {
    return this.structuredMode
  }

  publicEventPayload(event) {
    if (isQuickRecordStructuredModeEnabled(this.structuredMode) || !event) return event
    if (Array.isArray(event)) return event.map((item) => this.publicEventPayload(item))
    if (event.eventSummary?.displayedResult?.source === 'user_corrected') return event
    return { ...event, eventSummary: null }
  }

  #publicOrganizations(organizations) {
    return organizations.map((organization) => redactUnconfirmedQuickRecordOrganization(organization, this.structuredMode))
  }

  async assertEventOwnership(accountId, eventId) {
    const event = await this.events.findById(eventId)
    if (!event || event.accountId !== accountId) throw new HealthRecordOrganizationError('未找到这条健康随记', 404, 'HEALTH_EVENT_NOT_FOUND')
    return event
  }

  async invalidate(eventId, now = new Date()) {
    if (!this.state) return { eventId, revision: 1, status: 'stale', updatedAt: now.toISOString() }
    return this.state.invalidate(eventId, now)
  }

  async recomputeEvent(accountId, eventId, options = {}, now = new Date()) {
    const event = await this.assertEventOwnership(accountId, eventId)
    if (!isQuickRecordStructuredModeEnabled(this.structuredMode)) {
      const organizations = this.#publicOrganizations(await this.repository.findByEventId(eventId))
      return { stale: false, revision: null, organizations, rawRecordOnly: true, structuredMode: this.structuredMode }
    }
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
    if (!record || record.accountId !== accountId || record.eventId !== eventId) throw new HealthRecordOrganizationError('未找到这条随记内容', 404, 'HEALTH_EVENT_RECORD_NOT_FOUND')
    if (!isQuickRecordStructuredModeEnabled(this.structuredMode)) {
      return { status: 'completed', recordId, rawRecordOnly: true, structuredMode: this.structuredMode }
    }
    const bodyLocations = readBodyLocations(input)
    const result = await this.invalidateAndRecompute(accountId, eventId, now, {
      bodyLocationsByRecord: bodyLocations.length ? { [recordId]: bodyLocations } : undefined
    })
    return result.organizations?.find((item) => item.recordId === recordId) ?? null
  }

  async preview(accountId, eventId, input, now = new Date()) {
    const event = await this.assertEventOwnership(accountId, eventId)
    if (!this.members) throw new HealthRecordOrganizationError('记录对象服务不可用', 503, 'SUBJECT_SERVICE_UNAVAILABLE')
    const eventMember = await this.members.findById(event.memberId)
    if (!eventMember || eventMember.accountId !== accountId) throw new HealthRecordOrganizationError('记录对象不存在', 404, 'SUBJECT_MEMBER_NOT_FOUND')
    const accountMembers = await this.members.findByAccountId(accountId)
    const intentBeforeExtraction = classifyHealthInputBeforeExtraction(input?.rawInput)
    if (intentBeforeExtraction) {
      const healthAIOutput = emptyHealthAIOutput()
      return { hasHealthFacts: false, intent: intentBeforeExtraction, healthAIOutput,
        eventId, memberId: event.memberId, memberName: eventMember.name,
        organizedHealthData: projectOrganizedHealthData(healthAIOutput), provider: 'intent-gate' }
    }
    const organized = await this.ai.organizeHealthRecord(input?.rawInput, { selectedOccurredAt: input?.selectedOccurredAt, timezone: input?.timezone, referenceNow: now })
    const merged = mergeStructuredHealthFacts(organized.healthAIOutput, {
      bodyLocations: readBodyLocations(input), rawInput: input?.rawInput, occurredAt: input?.selectedOccurredAt })
    const priorOrganizations = await this.repository.findByEventId(eventId)
    const extracted = applyEventHealthContext(input?.rawInput, merged, priorOrganizations, {
      selectedOccurredAt: input?.selectedOccurredAt, timezone: input?.timezone, referenceNow: now, timeResolver: this.ai.timeResolver
    })
    const subjectFacts = resolveFactSubjects(input?.rawInput, extracted.facts, eventMember, accountMembers)
    const intent = classifyExtractedHealthInput(input?.rawInput, { ...extracted, facts: subjectFacts })
    const extractedHealthAIOutput = normalizeHealthAIOutput({ ...extracted, facts: eligibleHealthFacts({ facts: subjectFacts }) })
    for (const fact of extractedHealthAIOutput.facts) {
      if (fact.time.resolvedStart) assertPastOccurrence(fact.time.resolvedStart, now)
    }
    const hasHealthFacts = ['health_fact', 'uncertain_health_fact'].includes(intent) && extractedHealthAIOutput.facts.length > 0
    if (!hasHealthFacts || !this.previews) return { hasHealthFacts, intent, healthAIOutput: extractedHealthAIOutput,
      eventId, memberId: event.memberId, memberName: eventMember.name,
      organizedHealthData: projectOrganizedHealthData(extractedHealthAIOutput), provider: organized.provider,
      structuredMode: this.structuredMode, rawRecordOnly: false }
    const inputChannel = input?.inputChannel === 'voice' ? 'voice' : 'text'
    const selectedOccurredAt = assertPastOccurrence(input?.selectedOccurredAt ?? now.toISOString(), now)
    const rawRecordOnly = !isQuickRecordStructuredModeEnabled(this.structuredMode)
    const healthAIOutput = rawRecordOnly ? emptyHealthAIOutput() : extractedHealthAIOutput
    const draft = await this.previews.create({
      accountId, eventId, memberId: event.memberId, memberName: eventMember.name,
      rawInput: input.rawInput.trim(), inputChannel, selectedOccurredAt,
      parserVersion: extractedHealthAIOutput.parserVersion, provider: organized.provider, healthAIOutput,
      rawRecordOnly, structuredMode: this.structuredMode,
      checksum: checksumFor({ accountId, eventId, memberId: event.memberId, rawInput: input.rawInput.trim(), inputChannel, healthAIOutput, rawRecordOnly })
    }, now)
    return { hasHealthFacts, intent, previewId: draft.id, eventId, memberId: event.memberId, memberName: eventMember.name,
      rawInput: draft.rawInput, inputChannel, parserVersion: draft.parserVersion, createdAt: draft.createdAt,
      expiresAt: draft.expiresAt, checksum: draft.checksum, healthAIOutput,
      organizedHealthData: projectOrganizedHealthData(healthAIOutput), provider: organized.provider,
      structuredMode: this.structuredMode, rawRecordOnly }
  }

  async confirm(accountId, eventId, input, now = new Date()) {
    const previewId = typeof input?.previewId === 'string' ? input.previewId.trim() : ''
    const idempotencyKey = typeof input?.idempotencyKey === 'string' ? input.idempotencyKey.trim() : ''
    if (!previewId) throw new HealthRecordOrganizationError('预览标识不能为空', 400, 'PREVIEW_ID_REQUIRED')
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey)) throw new HealthRecordOrganizationError('确认请求标识无效', 400, 'INVALID_IDEMPOTENCY_KEY')
    if (!this.previews) throw new HealthRecordOrganizationError('预览确认不可用', 503, 'PREVIEW_CONFIRM_UNAVAILABLE')
    if (this.confirming.has(previewId)) return this.confirming.get(previewId)
    const operation = this.#confirmDraft(accountId, eventId, previewId, idempotencyKey, now)
    this.confirming.set(previewId, operation)
    try { return await operation } finally { this.confirming.delete(previewId) }
  }

  async #confirmDraft(accountId, eventId, previewId, idempotencyKey, now) {
    const event = await this.assertEventOwnership(accountId, eventId)
    const draft = await this.previews.findById(previewId)
    if (!draft || draft.accountId !== accountId || draft.eventId !== eventId) throw new HealthRecordOrganizationError('预览不存在或无权访问', 404, 'PREVIEW_NOT_FOUND')
    if (draft.status === 'confirmed') {
      const [record, organizations] = await Promise.all([this.records.findById(draft.recordId), this.repository.findByEventId(eventId)])
      return { previewId, record, organization: redactUnconfirmedQuickRecordOrganization(organizations.find((item) => item.id === draft.organizationId) ?? null, this.structuredMode), idempotent: true, structuredMode: this.structuredMode, rawRecordOnly: Boolean(draft.rawRecordOnly) }
    }
    const committedOrganization = await this.repository.findByPreviewId(eventId, previewId)
    if (committedOrganization) {
      const record = await this.records.findById(committedOrganization.recordId)
      if (record) {
        await this.previews.markConfirmed(previewId, {
          idempotencyKey,
          recordId: record.id,
          organizationId: committedOrganization.id
        }, now)
        return { previewId, record, organization: redactUnconfirmedQuickRecordOrganization(committedOrganization, this.structuredMode), idempotent: true, structuredMode: this.structuredMode, rawRecordOnly: Boolean(draft.rawRecordOnly) }
      }
    }
    if (new Date(draft.expiresAt).getTime() <= now.getTime()) throw new HealthRecordOrganizationError('本次预览已过期，请重新整理。', 409, 'PREVIEW_EXPIRED')
    if (event.memberId !== draft.memberId || draft.healthAIOutput.facts.some((fact) => fact.subjectMemberId !== event.memberId)) {
      throw new HealthRecordOrganizationError('记录对象与预览不一致', 409, 'PREVIEW_MEMBER_MISMATCH')
    }
    const occurredAt = assertPastOccurrence(draft.selectedOccurredAt, now)
    for (const fact of draft.healthAIOutput.facts) if (fact.time.resolvedStart) assertPastOccurrence(fact.time.resolvedStart, now)
    let record = null
    let organization = null
    try {
      record = await this.records.create({
        accountId, eventId, type: 'note', content: draft.rawInput, occurredAt,
        sourceType: draft.inputChannel === 'voice' ? 'voice_record' : 'text_record',
        sourceText: draft.rawInput, measurementMethod: null, measurementDevice: null,
        note: `preview:${previewId}`
      }, now)
      const state = await this.invalidate(eventId, now)
      const output = withProvenance(draft.healthAIOutput, record, state.revision)
      organization = await this.repository.upsert({
        accountId, eventId, recordId: record.id, rawInput: draft.rawInput,
        healthAIOutput: output, status: 'completed', provider: draft.provider,
        inputChannel: draft.inputChannel, previewId, checksum: draft.checksum,
        sourceRevision: state.revision, sourceRecordUpdatedAt: record.updatedAt
      }, now)
      if (isQuickRecordStructuredModeEnabled(this.structuredMode)) await this.refreshEventSummary(eventId, now)
      if (this.state) {
        await this.state.transition(eventId, state.revision, { status: 'completed', errorCode: null, completedAt: now.toISOString() }, now)
        await this.events.update(eventId, { organizationState: { revision: state.revision, status: 'completed', errorCode: null } }, now)
      }
      await this.previews.markConfirmed(previewId, { idempotencyKey, recordId: record.id, organizationId: organization.id }, now)
      return { previewId, record, organization: redactUnconfirmedQuickRecordOrganization(organization, this.structuredMode), idempotent: false, structuredMode: this.structuredMode, rawRecordOnly: Boolean(draft.rawRecordOnly) }
    } catch (error) {
      // Once the organization exists, the preview id is a durable commit marker.
      // A retry will recover it above and finish marking the preview confirmed.
      if (record && !organization) await this.records.delete(record.id)
      throw error
    }
  }

  async list(accountId, eventId) {
    const event = await this.assertEventOwnership(accountId, eventId)
    if (!isQuickRecordStructuredModeEnabled(this.structuredMode)) {
      return this.#publicOrganizations(await this.repository.findByEventId(eventId))
    }
    if (!this.state) return this.repository.findByEventId(eventId)
    let state = await this.state.get(eventId)
    const records = await this.records.findByEventId(eventId)
    let organizations = await this.repository.findByEventId(eventId)
    const current = organizations.length === records.length && organizations.every((item) => records.some((record) => record.id === item.recordId && record.updatedAt === item.sourceRecordUpdatedAt))
    if (!current) {
      const result = await this.invalidateAndRecompute(accountId, eventId)
      state = await this.state.get(eventId); organizations = result.organizations ?? []
    } else if (event.eventSummary && event.eventSummary.aggregationVersion !== healthEventSummaryAggregationVersion) {
      await this.refreshEventSummary(eventId, new Date(), event, organizations, records)
    }
    return current || state?.status === 'completed' ? organizations : []
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
    const rawOrganizations = knownOrganizations ?? await this.repository.findByEventId(eventId)
    const organizations = this.#publicOrganizations(rawOrganizations)
    const eventSummary = buildHealthEventSummary({ event, records, organizations, now })
    if (!eventSummary) {
      if (!event.eventSummary && !event.title) return event
      return this.events.update(eventId, { title: '', eventSummary: null }, now)
    }
    if (event.title === eventSummary.displayedResult.title && JSON.stringify(event.eventSummary) === JSON.stringify(eventSummary)) return event
    return this.events.update(eventId, { title: eventSummary.displayedResult.title, eventSummary }, now)
  }
}
