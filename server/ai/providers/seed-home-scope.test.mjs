import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EventEmitter } from 'node:events'
import { createSeedHomeScope, currentSeedHome, seedHomeRequest, seedHomeStatus, withSeedHome } from './seed-home-scope.mjs'
import { SeedASRProvider, seedASRConfiguration } from './seed-asr-provider.mjs'
import { LiveAudioPreviewService } from '../live-audio-preview.mjs'

const env = {
  NODE_ENV: 'production',
  HOOOHO_SEED_HOME_TESTFLIGHT: 'true',
  HOOOHO_SEED_TRIAL_HOOOHO_ID: 'synthetic-owner-number',
  HOOOHO_SEED_TRIAL_API_KEY: 'synthetic-ark',
  DOUBAO_ASR_API_KEY: 'synthetic-asr',
}
const owner = { id: 'synthetic-owner', hooohoId: env.HOOOHO_SEED_TRIAL_HOOOHO_ID }
const beta = { headers: { 'user-agent': 'Mozilla/5.0 Mobile/1 HooohoSeedTestFlight/1' } }

test('Seed TestFlight scopes the normal home endpoints only to the marked build', () => {
  for (const pathname of [
    '/api/ai/audio/live',
    '/api/ai/audio/transcriptions',
    '/api/members/synthetic/recognition-jobs/job/actions',
    '/api/members/synthetic/front-desk-record/contexts/example',
    '/api/members/synthetic/ai-drafts/example/save',
  ]) {
    assert.equal(seedHomeRequest(beta, pathname), true)
    assert.equal(seedHomeRequest({ headers: {} }, pathname), false)
    assert.equal(seedHomeRequest({ headers: { 'user-agent': 'HooohoSeedTestFlight/10' } }, pathname), false)
  }
  assert.equal(seedHomeRequest(beta, '/api/account/seed-testflight'), false)
})

test('boot requires both providers and the Hangzhou feature flag', () => {
  assert.deepEqual(seedHomeStatus(env), { route: 'seed-testflight-home-v1', ready: true })
  for (const overrides of [
    { DOUBAO_ASR_API_KEY: ' ' },
    { HOOOHO_SEED_TRIAL_API_KEY: '' },
    { HOOOHO_SEED_TRIAL_HOOOHO_ID: '' },
    { HOOOHO_SEED_HOME_TESTFLIGHT: 'false' },
    { RAILWAY_SERVICE_ID: 'synthetic-old-service' },
  ]) assert.equal(seedHomeStatus({ ...env, ...overrides }).ready, false)
})

test('account scope rejects guests, merged users and other accounts before model work', async () => {
  let called = 0
  for (const user of [null, { ...owner, guest: true }, { ...owner, mergedInto: 'other' }, { ...owner, hooohoId: 'other' }]) {
    const run = createSeedHomeScope({ env, findUser: async () => user, models: {} })
    await assert.rejects(run(owner.id, () => called++), { code: 'AI_SEED_HOME_ACCOUNT_REQUIRED' })
  }
  assert.equal(called, 0)
  const disabled = createSeedHomeScope({ env: { ...env, HOOOHO_SEED_HOME_TESTFLIGHT: '' }, findUser: async () => owner, models: {} })
  await assert.rejects(disabled(owner.id, () => called++), { code: 'AI_SEED_HOME_UNAVAILABLE' })
  assert.equal(called, 0)
})

test('concurrent requests and default background jobs cannot inherit a Seed route', async () => {
  const models = {}
  const run = createSeedHomeScope({ env, findUser: async () => owner, models })
  await Promise.all([
    run(owner.id, async () => {
      await Promise.resolve()
      assert.deepEqual(currentSeedHome(), { accountId: owner.id, models })
      await withSeedHome(undefined, async () => {
        await Promise.resolve()
        assert.equal(currentSeedHome(), undefined)
      })
      assert.equal(currentSeedHome().accountId, owner.id)
    }),
    Promise.resolve().then(() => assert.equal(currentSeedHome(), undefined)),
  ])
  assert.equal(currentSeedHome(), undefined)
})

function seedTranscriptFrame(text, final = false) {
  const payload = Buffer.from(JSON.stringify({ result: { text } }))
  const header = Buffer.alloc(8)
  header[0] = 0x11
  header[1] = final ? 0x92 : 0x90
  header[2] = 0x10
  header.writeUInt32BE(payload.length, 4)
  return Buffer.concat([header, payload])
}

test('the live and final speech paths call the two pinned Seed ASR endpoints', async t => {
  const connections = []
  const socketFactory = (url, { headers }) => {
    connections.push({ url, headers })
    const socket = new EventEmitter()
    socket.close = () => {}
    socket.send = packet => {
      if (packet[1] >> 4 === 1) queueMicrotask(() => socket.emit('message', seedTranscriptFrame('合成文字')))
      if (packet[1] === 0x22) queueMicrotask(() => socket.emit('message', seedTranscriptFrame('合成文字', true)))
    }
    setImmediate(() => socket.emit('open'))
    return socket
  }
  const preview = new LiveAudioPreviewService({ env, socketFactory, assertMember: async () => {} })
  t.after(() => preview.destroy())
  const final = new SeedASRProvider({ env, seedHome: true, seedSocketFactory: socketFactory, prepareSeedAudio: async () => Buffer.alloc(6400) })
  const run = createSeedHomeScope({
    env, findUser: async () => owner,
    models: { liveAudio: () => seedASRConfiguration(env, true) },
  })
  await run(owner.id, async () => {
    const session = await preview.open(owner.id, 'synthetic-child')
    assert.equal(preview.read(owner.id, session.id).text, '合成文字')
    preview.close(owner.id, session.id)
    const result = await final.transcribeAudio({})
    assert.equal(result.transcript, '合成文字')
    assert.equal(result.model, 'seed-asr-2.0')
  })
  assert.deepEqual(connections.map(({ url }) => new URL(url).pathname), ['/api/v3/sauc/bigmodel_async', '/api/v3/sauc/bigmodel_nostream'])
  assert.ok(connections.every(({ headers }) => headers['X-Api-Resource-Id'] === 'volc.seedasr.sauc.duration'))
})
