import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { HealthEventRepository } from './repositories/health-event-repository.mjs'
import { correctHealthEventSummary, healthEventSummaryAggregationVersion } from './health-event-summary.mjs'

const categories = new Set(['discomfort', 'reaction', 'nutrition', 'growth', 'medication', 'visit', 'other', 'fever', 'cough', 'pain', 'injury', 'allergy'])
const statuses = new Set(['observing', 'handling', 'stable', 'ended', 'recovered'])
const editableFields = new Set(['title', 'category', 'status', 'startTime', 'trackingKey'])

export class HealthEventError extends Error {
  constructor(message, status = 400, code = 'HEALTH_EVENT_ERROR') {
    super(message)
    this.status = status
    this.code = code
  }
}

function validateTitle(value) {
  const title = typeof value === 'string' ? value.trim() : ''
  if (!title || title.length > 120) throw new HealthEventError('随记标题应为 1–120 个字符', 400, 'INVALID_EVENT_TITLE')
  return title
}

function validateInitialTitle(value) {
  const title = typeof value === 'string' ? value.trim() : ''
  if (title.length > 120) throw new HealthEventError('随记标题不能超过 120 个字符', 400, 'INVALID_EVENT_TITLE')
  return title
}

function validateCategory(value) {
  if (!categories.has(value)) {
    throw new HealthEventError('随记分类无效', 400, 'INVALID_EVENT_CATEGORY')
  }
  return value
}

function validateStatus(value) {
  if (!statuses.has(value)) {
    throw new HealthEventError('随记状态无效', 400, 'INVALID_EVENT_STATUS')
  }
  return value
}

export function validateStartTime(value, now = new Date()) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    throw new HealthEventError('开始时间必须是 ISO 8601 日期时间', 400, 'INVALID_START_TIME')
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new HealthEventError('开始时间格式错误', 400, 'INVALID_START_TIME')
  if (parsed.getTime() > now.getTime()) throw new HealthEventError('发生时间不能晚于现在', 400, 'FUTURE_START_TIME')
  return parsed.toISOString()
}

export class HealthEventService {
  constructor(options = {}) {
    this.repository = options.repository ?? new HealthEventRepository(options.dataDirectory)
    this.members = options.members ?? new FamilyMemberRepository(options.dataDirectory)
    this.summaryRefresher = options.summaryRefresher ?? null
  }

  async assertMemberOwnership(accountId, memberId) {
    const member = await this.members.findById(memberId)
    if (!member || member.accountId !== accountId) {
      throw new HealthEventError('家庭成员不存在', 404, 'MEMBER_NOT_FOUND')
    }
    return member
  }

  async create(accountId, input, now = new Date()) {
    const memberId = typeof input.memberId === 'string' ? input.memberId : ''
    const startTime = input.startTime === undefined
      ? now.toISOString()
      : validateStartTime(input.startTime, now)
    const member = await this.assertMemberOwnership(accountId, memberId)
    const { isChildUnderSeven } = await import('../children/child-age.mjs')
    if (member.relationship !== 'child') throw new HealthEventError('当前版本仅支持为孩子新增记录', 409, 'CHILD_ONLY')
    if (member.recordingPausedAt) throw new HealthEventError('这个孩子已停止继续记录，历史内容仍可查看和导出', 409, 'CHILD_RECORDING_PAUSED')
    if (member.birthday && !isChildUnderSeven(member.birthday, now)) throw new HealthEventError('当前版本主要服务7岁以下儿童，既有记录仍可查看和导出。', 409, 'CHILD_AGE_LIMIT')
    return this.repository.create({
      accountId,
      memberId,
      title: validateInitialTitle(input.title),
      category: validateCategory(input.category),
      status: 'observing',
      startTime,
      recoveredAt: null
      , trackingKey: typeof input.trackingKey === 'string' ? input.trackingKey.trim().slice(0, 160) || null : null
    }, now)
  }

  async list(accountId, memberId = '') {
    let events = await this.repository.findByAccountId(accountId)
    if (memberId) events = events.filter((event) => event.memberId === memberId)
    const staleSummaries = events.filter((event) => (
      event.eventSummary && event.eventSummary.aggregationVersion !== healthEventSummaryAggregationVersion
    ))
    if (this.summaryRefresher && staleSummaries.length) {
      await Promise.all(staleSummaries.map((event) => this.summaryRefresher.ensureSummaryCurrent(accountId, event.id)))
      events = await this.repository.findByAccountId(accountId)
      if (memberId) events = events.filter((event) => event.memberId === memberId)
    }
    return events.filter((event) => event.title.trim())
  }

  async get(accountId, id, memberId = '') {
    const event = await this.repository.findById(id)
    if (!event || event.accountId !== accountId || (memberId && event.memberId !== memberId)) throw new HealthEventError('未找到这条健康随记', 404, 'HEALTH_EVENT_NOT_FOUND')
    return event
  }

  async update(accountId, id, input, now = new Date()) {
    const event = await this.get(accountId, id)
    const changes = {}
    for (const key of Object.keys(input)) {
      if (!editableFields.has(key)) continue
      if (key === 'title') changes.title = validateTitle(input.title)
      if (key === 'category') changes.category = validateCategory(input.category)
      if (key === 'status') {
        changes.status = validateStatus(input.status)
        if (changes.status === 'recovered' && event.status !== 'recovered') changes.recoveredAt = now.toISOString()
        if (changes.status !== 'recovered' && event.status === 'recovered') changes.recoveredAt = null
      }
      if (key === 'startTime') changes.startTime = validateStartTime(input.startTime, now)
      if (key === 'trackingKey') changes.trackingKey = typeof input.trackingKey === 'string' ? input.trackingKey.trim().slice(0, 160) || null : null
    }
    if (!Object.keys(changes).length) throw new HealthEventError('没有可更新的随记内容', 400, 'NO_EVENT_CHANGES')
    return this.repository.update(id, changes, now)
  }

  async delete(accountId, id) {
    await this.get(accountId, id)
    await this.repository.delete(id)
    return { success: true }
  }

  async correctSummary(accountId, id, input, now = new Date()) {
    const event = await this.get(accountId, id)
    let eventSummary
    try {
      eventSummary = correctHealthEventSummary(event.eventSummary, input, now)
    } catch (error) {
      throw new HealthEventError(error.message, 400, 'INVALID_EVENT_SUMMARY')
    }
    return this.repository.update(id, {
      title: eventSummary.displayedResult.title,
      eventSummary
    }, now)
  }
}
