import assert from 'node:assert/strict'
import test from 'node:test'
import type { HealthEvent, HealthEventRecordApiDto, HealthFact, HealthRecordOrganizationApiDto, Member } from '../../types/index.ts'
import { buildHealthEventPrompt, getAllPromptItemIds, getPromptInformationGroups, getPromptInformationSummary, type HealthEventPromptContext } from './healthEventPrompt.ts'
import { copyPromptText } from './promptClipboard.ts'

const member: Member = { id: 'm1', name: '小安', age: '6岁', relation: '子女', gender: 'female', heightCm: 118, weightKg: 22 }
const event: HealthEvent = {
  id: 'e1', memberId: 'm1', title: '反复发热', status: 'ongoing', startDate: '2026-08-20T10:00:00.000Z', symptoms: ['发热'], summary: '发热反复', medications: ['退热药'], visits: [], examinations: [], concerns: ['会不会加重'], attachments: [], personalizedModules: [], temperatureRecords: [], medicalInfo: { allergies: [], medications: [], medicalHistory: [], chronicDiseases: [], familyHistory: [] },
  timeline: [],
}
const records: HealthEventRecordApiDto[] = [
  { id: 'r1', accountId: 'account-secret', eventId: 'e1', type: 'symptom', content: '没有发热，担心如果晚上发烧怎么办', sourceText: '昨天没有发热，如果晚上发烧要不要去医院？', occurredAt: '2026-08-20T10:00:00.000Z', createdAt: '2026-08-20T10:01:00.000Z', updatedAt: '2026-08-20T10:01:00.000Z' },
  { id: 'r2', accountId: 'account-secret', eventId: 'e1', type: 'medication', content: '体温38.2℃，服药后降到37.5℃', sourceText: '今天体温38.2℃，吃了退热药，后来降到37.5℃，但头还是疼。', note: '服药后体温下降', occurredAt: '2026-08-21T10:00:00.000Z', createdAt: '2026-08-21T10:01:00.000Z', updatedAt: '2026-08-21T10:01:00.000Z' },
]
const fact = (overrides: Partial<HealthFact>): HealthFact => ({
  id: 'f1', type: 'symptom', name: '发热', bodyPart: null, sourceText: '昨天没有发热', time: { raw: '昨天', resolvedStart: '2026-08-20T10:00:00.000Z', resolvedEnd: null, precision: 'day', source: 'user_text' }, confidence: 0.96, polarity: 'negated', temporality: 'current', subject: 'event_subject', ...overrides,
})
const organizations: HealthRecordOrganizationApiDto[] = [
  { id: 'o1', accountId: 'account-secret', eventId: 'e1', recordId: 'r1', rawInput: records[0].sourceText!, healthAIOutput: { facts: [fact({ id: 'f1' }), fact({ id: 'f2', name: '如果晚上发烧', sourceText: '如果晚上发烧要不要去医院？', polarity: 'uncertain', temporality: 'conditional' })], confidence: 0.9, parserVersion: 'v1', promptVersion: 'v1', timeConflict: { hasConflict: false, conflict: null } }, organizedHealthData: { symptoms: [], temperature: null, medications: [], visits: [], examinations: [], concerns: [], attachments: [], timeline: [] }, confirmedData: null, status: 'completed', provider: 'local', createdAt: '2026-08-20T10:01:00.000Z', updatedAt: '2026-08-20T10:01:00.000Z' },
  { id: 'o2', accountId: 'account-secret', eventId: 'e1', recordId: 'r2', rawInput: records[1].sourceText!, healthAIOutput: { facts: [fact({ id: 'f3', type: 'temperature', name: '体温38.2℃', sourceText: records[1].sourceText!, time: { raw: '今天', resolvedStart: '2026-08-21T10:00:00.000Z', resolvedEnd: null, precision: 'day', source: 'user_text' }, polarity: 'affirmed', change: 'worsened' })], confidence: 0.9, parserVersion: 'v1', promptVersion: 'v1', timeConflict: { hasConflict: false, conflict: null } }, organizedHealthData: { symptoms: [], temperature: null, medications: [], visits: [], examinations: [], concerns: [], attachments: [], timeline: [] }, confirmedData: null, status: 'completed', provider: 'local', createdAt: '2026-08-21T10:01:00.000Z', updatedAt: '2026-08-21T10:01:00.000Z' },
]
const baseContext: HealthEventPromptContext = {
  currentMemberId: 'm1', member, event, records, organizations,
  healthProfile: [{ id: 'allergy', title: '过敏与不良反应', entries: [{ id: '1', lines: ['名称：青霉素', '出现过什么反应：皮疹'] }] }],
  relatedEvents: [{ id: 'e2', accountId: 'account-secret', memberId: 'm1', title: '去年发热', category: 'fever', status: 'recovered', startTime: '2025-08-01T09:00:00.000Z', recoveredAt: null, createdAt: '2025-08-01T09:00:00.000Z', updatedAt: '2025-08-03T09:00:00.000Z' }],
  attachments: [{ id: 'a1', accountId: 'account-secret', eventId: 'e1', name: '血常规.jpg', mimeType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,secret', createdAt: '2026-08-21T11:00:00.000Z', analysis: { status: 'completed', category: 'report', summary: '白细胞计数偏高', observedText: 'WBC 12.3', extractedFacts: [], provider: 'local', analyzedAt: '2026-08-21T11:00:00.000Z' } }],
}

test('defaults expose every available item instead of a small preselection', () => {
  const groups = getPromptInformationGroups(baseContext)
  const all = getAllPromptItemIds(baseContext)
  assert.deepEqual(all, groups.flatMap((group) => group.items.map(({ id }) => id)))
  assert.equal(all.length, getPromptInformationSummary(baseContext).totalCount)
  assert.ok(all.includes('raw:r1'))
  assert.ok(all.includes('attachment:a1'))
})

test('strictly stops when current member is missing or does not own the event', () => {
  assert.throws(() => buildHealthEventPrompt({ ...baseContext, currentMemberId: 'self' }, getAllPromptItemIds(baseContext), '是否需要就医'), /先选择人物/)
  assert.throws(() => buildHealthEventPrompt({ ...baseContext, currentMemberId: 'm2' }, getAllPromptItemIds(baseContext), '是否需要就医'), /所选人物不一致/)
})

test('strictly stops if another member appears in historical events', () => {
  const mixed = { ...baseContext, relatedEvents: [{ ...baseContext.relatedEvents[0], memberId: 'm2' }] }
  assert.throws(() => buildHealthEventPrompt(mixed, getAllPromptItemIds(mixed), '是否需要就医'), /不属于当前人物/)
})

test('keeps every original record and all facts from a multi-fact record without truncation', () => {
  const prompt = buildHealthEventPrompt(baseContext, getAllPromptItemIds(baseContext), '是否需要就医')
  for (const text of records.map((record) => record.sourceText!)) assert.match(prompt, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(prompt, /体温38\.2℃，吃了退热药，后来降到37\.5℃，但头还是疼。/)
  assert.equal(prompt.includes('…'), false)
})

test('preserves negation, conditional questions, original time, and symptom change semantics', () => {
  const prompt = buildHealthEventPrompt(baseContext, getAllPromptItemIds(baseContext), '是否需要就医')
  assert.match(prompt, /没有发热/)
  assert.match(prompt, /条件\/假设/)
  assert.match(prompt, /如果晚上发烧要不要去医院？/)
  assert.match(prompt, /原始时间表达：昨天/)
  assert.match(prompt, /加重/)
})

test('sorts structured facts by the real occurred time', () => {
  const prompt = buildHealthEventPrompt(baseContext, getAllPromptItemIds(baseContext), '是否需要就医')
  assert.ok(prompt.indexOf('昨天没有发热') < prompt.indexOf('体温38.2℃'))
})

test('includes current-member profile and history while hiding internal identifiers and binary data', () => {
  const prompt = buildHealthEventPrompt(baseContext, getAllPromptItemIds(baseContext), '是否需要就医')
  assert.match(prompt, /青霉素/)
  assert.match(prompt, /去年发热/)
  assert.doesNotMatch(prompt, /account-secret|data:image|memberId|eventId/)
})

test('includes OCR text and explicitly asks for manual attachment upload', () => {
  const prompt = buildHealthEventPrompt(baseContext, getAllPromptItemIds(baseContext), '是否需要就医')
  assert.match(prompt, /WBC 12\.3/)
  assert.match(prompt, /以下附件无法随文字复制，需要我另外上传/)
  assert.match(prompt, /血常规\.jpg/)
})

test('does not show a false attachment warning when there are no attachments', () => {
  const context = { ...baseContext, attachments: [] }
  const prompt = buildHealthEventPrompt(context, getAllPromptItemIds(context), '是否需要就医')
  assert.match(prompt, /以下附件无法随文字复制，需要我另外上传：\n\n无/)
})

test('does not fabricate normal findings for an empty profile', () => {
  const context = { ...baseContext, healthProfile: [] }
  const prompt = buildHealthEventPrompt(context, getAllPromptItemIds(context), '是否需要就医')
  assert.match(prompt, /未填写不代表没有异常/)
  assert.doesNotMatch(prompt, /无异常|正常/)
})

test('renders the complete professional prompt structure and the user question', () => {
  const prompt = buildHealthEventPrompt(baseContext, getAllPromptItemIds(baseContext), '应该挂什么科')
  for (const title of ['# 我的健康问题', '## 这次我主要想问', '# 对象基本信息', '# 当前健康事件', '# 完整时间线', '# 用户原始记录', '# 已采取的措施及效果', '# 健康档案', '# 相关历史健康事件', '# 检查结果与附件说明']) assert.match(prompt, new RegExp(title.replace('#', '\\#')))
  assert.match(prompt, /应该挂什么科/)
  assert.match(prompt, /不要擅自建议开始、停止或改变处方药/)
})

test('supports excluding an individual item without changing source data', () => {
  const selected = getAllPromptItemIds(baseContext).filter((id) => id !== 'raw:r1')
  const prompt = buildHealthEventPrompt(baseContext, selected, '是否需要就医')
  const originals = prompt.slice(prompt.indexOf('# 用户原始记录'), prompt.indexOf('# 已采取的措施及效果'))
  assert.doesNotMatch(originals, /昨天没有发热/)
  assert.match(originals, /今天体温38\.2℃/)
  assert.equal(baseContext.records.length, 2)
})

test('copy helper reports success and an actionable fallback', async () => {
  let copied = ''
  assert.deepEqual(await copyPromptText('完整提示词', { writeText: async (text) => { copied = text } }), { ok: true })
  assert.equal(copied, '完整提示词')
  assert.deepEqual(await copyPromptText('完整提示词', { writeText: async () => { throw new Error('blocked') } }), { ok: false, message: '自动复制失败，请全选下面的内容进行复制' })
})
