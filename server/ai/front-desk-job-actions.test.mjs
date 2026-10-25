import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { RecognitionJobs } from './recognition-jobs.mjs'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { HealthEventService } from '../events/health-event-service.mjs'
import { FrontDeskRecord } from './front-desk-record.mjs'
import { AIBusinessService } from './business/service.mjs'

// These fixtures exercise persistence, ownership and operation fencing. They
// substitute model responses explicitly and do not evaluate model accuracy.
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const unknown = () => ({ kind: 'unknown', memberId: null, label: null, sources: [] })
const reference = (messageId, quote) => ({ messageId, attachmentId: null, quote })
const noAction = () => ({ type: 'none', targetIds: [], targetVersion: null, confirmation: 'none', quote: '' })
const privateMediaPaths = (value, path = 'job') => typeof value === 'string' ? /^data:image\//u.test(value) ? [path] : [] : value && typeof value === 'object' ? Object.entries(value).flatMap(([key, item]) => ['mediaPreparation', 'sourceSignature', 'imageDataUrl'].includes(key) ? [`${path}.${key}`] : privateMediaPaths(item, `${path}.${key}`)) : []

async function until(operation, label) {
  for (let attempt = 0; attempt < 500; attempt++) {
    const value = await operation()
    if (value) return value
    await wait(10)
  }
  throw new Error(`Timed out: ${label}`)
}

async function fixture(t, configuration = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-front-job-actions-'))
  const members = new FamilyMemberRepository(directory)
  const member = await members.create({ accountId: 'synthetic', name: '小禾', relationship: 'child' })
  const other = await members.create({ accountId: 'synthetic', name: '小明', relationship: 'child' })
  const events = new HealthEventService({ dataDirectory: directory }), calls = []
  const extract = input => {
    const payload = JSON.parse(input.input)
    return { value: { items: payload.sources.flatMap(source => {
      const symptom = source.text.includes('喷嚏') ? '喷嚏' : source.text.includes('咳嗽') ? '咳嗽' : null
      return symptom ? [{ category: 'symptom', title: symptom, subject: configuration.subject ?? 'current', archiveCategory: null, relationKey: null, timeText: source.text.includes('今天') ? '今天' : null, fields: [{ name: 'symptom', value: symptom, quote: source.text, sourceId: source.id, page: source.page }] }] : []
    }) }, diagnostics: { provider: 'explicit-local-fixture' } }
  }
  const model = { provider: { name: 'explicit-local-fixture', model: 'no-network' }, structured: async input => {
    calls.push(input.task)
    return configuration.extract ? configuration.extract(input, extract) : extract(input)
  } }
  const dialogue = payload => {
    const latest = payload.latest, active = payload.conversation.activeContextId ?? 'new'
    const result = { reply: '我了解了。', contextId: active, responseMode: 'conversation', taskRelation: active === 'new' ? 'new' : 'continue', subject: unknown(), recordChanges: [], nextQuestion: null, requestedAction: noAction(), uncertainties: [], emergency: { currentChild: false, quote: '' } }
    if (latest.text === '保存这条') return { ...result, responseMode: 'operation', requestedAction: { type: 'save', targetIds: payload.candidate ? [payload.candidate.id] : [], targetVersion: payload.candidate?.version ?? null, confirmation: 'explicit', quote: latest.text } }
    if (['谢谢', '？', '。'].includes(latest.text)) return { ...result, reply: latest.text === '？' ? '刚才的草稿仍在，可以继续核对。' : '我在听。' }
    const ownership = configuration.subject ?? 'current'
    const owner = ownership === 'current' ? { kind: 'current', memberId: member.id, label: member.name, sources: [reference(latest.id, member.name)] } : ownership === 'other' ? { kind: 'other', memberId: null, label: '爸爸', sources: [reference(latest.id, '爸爸')] } : unknown()
    const correcting = latest.text === '不是咳嗽，小禾是喷嚏'
    const text = correcting ? '小禾是喷嚏' : latest.text
    const target = payload.conversation.facts.find(fact => fact.status === 'active')
    return { ...result, responseMode: 'record', subject: owner, recordChanges: [{ type: correcting ? 'correct' : 'add', targetId: correcting ? target?.id : null, text, polarity: 'affirmed', subject: owner, sources: [reference(latest.id, text)] }] }
  }
  const frontModel = { structured: async input => {
    calls.push(input.task)
    const payload = JSON.parse(input.input[0].content[0].text)
    return { value: await (configuration.dialogue ? configuration.dialogue(payload, dialogue) : dialogue(payload)), diagnostics: { provider: 'explicit-local-fixture' } }
  } }
  const business = new AIBusinessService({ dataDirectory: directory, model, logger: { info() {}, warn() {} } })
  const front = new FrontDeskRecord({ dataDirectory: directory, events, business, model: frontModel })
  const audio = { transcribe: async () => { calls.push('asr'); return { transcript: configuration.transcript ?? '小禾今天咳嗽' } } }
  const jobs = new RecognitionJobs({ dataDirectory: directory, events, business, frontDesk: front, audio, autoStart: false, logger: { info() {}, warn() {} } })
  business.assertRecognitionCurrent = draft => jobs.assertCurrent(draft)
  t.after(async () => { await jobs.close(); await until(() => !jobs.active.size, 'close workers'); jobs.db.close(); await rm(directory, { recursive: true, force: true }) })
  const submit = (id, text, extra = {}) => jobs.submit('synthetic', member.id, { id: 'task-1', mode: 'front', input: { id, kind: 'text', text, ...extra }, options: { smartRecord: true, followUp: false, selectedOccurredAt: new Date().toISOString() } })
  const snapshot = () => jobs.get('synthetic', member.id, 'task-1')
  const settled = revision => until(async () => {
    const result = await snapshot()
    return result.state === 'failed' || ['ready', 'needs_review'].includes(result.state) && result.resultRevision >= revision && !jobs.active.size ? result : null
  }, `revision ${revision}`)
  const saveInput = (review, context, id = 'save') => ({ id, kind: 'text', text: '保存这条', contextId: context.id, expectedContextVersion: context.version, presentedDraft: { id: review.id, version: review.version } })
  const submitSave = (review, context, id) => { const input = saveInput(review, context, id); return submit(input.id, input.text, input) }
  const records = () => business.records.repository.findByAccountId('synthetic')
  return { directory, member, other, events, business, front, frontModel, model, jobs, calls, audio, submit, snapshot, settled, submitSave, saveInput, records }
}

async function readyCandidate(f) {
  await f.submit('facts', '小禾今天咳嗽')
  const result = await f.settled(1)
  assert.equal(result.state, 'ready', JSON.stringify(result.error))
  assert.equal(result.review.state, 'ready')
  assert.equal(result.review.items.length, 1)
  assert.equal(result.review.items[0].subjectConfirmed, true)
  assert.equal((await f.records()).length, 0)
  return result
}

const imageResponse = payload => ({ reply: '看到一张绿色图片。', contextId: payload.conversation.activeContextId ?? 'new', responseMode: 'conversation', taskRelation: payload.conversation.activeContextId ? 'continue' : 'new', subject: unknown(), recordChanges: [], nextQuestion: null, requestedAction: noAction(), uncertainties: [], emergency: { currentChild: false, quote: '' } })
async function uploadImages(f, { good = true, bad = true } = {}) {
  const assets = [], buffers = []
  if (good) buffers.push({ name: 'usable-synthetic.png', buffer: await sharp({ create: { width: 16, height: 12, channels: 3, background: '#21816b' } }).png().toBuffer() })
  if (bad) buffers.push({ name: 'corrupt-synthetic.png', buffer: Buffer.from('Explicit corrupt image bytes; not an image') })
  for (const file of buffers) assets.push(await f.jobs.upload('synthetic', f.member.id, { ...file, mimeType: 'image/png' }))
  return assets
}

test('a displayed candidate saves through the real job transaction once; lost ACK and duplicate POST recover the same receipt', async t => {
  const f = await fixture(t), ready = await readyCandidate(f)
  const input = f.saveInput(ready.review, ready.frontDesk.context)
  await f.submit(input.id, input.text, input) // The caller deliberately discards this ACK.
  const saved = await f.settled(2)
  assert.equal(saved.state, 'ready', JSON.stringify(saved.error))
  assert.equal(saved.resultKind, 'saved')
  assert.equal(saved.operationReceipt.state, 'saved')
  assert.equal(saved.operationReceipt.savedDraft.state, 'saved')
  const recordIds = saved.operationReceipt.recordIds
  assert.equal(recordIds.length, 1)
  const record = await f.business.records.getOwnedRecord('synthetic', recordIds[0])
  assert.equal(record.aiProvenance.draftId, ready.review.id)
  assert.match(record.content, /咳嗽/u)
  await f.submit(input.id, input.text, input)
  await f.jobs.command('synthetic', f.member.id, 'task-1', { id: 'retry-lost-ack', type: 'retry' })
  const recovered = await f.snapshot()
  assert.equal(recovered.inputRevision, 2)
  assert.deepEqual(recovered.operationReceipt.recordIds, recordIds)
  assert.equal((await f.records()).length, 1)
  assert.equal((await f.front.snapshot('synthetic', f.member.id, ready.contextId)).operationReceipts.length, 1)
})

test('chat and punctuation do not extract again, and the preserved candidate can still be saved', async t => {
  const f = await fixture(t), ready = await readyCandidate(f)
  let current = ready
  for (const [index, text] of ['谢谢', '？', '。'].entries()) {
    await f.submit(`chat-${index}`, text, { contextId: ready.contextId })
    current = await f.settled(index + 2)
    assert.equal(current.state, 'ready', JSON.stringify(current.error))
    assert.equal(current.resultKind, 'conversation')
    assert.equal(current.review.id, ready.review.id)
    assert.equal(current.review.version, ready.review.version)
  }
  assert.equal(f.calls.filter(task => task === 'draft-extraction').length, 1)
  await f.submitSave(current.review, current.frontDesk.context)
  const saved = await f.settled(5)
  assert.equal(saved.operationReceipt?.state, 'saved', JSON.stringify(saved.error))
  assert.equal((await f.records()).length, 1)
  assert.equal(f.calls.filter(task => task === 'draft-extraction').length, 1)
})

test('correction invalidates the old source and version; a save failure retains the draft for a genuine retry', async t => {
  const f = await fixture(t), old = await readyCandidate(f)
  const oldFactId = old.frontDesk.context.facts.find(fact => fact.status === 'active').id
  await f.submit('correction', '不是咳嗽，小禾是喷嚏', { contextId: old.contextId })
  const revised = await f.settled(2)
  assert.equal(revised.state, 'ready', JSON.stringify(revised.error))
  assert.equal(revised.frontDesk.context.facts.find(fact => fact.id === oldFactId).status, 'superseded')
  assert.deepEqual(revised.review.items.flatMap(item => item.fields.filter(field => field.name === 'symptom').map(field => field.value)), ['喷嚏'])
  assert.ok(revised.review.items.flatMap(item => item.fields.filter(field => field.name === 'symptom').flatMap(field => field.sources)).every(source => source.sourceId !== oldFactId))
  await assert.rejects(() => f.business.save('synthetic', f.member.id, old.review.id, { version: old.review.version, confirmed: true }), { status: 409 })
  const save = f.business.save.bind(f.business), beforeCalls = f.calls.length
  f.business.save = async () => { throw Object.assign(new Error('Explicit local persistence failure'), { status: 503, code: 'LOCAL_SAVE_UNAVAILABLE' }) }
  await f.submitSave(revised.review, revised.frontDesk.context)
  const failed = await f.settled(3)
  assert.equal(failed.state, 'failed')
  assert.equal(failed.operationReceipt, undefined)
  assert.equal((await f.records()).length, 0)
  const retained = await f.business.read('synthetic', f.member.id, revised.review.id)
  assert.equal(retained.state, 'ready')
  assert.deepEqual(retained.items.flatMap(item => item.fields.filter(field => field.name === 'symptom').map(field => field.value)), ['喷嚏'])
  assert.match(retained.inputText, /不是咳嗽，小禾是喷嚏/u)
  f.business.save = save
  await f.jobs.command('synthetic', f.member.id, 'task-1', { id: 'retry-storage', type: 'retry' })
  const saved = await f.settled(3)
  assert.equal(saved.operationReceipt?.state, 'saved', JSON.stringify(saved.error))
  assert.equal((await f.records()).length, 1)
  assert.equal(f.calls.length, beforeCalls) // The exact displayed save uses no model; retry reuses its receipt.
})

for (const [subject, text] of [['unknown', '今天咳嗽'], ['other', '爸爸今天咳嗽']]) test(`${subject} factual subjects remain unassigned and cannot be saved through either entry`, async t => {
  const f = await fixture(t, { subject })
  await f.submit('facts', text)
  const ready = await f.settled(1)
  assert.equal(ready.state, 'ready', JSON.stringify(ready.error))
  assert.equal(ready.review.items[0].subjectConfirmed, false)
  await assert.rejects(() => f.business.save('synthetic', f.member.id, ready.review.id, { version: ready.review.version, confirmed: true }), { code: 'FRONT_SUBJECT_UNCONFIRMED' })
  await f.submitSave(ready.review, ready.frontDesk.context)
  const rejected = await f.settled(2)
  assert.equal(rejected.frontDesk.context.actionPlan.type, 'clarify')
  assert.equal(rejected.operationReceipt, undefined)
  assert.equal((await f.records()).length, 0)
})

test('an empty ASR result retains the original and creates no dialogue, candidate or fact', async t => {
  const f = await fixture(t, { transcript: '\u200b  ' }), wav = Buffer.alloc(364)
  wav.write('RIFF'); wav.write('WAVE', 8)
  const asset = await f.jobs.upload('synthetic', f.member.id, { buffer: wav, mimeType: 'audio/wav', name: 'explicit-empty-asr.wav' })
  await f.jobs.submit('synthetic', f.member.id, { id: 'task-1', mode: 'front', input: { id: 'empty-voice', kind: 'voice', text: '', assetIds: [asset.id], asrAssetId: asset.id }, options: { smartRecord: true } })
  const result = await f.settled(1)
  assert.equal(result.state, 'failed')
  assert.equal(f.jobs.raw('task-1').inputErrors['empty-voice'].code, 'ASR_EMPTY_TRANSCRIPT')
  const retained=(await f.front.store.read()).messages
  assert.equal(retained.length,1)
  assert.equal(retained[0].kind,'voice')
  assert.equal(retained[0].text,'')
  assert.equal(retained[0].acceptedInput,true)
  assert.equal(retained[0].status,'failed')
  assert.equal(result.frontDesk.context.messages[0].originalFileCount,0)
  assert.equal(result.frontDesk.context.messages[0].voices.length,1)
  assert.deepEqual(result.frontDesk.context.facts??[],[])
  assert.equal((await f.business.store.read()).drafts.length, 0)
  assert.equal((await f.records()).length, 0)
  assert.deepEqual(f.calls, ['asr'])
  assert.equal(f.jobs.asset('synthetic', f.member.id, asset.id).id, asset.id)
})

test('a newer correction fences a late old extraction before it can publish or save', async t => {
  const entered = deferred(), release = deferred(); let once = true
  t.after(() => release.resolve())
  const f = await fixture(t, { extract: async (input, extract) => { if (once) { once = false; entered.resolve(); await release.promise } return extract(input) } })
  await f.submit('facts', '小禾今天咳嗽')
  await entered.promise
  await f.submit('correction', '不是咳嗽，小禾是喷嚏')
  release.resolve()
  const result = await f.settled(2)
  assert.equal(result.state, 'ready', JSON.stringify(result.error))
  assert.equal(result.resultRevision, 2)
  assert.deepEqual(result.review.items.flatMap(item => item.fields.filter(field => field.name === 'symptom').map(field => field.value)), ['喷嚏'])
  assert.equal(result.review.frontEvidenceVersion, result.frontDesk.context.evidenceVersion)
  assert.equal((await f.records()).length, 0)
  const oldDrafts = (await f.business.store.read()).drafts.filter(draft => draft.id !== result.review.id)
  for (const draft of oldDrafts) await assert.rejects(() => f.business.save('synthetic', f.member.id, draft.id, { version: draft.version, confirmed: true }))
})

test('new input arriving during complex save understanding prevents the superseded instruction from saving its old draft', async t => {
  const entered = deferred(), release = deferred()
  t.after(() => release.resolve())
  const f = await fixture(t, { dialogue: async (payload, dialogue) => { if (payload.latest.text === '请保存这条，并保留原文') { entered.resolve(); await release.promise;return dialogue({...payload,latest:{...payload.latest,text:'保存这条'}}) } return dialogue(payload) } })
  const ready = await readyCandidate(f)
  await f.submit('complex-save','请保存这条，并保留原文',{contextId:ready.contextId,expectedContextVersion:ready.frontDesk.context.version,presentedDraft:{id:ready.review.id,version:ready.review.version}})
  await entered.promise
  await f.submit('correction', '不是咳嗽，小禾是喷嚏', { contextId: ready.contextId })
  release.resolve()
  const result = await f.settled(3)
  assert.equal(result.state, 'ready', JSON.stringify(result.error))
  assert.equal(result.resultRevision, 3)
  assert.deepEqual(result.review.items.flatMap(item => item.fields.filter(field => field.name === 'symptom').map(field => field.value)), ['喷嚏'])
  assert.equal((await f.records()).length, 0)
  assert.equal(result.operationReceipt, undefined)
  assert.equal((await f.front.snapshot('synthetic', f.member.id, ready.contextId)).operationReceipts?.length ?? 0, 0)
})

test('a real good image survives a corrupt sibling; retry preserves its result and never exposes private preparation cache', async t => {
  const f = await fixture(t, { dialogue: imageResponse }), assets = await uploadImages(f), requests = []
  const structured = f.frontModel.structured
  f.frontModel.structured = async input => { requests.push(input); return structured(input) }
  await f.submit('images', '', { kind: 'image', assetIds: assets.map(asset => asset.id) })
  const first = await f.settled(1)
  assert.equal(first.state, 'needs_review', JSON.stringify(first.error))
  assert.equal(first.frontDesk.context.mediaProblems.length, 1)
  assert.equal(first.frontDesk.context.mediaProblems[0].name, 'corrupt-synthetic.png')
  assert.equal(first.unresolvedInputs.length, 1)
  assert.equal(first.unresolvedInputs[0].id, 'images')
  assert.equal(requests.length, 1)
  assert.equal(requests[0].vision, true)
  const images = requests[0].input[0].content.filter(content => content.type === 'input_image')
  assert.equal(images.length, 1)
  assert.ok((await sharp(Buffer.from(images[0].image_url.split(',')[1], 'base64')).metadata()).width > 0)
  const privateLeaks = privateMediaPaths(first)
  const retained = (await f.front.store.read()).messages.find(message => message.id === 'images')
  assert.equal(retained.mediaPreparation.entries.length, 2)
  assert.equal(retained.mediaPreparation.entries.filter(entry => entry.status === 'prepared').length, 1)
  assert.equal(retained.originalFiles[0].name, 'corrupt-synthetic.png')
  await f.jobs.command('synthetic', f.member.id, 'task-1', { id: 'retry-corrupt-image', type: 'retry' })
  const retried = await f.settled(1)
  assert.equal(retried.state, 'needs_review', JSON.stringify(retried.error))
  assert.deepEqual({ modelCallsAfterRetry: requests.length, privateLeaks: [...privateLeaks, ...privateMediaPaths(retried)] }, { modelCallsAfterRetry: 1, privateLeaks: [] }, 'retrying an unchanged failed file must preserve successful vision and keep private media private')
  assert.equal(f.calls.filter(task => task === 'draft-extraction').length, 0)
  assert.equal((await f.records()).length, 0)
})

test('all corrupt image inputs produce specific local feedback without a fake image or model call', async t => {
  const f = await fixture(t, { dialogue: imageResponse }), assets = await uploadImages(f, { good: false })
  await f.submit('images', '', { kind: 'image', assetIds: assets.map(asset => asset.id) })
  const result = await f.settled(1)
  assert.equal(result.state, 'needs_review', JSON.stringify(result.error))
  assert.deepEqual(f.calls, [])
  assert.equal(result.frontDesk.context.mediaProblems.length, 1)
  assert.match(result.frontDesk.context.messages.find(message => message.kind === 'assistant').text, /corrupt-synthetic\.png/u)
  assert.equal(result.frontDesk.context.messages.find(message => message.id === 'images').files.length, 0)
  assert.equal(result.review ?? null, null)
  assert.equal(result.frontDesk.context.facts?.length ?? 0, 0)
  assert.equal((await f.records()).length, 0)
  assert.ok(!JSON.stringify(result).includes('mediaPreparation'))
  const original = (await f.front.store.read()).messages.find(message => message.id === 'images').originalFiles[0]
  assert.equal(Buffer.from(original.dataUrl.split(',')[1], 'base64').toString(), 'Explicit corrupt image bytes; not an image')
})

test('retryMedia cannot reuse a submitted ID with different text or different original bytes', async t => {
  const f = await fixture(t, { dialogue: imageResponse }), assets = await uploadImages(f)
  await f.submit('images', '', { kind: 'image', assetIds: assets.map(asset => asset.id) })
  await f.settled(1)
  const files = await f.jobs.materialize(f.jobs.raw('task-1'), assets.map(asset => asset.id))
  const input = { id: 'images', kind: 'image', text: '', files, retryMedia: true }
  await assert.rejects(() => f.front.submit('synthetic', f.member.id, { ...input, text: 'changed text' }), { code: 'FRONT_RECORD_ID_CONFLICT' })
  await assert.rejects(() => f.front.submit('synthetic', f.member.id, { ...input, files: files.slice(0, 1) }), { code: 'FRONT_RECORD_ID_CONFLICT' })
  await assert.rejects(() => f.submit('images', 'changed text', { kind: 'image', assetIds: assets.map(asset => asset.id) }), { code: 'RECOGNITION_INPUT_CONFLICT' })
  assert.equal(f.calls.filter(task => task === 'front-desk-dialogue').length, 1)
  assert.equal((await f.records()).length, 0)
})

test('closing a media job while its vision response is outstanding cannot revive the conversation', async t => {
  const entered = deferred(), release = deferred()
  t.after(() => release.resolve())
  const f = await fixture(t, { dialogue: async payload => { entered.resolve(); await release.promise; return imageResponse(payload) } }), assets = await uploadImages(f)
  await f.submit('images', '', { kind: 'image', assetIds: assets.map(asset => asset.id) })
  await entered.promise
  await f.jobs.command('synthetic', f.member.id, 'task-1', { id: 'discard-media', type: 'discard' })
  release.resolve()
  await until(() => !f.jobs.active.size, 'late media owner stopped')
  assert.equal((await f.snapshot()).state, 'discarded')
  assert.equal(await f.front.latest('synthetic', f.member.id), null)
  assert.equal((await f.front.store.read()).messages.some(message => message.kind === 'assistant' && message.text === '看到一张绿色图片。'), false)
  assert.equal((await f.records()).length, 0)
})

test('explicit context subject confirmation advances versions, rejects its old version, and permits a real save', async t => {
  const f = await fixture(t, { subject: 'unknown' })
  await f.submit('facts', '今天咳嗽')
  const ready = await f.settled(1), oldVersion = ready.frontDesk.context.version
  assert.equal(ready.review.items[0].subjectConfirmed, false)
  const confirmed = await f.front.confirmSubject('synthetic', f.member.id, ready.contextId, { expectedVersion: oldVersion })
  assert.equal(confirmed.version, oldVersion + 1)
  assert.ok(confirmed.review.version > ready.review.version)
  assert.equal(confirmed.review.items[0].subjectConfirmed, true)
  assert.equal(confirmed.facts.find(fact => fact.status === 'active').subject.confirmed, true)
  await assert.rejects(() => f.front.confirmSubject('synthetic', f.member.id, ready.contextId, { expectedVersion: oldVersion }), { code: 'FRONT_CONTEXT_CHANGED' })
  await assert.rejects(() => f.business.save('synthetic', f.member.id, ready.review.id, { version: ready.review.version, confirmed: true }), { status: 409 })
  await f.submitSave(confirmed.review, confirmed)
  const saved = await f.settled(2)
  assert.equal(saved.operationReceipt?.state, 'saved', JSON.stringify(saved.error))
  assert.equal((await f.records()).length, 1)
})

test('context confirmation cannot assign an explicitly other person to the selected child', async t => {
  const f = await fixture(t, { subject: 'other' })
  await f.submit('facts', '爸爸今天咳嗽')
  const ready = await f.settled(1)
  await assert.rejects(() => f.front.confirmSubject('synthetic', f.member.id, ready.contextId, { expectedVersion: ready.frontDesk.context.version }), { code: 'FRONT_SUBJECT_MISMATCH' })
  assert.equal((await f.business.read('synthetic', f.member.id, ready.review.id)).items[0].subjectConfirmed, false)
  assert.equal((await f.records()).length, 0)
})

test('a displayed unique draft and an actual save question allow affirmative confirmation to persist once', async t => {
  const f = await fixture(t, { dialogue: (payload, dialogue) => {
    if (payload.latest.text === '这条整理好了吗') return { ...imageResponse(payload), reply: '草稿在这里。', nextQuestion: { id: 'save-question', text: '要保存这条草稿吗？', target: 'save_confirmation', sourceMessageId: payload.latest.id } }
    if (payload.latest.text === '嗯') return { ...imageResponse(payload), requestedAction: { type: 'save', targetIds: [payload.candidate.id], targetVersion: payload.candidate.version, confirmation: 'affirmative_answer', quote: '嗯' } }
    return dialogue(payload)
  } })
  const ready = await readyCandidate(f)
  await f.submit('save-question-source', '这条整理好了吗', { contextId: ready.contextId, presentedDraft: { id: ready.review.id, version: ready.review.version }, expectedContextVersion: ready.frontDesk.context.version })
  const asked = await f.settled(2), pending = asked.frontDesk.context.pendingSaveConfirmation
  assert.equal(pending.targetId, ready.review.id)
  assert.equal(pending.targetVersion, ready.review.version)
  assert.match(asked.frontDesk.context.messages.at(-1).text, /要保存这条草稿吗？/u)
  await f.submit('affirm-save', '嗯', { contextId: ready.contextId, answerTo: { contextId: ready.contextId, questionId: 'save-question' }, presentedDraft: { id: ready.review.id, version: ready.review.version }, expectedContextVersion: asked.frontDesk.context.version })
  const saved = await f.settled(3)
  assert.equal(saved.operationReceipt?.state, 'saved', JSON.stringify(saved.error))
  assert.equal((await f.records()).length, 1)
  assert.equal(f.calls.filter(task => task === 'draft-extraction').length, 1)
})

for (const scenario of ['no-save-question', 'draft-changed-after-question']) test(`affirmative confirmation cannot save when ${scenario}`, async t => {
  const f = await fixture(t, { dialogue: (payload, dialogue) => {
    if (payload.latest.text === '这条整理好了吗') return { ...imageResponse(payload), nextQuestion: { id: 'save-question', text: '要保存这条草稿吗？', target: 'save_confirmation', sourceMessageId: payload.latest.id } }
    if (payload.latest.text === '嗯') return { ...imageResponse(payload), requestedAction: { type: 'save', targetIds: [payload.candidate.id], targetVersion: payload.candidate.version, confirmation: 'affirmative_answer', quote: '嗯' } }
    return dialogue(payload)
  } })
  const ready = await readyCandidate(f)
  let context = ready.frontDesk.context
  if (scenario === 'draft-changed-after-question') {
    await f.submit('save-question-source', '这条整理好了吗', { contextId: ready.contextId, presentedDraft: { id: ready.review.id, version: ready.review.version }, expectedContextVersion: context.version })
    context = (await f.settled(2)).frontDesk.context
    await f.business.edit('synthetic', f.member.id, ready.review.id, { version: ready.review.version, itemId: ready.review.items[0].id, field: 'title', value: '家长新修改的标题' })
  }
  await f.submit('affirm-save', '嗯', { contextId: ready.contextId, presentedDraft: { id: ready.review.id, version: ready.review.version }, expectedContextVersion: context.version })
  const result = await f.settled(scenario === 'no-save-question' ? 2 : 3)
  assert.equal(result.state, 'ready', JSON.stringify(result.error))
  assert.equal(result.operationReceipt, undefined)
  assert.equal((await f.records()).length, 0)
  assert.equal(f.calls.filter(task => task === 'draft-extraction').length, 1)
})


test('formal query, export and delete resolve the saved ID and recheck the actual record version',async t=>{
 const f=await fixture(t,{dialogue:(payload,dialogue)=>{
  const type=payload.latest.text==='查这条'?'query':payload.latest.text==='导出这条'?'export':payload.latest.text==='删除这条'?'delete':null
  if(!type)return dialogue(payload)
  const target=payload.recordTargets[0]
  return {...imageResponse(payload),reply:'正在处理这条记录。',responseMode:'operation',requestedAction:{type,targetIds:target?[target.id]:[],targetVersion:target?.version??null,confirmation:'explicit',quote:payload.latest.text}}
 }})
 const ready=await readyCandidate(f);await f.submitSave(ready.review,ready.frontDesk.context)
 let result=await f.settled(2);const recordId=result.operationReceipt.recordIds[0]
 for(const [index,text] of ['查这条','导出这条','删除这条'].entries()){
  await f.submit('operation-'+index,text,{contextId:result.contextId,expectedContextVersion:result.frontDesk.context.version})
  result=await f.settled(3+index)
  assert.equal(result.state,'ready',JSON.stringify(result.error));assert.equal(result.operationReceipt.targetId,recordId);assert.equal(result.operationReceipt.state,'completed')
  if(index===0)assert.match(result.operationReceipt.snapshot.inputText,/咳嗽/u)
  if(index===1){assert.match(result.operationReceipt.text,/咳嗽/u);assert.match(result.operationReceipt.text,/来源/u);assert.ok(!result.operationReceipt.text.includes('save:'))}
 }
 assert.equal((await f.records()).length,0)
 const repeat=await f.submit('operation-2','删除这条',{contextId:result.contextId,expectedContextVersion:result.frontDesk.context.version-1})
 assert.equal(repeat.operationReceipt.targetId,recordId);assert.equal((await f.records()).length,0)
})

test('a context-only update does not create a candidate or invalidate the displayed health draft',async t=>{
 const f=await fixture(t,{dialogue:(payload,dialogue)=>payload.latest.text==='杭州'?{...imageResponse(payload),recordChanges:[{type:'add',targetId:null,scope:'context',text:'杭州',polarity:'affirmed',subject:unknown(),sources:[reference(payload.latest.id,'杭州')]}]}:dialogue(payload)})
 const ready=await readyCandidate(f),calls=f.calls.filter(task=>task==='draft-extraction').length
 await f.submit('city','杭州',{contextId:ready.contextId})
 const updated=await f.settled(2)
 assert.equal(updated.resultKind,'conversation');assert.equal(updated.review.id,ready.review.id);assert.equal(updated.review.version,ready.review.version)
 assert.equal(f.calls.filter(task=>task==='draft-extraction').length,calls);assert.equal(updated.frontDesk.context.facts.find(fact=>fact.text==='杭州').scope,'context')
 await f.submitSave(updated.review,updated.frontDesk.context);assert.equal((await f.settled(3)).operationReceipt.state,'saved')
})


test('a model completion claim stays private until this evidence revision has a real candidate',async t=>{
 const entered=deferred(),release=deferred();t.after(()=>release.resolve())
 const f=await fixture(t,{dialogue:(payload,dialogue)=>({...dialogue(payload),reply:'已整理好这次观察。'}),extract:async(input,extract)=>{entered.resolve();await release.promise;return extract(input)}})
 await f.submit('facts','小禾今天咳嗽');await entered.promise
 const pending=await f.front.latest('synthetic',f.member.id)
 assert.doesNotMatch(pending.messages.find(message=>message.kind==='assistant').text,/已整理/u)
 release.resolve();const ready=await f.settled(1)
 assert.equal(ready.review.items.length,1);assert.match(ready.frontDesk.context.messages.find(message=>message.kind==='assistant').text,/已整理/u)
})

test('a failed extraction cannot expose a model completion claim or a fake candidate',async t=>{
 const f=await fixture(t,{dialogue:(payload,dialogue)=>({...dialogue(payload),reply:'已整理好这次观察。'}),extract:async()=>{throw Object.assign(new Error('Synthetic failure'),{status:503,code:'SYNTHETIC_FAILURE'})}})
 await f.submit('facts','小禾今天咳嗽');const failed=await f.settled(1)
 assert.equal(failed.state,'failed');assert.equal(failed.operationReceipt,undefined)
 assert.doesNotMatch(failed.frontDesk.context.messages.find(message=>message.kind==='assistant').text,/已整理/u)
 assert.equal((await f.records()).length,0)
})
