import assert from 'node:assert/strict'
import test from 'node:test'
import { createAllergyItem, type AllergyHistoryItem } from '../../features/health-profile/utils/allergyProfile.ts'
import { buildDietaryCardExportLayout } from './dietaryCardExport.ts'
import {
  createManualDietaryItem,
  defaultDietaryLanguage,
  deriveDietarySources,
  dietaryItemExists,
  dietaryLanguageOptions,
  dietaryCopy,
  emptyDietarySnapshot,
  mergeDietarySources,
  presentDietaryCard,
  readDietarySnapshot,
  resolveDietaryNativeLanguage,
  snapshotFromSources,
  translateFood
} from './dietaryCardModel.ts'

const accountId = 'account-1'
const memberId = 'member-current'
const at = '2026-09-26T00:00:00.000Z'

test('母语使用显式账号选择或设备语言地区，繁体与简体脚本优先于地区', () => {
  for (const locale of ['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant', 'zh_Hant_TW']) assert.equal(resolveDietaryNativeLanguage(undefined, locale), 'zh-Hant')
  for (const locale of ['zh-CN', 'zh-SG', 'zh-Hans-TW']) assert.equal(resolveDietaryNativeLanguage(undefined, locale), 'zh')
  assert.equal(resolveDietaryNativeLanguage('zh-CN', 'zh-TW'), 'zh')
  assert.equal(resolveDietaryNativeLanguage('en-US', 'zh-TW'), 'en')
  assert.equal(resolveDietaryNativeLanguage(undefined, 'en-GB'), 'en')
  assert.equal(resolveDietaryNativeLanguage(undefined, 'ja-JP'), 'zh')
  assert.deepEqual(dietaryLanguageOptions('zh-Hant').map((option) => option.label), ['繁體中文', 'English', '繁體中文 + English'])
  assert.deepEqual(dietaryLanguageOptions('zh').map((option) => option.value), ['zh', 'en', 'en-zh'])
  assert.deepEqual(dietaryLanguageOptions('en'), [{ value: 'en', label: 'English' }])
  assert.equal(defaultDietaryLanguage('zh-Hant'), 'en-zh-Hant')
})

test('纯英文正文及导出无中文，手工英文优先，缺失译名禁止不完整导出', () => {
  const item = createManualDietaryItem('鸡蛋', 'avoid')
  const snapshot = { ...emptyDietarySnapshot(memberId, at), items: [item], avoidCrossContact: true }
  assert.equal(translateFood(item, 'en'), 'Egg')
  assert.doesNotMatch(buildDietaryCardExportLayout(snapshot, 'en').texts.join(' '), /\p{Script=Han}/u)
  item.englishName = 'Chicken egg'
  assert.equal(translateFood(item, 'en'), 'Chicken egg')
  item.englishName = '   '
  assert.equal(translateFood(item, 'en'), 'Egg')
  const unknown = createManualDietaryItem('自制香料')
  snapshot.items.push(unknown)
  assert.deepEqual(presentDietaryCard(snapshot, 'en').missingTranslations, ['自制香料'])
  assert.throws(() => buildDietaryCardExportLayout(snapshot, 'en'), /补充/)
  unknown.visible = false
  assert.deepEqual(presentDietaryCard(snapshot, 'en').missingTranslations, [])
  unknown.visible = true
  unknown.englishName = '自制香料'
  assert.deepEqual(presentDietaryCard(snapshot, 'en').missingTranslations, ['自制香料'])
  unknown.englishName = 'Homemade spices'
  assert.doesNotMatch(buildDietaryCardExportLayout(snapshot, 'en').texts.join(' '), /\p{Script=Han}/u)
})

test('繁体正文、食物和双语导出使用相同词汇，不改原始记录', () => {
  const item = createManualDietaryItem('鸡蛋', 'avoid')
  const snapshot = { ...emptyDietarySnapshot(memberId, at), items: [item] }
  assert.equal(translateFood(item, 'zh-Hant'), '雞蛋')
  assert.equal(translateFood(item, 'en-zh-Hant'), 'Egg / 雞蛋')
  assert.equal(dietaryCopy['zh-Hant'].avoid, '明確不能吃')
  assert.ok(buildDietaryCardExportLayout(snapshot, 'en-zh-Hant').texts.includes('Egg / 雞蛋'))
  assert.equal(item.name, '鸡蛋')
  const traditionalItem = createManualDietaryItem('雞蛋')
  assert.equal(traditionalItem.foodId, 'egg')
  assert.equal(translateFood(traditionalItem, 'en'), 'Egg')
  assert.equal(translateFood(traditionalItem, 'zh'), '鸡蛋')
})

test('人工译名优先，资料重新同步不覆盖人工译名，不扩展食物范围',()=>{
  const sources=deriveDietarySources(storage([allergy('牛奶','confirmed')]),memberId,accountId)
  const snapshot=snapshotFromSources(memberId,sources,at)
  snapshot.items[0].englishName='Cow milk'
  const merged=mergeDietarySources(snapshot,sources,at)
  assert.equal(translateFood(merged.items[0],'en-zh'),'Cow milk / 牛奶')
  assert.equal(merged.items.length,1)
})

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
  const temporary = allergy('鸡蛋', 'suspected')
  temporary.dietaryAction = 'temporary'
  const snapshot = snapshotFromSources(memberId, deriveDietarySources(storage([temporary]), memberId, accountId), at)
  const card = presentDietaryCard(snapshot, 'zh')
  assert.equal(card.avoid.length, 0)
  assert.deepEqual(card.temporary.map((item) => item.name), ['鸡蛋'])
})

test('普通待排查、动物和仅报告线索不会自动变成忌口', () => {
  const suspected = allergy('花生', 'investigating')
  const animal = allergy('猫', 'confirmed', memberId, 'animal')
  const reportOnly = allergy('牛乳', 'investigating')
  reportOnly.sourceType = 'report'
  assert.deepEqual(deriveDietarySources(storage([suspected, animal, reportOnly]), memberId, accountId), [])
})

test('P-003 多项记录按明确和暂避分组、全量进入导出且高度随内容增长', () => {
  const names = ['牛奶', '鸡蛋', '花生', '小麦', '大豆', '芝麻', '核桃', '杏仁', '腰果', '虾', '蟹', '鱼', '芒果', '猕猴桃', '草莓', '桃', '番茄', '燕麦']
  const records = names.map((name, index) => allergy(name, index < 12 ? 'confirmed' : 'investigating'))
  records.slice(12).forEach((item) => { item.dietaryAction = 'temporary' })
  const sources = deriveDietarySources(storage(records), memberId, accountId)
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

test('更新跟随统一名称与状态、保留手工项和隐藏设置，删除来源不残留警告', () => {
  const temporary = allergy('鸡蛋', 'suspected')
  temporary.dietaryAction = 'temporary'
  const originalSources = deriveDietarySources(storage([allergy('牛奶', 'confirmed'), temporary]), memberId, accountId)
  const snapshot = snapshotFromSources(memberId, originalSources, at)
  snapshot.items[0] = { ...snapshot.items[0], name: '乳制品', nameAdjusted: true, visible: false }
  snapshot.items[1] = { ...snapshot.items[1], group: 'avoid', groupAdjusted: true }
  snapshot.items.push(createManualDietaryItem('自定义酱料'))
  const nextSources = deriveDietarySources(storage([allergy('牛奶', 'confirmed')]), memberId, accountId)
  const merged = mergeDietarySources(snapshot, nextSources, '2026-09-27T00:00:00.000Z')
  assert.equal(merged.items.find((item) => item.sourceId === `${memberId}-牛奶`)?.name, '牛奶')
  assert.equal(merged.items.find((item) => item.sourceId === `${memberId}-牛奶`)?.visible, false)
  assert.equal(merged.items.some((item) => item.sourceId === `${memberId}-鸡蛋`), false)
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
