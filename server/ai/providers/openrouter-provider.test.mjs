import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { OpenRouterProvider } from './openrouter-provider.mjs'
import { openRouterConfiguration } from './provider-config.mjs'
import { createAIProvider, createAudioProvider } from './provider-factory.mjs'
import { createDialogueProvider } from './dialogue-provider.mjs'
import { withAIAccount } from './call-control.mjs'
import { withAITrace } from './telemetry.mjs'
import { BusinessModel } from '../business/model.mjs'
import { prepareDocuments, recognizePage } from '../business/documents.mjs'
import { FamilyMemberRepository } from '../../members/repositories/family-member-repository.mjs'
import { AIBusinessService } from '../business/service.mjs'
import { MedicalSummaryService } from '../medical-summary-service.mjs'
import { NurseService } from '../nurse-service.mjs'
import { HealthEventService } from '../../events/health-event-service.mjs'

const env = { AI_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'synthetic-or-credential', OPENROUTER_MODEL: 'mistralai/synthetic-text', OPENROUTER_VISION_MODEL: 'mistralai/synthetic-vision' }
const silent = { info() {}, warn() {} }
const schema = { type: 'object', additionalProperties: false, required: ['text'], properties: { text: { type: 'string' } } }
const success = value => Response.json({ id: 'gen-synthetic-1', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }], usage: { prompt_tokens: 11, completion_tokens: 22 } })
const provider = (fetchImpl, options = {}) => new OpenRouterProvider({ env, logger: silent, fetchImpl, ...options })
const structured = (model, extra = {}) => model.structured({ task: 'front-desk-dialogue', schema, instructions: 'synthetic policy', input: 'PRIVATE_SYNTHETIC_INPUT', ...extra })

test('only explicit OpenRouter configuration selects it; key/model and official endpoint are required', async () => {
  for (const value of [{ AI_PROVIDER: 'openrouter' }, { ...env, OPENROUTER_MODEL: '' }, { ...env, OPENROUTER_API_KEY: '' }]) {
    const p = createAIProvider({ env: value, fetchImpl: () => assert.fail('must not call') })
    await assert.rejects(p.fetch(), { code: 'AI_NOT_CONFIGURED' })
  }
  for (const model of ['auto', 'openrouter/auto', '../secret', 'mistralai/synthetic?token=secret']) assert.throws(() => openRouterConfiguration({ env: { ...env, OPENROUTER_MODEL: model } }), { code: 'AI_MODEL_INVALID' })
  for (const baseUrl of ['http://openrouter.ai/api/v1', 'https://evil.example/api/v1', 'https://openrouter.ai/api/v1/chat/completions', 'https://user:secret@openrouter.ai/api/v1', 42]) assert.throws(() => openRouterConfiguration({ env, baseUrl }), { code: 'AI_BASE_URL_INVALID' })
  assert.equal(openRouterConfiguration({ env: { ...env, OPENROUTER_VISION_MODEL: '' } }).visionModel, env.OPENROUTER_MODEL)
  assert.equal(createAIProvider({ env: { OPENROUTER_API_KEY: 'configured-but-not-selected' } }), null)
  assert.equal(createDialogueProvider({ env, logger: silent }).name, 'openrouter')
  const legacy = { AI_PROVIDER: 'bailian', BAILIAN_API_KEY: 'synthetic-old', BAILIAN_BASE_URL: 'https://dashscope.aliyuncs.com/compatible-mode/v1' }
  assert.equal(createDialogueProvider({ env: legacy, logger: silent }).name, 'bailian')
  assert.equal(createAudioProvider('TTS', { env: { ...env, OPENAI_API_KEY: 'unused' } }), null)
  assert.equal(createAudioProvider('ASR', { env: { ...env, OPENAI_API_KEY: 'unused' } }), null)
  assert.equal(createAudioProvider('ASR', { env: { ...env, ...legacy, AI_PROVIDER: 'openrouter', ASR_PROVIDER: 'bailian' } }).name, 'bailian')
})

test('front-desk and extraction share one fixed model; legacy AI model variables cannot override it', async () => {
  const calls = [], logs = []
  const p = createDialogueProvider({ env: { ...env, AI_DRAFT_MODEL: 'old-qwen', AI_VISION_MODEL: 'old-vision' }, logger: { info: (...v) => logs.push(v), warn: (...v) => logs.push(v) }, fetchImpl: async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return success({ text: 'ok' }) } })
  const model = new BusinessModel({ provider: p, env, logger: silent })
  for (const task of ['front-desk-dialogue', 'draft-extraction']) {
    const result = await structured(model, { task, samplingTemperature: 0 })
    assert.equal(result.diagnostics.provider, 'openrouter'); assert.equal(result.diagnostics.model, env.OPENROUTER_MODEL)
    assert.equal(result.diagnostics.requestId, 'gen-synthetic-1'); assert.equal(result.diagnostics.outputTokens, 22)
  }
  assert.equal(calls.length, 2)
  for (const { url, init, body } of calls) {
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions'); assert.equal(init.redirect, 'error')
    assert.equal(init.headers.Authorization, 'Bearer synthetic-or-credential')
    assert.equal(body.model, env.OPENROUTER_MODEL); assert.equal(body.temperature, 0); assert.equal(body.stream, false)
    assert.deepEqual(body.provider, { require_parameters: true, allow_fallbacks: false })
    assert.equal(body.messages[0].content, 'synthetic policy'); assert.equal(body.messages[1].content[0].text, 'PRIVATE_SYNTHETIC_INPUT')
    assert.equal(body.response_format.json_schema.strict, true); assert.deepEqual(body.response_format.json_schema.schema, schema)
    assert.equal(body.enable_thinking, undefined); assert.equal(body.models, undefined); assert.equal(body.tools, undefined)
    assert.ok(body.max_tokens <= 8000)
  }
  assert.doesNotMatch(JSON.stringify(logs), /synthetic-or-credential|PRIVATE_SYNTHETIC_INPUT|Authorization/)
  await assert.rejects(model.speak('合成回复'), { code: 'TTS_NOT_CONFIGURED' })
})

test('credits, permissions/regions, authentication, rate limits and HTTP-200 errors fail without retries or leaking content', async () => {
  for (const [status, code] of [[400, 'INPUT_UNSUPPORTED'], [401, 'AUTHENTICATION'], [402, 'CREDIT_BALANCE'], [403, 'PERMISSION'], [404, 'MODEL_UNAVAILABLE'], [429, 'RATE_LIMIT'], [503, 'UNAVAILABLE']]) {
    for (const httpStatus of [status, 200]) {
      let calls = 0; const logs = []
      const model = new BusinessModel({ provider: provider(async () => { calls++; return Response.json({ error: { code: status, message: 'synthetic-or-credential PRIVATE_SYNTHETIC_INPUT' } }, { status: httpStatus }) }, { logger: { info: (...v) => logs.push(v), warn: (...v) => logs.push(v) } }), logger: silent })
      await assert.rejects(structured(model), error => { assert.equal(error.code, `AI_OPENROUTER_${code}`); assert.doesNotMatch(JSON.stringify(error), /synthetic-or-credential|PRIVATE_SYNTHETIC_INPUT/); return true })
      assert.equal(calls, 1); assert.doesNotMatch(JSON.stringify(logs), /synthetic-or-credential|PRIVATE_SYNTHETIC_INPUT/)
    }
  }
})

test('incomplete, refused, tool, malformed and schema-invalid outputs do not become valid results', async () => {
  for (const body of [null, [], { choices: [{ finish_reason: 'length', message: { content: '{"text":"partial"}' } }] }, { choices: [{ finish_reason: 'stop', message: { refusal: 'PRIVATE_SYNTHETIC_INPUT' } }] }, { choices: [{ finish_reason: 'stop', message: { content: '{"text":"ok"}', tool_calls: [{}] } }] }, { choices: [{ finish_reason: 'stop', message: { content: 'PRIVATE_SYNTHETIC_INPUT' } }] }, { choices: [{ finish_reason: 'stop', message: { content: '{"text":12}' } }] }, { choices: [{ finish_reason: 'stop', message: { content: '{"text":"ok","unexpected":"PRIVATE_SYNTHETIC_INPUT"}' } }] }]) {
    let calls = 0
    const model = new BusinessModel({ provider: provider(async () => { calls++; return Response.json(body) }), logger: silent })
    await assert.rejects(structured(model), error => { assert.match(error.code, /^AI_/); assert.doesNotMatch(JSON.stringify(error), /PRIVATE_SYNTHETIC_INPUT/); return true })
    assert.equal(calls, 1)
  }
})

test('input restrictions, pre-cancel, request disconnect and usage budgets prevent extra outbound work', async () => {
  let calls = 0
  const p = provider(async () => { calls++; return success({ text: 'ok' }) })
  const model = new BusinessModel({ provider: p, logger: silent })
  const cancelled = new AbortController(); cancelled.abort()
  await assert.rejects(structured(model, { signal: cancelled.signal })); assert.equal(calls, 0)
  await assert.rejects(withAITrace({ signal: cancelled.signal }, () => structured(model))); assert.equal(calls, 0)
  for (const content of [[{ type: 'input_image', image_url: 'https://example.test/private.png' }], [{ type: 'input_file', file_data: 'data:application/pdf;base64,AA==' }], [{ type: 'input_text', text: 'x'.repeat(66000) }]]) await assert.rejects(structured(model, { input: [{ role: 'user', content }] }))
  await assert.rejects(structured(model, { input: [{ role: 'system', content: [] }] }))
  await assert.rejects(p.fetch('https://evil.example/responses', {})); assert.equal(calls, 0)
  const limited = new BusinessModel({ provider: provider(async () => { calls++; return success({ text: 'ok' }) }, { env: { ...env, AI_MAX_CALLS_PER_ACCOUNT_HOUR: '1' } }), logger: silent })
  await withAIAccount('synthetic-or-limit', () => structured(limited))
  await assert.rejects(withAIAccount('synthetic-or-limit', () => structured(limited)), { code: 'AI_ACCOUNT_CALL_LIMIT' }); assert.equal(calls, 1)
})

test('PDF pages become inline images and use the configured vision model', async () => {
  const pdf = await PDFDocument.create(); pdf.addPage([100, 100])
  const file = { name: 'synthetic.pdf', mimeType: 'application/pdf', dataUrl: `data:application/pdf;base64,${Buffer.from(await pdf.save()).toString('base64')}` }
  const prepared = await prepareDocuments([file]); let body
  const model = new BusinessModel({ provider: provider(async (_, init) => { body = JSON.parse(init.body); return success({ text: '合成资料原文', status: 'readable' }) }), logger: silent })
  const page = await recognizePage(prepared.pages[0], model)
  assert.equal(body.model, env.OPENROUTER_VISION_MODEL); assert.equal(body.messages[1].content[1].type, 'image_url')
  assert.match(body.messages[1].content[1].image_url.url, /^data:image\/png;base64,/)
  assert.equal(page.page, 1); assert.equal(page.id, prepared.documents[0].id); assert.equal(prepared.documents[0].dataUrl, file.dataUrl)
  assert.equal(page.diagnostics.provider, 'openrouter')
})

test('same-ID drafts preserve edits on failure and save once with OpenRouter provenance', async t => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-or-')); t.after(() => rm(dataDirectory, { recursive: true, force: true }))
  const member = await new FamilyMemberRepository(dataDirectory).create({ accountId: 'synthetic', name: '合成孩子', relationship: 'self' })
  let calls = 0, failed = false
  const model = new BusinessModel({ provider: provider(async (_, init) => {
    calls++; if (failed) return Response.json({ error: { code: 402 } }, { status: 402 })
    const source = JSON.parse(JSON.parse(init.body).messages[1].content[0].text).sources[0]
    return success({ items: [{ category: 'symptom', title: '合成观察', timeText: null, archiveCategory: null, subject: 'current', relationKey: null, fields: [{ name: 'symptom', value: source.text, quote: source.text, sourceId: source.id, page: source.page }] }] })
  }), logger: silent })
  const service = new AIBusinessService({ dataDirectory, model })
  await assert.rejects(service.prepare('other', member.id, { text: '不应出站' }), { status: 404 }); assert.equal(calls, 0)
  const input = { text: '没有呕吐' }, draft = await service.prepare('synthetic', member.id, input)
  await service.prepare('synthetic', member.id, input); assert.equal(calls, 1)
  const edited = await service.edit('synthetic', member.id, draft.id, { version: draft.version, itemId: draft.items[0].id, field: 'symptom', value: '家长更正：没有呕吐' })
  failed = true
  await assert.rejects(service.prepare('synthetic', member.id, { id: draft.id, version: edited.version, text: '没有呕吐，之后补充' }))
  assert.equal((await service.read('synthetic', member.id, draft.id)).items[0].fields[0].value, '家长更正：没有呕吐')
  failed = false
  const next = await service.prepare('synthetic', member.id, input), result = await service.save('synthetic', member.id, next.id, { version: next.version, confirmed: true })
  await service.save('synthetic', member.id, next.id, { version: next.version, confirmed: true })
  const records = await service.records.repository.findByAccountId('synthetic')
  assert.equal(records.length, 1); assert.equal(records[0].id, result.result.records[0].recordId)
  assert.equal(records[0].aiProvenance.provider, 'openrouter'); assert.equal(records[0].aiProvenance.model, env.OPENROUTER_MODEL)
})

test('medical summary uses unchanged citation validation and reports OpenRouter provenance', async () => {
  let body
  const p = provider(async (_, init) => { body = JSON.parse(init.body); return success({ overview: '没有发热。', keyPoints: [{ text: '没有发热', quote: '没有发热', sectionId: 'record' }], missingInformation: [] }) })
  const result = await new MedicalSummaryService({ provider: p, logger: silent }).generate({ sections: [{ id: 'record', title: '观察', lines: ['[record:synthetic] 没有发热', '姓名：合成孩子'] }] }, 'synthetic-or-summary')
  assert.equal(result.provider, 'openrouter'); assert.equal(result.keyPointEvidence[0].sourceId, 'record:synthetic')
  assert.doesNotMatch(JSON.stringify(body.messages[1]), /姓名|合成孩子/)
})

test('in-flight cancellation and timeout reach the transport once and remain safe failures', async () => {
  const controller = new AbortController(); let started, calls = 0
  const ready = new Promise(resolve => { started = resolve })
  const model = new BusinessModel({ provider: provider(async (_, init) => {
    calls++; started()
    return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }))
  }), logger: silent })
  const pending = structured(model, { signal: controller.signal })
  await ready; controller.abort()
  await assert.rejects(pending, { code: 'AI_NETWORK_ERROR' }); assert.equal(calls, 1)
  const timedOut = new BusinessModel({ provider: provider(async () => { calls++; throw Object.assign(new Error('PRIVATE_SYNTHETIC_INPUT'), { name: 'TimeoutError' }) }), logger: silent })
  await assert.rejects(structured(timedOut), error => { assert.equal(error.code, 'AI_TIMEOUT'); assert.doesNotMatch(JSON.stringify(error), /PRIVATE_SYNTHETIC_INPUT/); return true }); assert.equal(calls, 2)
})

test('nurse generation honors explicit OpenRouter selection instead of constructing Bailian directly', async t => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-or-nurse-')); t.after(() => rm(dataDirectory, { recursive: true, force: true }))
  const events = new HealthEventService({ dataDirectory })
  const member = await new FamilyMemberRepository(dataDirectory).create({ accountId: 'synthetic', name: '合成孩子', relationship: 'child' })
  const nurse = new NurseService({ dataDirectory, events, env: { AI_PROVIDER: 'openrouter' } })
  let draft = await nurse.open('synthetic', member.id, { scope: member.id })
  draft = await nurse.change('synthetic', member.id, draft.id, { version: draft.version, turn: { id: 'first', role: 'user', text: '没有发热', at: new Date().toISOString(), final: true, status: 'completed' } })
  await assert.rejects(nurse.generate('synthetic', member.id, draft.id, { version: draft.version }), { code: 'AI_NOT_CONFIGURED' })
  const after = await nurse.owned('synthetic', member.id, draft.id)
  assert.equal(after.turns.filter(turn => turn.role === 'user').length, 1)
})
