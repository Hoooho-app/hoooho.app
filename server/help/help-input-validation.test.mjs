import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { HelpService } from './help-service.mjs'
import { FeedbackInterview } from './feedback-interview.mjs'
test('malformed help objects fail before creating sessions or invoking a provider', async t => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), 'hoooho-help-input-'))
  t.after(() => rm(dataDirectory, { recursive: true, force: true }))
  let calls = 0
  const provider = { fetch: async () => { calls++; throw new Error('must not call') } }
  const help = new HelpService({ dataDirectory, provider }), interview = new FeedbackInterview({ provider })
  for (const value of [null, [], false, 'text']) {
    await assert.rejects(help.start('owner', value), error => error.status === 400)
    await assert.rejects(help.rate('owner', 'missing', value), error => error.status === 400)
    await assert.rejects(interview.respond('owner', value), error => error.status === 400)
  }
  assert.equal((await help.store.read()).sessions.length, 0)
  assert.equal(calls, 0)
})
