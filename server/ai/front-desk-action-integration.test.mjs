import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { FrontDeskRecord } from './front-desk-record.mjs'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { HealthEventService } from '../events/health-event-service.mjs'

const unknown = () => ({ kind: 'unknown', memberId: null, label: null, sources: [] })
const reference = (quote, messageId = 'identity') => ({ messageId, attachmentId: null, quote })
const response = (extra = {}) => ({ reply: '我会按这条草稿处理。', contextId: 'context-1', responseMode: 'operation', taskRelation: 'continue', subject: unknown(), recordChanges: [], nextQuestion: null, uncertainties: [], emergency: { currentChild: false, quote: '' }, requestedAction: { type: 'save', targetIds: ['draft-1'], targetVersion: 3, confirmation: 'explicit', quote: '保存这条' }, ...extra })

async function fixture(t, extra = {}) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-front-action-'))
  t.after(() => rm(dataDirectory, { recursive: true, force: true }))
  const repository = new FamilyMemberRepository(dataDirectory)
  const member = await repository.create({ accountId: 'synthetic', name: '小禾', relationship: 'child' })
  await repository.create({ accountId: 'synthetic', name: '小明', relationship: 'child' })
  const owner = { kind: 'current', memberId: member.id, label: member.name, sources: [reference('小禾')], confirmed: true }
  const draft = { id: 'draft-1', version: 3, state: 'ready', inputText: '小禾今天咳嗽', items: [{ id: 'item-1', subject: 'current', subjectConfirmed: true, fields: [] }], sources: [], ...extra.draft }
  let calls = 0, saveCalls = 0
  const business = { read: async (accountId, memberId, id) => accountId === 'synthetic' && memberId === member.id && id === draft.id ? structuredClone(draft) : null, save: async () => { saveCalls++; throw new Error('The dialogue planner must not save') } }
  const model = { structured: async () => { calls++; return { value: response(extra.response), diagnostics: { provider: 'test' } } } }
  const service = new FrontDeskRecord({ dataDirectory, events: new HealthEventService({ dataDirectory }), business, model })
  await service.store.update(() => ({ contexts: [{ id: 'context-1', accountId: 'synthetic', memberId: member.id, provisional: false, createdAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z', version: 4, evidenceVersion: 2, subject: owner, draftId: draft.id, facts: [], ...extra.context }], messages: [{ id: 'identity', accountId: 'synthetic', memberId: member.id, contextId: 'context-1', kind: 'text', text: '小禾今天咳嗽', at: '2026-10-26T00:00:00Z', inputAt: 1, status: 'completed', files: [], voices: [] }] }))
  const input = { id: 'save-message', kind: 'text', text: '保存这条', contextId: 'context-1', expectedContextVersion: 4, presentedDraft: { id: draft.id, version: 3 } }
  return { service, member, draft, owner, input, model, get calls() { return calls }, get saveCalls() { return saveCalls } }
}

test('dialogue plans only the actual displayed draft and retains its immutable authorization source', async t => {
  const f = await fixture(t)
  const result = await f.service.submit('synthetic', f.member.id, f.input)
  assert.equal(result.context.actionPlan.type, 'save')
  assert.equal(result.context.actionPlan.targetId, f.draft.id)
  assert.equal(result.context.actionPlan.targetVersion, 3)
  assert.equal(result.context.actionPlan.expectedContextVersion, 4)
  assert.equal(result.context.actionPlan.executionContextVersion, 5)
  assert.equal(result.context.actionPlan.sourceMessageId, f.input.id)
  assert.deepEqual(result.context.messages.find(m => m.id === f.input.id).presentedDraft, f.input.presentedDraft)
  assert.equal(f.saveCalls, 0)
  const retry = await f.service.submit('synthetic', f.member.id, f.input)
  assert.equal(retry.context.actionPlan.operationId, result.context.actionPlan.operationId)
  assert.equal(f.calls, 0)
  await assert.rejects(() => f.service.submit('synthetic', f.member.id, { ...f.input, expectedContextVersion: 5 }), { code: 'FRONT_RECORD_ID_CONFLICT' })
})

test('missing presentation and stale versions never borrow the latest server draft', async t => {
  for (const kind of ['presentation', 'draft-version', 'context-version', 'missing-context-version']) {
    await t.test(kind, async t => {
      const f = await fixture(t), input = structuredClone(f.input)
      if (kind === 'presentation') delete input.presentedDraft
      if (kind === 'draft-version') input.presentedDraft.version = 2
      if (kind === 'context-version') input.expectedContextVersion = 3
      if (kind === 'missing-context-version') delete input.expectedContextVersion
      const result = await f.service.submit('synthetic', f.member.id, input)
      assert.equal(result.context.actionPlan.type, 'clarify')
      assert.equal(result.context.actionPlan.operationId, undefined)
      assert.equal(f.saveCalls, 0)
    })
  }
})

test('unknown subjects and review-only candidates cannot be planned for saving', async t => {
  for (const item of [{ id: 'item-1', subjectConfirmed: false }, { id: 'item-1', subjectConfirmed: true, unassigned: true }, { id: 'item-1', subjectConfirmed: true, needsReview: true }]) {
    await t.test(JSON.stringify(item), async t => {
      const f = await fixture(t, { draft: { items: [item] } })
      const result = await f.service.submit('synthetic', f.member.id, f.input)
      assert.equal(result.context.actionPlan.type, 'clarify')
      assert.equal(result.context.actionPlan.reason, 'subject_not_confirmed')
      assert.equal(f.saveCalls, 0)
    })
  }
})

test('correction in the same message invalidates the earlier displayed candidate before save planning', async t => {
  const f = await fixture(t)
  f.model.structured = async () => ({ value: response({ responseMode: 'record', subject: f.owner, recordChanges: [{ type: 'add', targetId: null, text: '喷嚏', polarity: 'affirmed', subject: { ...f.owner, sources: [reference('小禾', f.input.id)] }, sources: [reference('小禾今天喷嚏', f.input.id)] }] }), diagnostics: { provider: 'test' } })
  const result = await f.service.submit('synthetic', f.member.id, { ...f.input, text: '小禾今天喷嚏，保存这条' })
  assert.equal(result.context.actionPlan.type, 'clarify')
  assert.equal(result.context.actionPlan.reason, 'evidence_changed_in_turn')
  assert.equal(f.saveCalls, 0)
})

test('readback requires a real persisted receipt for the original target version', async t => {
  const receipt = { operationId: 'previous-save:save:3', type: 'save', targetId: 'draft-1', targetVersion: 3, confirmedVersion: 3, state: 'saved', recordIds: ['record-1'] }
  const f = await fixture(t, { context: { saved: true, operationReceipts: [receipt] }, draft: { state: 'saved', version: 4, result: { records: [{ recordId: 'record-1', eventId: 'event-1' }], count: 1 } } })
  const result = await f.service.submit('synthetic', f.member.id, f.input)
  assert.equal(result.context.id, 'context-1')
  assert.equal(result.context.actionPlan.type, 'readback')
  assert.equal(result.context.actionPlan.targetVersion, 3)
  assert.deepEqual(result.context.actionPlan.receipt.recordIds, ['record-1'])
  assert.equal(f.saveCalls, 0)
})

test('plain acknowledgement never executes a model-proposed save', async t => {
  const f = await fixture(t, { response: { requestedAction: { type: 'save', targetIds: ['draft-1'], targetVersion: 3, confirmation: 'explicit', quote: '谢谢' } } })
  const result = await f.service.submit('synthetic', f.member.id, { ...f.input, text: '谢谢' })
  assert.equal(result.context.actionPlan.type, 'none')
  assert.equal(f.saveCalls, 0)
})

test('unstructured original can be planned without inventing structured items when its subject is explicit', async t => {
  const f = await fixture(t, { draft: { items: [] }, response: { requestedAction: { type: 'save_original', targetIds: ['draft-1'], targetVersion: 3, confirmation: 'explicit', quote: '只保存原话' } } })
  const result = await f.service.submit('synthetic', f.member.id, { ...f.input, text: '只保存原话' })
  assert.equal(result.context.actionPlan.type, 'save_original')
  assert.deepEqual(result.context.actionPlan.itemIds, [])
  assert.equal(result.context.actionPlan.originals.hasText, true)
  assert.equal(f.saveCalls, 0)
})

test('mixed-subject dialogue does not confirm father observations because another clause names the child', async t => {
  const f = await fixture(t)
  f.model.structured = async () => ({ value: response({ responseMode: 'record', requestedAction: { type: 'none', targetIds: [], targetVersion: null, confirmation: 'none', quote: '' }, recordChanges: [{ type: 'add', targetId: null, text: '咳嗽', polarity: 'affirmed', subject: { ...f.owner, sources: [reference('小禾', f.input.id)] }, sources: [reference('爸爸今天咳嗽', f.input.id)] }] }), diagnostics: { provider: 'test' } })
  const result = await f.service.submit('synthetic', f.member.id, { ...f.input, text: '小禾的报告没带，爸爸今天咳嗽' })
  assert.equal(result.context.facts.at(-1).subject.confirmed, false)
  assert.equal(result.context.facts.at(-1).subject.kind, 'unknown')
  assert.equal(f.saveCalls, 0)
})

test('a casual name mention cannot reassign an earlier unknown fact; an explicit identity answer can', async t => {
  for (const [text, expected] of [['小禾的报告没带', false], ['这是小禾的', true]]) {
    await t.test(text, async t => {
      const f = await fixture(t)
      await f.service.store.update(data => ({ ...data, contexts: data.contexts.map(context => ({ ...context, subject: unknown(), facts: [{ id: 'existing-fact', status: 'active', text: '今天咳嗽', subject: { ...unknown(), confirmed: false }, sources: [reference('今天咳嗽')] }] })) }))
      f.model.structured = async () => ({ value: response({ subject: { ...f.owner, sources: [reference('小禾', f.input.id)] }, requestedAction: { type: 'none', targetIds: [], targetVersion: null, confirmation: 'none', quote: '' } }), diagnostics: { provider: 'test' } })
      const result = await f.service.submit('synthetic', f.member.id, { ...f.input, text })
      assert.equal(result.context.facts[0].subject.confirmed, expected)
    })
  }
})

test('a draft edited during model processing is reread before an operation is planned', async t => {
  const f = await fixture(t)
  f.model.structured = async () => { f.draft.version = 4; return { value: response(), diagnostics: { provider: 'test' } } }
  const result = await f.service.submit('synthetic', f.member.id, {...f.input,text:'请保存这条，并保留原文'})
  assert.equal(result.context.actionPlan.type, 'clarify')
  assert.equal(result.context.actionPlan.reason, 'candidate_not_presented_or_changed')
  assert.equal(f.saveCalls, 0)
})
