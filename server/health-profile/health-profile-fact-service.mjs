import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { HealthEventRepository } from '../events/repositories/health-event-repository.mjs'
import { HealthEventRecordRepository } from '../events/repositories/health-event-record-repository.mjs'
import { HealthRecordOrganizationRepository } from '../ai/repositories/health-record-organization-repository.mjs'
import { HealthProfileFactRepository } from './repositories/health-profile-fact-repository.mjs'

const categories = new Set(['important', 'allergy', 'medication', 'chronic', 'surgery', 'other'])
const statuses = new Set(['pending', 'confirmed', 'removed'])
const eligibleTypes = new Set(['symptom', 'medication', 'visit', 'examination', 'diagnosis', 'concern', 'other'])

export class HealthProfileFactError extends Error {
  constructor(message, status = 400, code = 'HEALTH_PROFILE_FACT_ERROR') {
    super(message)
    this.status = status
    this.code = code
  }
}

function requiredText(value, label, maxLength) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text || text.length > maxLength) throw new HealthProfileFactError(`${label}应为 1–${maxLength} 个字符`, 400, 'INVALID_HEALTH_PROFILE_FACT')
  return text
}

function optionalText(value, maxLength) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (text.length > maxLength) throw new HealthProfileFactError(`内容不能超过 ${maxLength} 个字符`, 400, 'INVALID_HEALTH_PROFILE_FACT')
  return text
}

function dateValue(value, label) {
  const parsed = new Date(value)
  if (typeof value !== 'string' || Number.isNaN(parsed.getTime())) throw new HealthProfileFactError(`${label}格式错误`, 400, 'INVALID_HEALTH_PROFILE_FACT_DATE')
  return parsed.toISOString()
}

function categoryValue(value) {
  if (!categories.has(value)) throw new HealthProfileFactError('归档分类无效', 400, 'INVALID_HEALTH_PROFILE_FACT_CATEGORY')
  return value
}

function statusValue(value) {
  if (!statuses.has(value)) throw new HealthProfileFactError('事实状态无效', 400, 'INVALID_HEALTH_PROFILE_FACT_STATUS')
  return value
}

function suggestedCategory(type) {
  if (type === 'medication') return 'medication'
  if (type === 'diagnosis') return 'chronic'
  return 'important'
}

function candidateKey(organizationId, sourceFactId) {
  return `${organizationId}:${sourceFactId}`
}

function isCandidateFact(fact) {
  return eligibleTypes.has(fact.type)
    && fact.polarity !== 'negated'
    && fact.temporality !== 'future'
    && fact.subject !== 'family_member'
    && fact.subject !== 'other_person'
}

export class HealthProfileFactService {
  constructor(options = {}) {
    this.repository = options.repository ?? new HealthProfileFactRepository(options.dataDirectory)
    this.members = options.members ?? new FamilyMemberRepository(options.dataDirectory)
    this.events = options.events ?? new HealthEventRepository(options.dataDirectory)
    this.records = options.records ?? new HealthEventRecordRepository(options.dataDirectory)
    this.organizations = options.organizations ?? new HealthRecordOrganizationRepository(options.dataDirectory)
  }

  async assertMember(accountId, memberId) {
    const member = await this.members.findById(memberId)
    if (!member || member.accountId !== accountId) throw new HealthProfileFactError('家庭成员不存在', 404, 'MEMBER_NOT_FOUND')
    return member
  }

  async get(accountId, factId) {
    const fact = await this.repository.findById(factId)
    if (!fact || fact.accountId !== accountId) throw new HealthProfileFactError('重要健康事实不存在', 404, 'HEALTH_PROFILE_FACT_NOT_FOUND')
    return fact
  }

  async list(accountId, memberId) {
    await this.assertMember(accountId, memberId)
    return (await this.repository.findByMemberId(memberId)).filter((fact) => fact.accountId === accountId)
  }

  async #candidateFromSource(accountId, memberId, organizationId, sourceFactId) {
    await this.assertMember(accountId, memberId)
    const events = (await this.events.findByAccountId(accountId)).filter((event) => event.memberId === memberId)
    for (const event of events) {
      const organization = (await this.organizations.findByEventId(event.id)).find((item) => item.id === organizationId)
      if (!organization || organization.accountId !== accountId) continue
      const sourceFact = organization.healthAIOutput.facts.find((item) => item.id === sourceFactId)
      if (!sourceFact || !isCandidateFact(sourceFact)) break
      const record = await this.records.findById(organization.recordId)
      if (!record || record.accountId !== accountId || record.eventId !== event.id) break
      const firstObservedAt = sourceFact.time?.resolvedStart || record.occurredAt
      return {
        id: candidateKey(organization.id, sourceFact.id),
        memberId,
        title: requiredText(sourceFact.name || sourceFact.concept || sourceFact.sourceText, '事实名称', 120),
        description: optionalText(sourceFact.originalText || sourceFact.sourceText || record.content, 500),
        suggestedCategory: suggestedCategory(sourceFact.type),
        firstObservedAt,
        source: {
          organizationId: organization.id,
          sourceFactId: sourceFact.id,
          eventId: event.id,
          eventTitle: event.title,
          eventStartTime: event.startTime,
          recordId: record.id,
          recordOccurredAt: record.occurredAt,
          originalText: record.content
        }
      }
    }
    throw new HealthProfileFactError('候选健康信息不存在或已失效', 404, 'HEALTH_PROFILE_CANDIDATE_NOT_FOUND')
  }

  async listCandidates(accountId, memberId) {
    await this.assertMember(accountId, memberId)
    const archived = new Set((await this.repository.findByMemberId(memberId)).flatMap((fact) => fact.sources.map((source) => candidateKey(source.organizationId, source.sourceFactId))))
    const events = (await this.events.findByAccountId(accountId)).filter((event) => event.memberId === memberId)
    const candidates = []
    for (const event of events) {
      for (const organization of await this.organizations.findByEventId(event.id)) {
        for (const sourceFact of organization.healthAIOutput.facts.filter(isCandidateFact)) {
          const key = candidateKey(organization.id, sourceFact.id)
          if (archived.has(key)) continue
          try {
            candidates.push(await this.#candidateFromSource(accountId, memberId, organization.id, sourceFact.id))
          } catch {
            // A stale organization without its original record is not traceable and must not be offered.
          }
        }
      }
    }
    return candidates.sort((left, right) => right.firstObservedAt.localeCompare(left.firstObservedAt) || left.id.localeCompare(right.id))
  }

  async create(accountId, input, now = new Date()) {
    const memberId = typeof input?.memberId === 'string' ? input.memberId : ''
    const source = input?.source ?? {}
    const candidate = await this.#candidateFromSource(accountId, memberId, source.organizationId, source.sourceFactId)
    const existing = await this.repository.findByMemberId(memberId)
    if (existing.some((fact) => fact.sources.some((item) => item.organizationId === source.organizationId && item.sourceFactId === source.sourceFactId))) {
      throw new HealthProfileFactError('这条来源已经加入健康档案', 409, 'HEALTH_PROFILE_SOURCE_EXISTS')
    }
    return this.repository.create({
      accountId,
      memberId,
      category: categoryValue(input.category ?? candidate.suggestedCategory),
      title: requiredText(input.title ?? candidate.title, '事实名称', 120),
      description: optionalText(input.description ?? candidate.description, 500),
      status: statusValue(input.status ?? 'pending'),
      sources: [candidate.source],
      firstObservedAt: input.firstObservedAt ? dateValue(input.firstObservedAt, '首次发现时间') : dateValue(candidate.firstObservedAt, '首次发现时间'),
      notes: optionalText(input.notes, 1000)
    }, now)
  }

  async update(accountId, factId, input, now = new Date()) {
    await this.get(accountId, factId)
    const changes = {}
    if (Object.hasOwn(input, 'title')) changes.title = requiredText(input.title, '事实名称', 120)
    if (Object.hasOwn(input, 'category')) changes.category = categoryValue(input.category)
    if (Object.hasOwn(input, 'status')) changes.status = statusValue(input.status)
    if (Object.hasOwn(input, 'firstObservedAt')) changes.firstObservedAt = dateValue(input.firstObservedAt, '首次发现时间')
    if (Object.hasOwn(input, 'notes')) changes.notes = optionalText(input.notes, 1000)
    if (!Object.keys(changes).length) throw new HealthProfileFactError('没有可更新的事实字段', 400, 'NO_HEALTH_PROFILE_FACT_CHANGES')
    return this.repository.update(factId, changes, now)
  }

  async addSource(accountId, factId, input, now = new Date()) {
    const fact = await this.get(accountId, factId)
    const candidate = await this.#candidateFromSource(accountId, fact.memberId, input?.organizationId, input?.sourceFactId)
    if (fact.sources.some((source) => source.organizationId === input.organizationId && source.sourceFactId === input.sourceFactId)) return fact
    const allFacts = await this.repository.findByMemberId(fact.memberId)
    if (allFacts.some((item) => item.id !== fact.id && item.sources.some((source) => source.organizationId === input.organizationId && source.sourceFactId === input.sourceFactId))) {
      throw new HealthProfileFactError('这条来源已关联到其他健康事实', 409, 'HEALTH_PROFILE_SOURCE_EXISTS')
    }
    return this.repository.update(factId, { sources: [...fact.sources, candidate.source] }, now)
  }
}
