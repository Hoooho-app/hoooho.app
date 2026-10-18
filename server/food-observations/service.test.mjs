import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FoodObservationService, observedFoods } from './service.mjs';
import { CareJourneyService } from '../care-journey/service.mjs';
import { FamilyMemberService } from '../members/family-member-service.mjs';
import { AccountDataService } from '../account/account-data-service.mjs';
import { foodObservationRoute, foodObservationResult, observationSourceMutation } from './api.mjs';
const DAY = 86400000;
async function setup(t, included = false) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-observation-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let clock = new Date('2026-10-01T01:00:00Z');
  const care = new CareJourneyService({ dataDirectory: directory, now: () => clock, enabledProducts: ['food-observation'], isIncluded: async () => included });
  await care.users.createGuest('owner', clock); await care.users.createGuest('other', clock);
  const member = await care.members.create({ accountId: 'owner', name: '小禾', birthday: '2024-01-01' }, clock);
  const sibling = await care.members.create({ accountId: 'owner', name: '小叶', birthday: '2023-01-01' }, clock);
  const s = new FoodObservationService({ dataDirectory: directory, now: () => clock, care });
  const list = (id = member.id, owner = 'owner') => s.list(owner, id);
  const fund = async () => { await care.get('owner'); await care.store.update(data => ({ ...data, accounts: data.accounts.map(a => a.accountId === 'owner' ? { ...a, wallet: 100, lifetime: 100 } : a) })); };
  const unlock = async (requestId = 'unlock-request-001') => { await fund(); return care.redeem('owner', { requestId, productId: 'food-observation' }); };
  const food = async (name = '南瓜', extra = {}) => {
    const event = await care.events.create({ accountId: 'owner', memberId: extra.memberId ?? member.id, title: '饮食记录', category: 'other', status: 'observing', startTime: (extra.occurredAt ?? clock.toISOString()) }, clock);
    return care.records.create({ accountId: 'owner', eventId: event.id, type: 'note', content: extra.content ?? `吃了${name}`, occurredAt: clock.toISOString(), journal: { categories: ['diet'], timePrecision: 'exact', diet: { kind: 'complementary', foods: [name] } }, ...extra }, clock);
  };
  const create = (name = '南瓜', extra = {}) => s.create('owner', { memberId: member.id, name, hasEaten: true, occurredAt: clock.toISOString(), days: 7, requestId: `create-${name}-001`.replace(/[^a-z0-9-]/gi, 'x'), ...extra });
  const change = (item, action, extra = {}) => s.change('owner', item.id, action, { memberId: member.id, version: item.version, requestId: `${action}-request-${item.version}`, ...extra });
  return { s, care, member, sibling, directory, list, fund, unlock, food, create, change, now: () => clock, tick: (ms = 1) => { clock = new Date(clock.getTime() + ms); }, next: days => { clock = new Date(clock.getTime() + days * DAY); } };
}
test('term unlock atomically charges once, survives retries and can renew only after expiry', async t => {
  const f = await setup(t); await f.fund();
  const results = await Promise.all(Array.from({ length: 8 }, () => f.care.redeem('owner', { productId: 'food-observation', requestId: 'unlock-request-001' })));
  assert.ok(results.every(r => r.balance === 70));
  let state = await f.list(); assert.equal(state.entitlement.active, true);
  assert.equal(state.entitlement.expiresAt, '2026-10-31T01:00:00.000Z');
  await assert.rejects(f.care.redeem('owner', { productId: 'food-observation', requestId: 'unlock-request-002' }), e => e.code === 'ALREADY_OWNED');
  f.next(30); state = await f.list(); assert.equal(state.entitlement.active, false);
  const renewed = await f.care.redeem('owner', { productId: 'food-observation', requestId: 'unlock-request-002' }); assert.equal(renewed.balance, 40);
  const account = (await f.care.store.read()).accounts[0]; assert.equal(account.ledger.filter(x => x.kind === 'spend').length, 2);
});
test('locked users cannot create/enable; trusted subscribed entitlement works without spending', async t => {
  const f = await setup(t);
  await assert.rejects(f.create(), e => e.code === 'OBSERVATION_LOCKED');
  await assert.rejects(f.s.automatic('owner', { memberId: f.member.id, enabled: true }), e => e.status === 403);
  const sub = await setup(t, true); const state = await sub.create();
  assert.equal(state.entitlement.included, true); assert.equal(state.items.length, 1);
  assert.equal((await sub.care.store.read()).accounts[0].ledger.length, 0);
});
test('manual ingestion saves one canonical health record, rejects future time, isolates independent durations', async t => {
  const f = await setup(t); await f.unlock();
  const input = { memberId: f.member.id, name: '南瓜', days: 7, hasEaten: true, occurredAt: f.now().toISOString(), requestId: 'manual-create-001' };
  const states = await Promise.all([f.s.create('owner', input), f.s.create('owner', input)]);
  assert.ok(states.every(s => s.items.length === 1 && s.items[0].sources.length === 1));
  assert.equal((await f.care.records.findByAccountId('owner')).length, 1);
  assert.equal(states[0].items[0].startAt, f.now().toISOString());
  await assert.rejects(f.create('胡萝卜', { requestId: 'manual-future-001', occurredAt: new Date(f.now().getTime() + DAY).toISOString() }), e => e.code === 'FUTURE_HEALTH_TIME');
  f.tick(); const second = await f.create('胡萝卜', { requestId: 'manual-create-002', days: 14 });
  const first = second.items.find(i => i.name === '南瓜');
  const changed = await f.change(first, 'duration', { days: 3 });
  assert.equal(changed.items.find(i => i.name === '南瓜').days, 3); assert.equal(changed.items.find(i => i.name === '胡萝卜').days, 14);
  await assert.rejects(f.change(first, 'duration', { days: 8 }), e => e.code === 'REQUEST_CONFLICT');
  await assert.rejects(f.change(changed.items.find(i => i.name === '南瓜'), 'duration', { days: 0 }), /1至365天/);
});
test('automatic is opt-in, skips baseline history and tracks actual source timestamp including backfill', async t => {
  const f = await setup(t); await f.unlock(); await f.food('苹果');
  assert.equal((await f.list()).items.length, 0); f.tick();
  await f.s.automatic('owner', { memberId: f.member.id, enabled: true }); f.tick();
  await f.food('南瓜', { occurredAt: new Date(f.now().getTime() - 2 * DAY).toISOString() });
  await f.s.scheduleAccount('owner'); let state = await f.list();
  assert.equal(state.items.length, 1); assert.equal(state.items[0].origin, 'automatic'); assert.equal(state.items[0].elapsedDays, 2);
  f.tick(); await f.food('苹果'); await f.food('胡萝卜', { memberId: f.sibling.id });
  state = await f.list(); assert.equal(state.items.length, 1); assert.equal((await f.list(f.sibling.id)).items.length, 0);
  await f.s.automatic('owner', { memberId: f.member.id, enabled: false }); f.tick(); await f.food('西兰花');
  assert.equal((await f.list()).items.length, 1);
});
test('food extraction excludes plans, negations, maternal intake, uncertain times and ingredients inferred from mixtures', async t => {
  const f = await setup(t); await f.unlock(); await f.s.automatic('owner', { memberId: f.member.id, enabled: true }); f.tick();
  for (const content of ['明天准备吃鸡蛋', '今天没有吃鸡蛋', '妈妈吃了鸡蛋', '今天不吃鸡蛋', '今天没碰鸡蛋', '下午要吃鸡蛋', '今天吃了鸡蛋？', '鸡蛋能吃吗？']) await f.food('鸡蛋', { content });
  await f.food('花生', { journal: { categories: ['diet'], timePrecision: 'unknown', diet: { kind: 'complementary', foods: ['花生'] } } });
  await f.food('牛奶', { journal: { categories: ['diet'], diet: { kind: 'feeding', feedingMethod: 'breast', foods: ['牛奶'] } } });
  await f.food('鸡蛋', { content: '吃了蛋糕' });
  const pending = await f.food('小麦'); await f.care.records.update(pending.id, { confirmationStatus: 'pending' }, f.now());
  await f.food('大豆', { caseContext: { identity: 'external_ai' } });
  await f.food('鱼', { occurredAt: new Date(f.now().getTime() + DAY).toISOString() });
  assert.deepEqual((await f.list()).items.map(i => i.name), []);
  await f.food('蛋糕', { content: '吃了蛋糕' });
  const state = await f.list(); assert.deepEqual(state.items.map(i => i.name), ['蛋糕']);
  assert.deepEqual(observedFoods({ content: '吃了鸡蛋', journal: { categories: ['diet'], diet: { kind: 'meal', foods: ['鸡蛋'] } } }), ['鸡蛋']);
});
test('existing allergy/avoid arrangements suppress ordinary automatic and manual observation without changing medical archive', async t => {
  const f = await setup(t); await f.unlock();
  await f.s.profile.update(() => ({ sections: [{ accountId: 'owner', memberId: f.member.id, sectionId: 'allergy', records: [{ name: '牛乳', category: 'food', currentStatus: 'confirmed' }] }, { accountId: 'owner', memberId: f.member.id, sectionId: 'dietary-card', records: [{ items: [{ name: '花生', group: 'avoid', visible: true }] }] }] }));
  const before = await f.s.profile.read(); await f.s.automatic('owner', { memberId: f.member.id, enabled: true }); f.tick(); await f.food('酸奶'); await f.food('花生');
  assert.equal((await f.list()).items.length, 0); await assert.rejects(f.create('牛奶'), e => e.code === 'EXISTING_CARE_ARRANGEMENT'); assert.deepEqual(await f.s.profile.read(), before);
});
test('full time enters due, requires two answers, unknown remains information-poor and sources never imply symptom absence', async t => {
  const f = await setup(t); await f.unlock(); let state = await f.create(); let item = state.items[0];
  assert.equal(item.status, 'observing'); await assert.rejects(f.change(item, 'review', { intake: 'daily', symptoms: 'none' }), /尚未到/);
  f.next(7); state = await f.list(); item = state.items[0]; assert.equal(item.status, 'due'); assert.equal(item.elapsedDays, 7); assert.equal(item.reviews.length, 0);
  await assert.rejects(f.change(item, 'review', { intake: 'daily' }), /分别确认/);
  state = await f.change(item, 'review', { intake: 'unknown', symptoms: 'unknown' });
  assert.equal(state.items[0].reviews[0].outcome, '信息不足，保留观察'); assert.equal(state.items[0].status, 'complete'); assert.equal(state.items[0].reviews[0].sourceChanged, false);
  const repeated = await f.change(item, 'review', { intake: 'unknown', symptoms: 'unknown' }); assert.equal(repeated.items[0].reviews.length, 1);
});
test('retrospective no-repeat and no-symptom answers cannot silently contradict recorded evidence', async t => {
  const f = await setup(t); await f.unlock(); await f.create(); f.next(2); await f.food();
  const symptom = await f.food('南瓜', { content: '晚上皮疹', journal: { categories: ['symptom'], timePrecision: 'exact' } });
  f.next(5); const item = (await f.list()).items[0];
  await assert.rejects(f.change(item, 'review', { intake: 'none', symptoms: 'yes' }), e => e.code === 'INTAKE_CONFLICT');
  await assert.rejects(f.change(item, 'review', { intake: 'sometimes', symptoms: 'none' }), e => e.code === 'SYMPTOM_REVIEW_REQUIRED');
  const state = await f.change(item, 'review', { intake: 'sometimes', symptoms: 'none', acknowledgeSymptoms: true });
  const review = state.items[0].reviews[0]; assert.equal(review.sources.length, 2); assert.equal(review.symptoms[0].id, symptom.id);
  assert.equal((await f.care.records.findById(symptom.id)).content, '晚上皮疹');
});
test('edits/deletions recalculate active start and stale writes fail; completed snapshots remain and flag changes across rounds', async t => {
  const f = await setup(t); await f.unlock(); let item = (await f.create()).items[0]; const first = item.sources[0]; f.next(1); const later = await f.food();
  await f.care.records.delete(first.id); const recomputed = (await f.list()).items[0]; assert.equal(recomputed.startAt, later.occurredAt); assert.equal(recomputed.sources.length, 1);
  await assert.rejects(f.change(item, 'duration', { days: 8 }), e => e.code === 'OBSERVATION_CHANGED');
  f.next(7); item = (await f.list()).items[0]; const reviewed = await f.change(item, 'review', { intake: 'none', symptoms: 'none' });
  const snapshot = reviewed.items[0].reviews[0]; assert.equal(snapshot.sourceChanged, false);
  item = reviewed.items[0]; const next = await f.change(item, 'next-round', { days: 3 }); assert.equal(next.items[0].status, 'waiting'); assert.equal(next.items[0].reviews[0].sourceChanged, false);
  f.tick(); await f.food(); const active = (await f.list()).items[0]; assert.equal(active.sources.length, 1); assert.equal(active.reviews[0].sourceChanged, false);
  await f.care.records.delete(later.id); const changed = (await f.list()).items[0]; assert.equal(changed.reviews[0].sourceChanged, true); assert.equal(changed.reviews[0].sources[0].id, later.id);
});
test('expiry blocks new observations and new rounds but preserves already started followup and history', async t => {
  const f = await setup(t); await f.unlock(); await f.s.automatic('owner', { memberId: f.member.id, enabled: true }); f.next(29); await f.create();
  f.next(7); await f.food('苹果'); let state = await f.list(); assert.equal(state.entitlement.active, false); assert.equal(state.items.length, 1); assert.equal(state.items[0].status, 'due');
  await assert.rejects(f.create('胡萝卜', { requestId: 'create-expired-002' }), e => e.code === 'OBSERVATION_LOCKED');
  state = await f.change(state.items[0], 'review', { intake: 'none', symptoms: 'none' }); assert.equal(state.items[0].status, 'complete');
  await assert.rejects(f.change(state.items[0], 'next-round', { days: 7 }), e => e.code === 'OBSERVATION_LOCKED');
});
test('account/member ownership and member deletion cover observations', async t => {
  const f = await setup(t); await f.unlock(); const item = (await f.create()).items[0];
  await assert.rejects(f.list(f.member.id, 'other'), e => e.status === 404);
  await assert.rejects(f.s.change('owner', item.id, 'duration', { memberId: f.sibling.id, days: 3, version: item.version, requestId: 'cross-child-001' }), e => e.status === 404);
  await f.s.automatic('owner', { memberId: f.member.id, enabled: true });
  await new FamilyMemberService({ dataDirectory: f.directory }).delete('owner', f.member.id);
  const store = await f.s.store.read(); assert.equal(store.observations.length, 0); assert.equal(store.preferences.length, 0);
});
test('account deletion includes both collections; route scope and source hooks cover formal writes only', async t => {
  const f = await setup(t); await f.unlock(); await f.create();
  await new AccountDataService({ dataDirectory: f.directory }).deleteAccount('owner');
  assert.equal((await f.s.store.read()).observations.length, 0);
  assert.deepEqual(foodObservationRoute('/api/food-observations/a-1/review'), { id: 'a-1', action: 'review' });
  assert.equal(foodObservationRoute('/api/food-observations/a-1/invalid'), null);
  assert.equal(observationSourceMutation('/api/quick-records', 'POST'), true); assert.equal(observationSourceMutation('/api/events/id/records', 'PATCH'), true);
  assert.equal(observationSourceMutation('/api/quick-records/duplicate-check', 'POST'), false);
  await assert.rejects(foodObservationResult(f.s, 'owner', { id: null }, 'DELETE', {}, {}), e => e.status === 405);
});
test('unstarted observations do not begin after entitlement expires; known arrangements do not retroactively auto-start after removal', async t => {
  const f = await setup(t); await f.unlock();
  await f.create('南瓜', { hasEaten: false });
  await f.s.profile.update(() => ({ sections: [{ accountId: 'owner', memberId: f.member.id, sectionId: 'allergy', records: [{ name: '花生', category: 'food', currentStatus: 'confirmed' }] }] }));
  await f.s.automatic('owner', { memberId: f.member.id, enabled: true }); f.tick(); await f.food('花生'); await f.list();
  await f.s.profile.update(() => ({ sections: [] })); assert.equal((await f.list()).items.length, 1);
  f.next(31); await f.food('南瓜'); const state = await f.list(); assert.equal(state.items[0].status, 'waiting'); assert.equal(state.items[0].startAt, null);
});
test('confirmed smart draft save and undo trigger reconciliation while unsaved previews do not', () => {
  assert.equal(observationSourceMutation('/api/members/child/ai-drafts/draft/save', 'POST'), true);
  assert.equal(observationSourceMutation('/api/members/child/ai-drafts/draft/undo', 'POST'), true);
  assert.equal(observationSourceMutation('/api/members/child/ai-drafts/draft', 'PATCH'), false);
});
test('guest upgrade retains both timed grants and moves observation ownership with the child', async t => {
  const f = await setup(t); await f.unlock();
  const guest = 'guest:observation-merge'; await f.care.users.createGuest(guest, f.now());
  const child = await f.care.members.create({ accountId: guest, name: '合并验收', birthday: '2024-01-01' }, f.now());
  await f.care.transaction(guest, null, account => { account.owned.push({ id: 'guest-grant', productId: 'food-observation', kind: 'term', expiresAt: new Date(f.now().getTime() + 60 * DAY).toISOString() }); }, { reconcile: false });
  await f.s.create(guest, { memberId: child.id, name: '苹果', hasEaten: false, days: 7, requestId: 'guest-create-001' });
  await new AccountDataService({ dataDirectory: f.directory }).mergeGuest(guest, 'owner', f.now());
  const state = await f.s.list('owner', child.id); assert.equal(state.items[0].name, '苹果');
  assert.equal(state.entitlement.expiresAt, new Date(f.now().getTime() + 60 * DAY).toISOString());
  const account = (await f.care.store.read()).accounts.find(a => a.accountId === 'owner'); assert.equal(account.owned.filter(o => o.productId === 'food-observation').length, 2);
});

test('explicit child milk/formula intake may be observed by product name without inferring ingredients or maternal exposure', () => {
  const record = (content, foods, feedingMethod) => ({ content, journal: { categories: ['diet'], diet: { kind: 'feeding', foods, feedingMethod } } });
  assert.deepEqual(observedFoods(record('喝了牛奶100ml', ['牛奶'], 'formula')), ['牛奶']);
  assert.deepEqual(observedFoods(record('喝了A牌配方奶', ['A牌配方奶', '牛奶', '大豆'], 'formula')), ['A牌配方奶']);
  assert.deepEqual(observedFoods(record('妈妈吃了鸡蛋后喂母乳', ['鸡蛋'], 'breast')), []);
  assert.deepEqual(observedFoods(record('喝了母乳', ['母乳'], 'expressed')), []);
});
