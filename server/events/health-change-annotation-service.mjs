import { createHash } from 'node:crypto'
import { HealthEventRecordError } from './health-event-record-error.mjs'

export const healthChangeTypes = new Set(['new', 'worsened', 'improved', 'resolved'])

const facts = [
  { key: 'cough', label: '咳嗽', aliases: ['咳嗽', '咳'] },
  { key: 'fever', label: '发热', aliases: ['发热', '发烧', '烧退'] },
  { key: 'headache', label: '头痛', aliases: ['头痛', '头疼', '偏头痛'] },
  { key: 'nasal_congestion', label: '鼻塞', aliases: ['鼻塞'] },
  { key: 'rash', label: '皮疹', aliases: ['皮疹', '红疹', '红点'] },
  { key: 'itching', label: '瘙痒', aliases: ['瘙痒', '发痒', '很痒'] },
  { key: 'sore_throat', label: '咽痛', aliases: ['咽痛', '喉咙痛', '嗓子疼'] },
  { key: 'runny_nose', label: '流涕', aliases: ['流涕', '流鼻涕'] },
  { key: 'vomiting', label: '呕吐', aliases: ['呕吐', '吐了'] },
  { key: 'diarrhea', label: '腹泻', aliases: ['腹泻', '拉肚子'] },
  { key: 'fatigue', label: '乏力', aliases: ['乏力', '没力气', '无力'] },
  { key: 'sleep_impact', label: '睡眠受影响', aliases: ['咳醒', '疼醒', '睡不着', '影响睡眠'] }
]

const unsafePattern = /(?:如果|要是|一旦|万一|担心|害怕|怕会|可能|也许|似乎|大概会|医生说|医生表示|妈妈说|爸爸说|她自己|他自己|听别人说|听说|测试一下|标签|记录方式)/u
const persistentPattern = /(?:还是|仍然|依旧|持续)(?:有|在)?/u

const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const aliasesPattern = (fact) => `(?:${fact.aliases.map(escapePattern).join('|')})`
const containsFact = (text, fact) => new RegExp(aliasesPattern(fact), 'u').test(text)

function explicitChange(text, fact) {
  const name = aliasesPattern(fact)
  const resolved = new RegExp(`(?:已经|现在|今天)?(?:不|没|没有|不再)(?:再)?${name}(?:了|啦)?|${name}(?:已经)?(?:消失|好了|停止)(?:了)?`, 'u')
  const worsened = new RegExp(`${name}.{0,12}(?:比.{0,8}(?:严重|厉害|明显)|加重|更(?:严重|厉害|明显)|越来越)|(?:更|明显|继续)(?:严重|厉害|加重).{0,8}${name}`, 'u')
  const improved = new RegExp(`${name}.{0,12}(?:减轻|缓解|轻了|轻一些|好转|好多了|改善)|${name}.{0,8}比.{0,8}(?:轻|好)`, 'u')
  const appeared = new RegExp(`(?:第一次|初次|开始|新出现|以前没有.{0,10}(?:现在|今天)).{0,10}${name}|${name}.{0,8}(?:开始|新出现)(?:了)?`, 'u')
  if (resolved.test(text)) return 'resolved'
  if (worsened.test(text)) return 'worsened'
  if (improved.test(text)) return 'improved'
  if (appeared.test(text)) return 'new'
  return null
}

function factState(text, fact, changeType) {
  if (changeType === 'resolved') return false
  if (!containsFact(text, fact)) return null
  const name = aliasesPattern(fact)
  if (new RegExp(`(?:不|没|没有|未)(?:再)?${name}`, 'u').test(text)) return false
  return true
}

const stableId = (recordId, factKey) => `change-${createHash('sha256').update(`${recordId}:${factKey}`).digest('hex').slice(0, 20)}`
const compareRecords = (left, right) => (
  left.occurredAt.localeCompare(right.occurredAt)
  || left.createdAt.localeCompare(right.createdAt)
  || left.id.localeCompare(right.id)
)

export function computeHealthChangeAnnotations(records, now = new Date()) {
  const previousByFact = new Map()
  const result = new Map()
  for (const record of [...records].sort(compareRecords)) {
    const text = String(record.content || record.sourceText || '').replace(/\s+/g, ' ').trim()
    const generated = []
    const mentioned = new Set()
    const unsafe = unsafePattern.test(text)
    for (const fact of facts) {
      if (!containsFact(text, fact)) continue
      mentioned.add(fact.key)
      if (unsafe) continue
      const prior = previousByFact.get(fact.key) ?? null
      let changeType = persistentPattern.test(text) ? null : explicitChange(text, fact)
      if ((changeType === 'worsened' || changeType === 'improved' || changeType === 'resolved') && !prior?.active) changeType = null
      if (changeType === 'new' && prior?.active) changeType = null
      if (changeType) {
        const existing = (record.changeAnnotations ?? []).find((item) => item.id === stableId(record.id, fact.key))
        generated.push({
          id: stableId(record.id, fact.key),
          factKey: fact.key,
          factLabel: fact.label,
          changeType,
          sourceRecordId: record.id,
          comparedRecordId: prior?.recordId ?? null,
          source: 'system',
          userEdited: false,
          hidden: false,
          createdAt: existing?.createdAt ?? now.toISOString(),
          updatedAt: now.toISOString()
        })
      }
      const active = factState(text, fact, changeType)
      if (active !== null) previousByFact.set(fact.key, { recordId: record.id, active })
    }

    const userOverrides = (record.changeAnnotations ?? []).filter((item) => item?.source === 'user' && mentioned.has(item.factKey))
    const overridesByFact = new Map(userOverrides.map((item) => [item.factKey, item]))
    result.set(record.id, [
      ...generated.filter((item) => !overridesByFact.has(item.factKey)),
      ...userOverrides
    ])
  }
  return result
}

export class HealthChangeAnnotationService {
  constructor(options = {}) {
    this.repository = options.repository
    this.events = options.events
  }

  async assertOwnedRecord(accountId, recordId) {
    const record = await this.repository.findById(recordId)
    if (!record || record.accountId !== accountId) throw new HealthEventRecordError('健康事件记录不存在', 404, 'HEALTH_EVENT_RECORD_NOT_FOUND')
    const event = await this.events.findById(record.eventId)
    if (!event || event.accountId !== accountId) throw new HealthEventRecordError('健康事件不存在', 404, 'HEALTH_EVENT_NOT_FOUND')
    return record
  }

  async recompute(accountId, eventId, now = new Date()) {
    const event = await this.events.findById(eventId)
    if (!event || event.accountId !== accountId) throw new HealthEventRecordError('健康事件不存在', 404, 'HEALTH_EVENT_NOT_FOUND')
    const records = await this.repository.findByEventId(eventId)
    await this.repository.replaceEventChangeAnnotations(eventId, computeHealthChangeAnnotations(records, now))
  }

  async update(accountId, recordId, annotationId, input, now = new Date()) {
    const record = await this.assertOwnedRecord(accountId, recordId)
    const existing = (record.changeAnnotations ?? []).find((item) => item.id === annotationId && !item.hidden)
    if (!existing) throw new HealthEventRecordError('变化标签不存在', 404, 'HEALTH_CHANGE_ANNOTATION_NOT_FOUND')
    if (!healthChangeTypes.has(input.changeType)) throw new HealthEventRecordError('变化标签类型无效', 400, 'INVALID_HEALTH_CHANGE_TYPE')
    const updated = { ...existing, changeType: input.changeType, source: 'user', userEdited: true, hidden: false, updatedAt: now.toISOString() }
    return this.repository.setChangeAnnotation(recordId, updated)
  }

  async delete(accountId, recordId, annotationId, now = new Date()) {
    const record = await this.assertOwnedRecord(accountId, recordId)
    const existing = (record.changeAnnotations ?? []).find((item) => item.id === annotationId && !item.hidden)
    if (!existing) throw new HealthEventRecordError('变化标签不存在', 404, 'HEALTH_CHANGE_ANNOTATION_NOT_FOUND')
    await this.repository.setChangeAnnotation(recordId, { ...existing, source: 'user', userEdited: true, hidden: true, updatedAt: now.toISOString() })
    return { success: true }
  }
}
