// One-shot real-provider verification against the already deployed binary.
// Only this fresh synthetic account/member/records are mutated or removed.
import { randomUUID } from 'node:crypto'
import { mkdir,writeFile } from 'node:fs/promises'

if (process.env.HOOOHO_RUN_COLD_LIVE_ACCEPTANCE !== '1') {
  console.error('Explicit HOOOHO_RUN_COLD_LIVE_ACCEPTANCE=1 is required. No production requests made.')
  process.exit(2)
}
const BASE = 'https://hoooho.com'
const EXPECTED = '4e6a7185241a2e7c26cfc39465f6d1c80f13c885'
const REPORT = 'outputs/nursing-record-production/cold-loop-acceptance.json'
const INPUTS = ['身体有点冷', '家长摸着孩子身体觉得凉。', '今天开始，持续了十分钟']
const FULL_RAW = INPUTS.join('\n')
const cookies = new Map(), exactRecordIds = new Set(), exactEventIds = new Set()
let token = '', accountId = '', memberId = '', stage = 'register', saveAttempted = false
const result = {
  check: 'production_cold_full_save',
  date: new Date().toISOString(),
  expectedCommit: EXPECTED,
  runtimeCommit: null,
  syntheticOnly: true,
  passed: false,
  checks: [],
  questions: [],
  turnCount: null,
  summary: null,
  savedRecordCount: 0,
  idempotent: false,
  emptySyntheticAccountRetained: false,
  cleanup: { recordsDeleted: 0, eventsDeleted: 0, eventRecordsEmpty: false, eventsGone: false, memberDeleted: false, memberGone: false, logout: 'not_needed', complete: false },
}
class CheckError extends Error {
  constructor(code, status = null) { super('Cold acceptance failed'); this.code = code; this.status = status }
}
function requireCheck(value, code) { if (!value) throw new CheckError(code) }
const safeCode = value => typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(value) ? value : 'CHECK_FAILED'
function retainCookies(response) {
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';', 1)[0], at = pair.indexOf('=')
    if (at < 1) continue
    const name = pair.slice(0, at), value = pair.slice(at + 1)
    if (!/^(__Host-)?hoooho_session$/.test(name)) continue
    if (value) cookies.set(name, value); else cookies.delete(name)
  }
}
async function api(route, method = 'GET', body, timeoutMs = 120000) {
  const headers = { Origin: BASE, 'Sec-Fetch-Site': 'same-origin', 'X-Hoooho-Timezone': 'Asia/Shanghai' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (cookies.size) headers.Cookie = [...cookies].map(([key, value]) => `${key}=${value}`).join('; ')
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  let response
  try { response = await fetch(BASE + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(timeoutMs) }) }
  catch { throw new CheckError('CHECK_NETWORK_OR_TIMEOUT') }
  retainCookies(response)
  let value
  try { value = await response.json() } catch { throw new CheckError('CHECK_INVALID_JSON', response.status) }
  if (!response.ok) throw new CheckError(safeCode(value?.error?.code), response.status)
  return value
}
async function notFound(route) {
  try { await api(route, 'GET', undefined, 15000) }
  catch (error) { if (error instanceof CheckError && error.status === 404) return true; throw error }
  return false
}
const validId = value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value)
const userRaw = context => context.messages.filter(message => message.kind !== 'assistant' && message.status === 'completed').map(message => message.text).join('\n')
const refsKey = saved => JSON.stringify(saved.result.records.map(ref => [ref.eventId, ref.recordId]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))))
async function front(text, answerTo) {
  return api(`/api/members/${memberId}/front-desk-record`, 'POST', { id: randomUUID(), kind: 'text', text, ...(answerTo ? { answerTo } : {}) })
}
async function eventRecords(eventId) {
  const rows = await api(`/api/events/${eventId}/records`)
  requireCheck(Array.isArray(rows), 'CHECK_RECORD_LIST_SHAPE')
  return rows
}

try {
  const registered = await api('/api/auth/register', 'POST', { nickname: `Cold${randomUUID().replaceAll('-', '').slice(0, 16)}`, password: randomUUID(), idempotencyKey: randomUUID() }, 20000)
  result.emptySyntheticAccountRetained = true
  requireCheck(typeof registered.token === 'string' && registered.token && typeof registered.user?.id === 'string' && cookies.size, 'CHECK_REGISTRATION_SESSION')
  token = registered.token; accountId = registered.user.id
  stage = 'runtime_commit'
  const capabilities = await api('/api/ai/audio/capabilities', 'GET', undefined, 15000)
  result.runtimeCommit = /^[a-f0-9]{40}$/.test(capabilities?.runtime?.commit ?? '') ? capabilities.runtime.commit : null
  requireCheck(result.runtimeCommit === EXPECTED, 'CHECK_WRONG_PRODUCTION_COMMIT')
  result.checks.push('already-deployed runtime commit matches; no deployment requested')

  stage = 'synthetic_member'
  const member = await api('/api/members', 'POST', { name: '冷感完整记录验收（虚构）', relationship: 'child', birthday: '2024-01-01', gender: 'female' }, 20000)
  requireCheck(validId(member.id) && (!member.accountId || member.accountId === accountId), 'CHECK_SYNTHETIC_MEMBER_OWNERSHIP')
  memberId = member.id
  requireCheck(Array.isArray(await api('/api/events')) && (await api('/api/events')).length === 0, 'CHECK_FRESH_ACCOUNT_EVENTS')

  stage = 'cold_observation_question'
  let turn = await front(INPUTS[0])
  const contextId = turn.context?.id
  requireCheck(validId(contextId), 'CHECK_CONTEXT_ID')
  requireCheck(turn.context.interview?.domain === 'cold' && turn.context.interview.question?.id === 'cold-observation', 'CHECK_COLD_FIRST_QUESTION')
  result.questions.push('cold-observation')
  result.checks.push('cold observation asks a concrete observation question')

  stage = 'bound_observation_answer'
  turn = await front(INPUTS[1], { contextId, questionId: 'cold-observation' })
  requireCheck(turn.context?.id === contextId, 'CHECK_ANSWER_CONTEXT_CHANGED')
  requireCheck(turn.context.interview.question?.id === 'cold-onset', 'CHECK_COLD_ONSET_QUESTION')
  result.questions.push('cold-onset')
  result.checks.push('caregiver touch observation stays in the same conversation and asks onset')

  stage = 'bound_onset_answer'
  turn = await front(INPUTS[2], { contextId, questionId: 'cold-onset' })
  requireCheck(turn.context?.id === contextId, 'CHECK_ANSWER_CONTEXT_CHANGED')
  const interview = turn.context.interview
  result.turnCount = interview?.turnCount ?? null
  requireCheck(interview?.status === 'ready' && interview.question === null && Number.isInteger(interview.turnCount) && interview.turnCount <= 3, 'CHECK_COLD_MUST_STOP')
  requireCheck(turn.context.saved !== true && userRaw(turn.context) === FULL_RAW, 'CHECK_FULL_RAW_CONTEXT')
  result.checks.push('today and ten-minute course ends questioning within the budget; exact original retained')

  stage = 'professional_summary'
  const draft = await api(`/api/members/${memberId}/ai-drafts`, 'POST', { text: FULL_RAW, smartRecord: true, frontDeskRecord: true, frontContextId: contextId, followUp: false,timezone:'Asia/Shanghai' })
  requireCheck(validId(draft.id) && draft.state === 'ready' && draft.inputText === FULL_RAW && draft.followUp === false, 'CHECK_DRAFT_INPUT_AND_STATE')
  requireCheck(Array.isArray(draft.items) && draft.items.length === 1 && draft.items[0].category === 'symptom', 'CHECK_SINGLE_SYMPTOM_RECORD')
  const summary = draft.items[0].professionalSummary?.text
  requireCheck(typeof summary === 'string' && summary.length > 0 && summary.length <= 1000, 'CHECK_SUMMARY_MISSING')
  result.summary = summary
  requireCheck(/冷|凉/u.test(summary) && /家长|照护者/u.test(summary) && /摸|触/u.test(summary), 'CHECK_CAREGIVER_TOUCH_ATTRIBUTION')
  requireCheck(/今天|今日/u.test(summary) && /(?:10|十)\s*(?:分钟|分|min)/iu.test(summary), 'CHECK_ONSET_AND_DURATION_FIDELITY')
  requireCheck(!/确诊|诊断为|感冒|感染|低体温|休克|寒战|发热|发烧|四肢|手脚|肢端|苍白|精神萎靡|抽搐/u.test(summary), 'CHECK_INVENTED_DIAGNOSIS_OR_OBSERVATION')
  requireCheck(!/(?:\d+(?:\.\d+)?\s*(?:℃|°\s*C|摄氏度)|体温.{0,5}(?:正常|偏低|偏高|测得|[零〇一二三四五六七八九十百\d]{2,}))/iu.test(summary), 'CHECK_INVENTED_TEMPERATURE')
  result.checks.push('one faithful professional symptom summary; no inferred diagnosis or temperature')

  stage = 'formal_save'
  saveAttempted = true
  const saved = await api(`/api/members/${memberId}/ai-drafts/${draft.id}/save`, 'POST', { version: draft.version, confirmed: true })
  requireCheck(saved.state === 'saved' && Array.isArray(saved.result?.records) && saved.result.records.length > 0, 'CHECK_SAVE_RESULT')
  for (const ref of saved.result.records) {
    requireCheck(validId(ref.eventId) && validId(ref.recordId), 'CHECK_SAVE_REFERENCE')
    exactEventIds.add(ref.eventId); exactRecordIds.add(ref.recordId)
  }
  requireCheck(saved.result.records.length === 1 && saved.result.count === 1, 'CHECK_SAVE_RECORD_COUNT')
  result.savedRecordCount = saved.result.count
  const beforeRetry = new Map()
  for (const eventId of exactEventIds) {
    const event = await api(`/api/events/${eventId}`)
    requireCheck(event.memberId === memberId && event.caseTracking !== true, 'CHECK_NO_AUTO_FOLLOWUP')
    const rows = await eventRecords(eventId)
    beforeRetry.set(eventId, rows.map(record => record.id).sort().join(','))
    for (const ref of saved.result.records.filter(item => item.eventId === eventId)) {
      const record = rows.find(item => item.id === ref.recordId)
      requireCheck(record?.content === summary && record.aiProvenance?.professionalSummary?.text === summary, 'CHECK_SAVED_SUMMARY_MISMATCH')
      requireCheck(record.sourceText === FULL_RAW, 'CHECK_SAVED_ORIGINAL_MISMATCH')
    }
  }
  result.checks.push('formal record reads back the same summary and full original; symptom follow-up remains off')

  stage = 'idempotent_save_retry'
  const replay = await api(`/api/members/${memberId}/ai-drafts/${draft.id}/save`, 'POST', { version: saved.version, confirmed: true })
  requireCheck(replay.state === 'saved' && replay.result?.count === saved.result.count && refsKey(replay) === refsKey(saved), 'CHECK_SAVE_RETRY_REFERENCES')
  for (const [eventId, before] of beforeRetry) requireCheck((await eventRecords(eventId)).map(record => record.id).sort().join(',') === before, 'CHECK_DUPLICATE_RECORD_AFTER_RETRY')
  const eventsAfterRetry = await api('/api/events')
  requireCheck(Array.isArray(eventsAfterRetry) && eventsAfterRetry.length === exactEventIds.size && eventsAfterRetry.every(event => exactEventIds.has(event.id)), 'CHECK_DUPLICATE_EVENT_AFTER_RETRY')
  result.idempotent = true
  result.checks.push('repeated save returns identical references and creates no extra record or event')
  result.passed = true
} catch (error) {
  result.error = { stage, code: error instanceof CheckError ? safeCode(error.code) : 'CHECK_INTERNAL_FAILURE', httpStatus: error instanceof CheckError ? error.status : null }
} finally {
  // Explicit exact-ID cleanup. Event DELETE does not cascade record rows, so
  // records must be deleted while their owned parent event still exists.
  let cleanupOk = true
  if(saveAttempted&&!exactEventIds.size&&memberId){
    try{
      const ownedEvents=await api('/api/events','GET',undefined,15000)
      requireCheck(Array.isArray(ownedEvents),'CHECK_CLEANUP_EVENT_LIST')
      for(const event of ownedEvents.filter(event=>event.memberId===memberId)){
        const records=await eventRecords(event.id)
        requireCheck(records.every(record=>record.sourceText===FULL_RAW),'CHECK_CLEANUP_ORIGINAL_MISMATCH')
        exactEventIds.add(event.id)
        for(const record of records)exactRecordIds.add(record.id)
      }
      result.cleanup.receiptRecovered=exactEventIds.size>0
    }catch{cleanupOk=false}
  }
  for (const recordId of exactRecordIds) {
    try { requireCheck((await api(`/api/records/${recordId}`, 'DELETE', {}, 20000))?.success === true, 'CHECK_RECORD_DELETE'); result.cleanup.recordsDeleted++ }
    catch { cleanupOk = false }
  }
  let empty = true, gone = true
  for (const eventId of exactEventIds) {
    try { requireCheck((await eventRecords(eventId)).length === 0, 'CHECK_RECORDS_NOT_EMPTY') }
    catch { empty = false; cleanupOk = false }
    try {
      requireCheck((await api(`/api/events/${eventId}`, 'DELETE', {}, 20000))?.success === true, 'CHECK_EVENT_DELETE')
      result.cleanup.eventsDeleted++
      requireCheck(await notFound(`/api/events/${eventId}`), 'CHECK_EVENT_STILL_EXISTS')
      requireCheck(await notFound(`/api/events/${eventId}/records`), 'CHECK_EVENT_RECORDS_STILL_ACCESSIBLE')
    } catch { gone = false; cleanupOk = false }
  }
  result.cleanup.eventRecordsEmpty = exactEventIds.size > 0 && empty
  result.cleanup.eventsGone = exactEventIds.size > 0 && gone
  if (saveAttempted && !exactEventIds.size) { cleanupOk = false; result.cleanup.saveReceiptMissing = true }
  if (memberId) {
    try {
      const ownMember = await api(`/api/members/${memberId}`, 'GET', undefined, 15000)
      requireCheck(ownMember.id === memberId && (!ownMember.accountId || ownMember.accountId === accountId), 'CHECK_CLEANUP_MEMBER_OWNERSHIP')
      requireCheck((await api(`/api/members/${memberId}`, 'DELETE', {}, 20000))?.success === true, 'CHECK_MEMBER_DELETE')
      result.cleanup.memberDeleted = true
      result.cleanup.memberGone = await notFound(`/api/members/${memberId}`)
      requireCheck(result.cleanup.memberGone, 'CHECK_MEMBER_STILL_EXISTS')
    } catch { cleanupOk = false }
  }
  if (token || cookies.size) {
    try { result.cleanup.logout = (await api('/api/auth/logout', 'POST', {}, 15000))?.success === true ? 'revoked' : 'failed' }
    catch { result.cleanup.logout = 'failed' }
    if (result.cleanup.logout !== 'revoked') cleanupOk = false
  }
  result.cleanup.complete = cleanupOk
  if (!cleanupOk) result.passed = false
  token = ''; accountId = ''; memberId = ''; cookies.clear(); exactRecordIds.clear(); exactEventIds.clear()
  await mkdir('outputs/nursing-record-production',{recursive:true})
  await writeFile(REPORT, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 })
  // All displayed text is generated from the three fixed synthetic inputs.
  // Never print credentials, account/member/record IDs, raw responses or errors.
  console.log(JSON.stringify(result, null, 2))
  if (!result.passed) process.exitCode = 1
}
