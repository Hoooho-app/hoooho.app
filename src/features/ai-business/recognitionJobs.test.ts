import assert from 'node:assert/strict'
import test from 'node:test'
import { recognitionPollDelay, recognitionStatusUrl, waitForRecognitionJob, uploadRecognitionAudio, type RecognitionJob } from './recognitionJobs'

const job = (seq = 4, state: RecognitionJob['state'] = 'running'): RecognitionJob => ({ id: 'job-1', state, seq, stage: 'reading', inputRevision: 1, resultRevision: 0, createdAt: '2026-10-17T00:00:00Z', updatedAt: '2026-10-17T00:00:00Z' })
test('only active jobs use their exact sequence for long polling; member and task IDs stay encoded', () => {
  assert.equal(recognitionStatusUrl('a/b', 'x/y', job()), '/api/members/a%2Fb/recognition-jobs/x%2Fy?afterSeq=4&waitMs=25000')
  assert.equal(recognitionStatusUrl('a', 'x', job(5, 'ready')), '/api/members/a/recognition-jobs/x')
})
test('old immediate status responses are paced while changed and terminal snapshots display without added delay', () => {
  assert.equal(recognitionPollDelay(job(), job(), 10), 990)
  assert.equal(recognitionPollDelay(job(), job(), 25000), 0)
  assert.equal(recognitionPollDelay(job(), job(5), 10), 0)
  assert.equal(recognitionPollDelay(job(), job(4, 'ready'), 10), 0)
})
test('terminal long-poll responses return immediately and cancellation interrupts the old-server fallback wait', async () => {
  const original = globalThis.fetch, controller = new AbortController(), urls: string[] = []
  globalThis.fetch = async input => { urls.push(String(input)); return new Response(JSON.stringify(job(5, urls.length === 1 ? 'ready' : 'running')), { status: 200 }) }
  try {
    assert.equal((await waitForRecognitionJob('member', 'synthetic', 'job-1', job())).state, 'ready')
    const pending = waitForRecognitionJob('member', 'synthetic', 'job-1', job(5), controller.signal)
    const rejected = assert.rejects(pending, { name: 'AbortError' })
    setTimeout(() => controller.abort(), 10); await rejected
    assert.equal(urls.length, 2); assert.ok(urls.every(url => url.includes('waitMs=25000')))
  } finally { globalThis.fetch = original }
})
test('cancelling before audio preparation cannot start decode or upload', async () => {
  const controller = new AbortController(); controller.abort()
  await assert.rejects(uploadRecognitionAudio('member', 'synthetic', {} as File, controller.signal), { name: 'AbortError' })
})
