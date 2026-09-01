import { createHash } from 'node:crypto'
import { HealthRecordOrganizationRepository } from '../ai/repositories/health-record-organization-repository.mjs'
import { isConfirmedDiagnosis, isConsumedMedication, isCurrentPositiveSymptom } from '../ai/health-fact-policy.mjs'
import { isQuickRecordStructuredModeEnabled, readQuickRecordStructuredMode } from '../ai/quick-record-structured-mode.mjs'
import { HealthEventRecordRepository } from '../events/repositories/health-event-record-repository.mjs'
import { HealthEventRepository } from '../events/repositories/health-event-repository.mjs'
import { HealthInformationCandidateRepository } from './repositories/health-information-candidate-repository.mjs'
import { HealthProfileFactService } from '../health-profile/health-profile-fact-service.mjs'

const categories = new Set(['adverse_reaction', 'chronic_condition', 'long_term_medication', 'important_health_fact'])
const statuses = new Set(['pending', 'confirmed', 'dismissed'])
const destinations = new Set(['allergy_adverse_reaction', 'chronic_condition', 'long_term_medication', 'important_health_fact'])
const categoryDestinations = {
  adverse_reaction: new Set(['allergy_adverse_reaction', 'important_health_fact']),
  chronic_condition: new Set(['chronic_condition', 'important_health_fact']),
  long_term_medication: new Set(['long_term_medication', 'important_health_fact']),
  important_health_fact: new Set(['important_health_fact'])
}
const profileCategory = {
  allergy_adverse_reaction: 'allergy',
  chronic_condition: 'chronic',
  long_term_medication: 'medication',
  important_health_fact: 'important'
}

export class HealthInformationCandidateError extends Error {
  constructor(message, status = 400, code = 'HEALTH_INFORMATION_CANDIDATE_ERROR') {
    super(message)
    this.status = status
    this.code = code
  }
}

const compact = (value, max = 240) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const unique = (values) => [...new Set(values.filter(Boolean))]
const effectiveTime = (record) => record.occurredAt || record.createdAt

function fingerprintOf(proposal) {
  return createHash('sha256').update(JSON.stringify([
    proposal.sourceEventId,
    proposal.category,
    proposal.title,
    [...proposal.sourceRecordIds].sort()
  ])).digest('hex')
}

function relationMentionsMedicationThenReaction(text, medication, reaction) {
  const value = compact(text, 500)
  if (!value || !medication || !reaction) return false
  const medicationIndex = value.indexOf(medication)
  const reactionIndex = value.indexOf(reaction)
  return medicationIndex >= 0 && reactionIndex > medicationIndex && /(?:后|之后|以后|用药|吃药|服用)/.test(value)
}

function createProposals(event, records, organizations) {
  const recordById = new Map(records.map((record) => [record.id, record]))
  const facts = organizations.flatMap((organization) => (
    organization.healthAIOutput?.facts ?? []
  ).map((fact) => ({ fact, organization, record: recordById.get(organization.recordId) })).filter((item) => item.record))
  const proposals = []

  for (const organization of organizations) {
    const record = recordById.get(organization.recordId)
    if (!record) continue
    const recordFacts = (organization.healthAIOutput?.facts ?? []).filter((fact) => fact.subject === 'event_subject')
    const medications = recordFacts.filter(isConsumedMedication)
    const reactions = recordFacts.filter((fact) => isCurrentPositiveSymptom(fact) && /皮疹|红疹|红点|瘙痒|肿胀|呼吸困难|恶心|呕吐|腹泻/.test(fact.name))
    for (const medication of medications) {
      const related = reactions.filter((reaction) => relationMentionsMedicationThenReaction(record.sourceText || record.content, medication.name, reaction.name))
      if (!related.length) continue
      proposals.push({
        sourceEventId: event.id,
        sourceRecordIds: [record.id],
        sourceFactIds: unique([medication.id, ...related.map((item) => item.id)]),
        sourceLinks: unique([medication.id, ...related.map((item) => item.id)]).map((sourceFactId) => ({ organizationId: organization.id, sourceFactId })),
        category: 'adverse_reaction',
        title: `${medication.name}相关反应`,
        description: `记录中提到用药后出现${unique(related.map((item) => item.name)).join('、')}，可由你决定是否长期保存。`,
        firstDiscoveredAt: effectiveTime(record)
      })
    }
  }

  const symptomsByName = new Map()
  const medicationsByName = new Map()
  for (const item of facts) {
    if (isCurrentPositiveSymptom(item.fact)) {
      const bucket = symptomsByName.get(item.fact.name) ?? []
      bucket.push(item)
      symptomsByName.set(item.fact.name, bucket)
    }
    if (isConsumedMedication(item.fact)) {
      const bucket = medicationsByName.get(item.fact.name) ?? []
      bucket.push(item)
      medicationsByName.set(item.fact.name, bucket)
    }
    if (isConfirmedDiagnosis(item.fact) && ['doctor_statement', 'test_result'].includes(item.fact.source)) {
      proposals.push({
        sourceEventId: event.id,
        sourceRecordIds: [item.record.id],
        sourceFactIds: [item.fact.id],
        sourceLinks: [{ organizationId: item.organization.id, sourceFactId: item.fact.id }],
        category: 'important_health_fact',
        title: `${item.fact.name}明确记录`,
        description: '来源记录中包含医生或检查明确记录的信息，可由你决定是否长期保存。',
        firstDiscoveredAt: effectiveTime(item.record)
      })
    }
  }

  for (const [name, entries] of symptomsByName) {
    const byRecord = [...new Map(entries.map((entry) => [entry.record.id, entry])).values()]
    if (byRecord.length < 3) continue
    proposals.push({
      sourceEventId: event.id,
      sourceRecordIds: byRecord.map((entry) => entry.record.id),
      sourceFactIds: unique(byRecord.map((entry) => entry.fact.id)),
      sourceLinks: byRecord.map((entry) => ({ organizationId: entry.organization.id, sourceFactId: entry.fact.id })),
      category: 'chronic_condition',
      title: `${name}反复记录`,
      description: `${name}在本次事件中多次出现，可由你决定是否作为长期健康问题保存。`,
      firstDiscoveredAt: byRecord.map((entry) => effectiveTime(entry.record)).sort()[0]
    })
  }

  for (const [name, entries] of medicationsByName) {
    const byRecord = [...new Map(entries.map((entry) => [entry.record.id, entry])).values()]
    const times = byRecord.map((entry) => new Date(effectiveTime(entry.record)).getTime()).filter(Number.isFinite).sort((a, b) => a - b)
    if (byRecord.length < 3 || times.length < 2 || times.at(-1) - times[0] < 14 * 24 * 60 * 60 * 1000) continue
    proposals.push({
      sourceEventId: event.id,
      sourceRecordIds: byRecord.map((entry) => entry.record.id),
      sourceFactIds: unique(byRecord.map((entry) => entry.fact.id)),
      sourceLinks: byRecord.map((entry) => ({ organizationId: entry.organization.id, sourceFactId: entry.fact.id })),
      category: 'long_term_medication',
      title: `${name}持续用药记录`,
      description: `${name}在较长时间内被多次记录，可由你决定是否作为长期用药保存。`,
      firstDiscoveredAt: new Date(times[0]).toISOString()
    })
  }

  return proposals.filter((proposal) => categories.has(proposal.category))
}

export class HealthInformationCandidateService {
  constructor(options = {}) {
    this.events = options.events ?? new HealthEventRepository(options.dataDirectory)
    this.records = options.records ?? new HealthEventRecordRepository(options.dataDirectory)
    this.organizations = options.organizations ?? new HealthRecordOrganizationRepository(options.dataDirectory)
    this.repository = options.repository ?? new HealthInformationCandidateRepository(options.dataDirectory)
    this.profileFacts = options.profileFacts ?? new HealthProfileFactService(options)
    this.structuredMode = readQuickRecordStructuredMode(options.structuredMode)
  }

  async assertEvent(accountId, eventId) {
    const event = await this.events.findById(eventId)
    if (!event || event.accountId !== accountId) throw new HealthInformationCandidateError('健康事件不存在', 404, 'HEALTH_EVENT_NOT_FOUND')
    return event
  }

  async publicCandidate(candidate, event, records) {
    const recordById = new Map(records.map((record) => [record.id, record]))
    return {
      id: candidate.id,
      memberId: candidate.memberId,
      sourceEventId: candidate.sourceEventId,
      sourceRecordIds: candidate.sourceRecordIds,
      sourceFactIds: candidate.sourceFactIds,
      category: candidate.category,
      title: candidate.title,
      description: candidate.description,
      status: candidate.status,
      destinationProfileSection: candidate.destinationProfileSection,
      note: candidate.note,
      relatedCandidateId: candidate.relatedCandidateId,
      firstDiscoveredAt: candidate.firstDiscoveredAt,
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
      confirmedAt: candidate.confirmedAt,
      dismissedAt: candidate.dismissedAt,
      profileFactId: candidate.profileFactId ?? null,
      sourceEvent: { id: event.id, title: event.title, category: event.category, startTime: event.startTime },
      sourceRecords: candidate.sourceRecordIds.map((id) => recordById.get(id)).filter(Boolean).map((record) => ({
        id: record.id,
        occurredAt: record.occurredAt,
        sourceType: record.sourceType,
        content: record.sourceText || record.content
      }))
    }
  }

  async list(accountId, eventId) {
    const event = await this.assertEvent(accountId, eventId)
    const [candidates, records] = await Promise.all([this.repository.findByEventId(eventId), this.records.findByEventId(eventId)])
    return Promise.all(candidates.filter((candidate) => candidate.accountId === accountId).map((candidate) => this.publicCandidate(candidate, event, records)))
  }

  async discover(accountId, eventId, now = new Date()) {
    const event = await this.assertEvent(accountId, eventId)
    if (!isQuickRecordStructuredModeEnabled(this.structuredMode)) return this.list(accountId, eventId)
    const [records, organizations] = await Promise.all([
      this.records.findByEventId(eventId),
      this.organizations.findByEventId(eventId)
    ])
    const proposals = createProposals(event, records, organizations)
    const memberCandidates = await this.repository.findByMemberId(event.memberId)
    for (const proposal of proposals) {
      const fingerprint = fingerprintOf(proposal)
      if (await this.repository.findByFingerprint(fingerprint)) continue
      const related = memberCandidates.find((candidate) => candidate.accountId === accountId && candidate.category === proposal.category && candidate.title === proposal.title)
      const created = await this.repository.create({
        accountId,
        memberId: event.memberId,
        ...proposal,
        fingerprint,
        relatedCandidateId: related?.id ?? null
      }, now)
      memberCandidates.push(created)
    }
    return this.list(accountId, eventId)
  }

  async update(accountId, candidateId, input, now = new Date()) {
    const candidate = await this.repository.findById(candidateId)
    if (!candidate || candidate.accountId !== accountId) throw new HealthInformationCandidateError('待确认健康信息不存在', 404, 'HEALTH_INFORMATION_CANDIDATE_NOT_FOUND')
    const status = compact(input?.status, 20)
    if (!statuses.has(status) || status === 'pending') throw new HealthInformationCandidateError('仅支持确认加入或暂不处理', 400, 'INVALID_CANDIDATE_STATUS')
    const changes = { status }
    if (status === 'confirmed') {
      const destination = compact(input?.destinationProfileSection, 40)
      if (!destinations.has(destination) || !categoryDestinations[candidate.category]?.has(destination)) {
        throw new HealthInformationCandidateError('请选择合适的归档位置', 400, 'INVALID_PROFILE_DESTINATION')
      }
      changes.destinationProfileSection = destination
      changes.note = compact(input?.note, 500) || null
      changes.confirmedAt = now.toISOString()
      changes.dismissedAt = null
      let profileFact = candidate.profileFactId ? await this.profileFacts.get(accountId, candidate.profileFactId) : null
      if (!profileFact) profileFact = await this.profileFacts.findBySource(accountId, candidate.memberId, candidate.sourceLinks[0])
      if (!profileFact) profileFact = await this.profileFacts.createFromCandidateSources(accountId, {
        memberId: candidate.memberId,
        title: candidate.title,
        category: profileCategory[destination],
        description: candidate.description,
        firstObservedAt: candidate.firstDiscoveredAt,
        notes: changes.note ?? '',
        sources: candidate.sourceLinks
      }, now)
      else if (profileFact.status === 'removed') profileFact = await this.profileFacts.update(accountId, profileFact.id, { status: 'confirmed' }, now)
      changes.profileFactId = profileFact.id
    } else {
      changes.destinationProfileSection = null
      changes.note = null
      changes.confirmedAt = null
      changes.dismissedAt = now.toISOString()
    }
    const updated = await this.repository.update(candidateId, changes, now)
    const event = await this.assertEvent(accountId, candidate.sourceEventId)
    const records = await this.records.findByEventId(candidate.sourceEventId)
    return this.publicCandidate(updated, event, records)
  }
}
