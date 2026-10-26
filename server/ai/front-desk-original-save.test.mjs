import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { AIBusinessService } from './business/service.mjs'
import { FrontDeskRecord } from './front-desk-record.mjs'
import { EventAttachmentService } from '../events/event-attachment-service.mjs'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { JsonStore } from '../auth/storage/json-store.mjs'
import { saveFrontDeskOriginal } from './front-desk-original-save.mjs'

const accountId = 'synthetic-original-owner', contextId = 'original-context', at = '2026-10-20T10:00:00.000Z'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const file = (id, mimeType = 'image/png', bytes = Buffer.from('synthetic damaged image'), extra = {}) => ({ id, name: `${id}.png`, mimeType, dataUrl: `data:${mimeType};base64,${bytes.toString('base64')}`, ...extra })

async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'front-original-save-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const members = new FamilyMemberRepository(directory), member = await members.create({ accountId, name: '合成人物', relationship: 'child' })
  const model = { structured() { assert.fail('must not call AI') }, speak() { assert.fail('must not call AI') } }
  const business = new AIBusinessService({ dataDirectory: directory, now: () => new Date(at), model, logger: { info() {}, warn() {} } })
  business.latest = async () => assert.fail('must not query latest')
  business.prepare = async () => assert.fail('must not prepare through AI')
  const front = new FrontDeskRecord({ dataDirectory: directory, now: () => new Date(at), business, events: business.events, model })
  const subject = { kind: 'current', memberId: member.id, label: '合成人物', confirmed: true }
  const message = { id: 'original-message', accountId, memberId: member.id, contextId, kind: 'text', status: 'completed', text: '合成原话，没有确认病情。', at, inputAt: Date.parse(at), files: [], voices: [] }
  const context = { id: contextId, accountId, memberId: member.id, version: 7, evidenceVersion: 3, subject, facts: [], createdAt: at, updatedAt: at, ...options.context }
  const messages = options.messages ? options.messages({ message, subject, member }) : [message]
  await front.store.update(() => ({ contexts: [context], messages }))
  const args = { front, business, accountId, memberId: member.id, contextId, input: { confirmed: true, expectedContextVersion: 7 } }
  const records = () => business.records.repository.findByAccountId(accountId)
  return { directory, members, member, business, front, subject, message, context, messages, args, records }
}

test('explicit original save persists one neutral manual record, exact original text and unknown occurrence', async t => {
  const f = await fixture(t), result = await saveFrontDeskOriginal(f.args)
  assert.equal(result.savedDraft.state, 'saved')
  assert.equal(result.savedDraft.result.count, 1)
  assert.equal(result.savedDraft.items[0].title, '原话记录')
  assert.equal(result.savedDraft.items[0].category, 'other')
  assert.equal(result.savedDraft.items[0].time.precision, 'unknown')
  assert.equal(result.savedDraft.items[0].time.resolvedStart, null)
  assert.equal(result.savedDraft.followUp, false)
  assert.equal(result.context.saved, true)
  assert.equal(result.context.version, 8)
  const [record] = await f.records(), event = await f.business.events.get(accountId, record.eventId)
  assert.equal(record.sourceText, f.message.text)
  assert.equal(record.journal.timePrecision, 'unknown')
  assert.equal(record.caseContext.timeUnknown, true)
  assert.equal(record.caseContext.identity, 'parent')
  assert.equal(record.aiProvenance.provider, 'manual')
  assert.equal(record.aiProvenance.category, 'other')
  assert.equal(event.caseTracking, false)
  const internal = await f.business.get(accountId, f.member.id, result.savedDraft.id)
  assert.equal(internal.frontEvidenceVersion, 3)
  assert.equal(internal.frontUnderstanding.recordChangesPending, false)
  assert.equal(internal.recognitionBinding, undefined)
})

test('original receipt lists only the exact accepted source IDs and never closes unrelated failed inputs',async t=>{
 const f=await fixture(t,{messages:({message})=>[message,{...message,id:'unaccepted',status:'failed',acceptedInput:false,text:'未接收的其他输入'},{...message,id:'another-context',contextId:'other-context',text:'另一事项'},{...message,id:'assistant',kind:'assistant',text:'不能当成原话'}]})
 const result=await saveFrontDeskOriginal(f.args),receipt=result.context.operationReceipts.find(r=>r.type==='save_original')
 assert.deepEqual(receipt.sourceMessageIds,['original-message'])
 assert.deepEqual((await saveFrontDeskOriginal(f.args)).context.operationReceipts[0].sourceMessageIds,['original-message'])
 assert.equal((await f.front.store.read()).messages.find(m=>m.id==='unaccepted').status,'failed')
})

test('manual text review preserves original source and binds its corrected text to the exact save receipt',async t=>{
 const f=await fixture(t),input={...f.args.input,reviewText:'用户核对后的文字，不补充病情判断。'}
 const first=await saveFrontDeskOriginal({...f.args,input}),again=await saveFrontDeskOriginal({...f.args,input})
 const [record]=await f.records()
 assert.equal(record.content,input.reviewText);assert.equal(record.sourceText,f.message.text)
 assert.equal(record.aiProvenance.sourceTextEdited,true);assert.equal(record.aiProvenance.provider,'manual')
 assert.equal(record.aiProvenance.title,'原话记录');assert.equal(record.journal.timePrecision,'unknown')
 assert.equal(first.savedDraft.result.records[0].recordId,again.savedDraft.result.records[0].recordId)
 assert.equal((await f.records()).length,1)
 await assert.rejects(()=>saveFrontDeskOriginal({...f.args,input:{...input,reviewText:'另一个版本'}}),e=>e.code==='FRONT_ORIGINAL_REVIEW_CHANGED')
 await assert.rejects(()=>saveFrontDeskOriginal(f.args),e=>e.code==='FRONT_ORIGINAL_REVIEW_CHANGED')
})

test('empty, oversized or non-text manual reviews fail before any formal record is written',async t=>{
 const f=await fixture(t)
 for(const reviewText of ['', '  ', '字'.repeat(4901), {text:'不能自动当成文字'}])await assert.rejects(()=>saveFrontDeskOriginal({...f.args,input:{...f.args.input,reviewText}}),e=>e.code==='FRONT_ORIGINAL_REVIEW_INVALID')
 assert.equal((await f.records()).length,0)
})

test('completed user source text is exact and pending, assistant, foreign and fake completed rows are excluded', async t => {
  const f = await fixture(t, { messages: ({ message }) => [
    { ...message, id: 'first', text: '第一段原话', inputAt: Date.parse(at) - 1 },
    { ...message, text: '第二段原话' },
    { ...message, id: 'assistant', kind: 'assistant', text: '不能作为原话' },
    { ...message, id: 'fake-role', role: 'assistant', text: '伪装completed' },
    { ...message, id: 'fake-source', source: 'model', text: '伪装模型原文' },
    { ...message, id: 'pending', status: 'pending', text: '不能保存未完成消息' },
    { ...message, id: 'foreign', accountId: 'other-owner', text: '不能保存其他账户' },
    { ...message, id: 'other-member', memberId: 'other-member', text: '不能保存其他成员' }
  ] })
  await saveFrontDeskOriginal(f.args)
  assert.equal((await f.records())[0].sourceText, '第一段原话\n第二段原话')
})

test('a durably accepted input remains explicitly preservable when only its model reply failed', async t => {
  const bytes = Buffer.from('accepted-but-not-analyzed-original')
  const f = await fixture(t, { context: { updatedAt: '2026-10-19T10:00:00.000Z' }, messages: ({ message }) => [{ ...message, status: 'failed', acceptedInput: true, inputAcceptedAt: at, text: '这是需要保留的原话，尚未核实。', originalFiles: [file('accepted-file', 'image/png', bytes)] }] })
  const result = await saveFrontDeskOriginal(f.args), [record] = await f.records()
  assert.equal(record.sourceText, '这是需要保留的原话，尚未核实。')
  assert.deepEqual(record.journal.categories, ['other'])
  assert.equal(record.aiProvenance.provider, 'manual')
  assert.equal(record.journal.symptom, undefined)
  assert.equal(record.journal.timePrecision, 'unknown')
  const [attachment] = await f.business.attachments.findByEventId(record.eventId)
  assert.equal(attachment.contentHash, sha(bytes))
  assert.deepEqual(Buffer.from(attachment.dataUrl.split(',')[1], 'base64'), bytes)
  assert.equal(attachment.analysis.status, 'unavailable')
  assert.equal(result.context.updatedAt, at)
  const replay = await saveFrontDeskOriginal(f.args)
  assert.equal(replay.savedDraft.result.records[0].recordId, record.id)
  assert.equal(replay.context.version, 8)
  assert.equal(replay.context.updatedAt, at)
  assert.equal(replay.context.operationReceipts.length, 1)
})

test('failed input without valid durable acceptance, discarded and spoofed assistant inputs are never preserved', async t => {
  for (const mode of ['not-accepted', 'missing-time', 'bad-time', 'invalid-calendar', 'assistant', 'quoted', 'discarded']) await t.test(mode, async t => {
    const f = await fixture(t, { messages: ({ message }) => [{ ...message, status: mode === 'discarded' ? 'discarded' : 'failed', acceptedInput: mode !== 'not-accepted', inputAcceptedAt: mode === 'missing-time' ? undefined : mode === 'bad-time' ? 'yesterday' : mode === 'invalid-calendar' ? '2026-02-30T10:00:00.000Z' : at,
      ...(mode === 'assistant' ? { role: 'assistant' } : {}), ...(mode === 'quoted' ? { quoted: true } : {})
    }] })
    await assert.rejects(() => saveFrontDeskOriginal(f.args), { code: 'FRONT_ORIGINAL_INPUT_REQUIRED' })
    assert.equal((await f.records()).length, 0)
  })
})

test('new original versions require the user to confirm that exact media version before preserving it', async t => {
  for (const mode of ['missing-confirmation', 'old-confirmation', 'model-confirmation', 'fresh-confirmation']) await t.test(mode, async t => {
    const bytes = Buffer.from('new-person-photo-requires-confirmation')
    const f = await fixture(t, { context: { originalsVersion: 2 }, messages: ({ message }) => [{ ...message, text: '', kind: 'image', originalFiles: [file('new-photo', 'image/png', bytes)] }] })
    await f.front.store.update(data => ({ ...data, contexts: data.contexts.map(context => ({ ...context, subject: { ...context.subject, confirmedBy: mode === 'model-confirmation' ? 'model' : 'user', ...(mode !== 'missing-confirmation' ? { confirmation: { originalsVersion: mode === 'old-confirmation' ? 1 : 2 } } : {}) } })) }))
    if (mode !== 'fresh-confirmation') {
      await assert.rejects(() => saveFrontDeskOriginal(f.args), { code: 'FRONT_SUBJECT_UNCONFIRMED' })
      assert.equal((await f.records()).length, 0)
    } else {
      const saved = await saveFrontDeskOriginal(f.args), [record] = await f.records()
      assert.equal(saved.context.originalsVersion, 2)
      assert.equal(record.aiProvenance.category, 'other')
      const [attachment] = await f.business.attachments.findByEventId(record.eventId)
      assert.deepEqual(Buffer.from(attachment.dataUrl.split(',')[1], 'base64'), bytes)
    }
  })
})

test('true HEIC and damaged originals replace their own prepared copies while unrelated JPEG and original voice remain byte-exact', async t => {
  const heic = Buffer.from('synthetic-raw-heic'), damaged = Buffer.from('synthetic-broken-image'), jpeg = Buffer.from('synthetic-jpeg'), voice = Buffer.from('synthetic-voice-original')
  const f = await fixture(t, { messages: ({ message }) => [{ ...message, text: '', kind: 'image',
    files: [file('converted', 'image/jpeg', Buffer.from('converted-jpeg'), { sourceInputId: 'raw-heic', name: 'original.jpg', originalMimeType: 'image/heic' }), file('broken-prepared', 'image/png', damaged, { sourceInputId: 'raw-broken' }), file('unrelated', 'image/jpeg', jpeg, { name: 'original.jpg' })],
    originalFiles: [file('raw-heic', 'image/heic', heic, { sourceInputId: 'raw-heic', name: 'original.heic' }), file('raw-broken', 'image/png', damaged, { sourceInputId: 'raw-broken' })],
    voices: [file('voice', 'audio/webm', voice, { name: 'voice.webm' })]
  }] })
  const result = await saveFrontDeskOriginal(f.args), [record] = await f.records()
  assert.equal(result.savedDraft.items[0].title, '原件记录')
  assert.equal(record.sourceText ?? '', '')
  assert.deepEqual(record.aiProvenance.sources, [])
  const attachments = await f.business.attachments.findByEventId(record.eventId)
  assert.equal(attachments.length, 4)
  assert.ok(!attachments.some(attachment => attachment.dataUrl.includes(Buffer.from('converted-jpeg').toString('base64'))))
  const service = new EventAttachmentService({ dataDirectory: f.directory })
  for (const bytes of [heic, damaged, jpeg, voice]) {
    const attachment = attachments.find(attachment => attachment.contentHash === sha(bytes))
    assert.ok(attachment)
    assert.equal(attachment.binarySize, bytes.length)
    assert.deepEqual(Buffer.from(attachment.dataUrl.split(',')[1], 'base64'), bytes)
    assert.equal(attachment.recordId, record.id)
    assert.equal(attachment.memberId, f.member.id)
    assert.equal(attachment.analysis.status, 'unavailable')
    assert.equal(attachment.analysis.provider, 'manual')
    if (!attachment.mimeType.startsWith('audio/')) assert.deepEqual((await service.read(accountId, record.eventId, attachment.id)).buffer, bytes)
  }
})

test('older media without source IDs is replaced only by reliable payload or conversion-position identity', async t => {
  const same = Buffer.from('same-original-bytes')
  const f = await fixture(t, { messages: ({ message }) => [{ ...message, text: '', files: [
    file('copy', 'image/png', same),
    file('converted', 'image/jpeg', Buffer.from('conversion'), { name: 'one.jpg', originalMimeType: 'image/heic', inputIndex: 2 }),
    file('independent', 'image/jpeg', Buffer.from('independent-jpeg'), { name: 'one.jpg' })
  ], originalFiles: [file('raw', 'image/png', same), file('heic', 'image/heic', Buffer.from('original-heic'), { name: 'one.heic', inputIndex: 2 })] }] })
  await saveFrontDeskOriginal(f.args)
  const [record] = await f.records(), attachments = await f.business.attachments.findByEventId(record.eventId)
  assert.equal(attachments.length, 3)
  assert.ok(attachments.some(attachment => attachment.contentHash === sha(Buffer.from('independent-jpeg'))))
  assert.ok(!attachments.some(attachment => attachment.contentHash === sha(Buffer.from('conversion'))))
})

test('same context input version replays its real receipt, including concurrent requests, without another record', async t => {
  const f = await fixture(t)
  const [first, second] = await Promise.all([saveFrontDeskOriginal(f.args), saveFrontDeskOriginal(f.args)])
  assert.equal(first.savedDraft.result.records[0].recordId, second.savedDraft.result.records[0].recordId)
  assert.equal((await f.records()).length, 1)
  assert.equal(second.context.operationReceipts.length, 1)
  assert.equal(second.context.operationReceipts[0].inputContextVersion, 7)
  const alias = await saveFrontDeskOriginal({ ...f.args, input: { confirmed: true, expectedVersion: 7 } })
  assert.equal(alias.savedDraft.id, first.savedDraft.id)
})

test('deleted saved record or forged receipt never creates a replacement', async t => {
  const f = await fixture(t), saved = await saveFrontDeskOriginal(f.args)
  await f.business.records.repository.delete(saved.savedDraft.result.records[0].recordId)
  await assert.rejects(() => saveFrontDeskOriginal(f.args), { code: 'FRONT_ORIGINAL_UNAVAILABLE' })
  assert.equal((await f.records()).length, 0)
  await f.front.store.update(data => ({ ...data, contexts: data.contexts.map(context => ({ ...context, operationReceipts: context.operationReceipts.map(receipt => ({ ...receipt, recordIds: ['forged-real-record'] })) })) }))
  await assert.rejects(() => saveFrontDeskOriginal(f.args), { code: 'FRONT_ORIGINAL_UNAVAILABLE' })
})

test('replay validates actual event membership even when the record and receipt still exist', async t => {
  const f = await fixture(t), saved = await saveFrontDeskOriginal(f.args)
  const target = saved.savedDraft.result.records[0]
  await new JsonStore(path.join(f.directory, 'health-events.json'), { events: [] }).update(data => ({ ...data, events: data.events.map(event => event.id === target.eventId ? { ...event, memberId: 'other-member' } : event) }))
  await assert.rejects(() => saveFrontDeskOriginal(f.args), { code: 'FRONT_ORIGINAL_UNAVAILABLE' })
  assert.equal((await f.records()).length, 1)
})

test('a legacy missing evidence counter is bound as zero and full 5000-character originals remain exact', async t => {
  const raw = '合成原话'.repeat(1250)
  const f = await fixture(t, { context: { evidenceVersion: undefined }, messages: ({ message }) => [{ ...message, text: raw }] })
  const saved = await saveFrontDeskOriginal(f.args), [record] = await f.records()
  assert.equal(record.sourceText, raw)
  assert.equal(record.aiProvenance.sources[0].quote, raw)
  assert.ok(record.content.length <= 5000)
  assert.equal(saved.context.evidenceVersion, 0)
  assert.equal((await f.business.get(accountId, f.member.id, saved.savedDraft.id)).frontEvidenceVersion, 0)
})

test('identical originals in separate confirmed intents create separate records', async t => {
  const f = await fixture(t), first = await saveFrontDeskOriginal(f.args)
  await f.front.store.update(data => ({ ...data, contexts: [...data.contexts, { ...f.context, id: 'second-intent' }], messages: [...data.messages, { ...f.message, id: 'second-message', contextId: 'second-intent' }] }))
  const second = await saveFrontDeskOriginal({ ...f.args, contextId: 'second-intent' })
  assert.notEqual(first.savedDraft.id, second.savedDraft.id)
  assert.notEqual(first.savedDraft.result.records[0].recordId, second.savedDraft.result.records[0].recordId)
  assert.equal((await f.records()).length, 2)
})

test('confirmation, stale or conflicting version, cross-member access and already saved without intent receipt fail before creation', async t => {
  for (const mode of ['unconfirmed', 'stale', 'conflicting', 'cross-member', 'saved', 'closed']) await t.test(mode, async t => {
    const f = await fixture(t, { context: mode === 'saved' ? { saved: true } : mode === 'closed' ? { closedAt: at } : {} }), args = { ...f.args, input: { ...f.args.input } }
    if (mode === 'unconfirmed') args.input.confirmed = false
    if (mode === 'stale') args.input.expectedContextVersion = 6
    if (mode === 'conflicting') args.input.expectedVersion = 6
    if (mode === 'cross-member') args.memberId = (await f.members.create({ accountId, name: '合成另一个人', relationship: 'child' })).id
    await assert.rejects(() => saveFrontDeskOriginal(args))
    assert.equal((await f.records()).length, 0)
  })
})

test('other, mixed, unknown and unconfirmed subjects in context, active facts, messages or original files cannot be assigned to the current member', async t => {
  for (const mode of ['context-other', 'context-multiple', 'context-unknown', 'context-unconfirmed', 'fact-other', 'fact-foreign', 'message-other', 'file-multiple']) await t.test(mode, async t => {
    const f = await fixture(t)
    await f.front.store.update(data => ({ ...data,
      contexts: data.contexts.map(context => ({ ...context,
        ...(mode.startsWith('context-') ? { subject: { ...f.subject, kind: mode.slice(8), confirmed: mode !== 'context-unconfirmed' } } : {}),
        ...(mode.startsWith('fact-') ? { facts: [{ status: 'active', subject: mode === 'fact-other' ? { kind: 'other' } : { ...f.subject, memberId: 'other-member' } }] } : {})
      })),
      messages: data.messages.map(message => ({ ...message,
        ...(mode === 'message-other' ? { subject: { kind: 'other' } } : {}),
        ...(mode === 'file-multiple' ? { originalFiles: [file('mixed', 'image/png', Buffer.from('bad'), { subject: { kind: 'multiple' } })] } : {})
      }))
    }))
    await assert.rejects(() => saveFrontDeskOriginal(f.args))
    assert.equal((await f.records()).length, 0)
  })
})

test('no trusted completed input and invalid/over-limit original bytes are rejected without formal writes', async t => {
  for (const mode of ['empty', 'fake-completed', 'invalid-base64', 'files', 'bytes']) await t.test(mode, async t => {
    const f = await fixture(t, { messages: ({ message }) => [{ ...message, text: '',
      ...(mode === 'fake-completed' ? { role: 'assistant', text: '不是真实用户原话' } : {}),
      ...(mode === 'invalid-base64' ? { originalFiles: [{ ...file('bad'), dataUrl: 'data:image/png;base64,!!bad' }] } : {}),
      ...(mode === 'files' ? { originalFiles: Array.from({ length: 13 }, (_, index) => file(`file-${index}`, 'image/png', Buffer.from(`bytes-${index}`))) } : {}),
      ...(mode === 'bytes' ? { originalFiles: [file('too-big', 'image/png', Buffer.alloc(15 * 1024 * 1024 + 1, 1))] } : {})
    }] })
    await assert.rejects(() => saveFrontDeskOriginal({ ...f.args, input: { ...f.args.input, text: '不能借用HTTP里的虚假原话' } }))
    assert.equal((await f.records()).length, 0)
  })
})

test('late context close, original mutation or cancellation rolls back the actual record, draft and attachments', async t => {
  for (const mode of ['close', 'source-change', 'cancel']) await t.test(mode, async t => {
    const f = await fixture(t, { messages: ({ message }) => [{ ...message, originalFiles: [file('kept-original')] }] }), controller = new AbortController()
    const save = f.business.save.bind(f.business)
    f.business.save = async (...args) => {
      const result = await save(...args)
      if (mode === 'cancel') controller.abort()
      else await f.front.store.update(data => mode === 'close' ? { ...data, contexts: data.contexts.map(context => ({ ...context, closedAt: at })) } : { ...data, messages: data.messages.map(message => ({ ...message, text: '晚到的更正' })) })
      return result
    }
    await assert.rejects(() => saveFrontDeskOriginal({ ...f.args, signal: controller.signal }))
    assert.equal((await f.records()).length, 0)
    assert.equal((await f.business.store.read()).drafts.length, 0)
    assert.equal((await f.business.events.repository.findByAccountId(accountId)).length, 0)
    assert.equal((await f.front.store.read()).contexts[0].saved, undefined)
  })
})
