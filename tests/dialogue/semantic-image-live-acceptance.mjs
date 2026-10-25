// One-shot real-provider verification against the already deployed binary.
// Only this fresh synthetic account/member/records are mutated or removed.
import { randomUUID } from 'node:crypto'
import { mkdir,writeFile } from 'node:fs/promises'

const verifyPostSaveTracking=false
if (process.env.HOOOHO_RUN_SEMANTIC_LIVE_ACCEPTANCE !== '1') {
  console.error('Explicit HOOOHO_RUN_SEMANTIC_LIVE_ACCEPTANCE=1 is required. No production requests made.')
  process.exit(2)
}
const BASE = 'https://hoooho.com'
const EXPECTED = process.argv[2]
if(!/^[a-f0-9]{40}$/.test(EXPECTED??'')){console.error('An exact deployed commit is required. No production requests made.');process.exit(2)}
const REPORT = 'outputs/nursing-record-production/semantic-image-only-acceptance.json'
const INPUTS = ['今天那个脚就是小拇指破了，然后被踢到的。','是脚的小拇指表面破皮，今天刚被踢到；现在没有出血，能正常走路，还没有做处理。','先按已经说过的情况记录，不再追问。不清楚的项目保留待确认。']
let FULL_RAW = ''
const cookies = new Map(), exactRecordIds = new Set(), exactEventIds = new Set()
let token = '', accountId = '', memberId = '', stage = 'register', saveAttempted = false
const result = {
  check: 'production_front_desk_semantic_image_only',
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
  constructor(code, status = null) { super('Semantic acceptance failed'); this.code = code; this.status = status }
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
const userRaw = context => context.messages.filter(message => message.kind !== 'assistant' && message.status === 'completed'&&message.recordable!==false).map(message => message.text).join('\n')
const refsKey = saved => JSON.stringify(saved.result.records.map(ref => [ref.eventId, ref.recordId]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))))
async function front(text, answerTo) {
  return api(`/api/members/${memberId}/front-desk-record`, 'POST', { id: randomUUID(), protocolVersion:2,kind: 'text', text, ...(answerTo ? { answerTo } : {}) })
}
async function eventRecords(eventId) {
  const rows = await api(`/api/events/${eventId}/records`)
  requireCheck(Array.isArray(rows), 'CHECK_RECORD_LIST_SHAPE')
  return rows
}

try {
  const registered = await api('/api/auth/register', 'POST', { nickname: `Sem${randomUUID().replaceAll('-', '').slice(0, 16)}`, password: randomUUID(), idempotencyKey: randomUUID() }, 20000)
  result.emptySyntheticAccountRetained = true
  requireCheck(typeof registered.token === 'string' && registered.token && typeof registered.user?.id === 'string' && cookies.size, 'CHECK_REGISTRATION_SESSION')
  token = registered.token; accountId = registered.user.id
  stage = 'runtime_commit'
  const capabilities = await api('/api/ai/audio/capabilities', 'GET', undefined, 15000)
  result.runtimeCommit = /^[a-f0-9]{40}$/.test(capabilities?.runtime?.commit ?? '') ? capabilities.runtime.commit : null
  requireCheck(result.runtimeCommit === EXPECTED, 'CHECK_WRONG_PRODUCTION_COMMIT')
  result.checks.push('already-deployed runtime commit matches; no deployment requested')

  stage = 'synthetic_member'
  const member = await api('/api/members', 'POST', { name: '语义记录验收（虚构）', relationship: 'child', birthday: '2024-01-01', gender: 'female' }, 20000)
  requireCheck(validId(member.id) && (!member.accountId || member.accountId === accountId), 'CHECK_SYNTHETIC_MEMBER_OWNERSHIP')
  memberId = member.id
  requireCheck(Array.isArray(await api('/api/events')) && (await api('/api/events')).length === 0, 'CHECK_FRESH_ACCOUNT_EVENTS')

  stage='photo_only'
  const {createRequire}=await import('node:module');const sharp=createRequire(new URL('../../package.json',import.meta.url))('sharp')
  const bytes=await sharp({create:{width:160,height:160,channels:3,background:'#000000'}}).png().toBuffer()
  const file={name:'合成空白图.png',mimeType:'image/png',dataUrl:'data:image/png;base64,'+bytes.toString('base64')}
  for(const text of ['', '？']){
    const turn=await api(`/api/members/${memberId}/front-desk-record`,'POST',{id:randomUUID(),protocolVersion:2,kind:'image',text,files:[file]})
    requireCheck(turn.context?.semanticVersion===2&&turn.context.decision?.organize===false,'CHECK_BLANK_IMAGE_NOT_FACT')
    requireCheck(turn.context.messages.some(m=>m.kind==='image'&&m.files?.some(f=>f.dataUrl===file.dataUrl)),'CHECK_ORIGINAL_RETAINED')
    requireCheck(turn.context.messages.some(m=>m.kind==='assistant'&&m.text),'CHECK_PHOTO_REPLY')
    let gated=false
    try{await api(`/api/members/${memberId}/ai-drafts`,'POST',{text:userRaw(turn.context),files:[file],smartRecord:true,frontDeskRecord:true,semanticVersion:2,frontContextId:turn.context.id})}catch(e){gated=e.code==='FRONT_RECORD_NOT_READY'}
    requireCheck(gated,'CHECK_NO_FACT_EXTRACTION')
    result.checks.push(text?'photo with only punctuation keeps image and asks clarification':'photo alone keeps original and asks clarification')
  }
  requireCheck((await api('/api/events')).length===0,'CHECK_NO_FORMAL_EVENT')
  stage='readable_photo_only'
  await api(`/api/members/${memberId}/front-desk-record`,'DELETE',{})
  const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="540"><rect width="1000" height="540" fill="white"/><g font-family="Noto Sans CJK SC, sans-serif" font-size="40" fill="black"><text x="50" y="85">观察记录</text><text x="50" y="180">记录时间：今天</text><text x="50" y="270">脚小趾表面破皮</text><text x="50" y="360">今天被踢到</text><text x="50" y="450">尚未做处理</text></g></svg>')
  const report={name:'合成观察文字照片.png',mimeType:'image/png',dataUrl:'data:image/png;base64,'+(await sharp(svg).png().toBuffer()).toString('base64')}
  let imageTurn=await api(`/api/members/${memberId}/front-desk-record`,'POST',{id:randomUUID(),protocolVersion:2,kind:'image',text:'',files:[report]})
  for(let count=0;count<2&&imageTurn.context.interview?.question;count++){
    const question=imageTurn.context.interview.question
    imageTurn=await front('这张观察记录是当前选中孩子的，图中情况发生在今天。请先整理图中已有内容，不再追问，不明确处保留待确认。',{contextId:imageTurn.context.id,questionId:question.id})
  }
  requireCheck(imageTurn.context.decision?.organize===true,'CHECK_READABLE_PHOTO_READY')
  const photoMessages=imageTurn.context.messages.filter(m=>m.kind!=='assistant'&&m.status==='completed'&&m.recordable!==false),files=photoMessages.flatMap(m=>m.files??[])
  requireCheck(files.some(f=>f.dataUrl===report.dataUrl),'CHECK_PHOTO_OWNER_NOT_RESOLVED')
  const organized=await api(`/api/members/${memberId}/ai-drafts`,'POST',{text:userRaw(imageTurn.context),files,smartRecord:true,frontDeskRecord:true,frontContextId:imageTurn.context.id,semanticVersion:2,followUp:false,timezone:'Asia/Shanghai'})
  requireCheck(organized.state==='ready'&&organized.items?.length===1&&organized.items[0].professionalSummary?.version==='professional-summary-v2','CHECK_PHOTO_NARRATIVE_READY')
  const description=organized.items[0].professionalSummary.text
  requireCheck(/脚|足/u.test(description)&&/趾/u.test(description)&&/破皮|破损/u.test(description)&&/踢/u.test(description),'CHECK_PHOTO_TEXT_FACTS')
  requireCheck(!/骨折|感染|左脚|右脚|已包扎|已消毒/u.test(description),'CHECK_PHOTO_NO_INFERENCE')
  result.imageSummary=description
  result.checks.push('readable observation image alone becomes one source-backed, independently verified narrative after attribution')
  requireCheck((await api('/api/events')).length===0,'CHECK_PHOTO_NO_AUTO_SAVE')
  result.passed=true
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
