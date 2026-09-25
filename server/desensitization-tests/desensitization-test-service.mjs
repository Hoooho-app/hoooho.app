import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { JsonStore } from '../auth/storage/json-store.mjs'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { HealthEventRepository } from '../events/repositories/health-event-repository.mjs'
import { HealthEventRecordRepository } from '../events/repositories/health-event-record-repository.mjs'

const dayMs = 86_400_000
const statuses = new Set(['active', 'archived'])
const symptomAnswers = new Set(['present', 'absent'])
const exposureAnswers = new Set(['eaten', 'not_eaten'])
const symptomCatalog = new Set(['红疹', '瘙痒', '风团', '肿胀', '腹痛', '呕吐', '腹泻', '便血', '咳嗽', '喘鸣', '呼吸困难', '喉咙紧'])
const severeSymptoms = new Set(['呼吸困难', '喉咙紧'])

const definitions = [
  { key: 'beef', label: '牛肉类', confirmed: ['牛肉', '牛肉泥', '炖牛肉'], candidates: ['牛肉丸', '牛肉饼', '牛肉肠'] },
  { key: 'cow_milk', label: '牛奶类', confirmed: ['牛奶', '纯牛奶', '全脂牛奶', '酸奶', '奶酪'], candidates: ['奶味零食', '奶油蛋糕', '奶糖'] },
  { key: 'egg', label: '鸡蛋类', confirmed: ['鸡蛋', '蛋黄', '蛋白', '鸡蛋黄', '鸡蛋白'], candidates: ['蛋糕', '蛋挞', '面包'] },
  { key: 'wheat', label: '小麦类', confirmed: ['小麦', '小麦粉'], candidates: ['面条', '馒头', '面包', '蛋糕'] },
  { key: 'peanut', label: '花生类', confirmed: ['花生', '花生酱'], candidates: ['混合坚果', '花生味零食'] },
  { key: 'soy', label: '大豆类', confirmed: ['大豆', '黄豆', '豆浆', '豆腐'], candidates: ['豆制品', '酱料'] }
]

const normalizeName = (value) => String(value ?? '').trim().replace(/\s+/g, '').slice(0, 30)
const definitionForName = (name) => definitions.find((item) => item.confirmed.includes(normalizeName(name))) ?? null
const definitionForKey = (key) => definitions.find((item) => item.key === key) ?? null

export class DesensitizationTestError extends Error {
  constructor(message, status = 400, code = 'DESENSITIZATION_TEST_ERROR', details) {
    super(message); this.status = status; this.code = code; if (details) this.details = details
  }
}

export function classifyFoodName(rawName) {
  const name = normalizeName(rawName)
  if (!name) throw new DesensitizationTestError('请输入食物名称', 400, 'EMPTY_FOOD_NAME')
  if (name === '牛') throw new DesensitizationTestError('请区分牛肉或牛奶', 422, 'AMBIGUOUS_FOOD', { choices: ['牛肉', '牛奶'] })
  const definition = definitionForName(name)
  return definition ? { categoryKey: definition.key, categoryLabel: definition.label, confidence: 'confirmed' } : { categoryKey: `custom:${name.toLocaleLowerCase('zh-CN')}`, categoryLabel: `${name}（单独观察）`, confidence: 'custom' }
}

function cleanText(value, limit, required = false) {
  const text = typeof value === 'string' ? value.trim() : ''
  if ((required && !text) || text.length > limit) throw new DesensitizationTestError(required ? '请填写完整信息' : '填写内容过长')
  return text
}

function localDateKey(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function validOccurredAt(value, now) {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) throw new DesensitizationTestError('请填写发生或观察时间', 400, 'INVALID_OCCURRED_AT')
  if (date.getTime() > now.getTime()) throw new DesensitizationTestError('发生或观察时间不能晚于现在', 400, 'FUTURE_OCCURRED_AT')
  return date.toISOString()
}

function normalizeRecord(input, now, previous = null) {
  const status = input?.status === 'draft' ? 'draft' : 'effective'
  const symptomAnswer = symptomAnswers.has(input?.symptomAnswer) ? input.symptomAnswer : null
  const exposureAnswer = exposureAnswers.has(input?.exposureAnswer) ? input.exposureAnswer : null
  const symptoms = [...new Set((Array.isArray(input?.symptoms) ? input.symptoms : []).map(String).filter((item) => symptomCatalog.has(item)))]
  const note = cleanText(input?.note, 1000)
  if (status === 'effective' && (!symptomAnswer || !exposureAnswer)) throw new DesensitizationTestError('请分别选择症状情况和是否吃过', 400, 'INCOMPLETE_OBSERVATION')
  if (symptomAnswer === 'present' && !symptoms.length && !note) throw new DesensitizationTestError('请选择具体症状，或补充其他表现', 400, 'MISSING_SYMPTOM_DETAIL')
  return {
    ...(previous ?? {}), status, symptomAnswer, exposureAnswer,
    symptoms: symptomAnswer === 'present' ? symptoms : [], note,
    actualFood: cleanText(input?.actualFood, 120), preparation: cleanText(input?.preparation, 120), amount: cleanText(input?.amount, 80),
    occurredAt: validOccurredAt(input?.occurredAt, now),
    source: 'caregiver_record', idempotencyKey: cleanText(input?.idempotencyKey, 180),
    withdrawnAt: null
  }
}

function normalizePlan(input, nextVersion, now) {
  const sourceType = input?.sourceType === 'verified_source' ? 'verified_source' : 'caregiver_transcription'
  const fields = {
    sourceType, sourceName: cleanText(input?.sourceName, 160), visitDate: cleanText(input?.visitDate, 10),
    food: cleanText(input?.food, 120), preparation: cleanText(input?.preparation, 160),
    firstAmount: cleanText(input?.firstAmount, 40), unit: cleanText(input?.unit, 30),
    location: cleanText(input?.location, 120), frequency: cleanText(input?.frequency, 120),
    observationPeriod: cleanText(input?.observationPeriod, 160), progressionCondition: cleanText(input?.progressionCondition, 500),
    stopRule: cleanText(input?.stopRule, 500), reviewDate: cleanText(input?.reviewDate, 10)
  }
  const complete = Boolean(fields.sourceName && fields.food && fields.firstAmount && fields.unit && fields.location && fields.observationPeriod && fields.stopRule)
  return { id: randomUUID(), version: nextVersion, ...fields, complete, createdAt: now.toISOString() }
}

function linkType(food, task) {
  const normalized = normalizeName(food)
  const definition = definitionForKey(task.categoryKey)
  if (definition?.confirmed.includes(normalized)) return 'confirmed'
  if (definition?.candidates.includes(normalized)) return 'pending'
  if (task.categoryKey.startsWith('custom:') && normalized.toLocaleLowerCase('zh-CN') === task.categoryKey.slice(7)) return 'confirmed'
  return null
}

function recordFoods(record) {
  const diet = record.journal?.diet
  if (!record.journal?.categories?.includes('diet') || !diet) return []
  return [...new Set((diet.foods ?? []).map(normalizeName).filter(Boolean))]
}

export class DesensitizationTestService {
  constructor(options = {}) {
    this.store = new JsonStore(path.join(options.dataDirectory, 'desensitization-tests.json'), { tasks: [], records: [] })
    this.members = options.members ?? new FamilyMemberRepository(options.dataDirectory)
    this.events = options.events ?? new HealthEventRepository(options.dataDirectory)
    this.healthRecords = options.healthRecords ?? new HealthEventRecordRepository(options.dataDirectory)
  }

  async assertMember(accountId, memberId) {
    const member = await this.members.findById(memberId)
    if (!member || member.accountId !== accountId) throw new DesensitizationTestError('未找到当前记录对象', 404, 'MEMBER_NOT_FOUND')
    return member
  }

  async owned(accountId, id, includeDeleted = false) {
    const data = await this.store.read()
    const task = data.tasks.find((item) => item.id === id && item.accountId === accountId && (includeDeleted || item.status !== 'deleted'))
    if (!task) throw new DesensitizationTestError('未找到这项排敏测试', 404, 'DESENSITIZATION_TEST_NOT_FOUND')
    return task
  }

  async healthContext(accountId, memberId, now) {
    const [events, records] = await Promise.all([this.events.findByAccountId(accountId), this.healthRecords.findByAccountId(accountId)])
    const eventIds = new Set(events.filter((item) => item.memberId === memberId).map((item) => item.id))
    const memberRecords = records.filter((item) => eventIds.has(item.eventId))
    const cutoff = now.getTime() - 30 * dayMs
    const foodStats = new Map()
    for (const record of memberRecords) {
      if (Date.parse(record.occurredAt) < cutoff) continue
      for (const food of recordFoods(record)) {
        const previous = foodStats.get(food) ?? { name: food, count: 0, latestAt: '' }
        previous.count += 1; if (record.occurredAt > previous.latestAt) previous.latestAt = record.occurredAt
        foodStats.set(food, previous)
      }
    }
    const suggestions = [...foodStats.values()].filter((item) => item.count >= 3).sort((a, b) => b.count - a.count || b.latestAt.localeCompare(a.latestAt)).slice(0, 4)
    return { memberRecords, suggestions }
  }

  async publicTask(data, task, memberRecords, timeZone, now) {
    const records = data.records.filter((item) => item.taskId === task.id && !item.withdrawnAt).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.createdAt.localeCompare(a.createdAt))
    const linkedRecords = []
    for (const record of memberRecords) {
      const foods = recordFoods(record); const matched = foods.map((food) => ({ food, relation: linkType(food, task) })).filter((item) => item.relation)
      if (!matched.length) continue
      linkedRecords.push({ recordId: record.id, eventId: record.eventId, occurredAt: record.occurredAt, sourceText: record.sourceText, content: record.content, foods, amount: record.journal?.diet?.amount ?? '', preparation: record.journal?.diet?.foodForm ?? '', reactions: record.journal?.diet?.reactions ?? [], relation: matched.some((item) => item.relation === 'confirmed') ? 'confirmed' : 'pending', matchedFoods: matched.map((item) => item.food) })
    }
    const trend = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now.getTime() - (6 - index) * dayMs); const day = localDateKey(date, timeZone)
      const items = records.filter((item) => item.status === 'effective' && localDateKey(new Date(item.occurredAt), timeZone) === day)
      const state = items.some((item) => item.symptomAnswer === 'present') ? 'symptom' : items.length && items.every((item) => item.symptomAnswer === 'absent') ? 'clear' : 'unknown'
      return { day, state, recordIds: items.map((item) => item.id) }
    })
    const effective = records.filter((item) => item.status === 'effective')
    const latest = effective[0] ?? null
    let consecutiveClear = 0
    for (const item of effective) { if (item.symptomAnswer !== 'absent') break; consecutiveClear += 1 }
    const latestSummary = !latest ? '还没有观察记录' : latest.symptomAnswer === 'present' ? `${localDateKey(new Date(latest.occurredAt), timeZone)}记录症状` : `最近${consecutiveClear}次未见症状`
    const nextStep = task.progressionPaused ? '已暂停进阶，请按已有安排处理并联系医疗团队' : latest?.symptomAnswer === 'present' ? '查看这次记录与处理经过' : trend.filter((item) => item.state === 'unknown').length >= 3 ? '看看哪些日期资料不足' : task.planVersions.at(-1)?.reviewDate ? `${task.planVersions.at(-1).reviewDate} 按已录入安排复评` : '查看变化与下一步'
    return { ...task, records, linkedRecords, trend, suggestions: undefined, latestSummary, nextStep, currentPlan: task.planVersions.at(-1) ?? null }
  }

  async list(accountId, memberId, now = new Date(), timeZone = 'Asia/Shanghai') {
    await this.assertMember(accountId, memberId)
    const [data, context] = await Promise.all([this.store.read(), this.healthContext(accountId, memberId, now)])
    const tasks = await Promise.all(data.tasks.filter((item) => item.accountId === accountId && item.memberId === memberId && item.status !== 'deleted').map((task) => this.publicTask(data, task, context.memberRecords, timeZone, now)))
    return { tasks, suggestions: context.suggestions }
  }

  async create(accountId, input, now = new Date(), timeZone = 'Asia/Shanghai') {
    const memberId = cleanText(input?.memberId, 180, true); await this.assertMember(accountId, memberId)
    const displayName = normalizeName(input?.displayName); const classification = classifyFoodName(displayName)
    let result
    await this.store.update((data) => {
      const existing = data.tasks.find((item) => item.accountId === accountId && item.memberId === memberId && item.categoryKey === classification.categoryKey && item.status !== 'deleted')
      if (existing) { result = { task: existing, existing: true }; return data }
      const deleted = data.tasks.find((item) => item.accountId === accountId && item.memberId === memberId && item.categoryKey === classification.categoryKey && item.status === 'deleted')
      const timestamp = now.toISOString()
      const task = deleted ? { ...deleted, displayName, status: 'archived', deletedAt: null, updatedAt: timestamp, version: deleted.version + 1 } : { id: randomUUID(), accountId, memberId, displayName, ...classification, status: 'active', version: 1, planVersions: [], progressionPaused: false, archivedAt: null, deletedAt: null, createdAt: timestamp, updatedAt: timestamp }
      result = { task, existing: Boolean(deleted), restoredArchived: Boolean(deleted) }
      return { ...data, tasks: deleted ? data.tasks.map((item) => item.id === deleted.id ? task : item) : [...data.tasks, task] }
    })
    const listed = await this.list(accountId, memberId, now, timeZone)
    return { ...result, task: listed.tasks.find((item) => item.id === result.task.id) }
  }

  async mutateTask(accountId, id, action, now = new Date(), expectedVersion = null) {
    const task = await this.owned(accountId, id, action === 'undo-delete')
    if (Number.isInteger(expectedVersion) && task.version !== expectedVersion) throw new DesensitizationTestError('观察任务已在其他位置更新，请刷新后重试', 409, 'VERSION_CONFLICT')
    let saved
    await this.store.update((data) => ({ ...data, tasks: data.tasks.map((item) => {
      if (item.id !== task.id) return item
      if (action === 'archive') saved = { ...item, status: 'archived', archivedAt: now.toISOString(), updatedAt: now.toISOString(), version: item.version + 1 }
      if (action === 'restore') {
        const duplicate = data.tasks.find((other) => other.id !== item.id && other.accountId === item.accountId && other.memberId === item.memberId && other.categoryKey === item.categoryKey && other.status === 'active')
        if (duplicate) throw new DesensitizationTestError('同类观察已经在进行中', 409, 'DUPLICATE_ACTIVE_TEST')
        saved = { ...item, status: 'active', archivedAt: null, deletedAt: null, updatedAt: now.toISOString(), version: item.version + 1 }
      }
      if (action === 'delete') saved = { ...item, previousStatus: item.status, status: 'deleted', deletedAt: now.toISOString(), updatedAt: now.toISOString(), version: item.version + 1 }
      if (action === 'undo-delete') saved = { ...item, status: statuses.has(item.previousStatus) ? item.previousStatus : 'active', deletedAt: null, updatedAt: now.toISOString(), version: item.version + 1 }
      return saved ?? item
    }) }))
    return saved
  }

  async updateName(accountId, id, input, now = new Date()) {
    const task = await this.owned(accountId, id); const displayName = normalizeName(input?.displayName)
    if (!displayName) throw new DesensitizationTestError('请输入食物名称')
    if (Number.isInteger(input?.version) && task.version !== input.version) throw new DesensitizationTestError('观察任务已在其他位置更新，请刷新后重试', 409, 'VERSION_CONFLICT')
    let saved
    await this.store.update((data) => ({ ...data, tasks: data.tasks.map((item) => item.id === task.id ? (saved = { ...item, displayName, updatedAt: now.toISOString(), version: item.version + 1 }) : item) }))
    return saved
  }

  async saveRecord(accountId, taskId, input, now = new Date()) {
    const task = await this.owned(accountId, taskId); await this.assertMember(accountId, task.memberId)
    let saved; let taskSaved = task; let idempotent = false
    await this.store.update((data) => {
      const duplicate = input?.idempotencyKey ? data.records.find((item) => item.taskId === task.id && item.idempotencyKey === input.idempotencyKey) : null
      if (duplicate) { saved = duplicate; idempotent = true; return data }
      const timestamp = now.toISOString(); const record = { id: randomUUID(), accountId, memberId: task.memberId, taskId: task.id, createdAt: timestamp, updatedAt: timestamp, version: 1, versions: [], planVersion: task.planVersions.at(-1)?.version ?? null, ...normalizeRecord(input, now) }
      saved = record
      if (record.status === 'effective' && record.symptomAnswer === 'present') taskSaved = { ...task, progressionPaused: true, pausedAt: timestamp, updatedAt: timestamp, version: task.version + 1 }
      return { ...data, records: [...data.records, record], tasks: data.tasks.map((item) => item.id === task.id ? taskSaved : item) }
    })
    return { record: saved, task: taskSaved, idempotent }
  }

  async updateRecord(accountId, taskId, recordId, input, now = new Date()) {
    const task = await this.owned(accountId, taskId); const data = await this.store.read()
    const previous = data.records.find((item) => item.id === recordId && item.taskId === task.id && item.accountId === accountId && !item.withdrawnAt)
    if (!previous) throw new DesensitizationTestError('未找到这条排敏记录', 404, 'OBSERVATION_NOT_FOUND')
    if (input?.version !== previous.version) throw new DesensitizationTestError('记录已在其他位置更新，请刷新后重试', 409, 'VERSION_CONFLICT')
    const { versions: previousVersions = [], ...previousSnapshot } = previous
    const replacement = { ...normalizeRecord(input, now, previous), id: previous.id, accountId, memberId: task.memberId, taskId: task.id, createdAt: previous.createdAt, updatedAt: now.toISOString(), version: previous.version + 1, versions: [...previousVersions, previousSnapshot], planVersion: previous.planVersion }
    const taskReplacement = replacement.status === 'effective' && replacement.symptomAnswer === 'present' && !task.progressionPaused ? { ...task, progressionPaused: true, pausedAt: now.toISOString(), updatedAt: now.toISOString(), version: task.version + 1 } : task
    await this.store.update((current) => ({ ...current, records: current.records.map((item) => item.id === previous.id ? replacement : item), tasks: current.tasks.map((item) => item.id === task.id ? taskReplacement : item) }))
    return replacement
  }

  async undoRecordUpdate(accountId, taskId, recordId, expectedVersion, now = new Date()) {
    await this.owned(accountId, taskId); let saved
    await this.store.update((data) => ({ ...data, records: data.records.map((item) => {
      if (item.id !== recordId || item.taskId !== taskId || item.accountId !== accountId) return item
      if (item.version !== expectedVersion || !item.versions?.length) throw new DesensitizationTestError('记录已变化，无法撤销刚才的修改', 409, 'UNDO_CONFLICT')
      const previous = item.versions.at(-1)
      return (saved = { ...previous, id: item.id, accountId: item.accountId, memberId: item.memberId, taskId: item.taskId, createdAt: item.createdAt, versions: item.versions.slice(0, -1), version: item.version + 1, updatedAt: now.toISOString() })
    }) }))
    if (!saved) throw new DesensitizationTestError('未找到这条排敏记录', 404, 'OBSERVATION_NOT_FOUND')
    return saved
  }

  async withdrawRecord(accountId, taskId, recordId, expectedVersion = null, now = new Date()) {
    await this.owned(accountId, taskId); let saved
    await this.store.update((data) => ({ ...data, records: data.records.map((item) => {
      if (item.id !== recordId || item.taskId !== taskId || item.accountId !== accountId) return item
      if (Number.isInteger(expectedVersion) && item.version !== expectedVersion) throw new DesensitizationTestError('记录已变化，无法撤回刚才的操作', 409, 'UNDO_CONFLICT')
      return (saved = { ...item, withdrawnAt: now.toISOString(), updatedAt: now.toISOString(), version: item.version + 1 })
    }) }))
    if (!saved) throw new DesensitizationTestError('未找到这条排敏记录', 404, 'OBSERVATION_NOT_FOUND')
    return saved
  }

  async restoreRecord(accountId, taskId, recordId, expectedVersion, now = new Date()) {
    await this.owned(accountId, taskId); let saved
    await this.store.update((data) => ({ ...data, records: data.records.map((item) => {
      if (item.id !== recordId || item.taskId !== taskId || item.accountId !== accountId) return item
      if (item.version !== expectedVersion || !item.withdrawnAt) throw new DesensitizationTestError('记录已变化，无法撤回刚才的操作', 409, 'UNDO_CONFLICT')
      return (saved = { ...item, withdrawnAt: null, updatedAt: now.toISOString(), version: item.version + 1 })
    }) }))
    if (!saved) throw new DesensitizationTestError('未找到这条排敏记录', 404, 'OBSERVATION_NOT_FOUND')
    return saved
  }

  async savePlan(accountId, taskId, input, now = new Date()) {
    const task = await this.owned(accountId, taskId)
    if (Number.isInteger(input?.taskVersion) && task.version !== input.taskVersion) throw new DesensitizationTestError('观察任务已在其他位置更新，请刷新后重试', 409, 'VERSION_CONFLICT')
    const plan = normalizePlan(input, (task.planVersions.at(-1)?.version ?? 0) + 1, now)
    let saved
    await this.store.update((data) => ({ ...data, tasks: data.tasks.map((item) => item.id === task.id ? (saved = { ...item, planVersions: [...item.planVersions, plan], progressionPaused: input?.resumeProgression === true && plan.complete ? false : item.progressionPaused, pausedAt: input?.resumeProgression === true && plan.complete ? null : item.pausedAt, updatedAt: now.toISOString(), version: item.version + 1 }) : item) }))
    return { task: saved, plan }
  }
}
