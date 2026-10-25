import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import sharp from 'sharp'
import { AIBusinessService } from './business/service.mjs'
import { eventsApiPlugin } from '../events/vite-events-plugin.mjs'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'

const accountId = 'synthetic-recovery-owner'
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
async function until(operation, label) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const value = await operation()
    if (value) return value
    await sleep(15)
  }
  throw new Error(`Timed out: ${label}`)
}
const unknown = () => ({ kind: 'unknown', memberId: null, label: null, sources: [] })
const noAction = () => ({ type: 'none', targetIds: [], targetVersion: null, confirmation: 'none', quote: '' })
const conversational = (payload, extra = {}) => ({ reply: '我先保留这些原话和资料。', contextId: payload.conversation.activeContextId ?? 'new', responseMode: 'conversation', taskRelation: payload.conversation.activeContextId ? 'continue' : 'new', subject: unknown(), recordChanges: [], nextQuestion: null, requestedAction: noAction(), uncertainties: [], emergency: { currentChild: false, quote: '' }, ...extra })
const bytesHash = bytes => createHash('sha256').update(bytes).digest('hex')
const privatePaths = (value, location = 'job') => typeof value === 'string' ? /^data:(?:image|audio)\//u.test(value) ? [location] : [] : value && typeof value === 'object' ? Object.entries(value).flatMap(([key, item]) => ['originalFiles', 'mediaPreparation', 'sourceSignature', 'imageDataUrl', 'responseHistory'].includes(key) ? [`${location}.${key}`] : privatePaths(item, `${location}.${key}`)) : []

function wave() {
  const bytes = Buffer.alloc(44 + 3200)
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVE', 8)
  bytes.write('fmt ', 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(16000, 24); bytes.writeUInt32LE(32000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40)
  return bytes
}

async function fixture(t, configuration = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'front-failure-recovery-'))
  const member = await new FamilyMemberRepository(directory).create({ accountId, name: '合成小禾', relationship: 'child' })
  const calls = [], payloads = [], asrCalls = []
  const business = new AIBusinessService({ dataDirectory: directory, env: {}, model: { structured() { assert.fail('a conversation or explicit original save must not extract facts') } }, logger: { info() {}, warn() {} } })
  const model = { structured: async input => {
    calls.push(input.task)
    const payload = JSON.parse(input.input[0].content[0].text)
    payloads.push(payload)
    if (configuration.dialogue) return { value: await configuration.dialogue(payload), diagnostics: { provider: 'explicit-local-recovery-fixture' } }
    return { value: conversational(payload), diagnostics: { provider: 'explicit-local-recovery-fixture' } }
  } }
  const provider = { name: 'explicit-local-recovery-fixture', transcribeAudio: async audio => {
    asrCalls.push(audio)
    if (configuration.asr) return configuration.asr(audio, asrCalls.length)
    return { transcript: '没有' }
  } }
  let middleware
  const server = createServer((request, response) => { void middleware(request, response, () => { response.statusCode = 404; response.end() }) })
  const plugin = eventsApiPlugin({ dataDirectory: directory, env: {}, business, model, provider, logger: { info() {}, warn() {} }, tokens: { verify: token => token === 'synthetic-local-token' ? { sub: accountId } : null } })
  plugin.configureServer({ httpServer: server, middlewares: { use: value => { middleware = value } }, config: { logger: { error() {} } } })
  t.after(async () => {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    await until(async () => { try { await rm(directory, { recursive: true, force: true }); return true } catch (error) { if (['EPERM', 'EBUSY'].includes(error.code)) return false; throw error } }, 'release local SQLite fixtures')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`, memberPath = `/api/members/${member.id}`
  const request = async (pathname, method = 'GET', body, contentType = 'application/json') => {
    const response = await fetch(base + pathname, { method, headers: { Authorization: 'Bearer synthetic-local-token', ...(body === undefined ? {} : { 'Content-Type': contentType }) }, ...(body === undefined ? {} : { body: Buffer.isBuffer(body) ? body : JSON.stringify(body) }) })
    return { status: response.status, data: await response.json() }
  }
  const upload = async (name, mimeType, bytes) => {
    const response = await request(`${memberPath}/recognition-assets?name=${encodeURIComponent(name)}`, 'POST', bytes, mimeType)
    assert.equal(response.status, 201, JSON.stringify(response.data))
    return response.data
  }
  const submitJob = async input => {
    const response = await request(`${memberPath}/recognition-jobs`, 'POST', { id: 'recovery-job', mode: 'front', input, options: { smartRecord: true, followUp: false, selectedOccurredAt: new Date().toISOString() } })
    assert.equal(response.status, 202, JSON.stringify(response.data))
    return response.data
  }
  const job = async () => {
    const response = await request(`${memberPath}/recognition-jobs/recovery-job`)
    assert.equal(response.status, 200, JSON.stringify(response.data))
    return response.data
  }
  const settled = predicate => until(async () => {
    const result = await job()
    return (predicate ? predicate(result) : ['ready', 'needs_review', 'failed'].includes(result.state)) ? result : null
  }, 'HTTP recognition job outcome')
  const frontPath = `${memberPath}/front-desk-record`
  const postFront = input => request(frontPath, 'POST', input)
  const contextAction = (context, input) => request(`${frontPath}/contexts/${context.id}`, 'POST', input)
  const records = () => business.records.repository.findByAccountId(accountId)
  return { directory, member, business, request, upload, submitJob, job, settled, postFront, contextAction, records, calls, payloads, asrCalls, memberPath }
}

test('HTTP model failure publishes the accepted message and private original count, and explicit recovery preserves exact originals once', async t => {
  const f = await fixture(t, { dialogue: async () => { throw Object.assign(new Error('explicit local dialogue failure'), { code: 'SYNTHETIC_DIALOGUE_UNAVAILABLE' }) } })
  const usable = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#418878' } }).png().toBuffer()
  const broken = Buffer.from('damaged original is still a real received input')
  const assets = [await f.upload('usable.png', 'image/png', usable), await f.upload('damaged.png', 'image/png', broken)]
  await f.submitJob({ id: 'accepted-failed-message', kind: 'image', text: '请先保留这两份资料原件。', assetIds: assets.map(asset => asset.id) })
  const failed = await f.settled(result => result.state === 'failed' && result.frontDesk?.context)
  assert.equal(failed.error.code, 'SYNTHETIC_DIALOGUE_UNAVAILABLE')
  const context = failed.frontDesk.context, message = context.messages.find(message => message.id === 'accepted-failed-message')
  assert.equal(message.status, 'failed')
  assert.equal(message.acceptedInput, true)
  assert.ok(Number.isFinite(Date.parse(message.inputAcceptedAt)))
  assert.equal(message.originalFileCount, 1)
  assert.equal(message.files.length, 1)
  assert.equal(context.originalsVersion, 1)
  assert.equal(context.originalsSubjectConfirmed, false)
  assert.deepEqual(privatePaths(failed), [])
  assert.equal((await f.records()).length, 0)
  const unconfirmed = await f.contextAction(context, { action: 'save_original', confirmed: true, expectedContextVersion: context.version })
  assert.equal(unconfirmed.status, 409)
  assert.equal(unconfirmed.data.error.code, 'FRONT_SUBJECT_UNCONFIRMED')
  const confirmed = await f.contextAction(context, { action: 'confirm_subject', expectedVersion: context.version })
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.data))
  assert.equal(confirmed.data.subject.confirmation.originalsVersion, 1)
  const saveInput = { action: 'save_original', confirmed: true, expectedContextVersion: confirmed.data.version }
  const saved = await f.contextAction(context, saveInput)
  assert.equal(saved.status, 200, JSON.stringify(saved.data))
  const [record] = await f.records(), attachments = await f.business.attachments.findByEventId(record.eventId)
  assert.equal(record.sourceText, message.text)
  assert.equal(record.aiProvenance.category, 'other')
  assert.equal(record.journal.timePrecision, 'unknown')
  assert.deepEqual(attachments.map(attachment => attachment.contentHash).sort(), [bytesHash(usable), bytesHash(broken)].sort())
  assert.ok(attachments.every(attachment => attachment.analysis.status === 'unavailable'))
  const replay = await f.contextAction(context, saveInput)
  assert.equal(replay.status, 200, JSON.stringify(replay.data))
  assert.equal(replay.data.savedDraft.result.records[0].recordId, record.id)
  assert.equal((await f.records()).length, 1)
  assert.equal(f.calls.length, 1)
})

test('HTTP upload after subject confirmation invalidates that exact original version until freshly confirmed', async t => {
  const f = await fixture(t)
  const png = async color => sharp({ create: { width: 8, height: 8, channels: 3, background: color } }).png().toBuffer()
  const firstBytes = await png('#216475'), secondBytes = await png('#934275')
  const asFile = (name, bytes) => ({ name, mimeType: 'image/png', dataUrl: `data:image/png;base64,${bytes.toString('base64')}` })
  const first = await f.postFront({ id: 'first-original', kind: 'image', text: '', files: [asFile('first.png', firstBytes)] })
  assert.equal(first.status, 200, JSON.stringify(first.data))
  const initial = first.data.context
  const confirmed = await f.contextAction(initial, { action: 'confirm_subject', expectedVersion: initial.version })
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.data))
  assert.equal(confirmed.data.originalsSubjectConfirmed, true)
  const second = await f.postFront({ id: 'second-original', contextId: initial.id, kind: 'image', text: '', files: [asFile('second.png', secondBytes)] })
  assert.equal(second.status, 200, JSON.stringify(second.data))
  const changed = second.data.context
  assert.equal(changed.id, initial.id)
  assert.equal(changed.originalsVersion, 2)
  assert.equal(changed.subject.confirmation.originalsVersion, 1)
  assert.equal(changed.originalsSubjectConfirmed, false)
  const rejected = await f.contextAction(changed, { action: 'save_original', confirmed: true, expectedContextVersion: changed.version })
  assert.equal(rejected.status, 409)
  assert.equal(rejected.data.error.code, 'FRONT_SUBJECT_UNCONFIRMED')
  const stale = await f.contextAction(changed, { action: 'confirm_subject', expectedVersion: confirmed.data.version })
  assert.equal(stale.status, 409)
  const fresh = await f.contextAction(changed, { action: 'confirm_subject', expectedVersion: changed.version })
  assert.equal(fresh.status, 200, JSON.stringify(fresh.data))
  assert.equal(fresh.data.subject.confirmation.originalsVersion, 2)
  assert.equal(fresh.data.originalsSubjectConfirmed, true)
  const saved = await f.contextAction(changed, { action: 'save_original', confirmed: true, expectedContextVersion: fresh.data.version })
  assert.equal(saved.status, 200, JSON.stringify(saved.data))
  const [record] = await f.records()
  assert.deepEqual((await f.business.attachments.findByEventId(record.eventId)).map(attachment => attachment.contentHash).sort(), [bytesHash(firstBytes), bytesHash(secondBytes)].sort())
})

test('HTTP partial ASR recovery never binds the delayed short transcript to the newer question emitted for the photo', async t => {
  const f = await fixture(t, {
    asr: async (_audio, attempt) => { if (attempt === 1) throw Object.assign(new Error('explicit synthetic ASR outage'), { code: 'ASR_TIMEOUT' }); return { transcript: '没有' } },
    dialogue: async payload => {
      if (payload.latest.id === 'before-audio') return conversational(payload, { reply: '第一张照片是谁的？', nextQuestion: { id: 'original-subject-question', text: '第一张照片是谁的？', target: 'subject', sourceMessageId: payload.latest.id } })
      if (!payload.latest.text) return conversational(payload, { reply: '图片里还有别的内容吗？', nextQuestion: { id: 'newer-photo-question', text: '图片里还有别的内容吗？', target: 'attachment_scope', sourceMessageId: payload.latest.id } })
      return conversational(payload)
    }
  })
  const initial = await f.postFront({ id: 'before-audio', kind: 'text', text: '我有一张照片。' })
  assert.equal(initial.status, 200, JSON.stringify(initial.data))
  const context = initial.data.context
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#827343' } }).png().toBuffer()
  const photo = await f.upload('photo.png', 'image/png', png), audio = await f.upload('voice.wav', 'audio/wav', wave())
  await f.submitJob({ id: 'partial-asr-message', contextId: context.id, answerTo: { contextId: context.id, questionId: 'original-subject-question' }, kind: 'voice', text: '', assetIds: [photo.id, audio.id], asrAssetId: audio.id })
  const partial = await f.settled(result => result.state === 'needs_review')
  assert.equal(f.asrCalls.length, 1)
  assert.equal(partial.unresolvedInputs.length, 1)
  assert.equal(partial.frontDesk.context.understanding.nextQuestion.id, 'newer-photo-question')
  const retry = await f.request(`${f.memberPath}/recognition-jobs/recovery-job/commands`, 'POST', { id: 'retry-asr', type: 'retry' })
  assert.equal(retry.status, 200, JSON.stringify(retry.data))
  const recovered = await f.settled(result => result.state === 'ready' && f.asrCalls.length === 2)
  const latest = f.payloads.at(-1)
  assert.equal(latest.latest.text, '没有')
  assert.equal(latest.latest.transcriptionRetry, true)
  assert.equal(latest.latest.answerTo.questionId, 'original-subject-question')
  assert.equal(latest.latest.answerQuestion.id, 'original-subject-question')
  assert.equal(latest.conversation.effectiveQuestion, null)
  assert.equal(recovered.unresolvedInputs.length, 0)
  assert.equal(recovered.frontDesk.context.messages.filter(message => message.id === 'partial-asr-message').length, 1)
  assert.equal(recovered.frontDesk.context.messages.find(message => message.id === 'partial-asr-message').text, '没有')
  assert.equal((await f.records()).length, 0)
  assert.deepEqual(privatePaths(recovered), [])
})

test('HTTP voice-only ASR failure exposes its durably accepted original for explicit neutral recovery', async t => {
  const f = await fixture(t, { asr: async () => { throw Object.assign(new Error('explicit synthetic ASR outage'), { code: 'ASR_TIMEOUT' }) } })
  const original = wave(), audio = await f.upload('voice-only.wav', 'audio/wav', original)
  await f.submitJob({ id: 'failed-voice-only', kind: 'voice', text: '', assetIds: [audio.id], asrAssetId: audio.id })
  const failed = await f.settled(result => result.state === 'failed' && result.frontDesk?.context)
  const context = failed.frontDesk.context, message = context.messages.find(message => message.id === 'failed-voice-only')
  assert.equal(message.status, 'failed')
  assert.equal(message.acceptedInput, true)
  assert.equal(message.voices.length, 1)
  assert.equal(failed.unresolvedInputs.length, 1)
  assert.equal(f.calls.length, 0)
  assert.equal((await f.records()).length, 0)
  assert.deepEqual(privatePaths(failed), [])
  const confirmed = await f.contextAction(context, { action: 'confirm_subject', expectedVersion: context.version })
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.data))
  const saved = await f.contextAction(context, { action: 'save_original', confirmed: true, expectedContextVersion: confirmed.data.version })
  assert.equal(saved.status, 200, JSON.stringify(saved.data))
  const [record] = await f.records(), [attachment] = await f.business.attachments.findByEventId(record.eventId)
  assert.equal(record.sourceText ?? '', '')
  assert.equal(record.aiProvenance.category, 'other')
  assert.deepEqual(Buffer.from(attachment.dataUrl.split(',')[1], 'base64'), original)
  assert.equal(attachment.contentHash, bytesHash(original))
  assert.equal(attachment.analysis.status, 'unavailable')
})

test('HTTP malformed or short WAV originals remain explicitly recoverable after local audio validation fails', async t => {
  for (const [name, original] of [['short.wav', Buffer.from('short received audio')], ['damaged.wav', Buffer.alloc(512, 3)]]) await t.test(name, async t => {
    const f = await fixture(t)
    const audio = await f.upload(name, 'audio/wav', original)
    await f.submitJob({ id: 'invalid-audio-message', kind: 'voice', text: '', assetIds: [audio.id], asrAssetId: audio.id })
    const failed = await f.settled(result => result.state === 'failed')
    const context = failed.frontDesk?.context
    assert.ok(context, 'The acknowledged audio original must have a recoverable front-desk context after local decoding fails')
    const message = context.messages.find(message => message.id === 'invalid-audio-message')
    assert.equal(message.status, 'failed')
    assert.equal(message.acceptedInput, true)
    assert.equal(message.originalFileCount, 1)
    assert.equal(message.voices.length, 0)
    assert.equal(f.asrCalls.length, 0)
    assert.equal(f.calls.length, 0)
    assert.equal((await f.records()).length, 0)
    assert.deepEqual(privatePaths(failed), [])
    const confirmed = await f.contextAction(context, { action: 'confirm_subject', expectedVersion: context.version })
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.data))
    const saved = await f.contextAction(context, { action: 'save_original', confirmed: true, expectedContextVersion: confirmed.data.version })
    assert.equal(saved.status, 200, JSON.stringify(saved.data))
    const [record] = await f.records(), [attachment] = await f.business.attachments.findByEventId(record.eventId)
    assert.equal(record.sourceText ?? '', '')
    assert.equal(record.aiProvenance.category, 'other')
    assert.equal(record.journal.timePrecision, 'unknown')
    assert.deepEqual(Buffer.from(attachment.dataUrl.split(',')[1], 'base64'), original)
    assert.equal(attachment.contentHash, bytesHash(original))
    assert.equal(attachment.analysis.status, 'unavailable')
  })
})
