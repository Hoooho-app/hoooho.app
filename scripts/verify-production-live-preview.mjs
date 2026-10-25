// Explicit, one-shot production acceptance. No app credential is read from CI
// secrets. A fresh synthetic account has no children or health data; its one
// session is revoked at the end. Its inaccessible empty identity remains.
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import ffmpeg from '@ffmpeg-installer/ffmpeg'

if (process.env.HOOOHO_RUN_PRODUCTION_LIVE_PREVIEW !== '1') {
  console.error('Explicit HOOOHO_RUN_PRODUCTION_LIVE_PREVIEW=1 is required. No production requests made.')
  process.exit(2)
}

const ORIGIN = 'https://hoooho.com'
const SAMPLE = 'https://dashscope.oss-cn-beijing.aliyuncs.com/audios/welcome.mp3'
const REPORT = '/tmp/hoooho-production-live-preview-report.json'
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const cookies = new Map()
let token = '', liveId = '', directory = '', stage = 'sample_download'
const result = {
  check: 'production_live_preview',
  date: new Date().toISOString(),
  passed: false,
  model: null,
  runtimeCommit: null,
  configured: false,
  handshakeMs: null,
  publicSample: SAMPLE,
  textObservedWhileSessionOpen: false,
  observedAtChunk: null,
  publicSampleTranscript: '',
  noChildOrHealthRecordsCreated: true,
  syntheticAccountCreated: false,
  emptySyntheticAccountRetained: false,
  cleanup: 'not_needed',
  logout: 'not_needed',
}
class CheckError extends Error {
  constructor(code, status = null) { super('Production acceptance failed'); this.code = code; this.status = status }
}
const safeCode = value => typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(value) ? value : 'CHECK_FAILED'
function retainCookies(response) {
  for (const value of response.headers.getSetCookie()) {
    const pair = value.split(';', 1)[0], separator = pair.indexOf('=')
    if (separator < 1) continue
    const name = pair.slice(0, separator), content = pair.slice(separator + 1)
    if (!/^(__Host-)?hoooho_session$/.test(name)) continue
    if (content) cookies.set(name, content); else cookies.delete(name)
  }
}
async function api(route, method = 'GET', body, timeoutMs = 10000) {
  const headers = { Origin: ORIGIN, 'Sec-Fetch-Site': 'same-origin', 'X-Hoooho-Timezone': 'Asia/Shanghai' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (cookies.size) headers.Cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join('; ')
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  let response
  try { response = await fetch(ORIGIN + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(timeoutMs) }) }
  catch { throw new CheckError('CHECK_NETWORK_OR_TIMEOUT') }
  retainCookies(response)
  let value
  try { value = await response.json() } catch { throw new CheckError('CHECK_INVALID_JSON', response.status) }
  if (!response.ok) throw new CheckError(safeCode(value?.error?.code), response.status)
  return value
}
function accept(snapshot, chunk) {
  if (!snapshot || snapshot.id !== liveId || snapshot.state !== 'listening') throw new CheckError('CHECK_SESSION_NOT_LISTENING')
  if (typeof snapshot.text !== 'string' || snapshot.text.length > 15000) throw new CheckError('CHECK_INVALID_PREVIEW')
  if (!snapshot.text.trim()) return false
  result.textObservedWhileSessionOpen = true
  result.observedAtChunk = chunk
  // The sole source is the fixed, public Alibaba sample, never a user's audio.
  result.publicSampleTranscript = snapshot.text.slice(0, 1000)
  return true
}

try {
  directory = await mkdtemp(path.join(tmpdir(), 'hoooho-live-public-sample-'))
  let sample
  try {
    const response = await fetch(SAMPLE, { redirect: 'error', signal: AbortSignal.timeout(20000) })
    if (!response.ok) throw new CheckError('CHECK_PUBLIC_SAMPLE_HTTP', response.status)
    sample = Buffer.from(await response.arrayBuffer())
  } catch (error) { throw error instanceof CheckError ? error : new CheckError('CHECK_PUBLIC_SAMPLE_NETWORK') }
  if (!sample.length || sample.length > 5 * 1024 * 1024) throw new CheckError('CHECK_PUBLIC_SAMPLE_SIZE')
  const input = path.join(directory, 'public-welcome.mp3'), output = path.join(directory, 'public-welcome.pcm')
  await writeFile(input, sample)
  stage = 'sample_conversion'
  const converted = spawnSync(ffmpeg.path, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-i', input, '-t', '18', '-vn', '-ac', '1', '-ar', '16000', '-f', 's16le', output], { timeout: 15000, stdio: 'ignore' })
  if (converted.error || converted.status !== 0) throw new CheckError('CHECK_PUBLIC_SAMPLE_CONVERSION')
  const pcm = await readFile(output)
  if (pcm.length < 6400 || pcm.length > 16000 * 2 * 18 || pcm.length % 2) throw new CheckError('CHECK_PUBLIC_PCM_SIZE')

  stage = 'synthetic_registration'
  const registered = await api('/api/auth/register', 'POST', {
    nickname: `Live${randomUUID().replaceAll('-', '').slice(0, 16)}`,
    password: randomUUID(),
    idempotencyKey: randomUUID(),
  }, 20000)
  if (typeof registered.token !== 'string' || !registered.token || !cookies.size) throw new CheckError('CHECK_REGISTRATION_SESSION')
  token = registered.token
  result.syntheticAccountCreated = true
  result.emptySyntheticAccountRetained = true

  stage = 'configuration'
  const [live, audio] = await Promise.all([api('/api/ai/audio/live'), api('/api/ai/audio/capabilities')])
  result.configured = live.configured === true
  result.model = live.model === 'qwen3-asr-flash-realtime' ? live.model : null
  result.runtimeCommit = /^[a-f0-9]{40}$/.test(audio?.runtime?.commit ?? '') ? audio.runtime.commit : null
  if (!result.configured || !result.model) throw new CheckError('CHECK_LIVE_NOT_CONFIGURED')
  if (process.env.HOOOHO_EXPECT_PRODUCTION_COMMIT && process.env.HOOOHO_EXPECT_PRODUCTION_COMMIT !== result.runtimeCommit) throw new CheckError('CHECK_WRONG_PRODUCTION_COMMIT')

  stage = 'live_handshake'
  const began = Date.now(), opened = await api('/api/ai/audio/live', 'POST', { memberId: '' }, 17000)
  if (typeof opened.id !== 'string' || !/^[a-f0-9-]{36}$/.test(opened.id)) throw new CheckError('CHECK_LIVE_SESSION_ID')
  liveId = opened.id
  result.handshakeMs = Date.now() - began
  result.cleanup = 'pending'
  if (opened.state !== 'listening' || opened.text) throw new CheckError('CHECK_LIVE_HANDSHAKE')

  stage = 'real_time_public_audio'
  const started = Date.now(), deadline = started + 20000
  let sequence = 0
  for (let offset = 0; offset < pcm.length && Date.now() < deadline; offset += 6400) {
    const bytes = pcm.subarray(offset, Math.min(offset + 6400, pcm.length))
    const appended = await api(`/api/ai/audio/live/${liveId}`, 'POST', { sequence, audio: bytes.toString('base64') }, 8000)
    if (accept(appended, sequence)) break
    const read = await api(`/api/ai/audio/live/${liveId}`, 'GET', undefined, 8000)
    if (accept(read, sequence)) break
    sequence++
    const until = started + sequence * 200 - Date.now()
    if (until > 0) await delay(Math.min(until, 200))
  }
  // The input session stays open throughout this wait. No stop, finish or
  // final-audio transcription endpoint is called to obtain the observed text.
  while (!result.textObservedWhileSessionOpen && Date.now() < deadline) {
    await delay(200)
    accept(await api(`/api/ai/audio/live/${liveId}`, 'GET', undefined, 5000), sequence)
  }
  if (!result.textObservedWhileSessionOpen) throw new CheckError('CHECK_NO_LIVE_TEXT_BEFORE_CLOSE')
  result.passed = true
} catch (error) {
  result.error = { stage, code: error instanceof CheckError ? safeCode(error.code) : 'CHECK_INTERNAL_FAILURE', httpStatus: error instanceof CheckError ? error.status : null }
} finally {
  if (liveId) {
    try {
      const closed = await api(`/api/ai/audio/live/${liveId}`, 'DELETE', {}, 8000)
      result.cleanup = closed?.state === 'closed' ? 'closed' : 'failed'
    } catch { result.cleanup = 'failed' }
  }
  if (token || cookies.size) {
    try { result.logout = (await api('/api/auth/logout', 'POST', {}, 8000))?.success === true ? 'revoked' : 'failed' }
    catch { result.logout = 'failed' }
  }
  if (directory) await rm(directory, { recursive: true, force: true }).catch(() => undefined)
  token = ''; cookies.clear()
  if (result.cleanup === 'failed' || result.logout === 'failed') result.passed = false
  await writeFile(REPORT, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 })
  // Only the allowlisted report reaches CI output. No exception object,
  // credential, cookie, nickname, session ID, or raw HTTP body is printed.
  console.log(JSON.stringify(result, null, 2))
  if (!result.passed) process.exitCode = 1
}
