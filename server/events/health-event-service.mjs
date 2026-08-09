import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { HealthEventRepository } from './repositories/health-event-repository.mjs'

const categories = new Set(['fever', 'cough', 'pain', 'injury', 'allergy', 'other'])
const statuses = new Set(['observing', 'handling', 'recovered'])
const editableFields = new Set(['title', 'category', 'status', 'startTime'])

export class HealthEventError extends Error {
  constructor(message, status = 400, code = 'HEALTH_EVENT_ERROR') {
    super(message)
    this.status = status
    this.code = code
  }
}

function validateTitle(value) {
  const title = typeof value === 'string' ? value.trim() : ''
  if (!title || title.length > 120) throw new HealthEventError('事件名称应为 1–120 个字符', 400, 'INVALID_EVENT_TITLE')
  return title
}

function validateInitialTitle(value) {
  const title = typeof value === 'string' ? value.trim() : ''
  if (title.length > 120) throw new HealthEventError('事件名称不能超过 120 个字符', 400, 'INVALID_EVENT_TITLE')
  return title
}

function validateCategory(value) {
  if (!categories.has(value)) {
    throw new HealthEventError('事件分类必须是 fever、cough、pain、injury、allergy 或 other', 400, 'INVALID_EVENT_CATEGORY')
  }
  return value
}

function validateStatus(value) {
  if (!statuses.has(value)) {
    throw new HealthEventError('事件状态必须是 observing、handling 或 recovered', 400, 'INVALID_EVENT_STATUS')
  }
  return value
}

function validateStartTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    throw new HealthEventError('开始时间必须是 ISO 8601 日期时间', 400, 'INVALID_START_TIME')
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new HealthEventError('开始时间格式错误', 400, 'INVALID_START_TIME')
  return parsed.toISOString()
}

export class HealthEventService {
  constructor(options = {}) {
    this.repository = options.repository ?? new HealthEventRepository(options.dataDirectory)
    this.members = options.members ?? new FamilyMemberRepository(options.dataDirectory)
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
    await this.assertMemberOwnership(accountId, memberId)
    return this.repository.create({
      accountId,
      memberId,
      title: validateInitialTitle(input.title),
      category: validateCategory(input.category),
      status: 'observing',
      startTime: validateStartTime(input.startTime)
    }, now)
  }

  async list(accountId) {
    return this.repository.findByAccountId(accountId)
  }

  async get(accountId, id) {
    const event = await this.repository.findById(id)
    if (!event || event.accountId !== accountId) throw new HealthEventError('健康事件不存在', 404, 'HEALTH_EVENT_NOT_FOUND')
    return event
  }

  async update(accountId, id, input, now = new Date()) {
    await this.get(accountId, id)
    const changes = {}
    for (const key of Object.keys(input)) {
      if (!editableFields.has(key)) continue
      if (key === 'title') changes.title = validateTitle(input.title)
      if (key === 'category') changes.category = validateCategory(input.category)
      if (key === 'status') changes.status = validateStatus(input.status)
      if (key === 'startTime') changes.startTime = validateStartTime(input.startTime)
    }
    if (!Object.keys(changes).length) throw new HealthEventError('没有可更新的事件字段', 400, 'NO_EVENT_CHANGES')
    return this.repository.update(id, changes, now)
  }

  async delete(accountId, id) {
    await this.get(accountId, id)
    await this.repository.delete(id)
    return { success: true }
  }
}
