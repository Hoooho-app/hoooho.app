import assert from 'node:assert/strict'
import test from 'node:test'
import {
  allergyGroup,
  activeAllergyReactions,
  allergyOptions,
  applyAllergyReport,
  createAllergyItem,
  linkJournalObservation,
  mergeDesensitizationConclusion,
  normalizeAllergyArchive,
  reconcileDesensitizationObservation,
  readAllergyArchive,
  reconcileJournalObservation,
  saveQuickAllergy,
  serializeAllergyArchive,
  type AllergyArchive,
  type AllergyReportRecord,
  type QuickAllergyInput
} from './allergyProfile.ts'

const baseInput: QuickAllergyInput = {
  mutationKey: 'mutation-1', memberId: 'member-1', accountId: 'account-1', name: '牛乳', category: 'food',
  certainty: 'investigating', reaction: '', occurredAt: '', sourceType: 'caregiver', sourceLabel: '', dietaryAction: '', ingredientNames: []
}

test('旧记录兼容为 V3，昆虫并入动物且只读取当前成员', () => {
  const archive = normalizeAllergyArchive([
    { id: 'old-insect', accountId: 'legacy-token', memberId: 'member-1', name: '蜜蜂', category: 'insect', certainty: '怀疑中' },
    { id: 'other', accountId: 'account-1', memberId: 'member-2', name: '牛奶', category: 'food', certainty: '医生已确认' }
  ], 'member-1', 'account-1')
  assert.equal(archive.version, 3)
  assert.deepEqual(archive.items.map((item) => [item.name, item.category, item.currentStatus, item.accountId]), [['蜜蜂', 'animal', 'suspected', 'account-1']])
  assert.equal(archive.reports.length, 0)
  assert.deepEqual(Object.keys(allergyOptions), ['food', 'drug', 'animal', 'environment', 'contact', 'unknown'])
})

test('同页快速添加保留原始层级、候选原料并按状态分组', () => {
  const items = saveQuickAllergy([], { ...baseInput, name: '面包', reaction: '食用后皮肤发红', ingredientNames: ['小麦', '牛乳', '鸡蛋'] })
  assert.equal(items.length, 1)
  assert.equal(items[0].name, '面包')
  assert.deepEqual(items[0].ingredientRelations.map((item) => [item.name, item.relation]), [['小麦', 'candidate'], ['牛乳', 'candidate'], ['鸡蛋', 'candidate']])
  assert.equal(allergyGroup(items[0]), 'investigating')
  assert.equal(items[0].reactions[0].symptoms, '食用后皮肤发红')
})

test('重复提交幂等、精确同名更新，但部分重叠名称不合并', () => {
  const first = saveQuickAllergy([], baseInput)
  const repeated = saveQuickAllergy(first, baseInput)
  assert.strictEqual(repeated, first)
  const confirmed = saveQuickAllergy(first, { ...baseInput, mutationKey: 'mutation-2', certainty: 'confirmed' })
  assert.equal(confirmed.length, 1)
  assert.equal(confirmed[0].currentStatus, 'confirmed')
  const wheat = saveQuickAllergy(confirmed, { ...baseInput, mutationKey: 'mutation-3', name: '小麦' })
  const gluten = saveQuickAllergy(wheat, { ...baseInput, mutationKey: 'mutation-4', name: '麸质' })
  assert.deepEqual(gluten.map((item) => item.name), ['牛乳', '小麦', '麸质'])
})

test('编辑保存保留既有证据并追加状态历史', () => {
  const item = createAllergyItem('member-1', 'food', '牛奶', 'account-1')
  item.currentStatus = 'investigating'
  item.sourceReferences.push({ id: 'source-1', type: 'journal', sourceId: 'record-1', label: '健康随记', active: true, createdAt: '2026-09-01' })
  const next = saveQuickAllergy([item], { ...baseInput, id: item.id, mutationKey: 'edit-1', name: '牛乳', certainty: 'confirmed', sourceType: 'clinician', sourceLabel: '医生告知' })
  assert.equal(next[0].id, item.id)
  assert.equal(next[0].sourceReferences[0].sourceId, 'record-1')
  assert.equal(next[0].history.at(-1)?.status, 'confirmed')
})

test('报告可一次核对多项，阳性不自动确诊，阴性不删除既有明确记录', () => {
  const confirmed = createAllergyItem('member-1', 'food', '鸡蛋', 'account-1')
  confirmed.currentStatus = 'confirmed'
  const report: AllergyReportRecord = {
    recordType: 'allergy-report', id: 'report-1', accountId: 'account-1', memberId: 'member-1', fileName: '报告.pdf',
    mimeType: 'application/pdf', dataUrl: 'data:application/pdf;base64,AA', recognitionStatus: 'manual_review_required', createdAt: '2026-09-20', updatedAt: '2026-09-20',
    items: [
      { id: 'line-1', name: '花生', category: 'food', result: 'positive', testedAt: '2026-09-18', adopted: true, unclear: false, originalName: '', originalResult: '' },
      { id: 'line-2', name: '鸡蛋', category: 'food', result: 'negative', testedAt: '2026-09-18', adopted: true, unclear: false, originalName: '', originalResult: '' },
      { id: 'line-3', name: '未核对项', category: 'food', result: '', testedAt: '', adopted: false, unclear: true, originalName: '', originalResult: '' }
    ]
  }
  const next = applyAllergyReport({ version: 3, items: [confirmed], reports: [] }, report)
  assert.equal(next.reports[0].recognitionStatus, 'user_reviewed')
  assert.equal(next.items.find((item) => item.name === '花生')?.currentStatus, 'investigating')
  assert.equal(next.items.find((item) => item.name === '鸡蛋')?.currentStatus, 'confirmed')
  assert.equal(next.items.some((item) => item.name === '未核对项'), false)
})

test('排敏明确和待排查结论均保留独立来源引用', () => {
  const confirmed = mergeDesensitizationConclusion([], { accountId: 'account-1', memberId: 'member-1', taskId: 'task-1', name: '牛奶', conclusion: 'confirmed', observationIds: ['obs-1'], occurredAt: '2026-09-20' })
  assert.equal(confirmed[0].currentStatus, 'confirmed')
  assert.equal(confirmed[0].sourceReferences[0].sourceId, 'task-1')
  assert.deepEqual(confirmed[0].sourceReferences[0].recordIds, ['obs-1'])
  const investigating = mergeDesensitizationConclusion(confirmed, { accountId: 'account-1', memberId: 'member-1', taskId: 'task-1', name: '牛奶', conclusion: 'investigating', observationIds: ['obs-1'], occurredAt: '2026-09-21' })
  assert.equal(investigating[0].currentStatus, 'investigating')
  assert.equal(investigating[0].sourceReferences.length, 1)
})

test('排敏待排查不覆盖人工确认，重试同步不重复追加历史', () => {
  const manual = saveQuickAllergy([], { ...baseInput, name: '牛奶', certainty: 'confirmed', sourceType: 'clinician', sourceLabel: '医生告知' })
  const input = { accountId: 'account-1', memberId: 'member-1', taskId: 'task-1', name: '牛奶', conclusion: 'investigating' as const, observationIds: ['obs-1'], occurredAt: '2026-09-20' }
  const linked = mergeDesensitizationConclusion(manual, input)
  assert.equal(linked[0].currentStatus, 'confirmed')
  assert.equal(linked[0].sourceLabel, '医生告知')
  assert.equal(linked[0].sourceReferences[0].sourceId, 'task-1')
  assert.equal(linked[0].history.at(-1)?.status, 'investigating')
  assert.strictEqual(mergeDesensitizationConclusion(linked, input), linked)
})

test('排敏观察撤回、恢复及修改同步引用并保留结论历史，隔离其他成员', () => {
  const input = { accountId: 'account-1', memberId: 'member-1', taskId: 'task-1', name: '牛奶', conclusion: 'confirmed' as const, observationIds: ['obs-1', 'obs-2'], occurredAt: '2026-09-20' }
  const other = createAllergyItem('member-2', 'food', '牛奶', 'account-1')
  const initial = [...mergeDesensitizationConclusion([], input), other]
  const change = { accountId: input.accountId, memberId: input.memberId, taskId: input.taskId, recordId: 'obs-1', occurredAt: '2026-09-21' }
  const withdrawn = reconcileDesensitizationObservation(initial, { ...change, action: 'withdraw' })
  assert.deepEqual(withdrawn[0].sourceReferences[0].recordIds, ['obs-2'])
  assert.equal(withdrawn[0].currentStatus, 'confirmed')
  assert.equal(withdrawn[0].history.at(-1)?.label, '排敏观察已撤回，原结论需复核')
  assert.strictEqual(withdrawn[1], other)
  const repeated = reconcileDesensitizationObservation(withdrawn, { ...change, action: 'withdraw' })
  assert.strictEqual(repeated[0], withdrawn[0])
  const restored = reconcileDesensitizationObservation(withdrawn, { ...change, action: 'restore', occurredAt: '2026-09-22' })
  assert.deepEqual(restored[0].sourceReferences[0].recordIds, ['obs-2', 'obs-1'])
  const updated = reconcileDesensitizationObservation(restored, { ...change, action: 'update', occurredAt: '2026-09-23' })
  assert.equal(updated[0].history.at(-1)?.label, '排敏观察已修改，原结论需复核')
  assert.equal(updated[0].history.at(-1)?.sourceId, 'obs-1')
  const retry = reconcileDesensitizationObservation(updated, { ...change, action: 'update', occurredAt: '2026-09-23' })
  assert.strictEqual(retry[0], updated[0])
})

test('健康随记只有用户明确关联后进入待排查，并按记录 ID 防重复', () => {
  const input = { accountId: 'account-1', memberId: 'member-1', eventId: 'event-1', recordId: 'record-1', name: '', category: 'food' as const, reaction: '皮肤发红', occurredAt: '2026-09-20' }
  const first = linkJournalObservation([], input)
  const repeated = linkJournalObservation(first, input)
  assert.equal(first[0].name, '尚未明确')
  assert.equal(first[0].category, 'unknown')
  assert.equal(first[0].currentStatus, 'investigating')
  assert.equal(repeated[0].evidenceLinks.length, 1)
  assert.equal(repeated[0].reactions.length, 1)
})

test('随记修改或删除后原反应不计数，保留历史并允许明确重新关联', () => {
  const input = { accountId: 'account-1', memberId: 'member-1', eventId: 'event-1', recordId: 'record-1', name: '牛奶', category: 'food' as const, reaction: '皮肤发红', occurredAt: '2026-09-20' }
  const linked = linkJournalObservation([], input)
  const other = createAllergyItem('member-2', 'food', '牛奶', 'account-1')
  const changed = reconcileJournalObservation([...linked, other], { accountId: 'account-1', memberId: 'member-1', recordId: 'record-1', action: 'update', occurredAt: '2026-09-21' })
  assert.equal(changed[0].sourceReferences[0].active, false)
  assert.equal(activeAllergyReactions(changed[0]).length, 0)
  assert.equal(changed[0].reactions[0].symptoms, '皮肤发红')
  assert.strictEqual(changed[1], other)
  assert.strictEqual(reconcileJournalObservation(changed, { accountId: 'account-1', memberId: 'member-1', recordId: 'record-1', action: 'delete', occurredAt: '2026-09-22' })[0], changed[0])
  const relinked = linkJournalObservation(changed, { ...input, reaction: '皮肤轻微发红', occurredAt: '2026-09-23' })
  assert.equal(relinked[0].sourceReferences[0].active, true)
  assert.deepEqual(activeAllergyReactions(relinked[0]).map(record=>record.symptoms), ['皮肤轻微发红'])
  assert.equal(relinked[0].reactions.length, 2)
  const deleted = reconcileJournalObservation(relinked, { accountId: 'account-1', memberId: 'member-1', recordId: 'record-1', action: 'delete', occurredAt: '2026-09-24' })
  const restored = readAllergyArchive(JSON.stringify(serializeAllergyArchive({ version: 3, items: deleted, reports: [] })), 'member-1', 'account-1')
  assert.equal(activeAllergyReactions(restored.items[0]).length, 0)
  assert.equal(restored.items[0].history.at(-1)?.label, '关联的健康随记已删除，原反应保留备查')
})

test('旧随记关联缺少来源引用时重复提交不生成第二次反应', () => {
  const input = { accountId: 'account-1', memberId: 'member-1', eventId: 'event-1', recordId: 'record-1', name: '牛奶', category: 'food' as const, reaction: '皮肤发红', occurredAt: '2026-09-20' }
  const linked = linkJournalObservation([], input)
  const legacy = [{ ...linked[0], sourceReferences: [] }]
  assert.strictEqual(linkJournalObservation(legacy, input), legacy)
  assert.equal(legacy[0].reactions.length, 1)
})

test('序列化继续使用 records 数组并同时保留报告，读取时按账户与成员隔离', () => {
  const current = saveQuickAllergy([], baseInput)[0]
  const other = createAllergyItem('member-2', 'drug', '青霉素', 'account-1')
  const report = { recordType: 'allergy-report', id: 'report-1', accountId: 'account-1', memberId: 'member-1', fileName: '报告', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA', recognitionStatus: 'manual_review_required', items: [], createdAt: '2026-09-20', updatedAt: '2026-09-20' } satisfies AllergyReportRecord
  const records = serializeAllergyArchive({ version: 3, items: [current, other], reports: [report] } satisfies AllergyArchive)
  assert.equal(Array.isArray(records), true)
  const restored = readAllergyArchive(JSON.stringify(records), 'member-1', 'account-1')
  assert.deepEqual(restored.items.map((item) => item.name), ['牛乳'])
  assert.deepEqual(restored.reports.map((item) => item.id), ['report-1'])
})

test('旧内嵌过敏档案与普通记录使用原位置稳定ID，已删和其他孩子不流入全局读取', () => {
  const records = [{ memberId: 'm', _allergyArchive: { items: [{ name: '牛奶', category: 'food', currentStatus: 'confirmed' }, { name: '花生', category: 'food', currentStatus: 'confirmed', profileListDeletedAt: '2026-10-05' }] } }, { name: '鸡蛋', category: 'food', currentStatus: 'confirmed' }, { memberId: 'other', _allergyArchive: { items: [{ name: '虾', category: 'food', currentStatus: 'confirmed' }] } }]
  const archive = readAllergyArchive(JSON.stringify(records), 'm', 'a')
  assert.deepEqual(archive.items.map(item => [item.id, item.name]), [['legacy-allergy-1:item-1', '牛奶'], ['legacy-allergy-2', '鸡蛋']])
})
