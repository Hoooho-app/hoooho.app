import assert from 'node:assert/strict'
import test from 'node:test'
import { createAllergyItem, type AllergyHistoryItem } from '../../features/health-profile/utils/allergyProfile.ts'
import { buildDietaryCardExportLayout } from './dietaryCardExport.ts'
import {
  createManualDietaryItem,
  deriveDietarySources,
  dietaryItemExists,
  emptyDietarySnapshot,
  mergeDietarySources,
  presentDietaryCard,
  readDietarySnapshot,
  snapshotFromSources,
  translateFood
} from './dietaryCardModel.ts'

const accountId = 'account-1'
const memberId = 'member-current'
const at = '2026-09-26T00:00:00.000Z'

function allergy(name: string, status: AllergyHistoryItem['currentStatus'], owner = memberId, category: AllergyHistoryItem['category'] = 'food') {
  const item = createAllergyItem(owner, category, name, accountId)
  item.id = `${owner}-${name}`
  item.currentStatus = status
  return item
}

function storage(items: AllergyHistoryItem[]) {
  return JSON.stringify({ version: 2, items })
}

test('P-001 无可映射记录时建立温暖空状态快照且不可导出内容', () => {
  const sources = deriveDietarySources(storage([
    allergy('青霉素', 'confirmed', memberId, 'drug'),
    allergy('小麦', 'excluded'),
    allergy('牛奶', 'tolerated'),
    allergy('尚未明确', 'suspected', memberId, 'unknown')
  ]), memberId, accountId)
  const snapshot = snapshotFromSources(memberId, sources, at)
  assert.deepEqual(sources, [])
  assert.equal(presentDietaryCard(snapshot, 'zh').visibleCount, 0)
  assert.equal(buildDietaryCardExportLayout(snapshot, 'zh').texts.includes('牛奶'), false)
})

test('P-002 仅一项已确认食物直接进入明确不能吃并可生成完整导出布局', () => {
  const sources = deriveDietarySources(storage([allergy('牛奶', 'confirmed')]), memberId, accountId)
  const snapshot = snapshotFromSources(memberId, sources, at)
  const card = presentDietaryCard(snapshot, 'zh')
  const exportLayout = buildDietaryCardExportLayout(snapshot, 'zh')
  assert.deepEqual(card.avoid.map((item) => item.name), ['牛奶'])
  assert.equal(card.temporary.length, 0)
  assert.ok(exportLayout.texts.includes('牛奶'))
  assert.equal(exportLayout.rows[0].labels.length, 1)
})

test('P-002 仅一项暂避食物也直接显示且不制造明确不能吃分组', () => {
  const snapshot = snapshotFromSources(memberId, deriveDietarySources(storage([allergy('鸡蛋', 'suspected')]), memberId, accountId), at)
  const card = presentDietaryCard(snapshot, 'zh')
  assert.equal(card.avoid.length, 0)
  assert.deepEqual(card.temporary.map((item) => item.name), ['鸡蛋'])
})

test('P-003 多项记录按明确和暂避分组、全量进入导出且高度随内容增长', () => {
  const names = ['牛奶', '鸡蛋', '花生', '小麦', '大豆', '芝麻', '核桃', '杏仁', '腰果', '虾', '蟹', '鱼', '芒果', '猕猴桃', '草莓', '桃', '番茄', '燕麦']
  const sources = deriveDietarySources(storage(names.map((name, index) => allergy(name, index < 12 ? 'confirmed' : 'investigating'))), memberId, accountId)
  const snapshot = snapshotFromSources(memberId, sources, at)
  const full = buildDietaryCardExportLayout(snapshot, 'zh')
  const short = buildDietaryCardExportLayout(snapshotFromSources(memberId, sources.slice(0, 1), at), 'zh')
  assert.equal(presentDietaryCard(snapshot, 'zh').visibleCount, 18)
  assert.equal(full.texts.includes('燕麦'), true)
  assert.equal(full.rows.reduce((sum, row) => sum + row.labels.length, 0), 18)
  assert.ok(full.height > short.height)
})

test('P-003 超过18项仍保留最后一项并继续增长导出高度', () => {
  const items = Array.from({ length: 19 }, (_, index) => createManualDietaryItem(`自定义食物${index + 1}`, index < 12 ? 'avoid' : 'temporary'))
  const snapshot = { ...emptyDietarySnapshot(memberId, at), items }
  const layout = buildDietaryCardExportLayout(snapshot, 'zh')
  assert.equal(layout.rows.reduce((sum, row) => sum + row.labels.length, 0), 19)
  assert.ok(layout.texts.includes('自定义食物19'))
})

test('数据严格按 currentMemberId 隔离，不读取其他人物记录', () => {
  const current = allergy('牛奶', 'confirmed')
  const otherMember = allergy('鸡蛋', 'confirmed', 'member-other')
  const sources = deriveDietarySources(storage([current, otherMember]), memberId, accountId)
  assert.deepEqual(sources.map((item) => item.name), ['牛奶'])
})

test('P-004 保存快照可为空且只改变出示清单，不删除健康档案来源', () => {
  const sourceStorage = storage([allergy('牛奶', 'confirmed')])
  const sources = deriveDietarySources(sourceStorage, memberId, accountId)
  const hidden = snapshotFromSources(memberId, sources, at)
  hidden.items[0].visible = false
  const restored = readDietarySnapshot(JSON.stringify([hidden]), memberId)
  assert.ok(restored)
  assert.equal(presentDietaryCard(restored!, 'zh').visibleCount, 0)
  assert.deepEqual(deriveDietarySources(sourceStorage, memberId, accountId).map((item) => item.name), ['牛奶'])
})

test('更新保留手工项、重命名、改组和隐藏状态，来源删除后仅需复核', () => {
  const originalSources = deriveDietarySources(storage([allergy('牛奶', 'confirmed'), allergy('鸡蛋', 'suspected')]), memberId, accountId)
  const snapshot = snapshotFromSources(memberId, originalSources, at)
  snapshot.items[0] = { ...snapshot.items[0], name: '乳制品', nameAdjusted: true, visible: false }
  snapshot.items[1] = { ...snapshot.items[1], group: 'avoid', groupAdjusted: true }
  snapshot.items.push(createManualDietaryItem('自定义酱料'))
  const nextSources = deriveDietarySources(storage([allergy('牛奶', 'confirmed')]), memberId, accountId)
  const merged = mergeDietarySources(snapshot, nextSources, '2026-09-27T00:00:00.000Z')
  assert.equal(merged.items.find((item) => item.sourceId === `${memberId}-牛奶`)?.name, '乳制品')
  assert.equal(merged.items.find((item) => item.sourceId === `${memberId}-牛奶`)?.visible, false)
  assert.equal(merged.items.find((item) => item.sourceId === `${memberId}-鸡蛋`)?.group, 'avoid')
  assert.equal(merged.items.find((item) => item.sourceId === `${memberId}-鸡蛋`)?.needsReview, true)
  assert.equal(merged.items.some((item) => item.name === '自定义酱料'), true)
})

test('精确去重且双语未知项保留中文并明确待补', () => {
  const items = [createManualDietaryItem('牛奶'), createManualDietaryItem('自制香料')]
  assert.equal(dietaryItemExists(items, ' 牛奶 '), true)
  assert.equal(dietaryItemExists(items, '奶粉'), false)
  assert.equal(translateFood(items[0], 'en-zh'), 'Milk / 牛奶')
  assert.equal(translateFood(items[1], 'en-zh'), '自制香料（英文待补充）')
  assert.deepEqual(presentDietaryCard({ ...emptyDietarySnapshot(memberId, at), items }, 'en-zh').missingTranslations, ['自制香料'])
})
