import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { NurseService } from './nurse-service.mjs'
import { confirmedCurrentEmergency } from './nurse-emergency.mjs'
import { validateNurseMetadata } from './nurse-contract.mjs'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { HealthEventService } from '../events/health-event-service.mjs'
import { HealthEventRecordService } from '../events/health-event-record-service.mjs'
import { QuickRecordService } from '../events/quick-record-service.mjs'
import { AccountDataService } from '../account/account-data-service.mjs'

const at = '2026-10-06T01:00:00.000Z'
const output = (change = {}) => ({ reply: '痒有没有影响睡眠？', intent: 'continue', emergency: { currentChild: false, quote: '' }, fields: { narrative: '脸颊发红发痒。', locationText: '脸颊', impactLevel: '', triggerText: '', trend: '' }, fieldEvidence: [{ field: 'narrative', sourceTurnId: 'user-1', quote: '脸颊发红发痒' }, { field: 'locationText', sourceTurnId: 'user-1', quote: '脸颊' }], notes: [], ...change })
async function fixture(t, make = () => output()) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-nurse-test-'))
  t.after(() => rm(dataDirectory, { recursive: true, force: true }))
  const members = new FamilyMemberRepository(dataDirectory)
  const member = await members.create({ accountId: 'qa-nurse', name: '合成验证人物', relationship: 'other' })
  const events = new HealthEventService({ dataDirectory })
  const provider = { baseUrl: 'https://fixture.invalid', model: 'fixture', fetch: async () => Response.json({ output: [{ content: [{ text: JSON.stringify(await make()) }] }], usage: { input_tokens: 15, output_tokens: 20 } }) }
  const nurse = new NurseService({ dataDirectory, events, provider, now: () => new Date(at) })
  let draft = await nurse.open('qa-nurse', member.id, { scope: `${member.id}:event-a:task-a` })
  const user = { id: 'user-1', role: 'user', text: '脸颊发红发痒。我担心是鸡蛋过敏，但没有喘。', at, final: true, status: 'completed' }
  const append = async () => { draft = await nurse.change('qa-nurse', member.id, draft.id, { version: draft.version, turn: user }); return draft }
  return { nurse, events, members, member, dataDirectory, user, append, get draft() { return draft } }
}
test('empty conversation cannot be organized; resume same scope, child and account isolation', async t => {
  const f = await fixture(t)
  assert.equal((await f.nurse.open('qa-nurse', f.member.id, { scope: `${f.member.id}:event-a:task-a` })).id, f.draft.id)
  await assert.rejects(() => f.nurse.generate('qa-nurse', f.member.id, f.draft.id, { version: 0, organize: true }), /先说出/)
  const other = await f.members.create({ accountId: 'qa-nurse', name: '另一个合成人物', relationship: 'other' })
  await assert.rejects(() => f.nurse.owned('qa-nurse', other.id, f.draft.id), /当前人物/)
  await assert.rejects(() => f.nurse.owned('other-account', f.member.id, f.draft.id))
})
test('final transcripts, corrections and interrupted replies survive; interim and assistant-as-source rejected', async t => {
  const f = await fixture(t); await f.append()
  await assert.rejects(() => f.nurse.change('qa-nurse', f.member.id, f.draft.id, { version: 1, turn: { ...f.user, id: 'interim', final: false } }), /最终/)
  const metadata = { version: 'nurse-v1', draftId: f.draft.id, turns: f.draft.turns, professionalNotes: [{ id: 'note', category: 'parent_concern', heading: '家长担心', text: '担心鸡蛋过敏', sourceTurnIds: [f.draft.turns[0].id], certainty: 'uncertain', attribution: 'parent', editedByUser: false, createdAt: at, updatedAt: at }] }
  assert.throws(() => validateNurseMetadata(metadata), /家长原话/)
  assert.throws(() => validateNurseMetadata({ ...metadata, turns: [{ ...f.user, correctsTurnId: 'missing' }] }), /更正来源/)
})
test('organization requires exact user quote; suspicion stays uncertain without allergy-history mutation', async t => {
  const f = await fixture(t, () => output({ notes: [{ category: 'parent_concern', heading: '家长担心鸡蛋相关', text: '家长担心鸡蛋过敏，尚未确认。', sourceTurnId: 'user-1', quote: '我担心是鸡蛋过敏', certainty: 'uncertain', attribution: 'parent' }] }))
  await f.append(); const next = await f.nurse.generate('qa-nurse', f.member.id, f.draft.id, { version: 1, organize: true })
  assert.equal(next.notes[0].certainty, 'uncertain'); assert.equal(next.turns.length, 2); assert.equal(next.step, 'review')
  const bad = await fixture(t, () => output({ notes: [{ category: 'prior_action', heading: '处理', text: '已服药', sourceTurnId: 'user-1', quote: '吃了药', certainty: 'reported', attribution: 'parent' }] }))
  await bad.append(); await assert.rejects(() => bad.nurse.generate('qa-nurse', bad.member.id, bad.draft.id, { version: 1, organize: true }), /来源未通过/)
})
test('late result cannot overwrite a changed or discarded draft', async t => {
  let resolve, entered; const wait = new Promise(r => { resolve = r }), started = new Promise(r => { entered = r })
  const f = await fixture(t, async () => { entered(); await wait; return output() }); await f.append()
  const pending = f.nurse.generate('qa-nurse', f.member.id, f.draft.id, { version: 1, organize: true })
  await started
  await f.nurse.change('qa-nurse', f.member.id, f.draft.id, { version: 1, discard: true }); resolve()
  await assert.rejects(() => pending, /迟到结果/)
})
test('current emergency stops normal questions, cannot use an older turn as current evidence', async t => {
  const f = await fixture(t, () => output({ emergency: { currentChild: true, quote: '没有喘' } })); await f.append()
  // Semantic decision is supplied by the model; quote provenance is independently enforced.
  const next = await f.nurse.generate('qa-nurse', f.member.id, f.draft.id, { version: 1 })
  assert.equal(next.emergency, false)
  const danger = await f.nurse.change('qa-nurse', f.member.id, f.draft.id, { version: next.version, turn: { ...f.user, id: 'user-danger', text: '刚才没有喘，但现在孩子呼吸困难。' } })
  f.nurse.provider.fetch = async () => Response.json({ output: [{ content: [{ text: JSON.stringify(output({ emergency: { currentChild: true, quote: '现在孩子呼吸困难' } })) }] }] })
  const urgent = await f.nurse.generate('qa-nurse', f.member.id, f.draft.id, { version: danger.version })
  assert.equal(urgent.emergency, true); assert.match(urgent.turns.at(-1).text, /当地急救/); assert.ok(!urgent.turns.at(-1).text.includes('120'))
})
test('review cannot persist audio or change immutable transcript; account deletion removes drafts', async t => {
  const f = await fixture(t); await f.append()
  const metadata = { version: 'nurse-v1', draftId: f.draft.id, turns: f.draft.turns, professionalNotes: [], snapshots: [] }
  const next = await f.nurse.change('qa-nurse', f.member.id, f.draft.id, { version: 1, review: { fields: { narrative: '发红', rawAudio: 'data:audio/raw' }, metadata: { ...metadata, rawAudio: 'data:audio/raw' }, deletedNoteIds: [], rawAudio: 'data:audio/raw' } })
  assert.ok(!JSON.stringify(next).includes('rawAudio'))
  await assert.rejects(() => f.nurse.change('qa-nurse', f.member.id, next.id, { version: next.version, review: { fields: {}, metadata: { ...metadata, turns: [{ ...f.user, text: '篡改原话' }] } } }), /原话来源/)
  await new AccountDataService({ dataDirectory: f.dataDirectory }).deleteAccount('qa-nurse')
  await assert.rejects(() => f.nurse.owned('qa-nurse', f.member.id, next.id))
})
test('atomic save metadata+transcript, idempotent same record, failed validation creates nothing; original text immutable on edit', async t => {
  const f = await fixture(t); await f.append()
  const event = await f.events.create('qa-nurse', { memberId: f.member.id, title: '合成症状', category: 'other', startTime: at })
  const records = new HealthEventRecordService({ dataDirectory: f.dataDirectory })
  const aiNurse = { version: 'nurse-v1', draftId: f.draft.id, turns: f.draft.turns, professionalNotes: [], snapshots: [] }
  const input = { type: 'note', content: '脸颊发红', occurredAt: at, journal: { categories: ['symptom'], symptom: { symptomCategory: 'skin', narrative: '脸颊发红', locations: [], descriptors: [] }, aiNurse } }
  await assert.rejects(() => records.create('qa-nurse', event.id, { ...input, content: '' }))
  assert.equal((await records.list('qa-nurse', event.id)).length, 0); assert.ok(!(await f.nurse.owned('qa-nurse', f.member.id, f.draft.id)).saved)
  const first = await records.create('qa-nurse', event.id, input); const second = await records.create('qa-nurse', event.id, input)
  assert.equal(first.id, second.id); assert.equal((await records.list('qa-nurse', event.id)).length, 1)
  assert.equal((await f.nurse.owned('qa-nurse', f.member.id, f.draft.id)).saved.recordId, first.id)
  await assert.rejects(() => records.update('qa-nurse', first.id, { journal: { ...input.journal, aiNurse: { ...aiNurse, turns: [{ ...f.user, text: '伪造' }] } } }), /原文只读/)
  const updated = await records.update('qa-nurse', first.id, { journal: { categories: ['other'] } })
  assert.deepEqual(updated.journal.aiNurse.turns, first.journal.aiNurse.turns)
})


test('failed media association rolls back event, record, idempotency marker and saved draft together', async t => {
  const f = await fixture(t); await f.append()
  const records = new HealthEventRecordService({ dataDirectory: f.dataDirectory })
  const quick = new QuickRecordService({ dataDirectory: f.dataDirectory, events: f.events, records, photos: { prepareForSave: async () => [], attach: async () => { throw new Error('fixture-media-failure') } } })
  const input = { idempotencyKey: 'nurse-atomic-media', memberId: f.member.id, title: '合成症状', content: '脸颊发红', occurredAt: at, inputChannel: 'text', journal: { categories: ['symptom'], symptom: { symptomCategory: 'skin', narrative: '脸颊发红', locations: [], descriptors: [] }, aiNurse: { version: 'nurse-v1', draftId: f.draft.id, turns: f.draft.turns, professionalNotes: [], snapshots: [] } } }
  await assert.rejects(() => quick.create('qa-nurse', input), /fixture-media-failure/)
  assert.equal((await f.events.repository.findByAccountId('qa-nurse')).length, 0)
  assert.equal((await records.repository.findByAccountId('qa-nurse')).length, 0)
  assert.equal(await quick.requests.find('qa-nurse', input.idempotencyKey), null)
  assert.ok(!(await f.nurse.owned('qa-nurse', f.member.id, f.draft.id)).saved)
  quick.photos = null
  const saved = await quick.create('qa-nurse', input)
  const again = await quick.create('qa-nurse', input)
  assert.equal(again.recordId, saved.recordId)
})

test('semantic voice intent appends no duplicate normal assistant turn; field provenance rejects assistant questions', async t => {
  const f = await fixture(t, () => output({ reply: '', intent: 'organize' })); await f.append()
  const assessed = await f.nurse.generate('qa-nurse', f.member.id, f.draft.id, { version: 1, assessOnly: true })
  assert.equal(assessed.organizeSuggested, true); assert.equal(assessed.turns.length, 2)
  const bad = await fixture(t); await bad.append()
  bad.nurse.provider.fetch = async () => Response.json({ output: [{ content: [{ text: JSON.stringify(output({ fieldEvidence: [{ field: 'narrative', sourceTurnId: bad.draft.turns[0].id, quote: '孩子哪里不舒服' }] })) }] }] })
  await assert.rejects(() => bad.nurse.generate('qa-nurse', bad.member.id, bad.draft.id, { version: 1, organize: true }), /字段来源/)
})

test('reorganization protects human fields, changed headings, deleted notes and body/time review controls', async t => {
  const note = { category: 'parent_concern', heading: '担心', text: '担心鸡蛋相关', sourceTurnId: 'user-1', quote: '我担心是鸡蛋过敏', certainty: 'uncertain', attribution: 'parent' }
  const f = await fixture(t, () => output({ notes: [note] })); await f.append()
  const first = await f.nurse.generate('qa-nurse', f.member.id, f.draft.id, { version: 1, organize: true })
  const metadata = { version: 'nurse-v1', draftId: first.id, turns: first.turns, professionalNotes: [], snapshots: first.snapshots }
  const reviewed = await f.nurse.change('qa-nurse', f.member.id, first.id, { version: first.version, review: { fields: { ...first.fields, narrative: '人工核对的症状', locationText: '' }, metadata, deletedNoteIds: first.notes.map(n => n.id), form: { categories: ['symptom'], symptom: { symptomCategory: 'skin', narrative: '人工核对的症状', locations: [], descriptors: [], shortNote: '人工补充' }, timePrecision: 'unknown' } } })
  const next = await f.nurse.generate('qa-nurse', f.member.id, first.id, { version: reviewed.version, organize: true })
  assert.equal(next.notes.length, 0); assert.equal(next.fields.narrative, '人工核对的症状'); assert.equal(next.fields.locationText, '')
  assert.equal(next.review.form.symptom.shortNote, '人工补充'); assert.equal(next.review.form.timePrecision, 'unknown')
  const resend = await f.nurse.change('qa-nurse', f.member.id, first.id, { version: 0, turn: f.user })
  assert.equal(resend.version, next.version)
})

test('absence of consciousness is danger, not a negated consciousness symptom', () => {
 assert.equal(confirmedCurrentEmergency({currentChild:true,quote:'孩子现在没有意识了'},{text:'孩子现在没有意识了'}),true)
 assert.equal(confirmedCurrentEmergency({currentChild:true,quote:'没有意识异常'},{text:'没有意识异常，现在反应正常'}),false)
})
