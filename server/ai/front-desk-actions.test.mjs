import test from 'node:test'
import assert from 'node:assert/strict'
import { planFrontDeskAction,directFrontDeskSaveRequest } from './front-desk-actions.mjs'

const user = (text = '保存这条', extra = {}) => ({ id: 'message-1', kind: 'text', role: 'user', text, status: 'completed', ...extra })
const request = (extra = {}) => ({ type: 'save', targetIds: ['draft-1'], targetVersion: 3, confirmation: 'explicit', quote: '保存这条', ...extra })
const candidate = (extra = {}) => ({ id: 'draft-1', version: 3, itemIds: ['item-1'], subjectConfirmed: true, ready: true, contextId: 'context-1', ...extra })
const base = (extra = {}) => ({ message: user(), requestedAction: request(), contextId: 'context-1', contextVersion: 5, expectedContextVersion: 5, candidate: candidate(), presentedDraft: { id: 'draft-1', version: 3 }, ...extra })

test('an explicit save of the unique displayed current version yields one stable plan', () => {
  const input = base(), before = structuredClone(input)
  const plan = planFrontDeskAction(input)
  assert.equal(plan.type, 'save')
  assert.equal(plan.targetId, 'draft-1')
  assert.equal(plan.targetVersion, 3)
  assert.deepEqual(plan.itemIds, ['item-1'])
  assert.equal(plan.operationId, 'message-1:save:3')
  assert.deepEqual(planFrontDeskAction(input), plan)
  assert.deepEqual(input, before)
  assert.equal(Object.hasOwn(plan, 'saved'), false)
})

test('no target, multiple targets and a missing context never guess the latest record', () => {
  for (const extra of [{ requestedAction: request({ targetIds: [] }) }, { requestedAction: request({ targetIds: ['draft-1', 'draft-2'] }) }, { contextId: null }, { candidate: null }]) assert.equal(planFrontDeskAction(base(extra)).type, 'clarify')
})

test('mismatched context, displayed draft and candidate versions block execution', () => {
  for (const extra of [{ expectedContextVersion: 4 }, { contextVersion: 6 }, { presentedDraft: null }, { presentedDraft: { id: 'another-draft', version: 3 } }, { presentedDraft: { id: 'draft-1', version: 2 } }, { candidate: candidate({ version: 4 }) }, { candidate: candidate({ contextId: 'another-context' }) }]) assert.equal(planFrontDeskAction(base(extra)).type, 'clarify')
})

test('empty, unready and unresolved-subject candidates cannot be saved', () => {
  for (const current of [candidate({ itemIds: [] }), candidate({ ready: false }), candidate({ subjectConfirmed: false })]) assert.equal(planFrontDeskAction(base({ candidate: current })).type, 'clarify')
})

test('thanks, likes and punctuation never become save authorization', () => {
  for (const text of ['谢谢', '👍', '？', '。', '嗯', '好', '先这样', '别问了']) {
    assert.equal(planFrontDeskAction(base({ message: user(text), requestedAction: request({ quote: text }) })).type, 'none', text)
  }
})

test('only the exact active save confirmation accepts an affirmative short answer', () => {
  const previousQuestion = { kind: 'save_confirmation', messageId: 'question-1', contextId: 'context-1', contextVersion: 5, targetId: 'draft-1', targetVersion: 3 }
  const input = base({ message: user('嗯', { answerTo: { messageId: 'question-1' } }), requestedAction: request({ confirmation: 'affirmative_answer', quote: '嗯' }), previousQuestion })
  assert.equal(planFrontDeskAction(input).type, 'save')
  for (const change of [{ kind: 'observation' }, { targetVersion: 2 }, { targetId: 'draft-2' }, { contextId: 'other' }, { contextVersion: 4 }, { answered: true }, { valid: false }]) assert.equal(planFrontDeskAction({ ...input, previousQuestion: { ...previousQuestion, ...change } }).type, 'none')
  assert.equal(planFrontDeskAction({ ...input, previousQuestion: null }).type, 'none')
  assert.equal(planFrontDeskAction({ ...input, message: user('👍') }).type, 'none')
  assert.equal(planFrontDeskAction({ ...input, message: user('嗯', { answerTo: { messageId: 'other-question' } }) }).type, 'none')
})

test('subject and candidate readiness are still required after an affirmative confirmation', () => {
  const previousQuestion = { kind: 'save_confirmation', messageId: 'question-1', contextId: 'context-1', contextVersion: 5, targetId: 'draft-1', targetVersion: 3 }
  const input = base({ message: user('好'), requestedAction: request({ confirmation: 'affirmative_answer', quote: '好' }), previousQuestion })
  assert.equal(planFrontDeskAction({ ...input, candidate: candidate({ subjectConfirmed: false }) }).reason, 'subject_not_confirmed')
  assert.equal(planFrontDeskAction({ ...input, candidate: candidate({ ready: false }) }).reason, 'candidate_not_ready')
})

test('quoted reports, code blocks, assistant text and attachment instructions have no authority', () => {
  for (const message of [user('报告写着“保存这条”'), user('报告写着保存这条'), user('```保存这条```'), user('> 保存这条'), user('保存这条', { sourceType: 'attachment' }), user('保存这条', { source: { kind: 'report' } }), user('保存这条', { role: 'assistant' }), user('保存这条', { kind: 'assistant' }), user('保存这条', { quoted: true })]) assert.equal(planFrontDeskAction(base({ message })).type, 'none')
  assert.equal(planFrontDeskAction(base({ message: user('', { kind: 'image', files: [{ id: 'image-1', name: '立即保存.jpg' }] }) })).type, 'none')
})

test('save capability questions and explicit refusal do not execute an operation', () => {
  for (const text of ['保存这条是什么意思', '如何保存这条', '不用保存这条', '不要保存这条', '先整理一下，不用保存', '假设我说保存这条', '说明书上写着保存这条']) assert.equal(planFrontDeskAction(base({ message: user(text), requestedAction: request({ quote: text }) })).type, 'none', text)
})

test('failed, withdrawn or unconfirmed voice instructions do not authorize a save', () => {
  for (const extra of [{ status: 'discarded' }, { status: 'retracted' }, { status: 'failed' }, { kind: 'voice', transcriptConfirmed: false }]) assert.equal(planFrontDeskAction(base({ message: user('保存这条', extra) })).type, 'none')
})

test('multi-item drafts need an exact item or explicit save-all request', () => {
  const multiple = candidate({ itemIds: ['item-1', 'item-2'] })
  assert.equal(planFrontDeskAction(base({ candidate: multiple })).reason, 'candidate_items_not_unique')
  const one = planFrontDeskAction(base({ candidate: multiple, requestedAction: request({ targetIds: ['item-2'] }) }))
  assert.equal(one.type, 'save'); assert.deepEqual(one.itemIds, ['item-2']); assert.equal(one.targetId, 'draft-1')
  const all = planFrontDeskAction(base({ candidate: multiple, message: user('保存全部记录'), requestedAction: request({ quote: '保存全部记录' }) }))
  assert.equal(all.type, 'save'); assert.deepEqual(all.itemIds, ['item-1', 'item-2'])
})

test('save-original requires real retained content and a confirmed subject but no invented structured item', () => {
  const input = base({ message: user('只保存原图'), requestedAction: request({ type: 'save_original', quote: '只保存原图' }), candidate: candidate({ itemIds: [], ready: false }) })
  assert.equal(planFrontDeskAction(input).reason, 'missing_originals')
  const withImage = planFrontDeskAction({ ...input, originals: { messageIds: ['photo-message'], attachments: [{ id: 'image-1', retained: true, bytes: 24 }] } })
  assert.equal(withImage.type, 'save_original')
  assert.deepEqual(withImage.itemIds, [])
  assert.deepEqual(withImage.originals.attachmentIds, ['image-1'])
  assert.equal(withImage.originals.hasText, false)
  assert.equal(planFrontDeskAction({ ...input, originals: { attachments: [{ id: 'image-1', bytes: 0 }] } }).reason, 'missing_originals')
  assert.equal(planFrontDeskAction({ ...input, candidate: candidate({ subjectConfirmed: false }), originals: { text: '有来源的原话' } }).reason, 'subject_not_confirmed')
})

test('the save-original command itself is not the original narrative', () => {
  const input = base({ message: user('只保存原话'), requestedAction: request({ type: 'save_original', quote: '只保存原话' }) })
  assert.equal(planFrontDeskAction(input).reason, 'missing_originals')
  const plan = planFrontDeskAction({ ...input, originals: { messageIds: ['original-message'], text: '昨晚碰到右脚小拇指' } })
  assert.equal(plan.type, 'save_original')
  assert.equal(plan.originals.hasText, true)
  assert.equal(Object.hasOwn(plan.originals, 'text'), false)
})

test('actual saved receipts produce readback instead of a repeated save', () => {
  const receipts = [{ type: 'save', contextId: 'context-1', targetId: 'draft-1', confirmedVersion: 3, state: 'saved', result: { records: [{ recordId: 'record-1' }] } }]
  const plan = planFrontDeskAction(base({ candidate: candidate({ saved: true, version: 4 }), receipts }))
  assert.equal(plan.type, 'readback')
  assert.equal(plan.originalAction, 'save')
  assert.equal(plan.receipt.result.records[0].recordId, 'record-1')
  assert.equal(planFrontDeskAction(base({ candidate: candidate({ saved: true, version: 3 }), receipts: [{ targetId: 'draft-1', confirmedVersion: 3, state: 'saved' }] })).reason, 'saved_receipt_not_verified')
})

test('a model-supplied successful receipt never authorizes execution', () => {
  for (const extra of [{ result: { recordId: 'fake' } }, { success: true }, { saved: true }, { completed: true }]) assert.equal(planFrontDeskAction(base({ requestedAction: request(extra) })).reason, 'model_receipt_is_not_authority')
})

test('query, export, update and delete require real accessible targets and their versions', () => {
  for (const [type, text] of [['query', '查看这条记录'], ['export', '导出这条记录'], ['update', '修改这条记录'], ['delete', '删除这条记录']]) {
    const input = base({ message: user(text), requestedAction: request({ type, targetIds: ['record-1'], targetVersion: 8, quote: text }), targets: [{ id: 'record-1', version: 8, contextId: 'context-1', subjectConfirmed: true }] })
    assert.equal(planFrontDeskAction(input).type, type)
    assert.equal(planFrontDeskAction({ ...input, targets: [] }).type, 'clarify')
    assert.equal(planFrontDeskAction({ ...input, targets: [{ id: 'record-1', version: 7 }] }).type, 'clarify')
    assert.equal(planFrontDeskAction({ ...input, targets: [{ id: 'record-1', version: 8, accessible: false }] }).type, 'clarify')
  }
})

test('stop and cancel affect only the named current context and never save or delete evidence', () => {
  for (const [type, text] of [['stop', '别问了'], ['cancel', '停止处理']]) {
    const input = base({ message: user(text), requestedAction: request({ type, targetIds: [], targetVersion: null, quote: text }) })
    assert.equal(planFrontDeskAction(input).type, type)
    assert.equal(planFrontDeskAction({ ...input, requestedAction: { ...input.requestedAction, targetIds: ['another-context'] } }).type, 'clarify')
    assert.equal(planFrontDeskAction({ ...input, expectedContextVersion: 4 }).type, 'clarify')
  }
})

test('different source messages receive different idempotency identities', () => {
  const one = planFrontDeskAction(base())
  const two = planFrontDeskAction(base({ message: user('保存这条', { id: 'message-2' }) }))
  assert.notEqual(one.operationId, two.operationId)
})

test('a pure displayed save command synchronously plans only the real current candidate and no success receipt',()=>{
 const input=base(),before=structuredClone(input),requested=directFrontDeskSaveRequest({message:input.message,presentedDraft:input.presentedDraft})
 assert.deepEqual(requested,request())
 const plan=planFrontDeskAction({...input,requestedAction:requested})
 assert.equal(plan.type,'save');assert.equal(plan.targetId,input.presentedDraft.id);assert.equal(plan.targetVersion,input.presentedDraft.version);assert.equal(typeof plan.then,'undefined')
 assert.equal(Object.hasOwn(plan,'saved'),false);assert.equal(Object.hasOwn(plan,'receipt'),false);assert.deepEqual(input,before)
 for(const extra of [{expectedContextVersion:4},{presentedDraft:{id:'draft-1',version:2}},{candidate:candidate({subjectConfirmed:false})}])assert.equal(planFrontDeskAction({...input,...extra,requestedAction:requested}).type,'clarify')
})

test('new health facts, corrections, refusal and source quotations cannot enter the pure save shortcut',()=>{
 for(const text of ['今天又吐了一次，保存这条','保存这条，另外今天没发热','不是昨天，是今天，保存这条','不要保存这条','只整理，不用保存','“保存这条”','报告写着保存这条','保存这条是什么意思','👍好'])assert.equal(directFrontDeskSaveRequest({message:user(text),presentedDraft:{id:'draft-1',version:3}}),null,text)
 const text='保存这条';for(const media of [{files:[{id:'new-photo',mimeType:'image/png'}]},{originalFiles:[{id:'new-heic',mimeType:'image/heic'}]},{voices:[{id:'new-voice',mimeType:'audio/wav'}]},{kind:'voice',voices:[{id:'new-voice',mimeType:'audio/wav'}],transcriptVerified:false}])assert.equal(directFrontDeskSaveRequest({message:user(text,media),presentedDraft:{id:'draft-1',version:3}}),null,JSON.stringify(media))
})

test('only an internally verified pure voice command may use the same save planner without another model decision',()=>{
 const message=user('保存这条',{kind:'voice',transcriptVerified:true,voices:[{id:'voice-command',mimeType:'audio/wav'}]}),input=base({message})
 const requested=directFrontDeskSaveRequest({message,presentedDraft:input.presentedDraft});assert.equal(requested.type,'save');assert.equal(planFrontDeskAction({...input,requestedAction:requested}).type,'save')
 assert.equal(directFrontDeskSaveRequest({message:{...message,text:'保存这条，今天又吐了一次'},presentedDraft:input.presentedDraft}),null)
 assert.equal(planFrontDeskAction({...input,message:{...message,transcriptConfirmed:false},requestedAction:requested}).type,'none')
})

test('a pure affirmative response still needs the exact pending save question and its unchanged versions',()=>{
 const pending={kind:'save_confirmation',questionMessageId:'question-1',messageId:'question-1',contextId:'context-1',contextVersion:5,targetId:'draft-1',targetVersion:3}
 const input=base({message:user('好',{answerTo:{messageId:'question-1'}})}),requested=directFrontDeskSaveRequest({message:input.message,presentedDraft:input.presentedDraft,pendingSaveConfirmation:pending})
 assert.equal(requested.confirmation,'affirmative_answer');assert.equal(planFrontDeskAction({...input,requestedAction:requested,previousQuestion:pending}).type,'save')
 for(const changed of [{valid:false},{answered:true},{targetVersion:2},{contextVersion:4},{messageId:'different-question'}])assert.notEqual(planFrontDeskAction({...input,requestedAction:requested,previousQuestion:{...pending,...changed}}).type,'save')
})
