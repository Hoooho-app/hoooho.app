import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { ProfileSectionStore } from './profile-section-store.mjs'
import { ChildProfileListService } from './child-profile-list-service.mjs'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { createFoodLabelService } from '../food-label/api.mjs'
import { AuthService } from '../auth/auth-service.mjs'
import { BrowserSessionService } from '../auth/browser-session-service.mjs'

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-allergy-sync-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new ProfileSectionStore(directory)
  const write = (sectionId, records, accountId = 'owner', memberId = 'child') => store.update(data => ({ ...data, sections: [...data.sections.filter(s => !(s.accountId === accountId && s.memberId === memberId && s.sectionId === sectionId)), { accountId, memberId, sectionId, records, revision: (data.sections.find(s => s.accountId === accountId && s.memberId === memberId && s.sectionId === sectionId)?.revision ?? 0) + 1 }] }))
  const read = async sectionId => (await store.read()).sections.find(s => s.accountId === 'owner' && s.memberId === 'child' && s.sectionId === sectionId)
  const card = (items, memberId = 'child') => [{ version: 1, memberId, items, avoidCrossContact: false }]
  const manual = (name, group = 'avoid') => ({ id: `manual:${name}`, name, group, visible: true, manuallyAdded: true })
  return { directory, store, write, read, card, manual }
}

test('卡片新增明确食物原子写入过敏史、带稳定来源；暂避留待排查且重试不重复', async t => {
  const f = await fixture(t)
  await f.write('dietary-card', f.card([f.manual(' 牛奶 '), f.manual('鸡蛋', 'temporary')]))
  const allergy = await f.read('allergy'), card = await f.read('dietary-card')
  assert.deepEqual(allergy.records.map(r => [r.name, r.currentStatus]), [['牛奶', 'confirmed'], ['鸡蛋', 'investigating']])
  assert.equal(card.records[0].items[0].sourceId, allergy.records[0].id)
  assert.equal(card.records[0].items[1].group, 'temporary')
  await f.write('dietary-card', card.records)
  assert.deepEqual((await f.read('allergy')).records, allergy.records)
  assert.equal((await f.read('allergy')).revision, allergy.revision)
})

test('卡片改名和改组更新同一过敏ID并保留医生来源、报告、反应；隐藏不删除', async t => {
  const f = await fixture(t)
  const original = { id: 'milk', name: '牛奶', category: 'food', currentStatus: 'confirmed', sourceType: 'clinician', tests: [{ id: 'report' }], reactions: [{ id: 'reaction' }], customLegacyField: '保留' }
  await f.write('allergy', [original])
  await f.write('dietary-card', f.card([{ id: 'card-milk', sourceId: 'milk', name: '牛奶', group: 'avoid', visible: true }]))
  let card = (await f.read('dietary-card')).records
  card = structuredClone(card); card[0].items[0].name = '牛奶蛋白'; card[0].items[0].group = 'temporary'
  await f.write('dietary-card', card)
  const allergy = await f.read('allergy'), row = allergy.records[0]
  assert.equal(row.id, 'milk'); assert.equal(row.name, '牛奶蛋白'); assert.equal(row.currentStatus, 'investigating')
  for (const key of ['sourceType', 'tests', 'reactions', 'customLegacyField']) assert.deepEqual(row[key], original[key])
  card = structuredClone((await f.read('dietary-card')).records); card[0].items[0].visible = false
  await f.write('dietary-card', card)
  assert.deepEqual((await f.read('allergy')).records, allergy.records)
  assert.equal((await f.read('dietary-card')).records[0].items[0].visible, false)
})

test('过敏史改名、删除、恢复全局更新；自定义译名或隐藏状态不保留已删警告', async t => {
  const f = await fixture(t)
  await f.write('dietary-card', f.card([f.manual('牛奶')]))
  const allergy = structuredClone((await f.read('allergy')).records)
  const card = structuredClone((await f.read('dietary-card')).records)
  card[0].items[0].englishName = 'Milk'; card[0].items[0].visible = false
  await f.write('dietary-card', card)
  allergy[0].name = '牛奶蛋白'
  await f.write('allergy', allergy)
  assert.equal((await f.read('dietary-card')).records[0].items[0].name, '牛奶蛋白')
  assert.equal((await f.read('dietary-card')).records[0].items[0].visible, false)
  allergy[0].profileListDeletedAt = '2026-10-05T12:00:00Z'
  await f.write('allergy', allergy)
  assert.deepEqual((await f.read('dietary-card')).records[0].items, [])
  assert.deepEqual(await createFoodLabelService({ dataDirectory: f.directory, model: {} }).readRecords('owner', 'child'), [])
  delete allergy[0].profileListDeletedAt
  await f.write('allergy', allergy)
  assert.equal((await f.read('dietary-card')).records[0].items[0].sourceId, allergy[0].id)
})

test('旧手工项在下一次保存建立来源，检测线索不自动确认，非食物不过卡', async t => {
  const f = await fixture(t)
  await f.write('allergy', [{ id: 'egg-report', name: '鸡蛋', category: 'food', currentStatus: 'investigating', tests: [{ result: 'positive' }] }, { id: 'cat', name: '猫', category: 'animal', currentStatus: 'confirmed' }])
  await f.write('dietary-card', f.card([f.manual('花生'), f.manual('鸡蛋', 'temporary')]))
  const allergy = await f.read('allergy')
  assert.equal(allergy.records.length, 3)
  assert.equal(allergy.records[0].id, 'egg-report')
  assert.equal(allergy.records[0].currentStatus, 'investigating')
  assert.deepEqual(allergy.records[0].tests, [{ result: 'positive' }])
  assert.deepEqual((await f.read('dietary-card')).records[0].items.map(i => i.name), ['花生', '鸡蛋'])
})

test('同步按账号和孩子隔离，伪造来源/重复名称失败时两份数据都不变', async t => {
  const f = await fixture(t)
  await f.write('allergy', [{ id: 'foreign', name: '虾', category: 'food', currentStatus: 'confirmed' }], 'other', 'child')
  const before = await f.store.read()
  await assert.rejects(() => f.write('dietary-card', f.card([{ ...f.manual('虾'), sourceId: 'foreign' }])), { code: 'ALLERGY_SYNC_CONFLICT' })
  assert.deepEqual(await f.store.read(), before)
  await assert.rejects(() => f.write('dietary-card', f.card([f.manual('牛奶'), { ...f.manual(' 牛奶 '), id: 'another' }])) , { code: 'ALLERGY_SYNC_CONFLICT' })
  assert.deepEqual(await f.store.read(), before)
  await f.write('dietary-card', f.card([f.manual('牛奶')]))
  assert.equal((await f.store.read()).sections.find(s => s.accountId === 'other').records[0].name, '虾')
  await f.write('dietary-card', f.card([f.manual('花生')], 'sibling'), 'owner', 'sibling')
  assert.deepEqual((await f.read('allergy')).records.map(r => r.name), ['牛奶'])
})

test('新版过敏列表命令实际联动卡片，明确项可读取、待排查不进入新版列表', async t => {
  const f = await fixture(t)
  const members = new FamilyMemberRepository(f.directory)
  const child = await members.create({ accountId: 'owner', name: '合成孩子', relationship: 'child', gender: 'female', birthday: '2024-01-01' })
  await f.write('dietary-card', f.card([f.manual('花生'), f.manual('鸡蛋', 'temporary')], child.id), 'owner', child.id)
  const service = new ChildProfileListService({ dataDirectory: f.directory })
  let list = await service.list('owner', child.id, 'allergy')
  assert.deepEqual(list.rows.map(r => r.name), ['花生']); assert.equal(list.compatibility.pendingAllergies, 1)
  const added = await service.command('owner', child.id, 'allergy', { action: 'add', name: '虾', group: '食物', key: 'add-shrimp' })
  const shrimp = added.rows.find(r => r.name === '虾')
  let card = (await f.store.read()).sections.find(s => s.memberId === child.id && s.sectionId === 'dietary-card')
  assert.ok(card.records[0].items.some(i => i.sourceId === shrimp.id))
  await service.command('owner', child.id, 'allergy', { action: 'delete', id: shrimp.id, version: shrimp.version, key: 'delete-shrimp' })
  card = (await f.store.read()).sections.find(s => s.memberId === child.id && s.sectionId === 'dietary-card')
  assert.equal(card.records[0].items.some(i => i.sourceId === shrimp.id), false)
  list = await service.list('owner', child.id, 'allergy')
  assert.deepEqual(list.rows.map(r => r.name), ['花生'])
})

test('真实登录保存接口返回联动后的版本与关联数据；旧卡片版本拒绝覆盖档案新值', async t => {
  const f = await fixture(t)
  const auth = new AuthService({ dataDirectory: f.directory, tokenSecret: 'synthetic-sync-test-secret', logger: () => {} })
  const browser = new BrowserSessionService(auth), user = await auth.users.createGuest()
  const headers = new Map(), response = { setHeader: (key, value) => headers.set(key, value) }
  const request = { method: 'POST', headers: { host: 'localhost', origin: 'http://localhost', 'content-type': 'application/json' }, socket: { encrypted: false } }
  await browser.issue(request, response, user)
  request.headers.cookie = headers.get('Set-Cookie').split(';')[0]
  const member = await auth.members.create({ accountId: user.id, name: '合成孩子', relationship: 'child' })
  const saved = await browser.profileSections(request, { memberId: member.id, sectionId: 'dietary-card', revision: 0, records: f.card([f.manual('牛奶')], member.id) })
  assert.ok(saved.records[0].items[0].sourceId)
  const related = saved.relatedSections.find(s => s.sectionId === 'allergy')
  assert.equal(related.records[0].name, '牛奶'); assert.equal(related.records[0].currentStatus, 'confirmed')
  await browser.profileSections(request, { memberId: member.id, sectionId: 'allergy', revision: related.revision, records: [{ ...related.records[0], name: '牛奶蛋白' }] })
  await assert.rejects(() => browser.profileSections(request, { memberId: member.id, sectionId: 'dietary-card', revision: saved.revision, records: saved.records }), { code: 'PROFILE_CONFLICT' })
  const sections = await browser.profileSections(request)
  assert.equal(sections.find(s => s.sectionId === 'dietary-card').records[0].items[0].name, '牛奶蛋白')
})

test('归档撤销移除整节时清除卡片旧来源，删除整个账号不复活任何数据', async t => {
  const f = await fixture(t)
  await f.write('dietary-card', f.card([f.manual('牛奶')]))
  await f.store.update(data => ({ ...data, sections: data.sections.filter(s => s.sectionId !== 'allergy') }))
  assert.deepEqual((await f.read('dietary-card')).records[0].items, [])
  await f.store.update(() => ({ sections: [] }))
  assert.deepEqual(await f.store.read(), { sections: [] })
})

test('旧内嵌档案读写保持同一来源ID，卡片与配料核对都读取有效记录', async t => {
  const f = await fixture(t)
  await f.write('allergy', [{ memberId: 'child', _allergyArchive: { items: [{ name: '牛奶', category: 'food', currentStatus: 'confirmed', tests: [{ id: 'old-report' }] }, { id: 'removed', name: '花生', category: 'food', currentStatus: 'confirmed', profileListDeletedAt: '2026-10-05' }] }, retainedField: '旧档案' }])
  await f.write('dietary-card', f.card([{ id: 'derived', sourceId: 'legacy-allergy-1:item-1', sourceName: '牛奶', sourceGroup: 'avoid', name: '牛奶蛋白', group: 'avoid', visible: true }]))
  const row = (await f.read('allergy')).records[0]
  assert.equal(row._allergyArchive.items[0].id, 'legacy-allergy-1:item-1')
  assert.equal(row._allergyArchive.items[0].name, '牛奶蛋白')
  assert.deepEqual(row._allergyArchive.items[0].tests, [{ id: 'old-report' }])
  assert.equal(row.retainedField, '旧档案')
  assert.deepEqual((await createFoodLabelService({ dataDirectory: f.directory, model: {} }).readRecords('owner', 'child')).map(r => r.name), ['牛奶蛋白'])
})
