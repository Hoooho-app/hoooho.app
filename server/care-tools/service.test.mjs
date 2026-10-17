import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { CareJourneyService } from '../care-journey/service.mjs'
import { MedicationReminderService } from '../medication-reminders/medication-reminder-service.mjs'
import { CareToolsService } from './service.mjs'

const photo = label => ({ id: label, dataUrl: `data:image/jpeg;base64,${Buffer.from(label).toString('base64')}` })
const product = (name, photos = [photo(name)]) => ({ name, photos })
const readable = () => ({ ingredients: ['燕麦', '水'], displayIngredients: ['燕麦', '水'], contains: ['燕麦'], advisory: ['本厂也处理含奶食品'], labelEvidence: [{ reliable: true, text: '配料：燕麦、水；本厂也处理含奶食品' }], assessmentComplete: true })
const request = (memberId, requestId = 'food-request-0001', products = [product('燕麦片'), product('米饼')]) => ({ memberId, requestId, products })

async function fixture(t, { fund = 20 } = {}) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-care-tools-'))
  t.after(() => rm(dataDirectory, { recursive: true, force: true }))
  let clock = new Date('2026-10-18T01:00:00Z')
  const care = new CareJourneyService({ dataDirectory, now: () => clock, enabledProducts: ['food-comparison', 'handoff-enhanced', 'medication-templates'] })
  await care.users.createGuest('owner', clock); await care.users.createGuest('other', clock)
  const member = await care.members.create({ accountId: 'owner', name: '小禾', relationship: 'child', birthday: '2024-01-01' }, clock)
  const otherMember = await care.members.create({ accountId: 'other', name: '另一个孩子', relationship: 'child', birthday: '2024-02-01' }, clock)
  const earn = async (accountId, days) => { for (let i = 0; i < days; i++) { await care.checkIn(accountId); clock = new Date(clock.getTime() + 86400000) } }
  if (fund) await earn('owner', fund)
  const calls = []
  let behavior = async () => readable()
  const food = { analyze: async (accountId, input, signal) => { calls.push({ accountId, input }); return behavior(accountId, input, signal) } }
  const tools = new CareToolsService({ dataDirectory, care, food })
  return { care, tools, member, otherMember, calls, earn, now: () => clock, setFood: fn => { behavior = fn } }
}

async function wallet(f, accountId = 'owner') {
  const s = await f.care.get(accountId)
  return { balance: s.balance, wallet: s.walletBalance, reserved: s.reserved, lifetime: s.lifetime, spends: s.ledger.filter(x => x.kind === 'spend') }
}

async function savedCard(f, items, { accountId = 'owner', memberId = f.member.id } = {}) {
  const snapshot = { version: 1, memberId, savedAt: '2026-10-17T02:00:00Z', items, avoidCrossContact: true }
  await f.tools.profiles.update(data => ({ ...data, sections: [...data.sections, { accountId, memberId, sectionId: 'dietary-card', records: [snapshot] }] }))
  return snapshot
}

async function reminder(f, { accountId = 'owner', memberId = f.member.id, mode = 'daily' } = {}) {
  const service = new MedicationReminderService({ dataDirectory: f.care.directory })
  return service.create(accountId, { memberId, plan: { medicationName: '仅本次医嘱药名', medicationType: 'syrup', amount: 2.5, unit: 'mL', route: 'oral', mode, times: mode === 'daily' ? ['08:00', '20:00'] : ['08:00'], ...(mode === 'interval' ? { intervalHours: 8 } : {}), startDate: f.now().toISOString().slice(0, 10), durationDays: 14, reminderTargets: ['我'], timezone: 'Asia/Shanghai' } }, f.now())
}
async function ownTemplates(f, accountId = 'owner') {
  return f.care.redeem(accountId, { productId: 'medication-templates', requestId: 'templates-owned-0001' })
}

test('two reliably read labels produce one saved scoped comparison and charge exactly five tree sprouts', async t => {
  const f = await fixture(t), before = await wallet(f)
  const result = await f.tools.compare('owner', request(f.member.id))
  assert.equal(result.valid, true); assert.equal(result.kind, 'food-comparison'); assert.equal(result.memberId, f.member.id)
  assert.deepEqual(result.products.map(x => x.name), ['燕麦片', '米饼'])
  assert.equal(result.products.length, 2); assert.deepEqual(result.unreadable, [])
  assert.ok(result.products.every(x => x.labelEvidence.every(e => e.reliable) && x.sourcePhotoCount === 1))
  assert.deepEqual(await f.tools.results('owner', result.id), result)
  const after = await wallet(f)
  assert.equal(after.balance, before.balance - 5); assert.equal(after.wallet, before.wallet - 5); assert.equal(after.reserved, 0); assert.equal(after.lifetime, before.lifetime)
  assert.equal(after.spends.length - before.spends.length, 1)
  const restarted = new CareToolsService({ dataDirectory: f.care.directory, care: new CareJourneyService({ dataDirectory: f.care.directory, now: f.now, enabledProducts: ['food-comparison'] }), food: { analyze: () => { throw Error('must use saved result') } } })
  assert.deepEqual(await restarted.compare('owner', request(f.member.id)), result)
  assert.equal((await wallet(f)).balance, after.balance)
})

test('a third unreadable label is excluded only after two real readable products remain', async t => {
  const f = await fixture(t), before = await wallet(f)
  f.setFood(async (_owner, input) => { if (input.taskId.endsWith('-2')) throw Error('unreadable third label'); return readable() })
  const result = await f.tools.compare('owner', request(f.member.id, 'three-labels-0001', [product('食品A'), product('食品B'), product('食品C')]))
  assert.equal(result.products.length, 2); assert.deepEqual(result.unreadable.map(x => x.name), ['食品C'])
  assert.equal((await wallet(f)).balance, before.balance - 5)
})

for (const [name, outcome] of [
  ['recognizer failure', () => { throw Error('provider timed out') }],
  ['explicit failed assessment', () => ({ ...readable(), failure: { message: 'blurred' } })],
  ['incomplete assessment', () => ({ ...readable(), assessmentComplete: false })],
  ['missing ingredients', () => ({ ...readable(), ingredients: [] })],
  ['missing evidence', () => ({ ...readable(), labelEvidence: [] })],
  ['unreliable evidence', () => ({ ...readable(), labelEvidence: [{ reliable: false, text: '看不清' }] })]
]) test(`one readable label plus ${name} releases reservation without charging or saving a result`, async t => {
  const f = await fixture(t), before = await wallet(f)
  f.setFood(async (_owner, input) => input.taskId.endsWith('-0') ? readable() : outcome())
  await assert.rejects(f.tools.compare('owner', request(f.member.id)), e => e.code === 'NO_VALID_RESULT')
  assert.deepEqual(await wallet(f), before)
  assert.deepEqual(await f.tools.results('owner'), { items: [] })
})

test('cancel before recognition and after the second recognition never debit a completed-looking result', async t => {
  const f = await fixture(t), before = await wallet(f)
  const beforeStart = new AbortController(); beforeStart.abort()
  await assert.rejects(f.tools.compare('owner', request(f.member.id, 'cancel-before-0001'), beforeStart.signal), e => e.name === 'AbortError')
  assert.equal(f.calls.length, 0); assert.deepEqual(await wallet(f), before)
  const afterSecond = new AbortController()
  f.setFood(async (_owner, input) => { if (input.taskId.endsWith('-1')) afterSecond.abort(); return readable() })
  await assert.rejects(f.tools.compare('owner', request(f.member.id, 'cancel-during-0001'), afterSecond.signal), e => e.name === 'AbortError')
  assert.deepEqual(await wallet(f), before); assert.deepEqual(await f.tools.results('owner'), { items: [] })
})

test('concurrent duplicate requests run recognition once, while replay never charges again', async t => {
  const f = await fixture(t), before = await wallet(f)
  let release, started
  const gate = new Promise(resolve => { release = resolve }), inProgress = new Promise(resolve => { started = resolve })
  f.setFood(async () => { started(); await gate; return readable() })
  const input = request(f.member.id, 'concurrent-0001'), running = f.tools.compare('owner', input)
  await inProgress
  const held = await wallet(f)
  assert.equal(held.wallet, before.wallet); assert.equal(held.reserved, 5); assert.equal(held.balance, before.balance - 5)
  await assert.rejects(f.tools.compare('owner', input), e => e.code === 'SERVICE_IN_PROGRESS')
  release(); const first = await running
  assert.deepEqual(await f.tools.compare('owner', input), first)
  assert.equal(f.calls.length, 2); assert.equal((await wallet(f)).balance, before.balance - 5)
  await assert.rejects(f.tools.compare('owner', { ...input, products: [product('另一件食品'), product('米饼')] }), e => e.code === 'REQUEST_CONFLICT')
  assert.equal((await wallet(f)).balance, before.balance - 5)
})

test('another account cannot run a comparison for an unowned child or read saved result by id', async t => {
  const f = await fixture(t)
  const result = await f.tools.compare('owner', request(f.member.id))
  const beforeOther = await wallet(f, 'other'), calls = f.calls.length
  await assert.rejects(f.tools.compare('other', request(f.member.id, 'other-account-0001')), e => e.status === 404)
  await assert.rejects(f.tools.results('other', result.id), e => e.code === 'RESULT_NOT_FOUND')
  assert.deepEqual(await f.tools.results('other'), { items: [] }); assert.deepEqual(await wallet(f, 'other'), beforeOther); assert.equal(f.calls.length, calls)
  const listing = await f.tools.results('owner')
  assert.deepEqual(listing.items[0].productNames, ['燕麦片', '米饼']); assert.equal(listing.items[0].products, undefined)
})

test('renaming the same photos as different products is rejected before recognition and does not reserve money', async t => {
  const f = await fixture(t), before = await wallet(f), shared = photo('同一张包装标签')
  await assert.rejects(f.tools.compare('owner', request(f.member.id, 'same-photo-0001', [product('食品A', [shared]), product('食品B', [{ ...shared, id: 'changed-client-id' }])])), e => e.code === 'CARE_TOOL_INVALID')
  assert.equal(f.calls.length, 0); assert.deepEqual(await wallet(f), before)
})

test('reordering or sharing a packaging photo cannot turn one food into two chargeable products', async t => {
  const f = await fixture(t), before = await wallet(f), a = photo('标签正面'), b = photo('标签背面'), c = photo('另一个侧面')
  for (const [key, products] of [['reordered-photos-01', [product('食品A', [a, b]), product('食品B', [b, a])]], ['overlap-photos-001', [product('食品A', [a, b]), product('食品B', [a, c])]]]) {
    await assert.rejects(f.tools.compare('owner', request(f.member.id, key, products)), e => e.code === 'CARE_TOOL_INVALID')
  }
  assert.equal(f.calls.length, 0); assert.deepEqual(await wallet(f), before)
})

test('handoff without a saved and reviewed dietary snapshot does not charge, including another account card and review-pending entries', async t => {
  const f = await fixture(t), before = await wallet(f)
  const input = { memberId: f.member.id, requestId: 'handoff-request-01', scenario: 'nursery', confirmed: true }
  await assert.rejects(f.tools.handoff('owner', input), e => e.code === 'DIETARY_REVIEW_REQUIRED')
  await savedCard(f, [{ name: '花生', group: 'avoid', visible: true }], { accountId: 'other', memberId: f.member.id })
  await savedCard(f, [{ name: '牛奶', group: 'avoid', visible: true, needsReview: true }, { name: '鸡蛋', group: 'temporary', visible: false }])
  await assert.rejects(f.tools.handoff('owner', input), e => e.code === 'DIETARY_REVIEW_REQUIRED')
  await assert.rejects(f.tools.handoff('owner', { ...input, confirmed: false }), e => e.code === 'CARE_TOOL_INVALID')
  assert.deepEqual(await wallet(f), before); assert.deepEqual(await f.tools.results('owner'), { items: [] })
})

test('handoff uses only reviewed visible avoided foods, charges once, and saves the evidence date', async t => {
  const f = await fixture(t), before = await wallet(f)
  const saved = await savedCard(f, [{ name: '花生', group: 'avoid', visible: true }, { name: '牛奶', group: 'temporary', visible: true }, { name: '鸡蛋', group: 'avoid', visible: false }, { name: '虾', group: 'avoid', visible: true, needsReview: true }, { name: '米饭', group: 'normal', visible: true }])
  const input = { memberId: f.member.id, requestId: 'handoff-valid-0001', scenario: 'travel', confirmed: true, note: '请使用独立餐具' }
  const result = await f.tools.handoff('owner', input)
  assert.deepEqual(result.avoid, ['花生']); assert.deepEqual(result.temporary, ['牛奶']); assert.equal(result.sourceSavedAt, saved.savedAt); assert.equal(result.avoidCrossContact, true)
  assert.deepEqual(await f.tools.handoff('owner', input), result); assert.equal((await wallet(f)).balance, before.balance - 10)
  await assert.rejects(f.tools.results('other', result.id), e => e.status === 404)
})

test('medication templates require ownership and cannot import another account reminder even after purchase', async t => {
  const f = await fixture(t), own = await reminder(f), foreign = await reminder(f, { accountId: 'other', memberId: f.otherMember.id }), before = await wallet(f)
  await assert.rejects(f.tools.saveTemplate('owner', { reminderId: own.id, requestId: 'unowned-template-01', label: '早晚安排' }), e => e.code === 'TEMPLATE_NOT_OWNED')
  assert.deepEqual(await f.tools.listTemplates('owner'), { owned: false, items: [] }); assert.deepEqual(await wallet(f), before)
  await ownTemplates(f); const afterPurchase = await wallet(f)
  await assert.rejects(f.tools.saveTemplate('owner', { reminderId: foreign.id, requestId: 'foreign-template-01', label: '他人安排' }), e => e.code === 'REMINDER_NOT_FOUND')
  assert.deepEqual(await f.tools.listTemplates('owner'), { owned: true, items: [] }); assert.deepEqual(await wallet(f), afterPurchase)
})

test('permanent medication templates copy timing structure only, omit clinical facts, and do not charge per save', async t => {
  const f = await fixture(t), source = await reminder(f)
  await ownTemplates(f); const afterPurchase = await wallet(f)
  const input = { reminderId: source.id, requestId: 'template-save-0001', label: '早晚各一次' }
  const first = await f.tools.saveTemplate('owner', input), template = first.items[0]
  assert.equal(first.owned, true); assert.deepEqual(template.structure, { mode: 'daily', times: ['08:00', '20:00'], reminderTargets: ['我'] })
  assert.deepEqual(Object.keys(template.structure).sort(), ['mode', 'reminderTargets', 'times'])
  for (const forbidden of ['medicationName', 'medicationType', 'amount', 'unit', 'route', 'startDate', 'durationDays', 'memberId', 'timezone']) assert.equal(template.structure[forbidden], undefined)
  assert.ok(!JSON.stringify(template).includes('仅本次医嘱药名'))
  assert.deepEqual(await f.tools.saveTemplate('owner', input), first); assert.deepEqual(await wallet(f), afterPurchase)
  await assert.rejects(f.tools.saveTemplate('owner', { ...input, label: '更换模板名' }), e => e.code === 'REQUEST_CONFLICT')
  assert.equal((await f.tools.listTemplates('owner')).items.length, 1)
  assert.deepEqual(await f.tools.listTemplates('other'), { owned: false, items: [] })
  await f.earn('other', 20); await ownTemplates(f, 'other')
  assert.deepEqual(await f.tools.listTemplates('other'), { owned: true, items: [] })
  await f.tools.deleteTemplate('other', template.id)
  assert.equal((await f.tools.listTemplates('owner')).items.length, 1)
})


test('interval template retains the chosen interval and no treatment facts or course dates', async t => {
  const f = await fixture(t), source = await reminder(f, { mode: 'interval' })
  await ownTemplates(f); const afterPurchase = await wallet(f)
  const saved = await f.tools.saveTemplate('owner', { reminderId: source.id, requestId: 'interval-template-01', label: '每八小时安排' })
  assert.deepEqual(saved.items[0].structure, { mode: 'interval', times: ['08:00'], intervalHours: 8, reminderTargets: ['我'] })
  assert.deepEqual(await wallet(f), afterPurchase)
})

test('malformed product and photo objects fail as input errors before reserving sprouts or invoking recognition', async t => {
  const f = await fixture(t), before = await wallet(f)
  for (const products of [[null, product('食品B')], [product('食品A', [null]), product('食品B')], [product('食品A', [{ id: 'missing-data' }]), product('食品B')], [product('食品A', [{ dataUrl: '' }]), product('食品B')]]) {
    await assert.rejects(f.tools.compare('owner', request(f.member.id, 'malformed-input-01', products)), e => e.status === 422)
  }
  assert.equal(f.calls.length, 0); assert.deepEqual(await wallet(f), before)
})
