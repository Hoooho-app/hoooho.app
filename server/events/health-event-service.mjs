import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { HealthEventRepository } from './repositories/health-event-repository.mjs'
import { correctHealthEventSummary, healthEventSummaryAggregationVersion } from './health-event-summary.mjs'
import { randomBytes } from 'node:crypto'

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

function validateMedicalPreparation(input) {
  const fingerprint = typeof input.sourceFingerprint === 'string' ? input.sourceFingerprint.trim() : ''
  const summary = input.summary
  if (!fingerprint || fingerprint.length > 256 || !summary || typeof summary !== 'object') {
    throw new HealthEventError('病情摘要内容无效', 400, 'INVALID_MEDICAL_PREPARATION')
  }
  const memberName = typeof summary.memberName === 'string' ? summary.memberName.trim() : ''
  const prompt = typeof summary.prompt === 'string' ? summary.prompt.trim() : ''
  const text = typeof summary.text === 'string' ? summary.text.trim() : ''
  const sections = Array.isArray(summary.sections) ? summary.sections.slice(0, 12).map((section) => ({
    id: String(section?.id ?? '').slice(0, 40),
    title: String(section?.title ?? '').trim().slice(0, 80),
    lines: Array.isArray(section?.lines) ? section.lines.slice(0, 40).map((line) => String(line).trim().slice(0, 500)).filter(Boolean) : []
  })).filter((section) => section.id && section.title && section.lines.length) : []
  if (!memberName || memberName.length > 80 || !prompt || prompt.length > 40_000 || !text || text.length > 40_000 || !sections.length) {
    throw new HealthEventError('病情摘要内容无效', 400, 'INVALID_MEDICAL_PREPARATION')
  }
  return { memberName, prompt, text, sections, selectedSourceIds: Array.isArray(summary.selectedSourceIds) ? summary.selectedSourceIds.map(String).slice(0, 12) : [] }
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
    await this.assertMemberOwnership(accountId, memberId)
    const startTime = input.startTime === undefined
      ? now.toISOString()
      : validateStartTime(input.startTime, now)
    return this.repository.create({
      accountId,
      memberId,
      title: validateInitialTitle(input.title),
      category: validateCategory(input.category),
      status: 'observing',
      startTime,
      recoveredAt: null
    }, now)
  }

  async list(accountId) {
    let events = await this.repository.findByAccountId(accountId)
    const staleSummaries = events.filter((event) => (
      event.eventSummary && event.eventSummary.aggregationVersion !== healthEventSummaryAggregationVersion
    ))
    if (this.summaryRefresher && staleSummaries.length) {
      await Promise.all(staleSummaries.map((event) => this.summaryRefresher.ensureSummaryCurrent(accountId, event.id)))
      events = await this.repository.findByAccountId(accountId)
    }
    return events.filter((event) => event.title.trim())
  }

  async listJournal(accountId) {
    // Lifestyle records need no medical summary to be visible in the journal.
    return this.repository.findByAccountId(accountId)
  }

  async get(accountId, id) {
    const event = await this.repository.findById(id)
    if (!event || event.accountId !== accountId) throw new HealthEventError('未找到这条健康随记', 404, 'HEALTH_EVENT_NOT_FOUND')
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
    }
    if (!Object.keys(changes).length) throw new HealthEventError('没有可更新的随记内容', 400, 'NO_EVENT_CHANGES')
    return this.repository.update(id, changes, now)
  }

  async delete(accountId, id) {
    await this.get(accountId, id)
    await this.repository.delete(id)
    return { success: true }
  }

  async saveMedicalPreparation(accountId, id, input, now = new Date()) {
    const event = await this.get(accountId, id)
    const summary = validateMedicalPreparation(input)
    const accountEvents = await this.repository.findByAccountId(accountId)
    const existing = accountEvents
      .filter((item) => item.memberId === event.memberId && item.medicalPreparation)
      .map((item) => item.medicalPreparation)
      .sort((left, right) => right.version - left.version)[0] ?? null
    if (existing?.sourceFingerprint === input.sourceFingerprint.trim()) {
      return { status: 'current', medicalPreparation: existing }
    }
    const timestamp = now.toISOString()
    const medicalPreparation = {
      version: existing ? existing.version + 1 : 1,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      shareToken: randomBytes(24).toString('base64url'),
      sourceFingerprint: input.sourceFingerprint.trim(),
      summary: { ...summary, generatedAt: timestamp }
    }
    const medicalPreparationSnapshots = event.medicalPreparation && existing?.shareToken === event.medicalPreparation.shareToken
      ? [...(event.medicalPreparationSnapshots ?? []), existing].slice(-20)
      : (event.medicalPreparationSnapshots ?? [])
    await this.repository.update(id, { medicalPreparation, medicalPreparationSnapshots }, now)
    return { status: existing ? 'updated' : 'created', medicalPreparation }
  }

  async getSharedMedicalPreparation(token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,80}$/.test(token)) {
      throw new HealthEventError('私密链接无效', 404, 'MEDICAL_PREPARATION_NOT_FOUND')
    }
    const event = await this.repository.findByMedicalPreparationToken(token)
    if (!event?.medicalPreparation) throw new HealthEventError('病情摘要不存在或链接已失效', 404, 'MEDICAL_PREPARATION_NOT_FOUND')
    const member = await this.members.findById(event.memberId)
    if (!member || member.accountId !== event.accountId) throw new HealthEventError('病情摘要不存在或链接已失效', 404, 'MEDICAL_PREPARATION_NOT_FOUND')
    return { ...event.medicalPreparation, eventId: event.id }
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
