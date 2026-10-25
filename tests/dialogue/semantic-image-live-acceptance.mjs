import {cleanupSyntheticMember} from './synthetic-acceptance-cleanup.mjs'
import {authenticateSyntheticAccount} from './synthetic-acceptance-account.mjs'
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
let token = '', accountId = '', memberId = '', stage = 'register', saveAttempted = false, activeDraftId = ''
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
  if (!response.ok) {const error=new CheckError(safeCode(value?.error?.code),response.status);if(Number.isInteger(value?.error?.retryAfter))error.retryAfter=value.error.retryAfter;if(error.code==='INVALID_JOURNAL_SYMPTOM'&&typeof value?.error?.message==='string'&&value.error.message.length<160)error.validationMessage=value.error.message;if(Array.isArray(value?.error?.verification?.codes))error.verificationCodes=value.error.verification.codes.filter(x=>typeof x==='string'&&/^[a-z_]{1,50}$/.test(x));if(Array.isArray(value?.error?.verification?.sourceSpans))error.sourceSpans=value.error.verification.sourceSpans.filter(v=>['sourceIndex','page','start','end'].every(k=>Number.isInteger(v?.[k])&&v[k]>=0&&v[k]<1000000));if([0,1].includes(value?.error?.verification?.recoveryAttempt))error.recoveryAttempt=value.error.verification.recoveryAttempt;if(Array.isArray(value?.error?.verification?.timeCoverage))error.timeCoverage=value.error.verification.timeCoverage.filter(v=>Number.isInteger(v?.itemIndex)&&v.itemIndex>=0&&v.itemIndex<30&&typeof v.known==='boolean'&&typeof v.included==='boolean');throw error}
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
  const registered = await authenticateSyntheticAccount(api)
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
    result.questions.push(question.text)
    imageTurn=await front('这张观察记录是当前选中孩子的，图中情况发生在今天。请先整理图中已有内容，不再追问，不明确处保留待确认。',{contextId:imageTurn.context.id,questionId:question.id})
  }
  result.photoDecision=imageTurn.context.decision
  result.finalQuestion=imageTurn.context.interview?.question?.text??null
  requireCheck(imageTurn.context.decision?.organize===true,'CHECK_READABLE_PHOTO_READY')
  const photoMessages=imageTurn.context.messages.filter(m=>m.kind!=='assistant'&&m.status==='completed'&&m.recordable!==false),files=photoMessages.flatMap(m=>m.files??[])
  requireCheck(files.some(f=>f.dataUrl===report.dataUrl),'CHECK_PHOTO_OWNER_NOT_RESOLVED')
  FULL_RAW=userRaw(imageTurn.context)
  const organized=await api(`/api/members/${memberId}/ai-drafts`,'POST',{text:FULL_RAW,files,smartRecord:true,frontDeskRecord:true,frontContextId:imageTurn.context.id,semanticVersion:2,followUp:false,timezone:'Asia/Shanghai'})
  requireCheck(organized.state==='ready'&&organized.items?.length===1&&organized.items[0].professionalSummary?.version==='professional-summary-v2'&&organized.items[0].professionalSummary.verification?.protocol==='source-entailment-v2'&&organized.items[0].professionalSummary.verification.sourceCoverage===true,'CHECK_PHOTO_NARRATIVE_READY')
  const description=organized.items[0].professionalSummary.text
  requireCheck(/脚|足/u.test(description)&&/趾/u.test(description)&&/破皮|破损/u.test(description)&&/踢/u.test(description),'CHECK_PHOTO_TEXT_FACTS')
  requireCheck(!/骨折|感染|左脚|右脚|已包扎|已消毒/u.test(description),'CHECK_PHOTO_NO_INFERENCE')
  result.imageSummary=description
  result.checks.push('readable observation image alone becomes one source-backed, independently verified narrative after attribution')
  requireCheck((await api('/api/events')).length===0,'CHECK_PHOTO_NO_AUTO_SAVE')
  requireCheck(validId(organized.id),'CHECK_DRAFT_ID')
  activeDraftId=organized.id
  stage='formal_save'
  saveAttempted=true
  const saved=await api(`/api/members/${memberId}/ai-drafts/${organized.id}/save`,'POST',{version:organized.version,confirmed:true})
  requireCheck(saved.state==='saved'&&Array.isArray(saved.result?.records)&&saved.result.records.length>0,'CHECK_SAVE_RESULT')
  for(const ref of saved.result.records){
    requireCheck(validId(ref.eventId)&&validId(ref.recordId),'CHECK_SAVE_REFERENCE')
    exactEventIds.add(ref.eventId);exactRecordIds.add(ref.recordId)
  }
  requireCheck(saved.result.records.length===1&&saved.result.count===1,'CHECK_SAVE_RECORD_COUNT')
  result.savedRecordCount=saved.result.count
  const beforeRetry=new Map()
  for(const eventId of exactEventIds){
    const event=await api(`/api/events/${eventId}`)
    requireCheck(event.memberId===memberId&&event.caseTracking!==true,'CHECK_NO_AUTO_FOLLOWUP')
    const rows=await eventRecords(eventId)
    beforeRetry.set(eventId,rows.map(record=>record.id).sort().join(','))
    for(const ref of saved.result.records.filter(item=>item.eventId===eventId)){
      const record=rows.find(item=>item.id===ref.recordId)
      requireCheck(record?.content===description&&record.aiProvenance?.professionalSummary?.text===description,'CHECK_SAVED_SUMMARY_MISMATCH')
      requireCheck(record.sourceText===FULL_RAW,'CHECK_SAVED_ORIGINAL_MISMATCH')
    }
  }
  result.checks.push('photo-derived formal record reads back the same summary and full original; follow-up remains off')
  stage='idempotent_save_retry'
  const replay=await api(`/api/members/${memberId}/ai-drafts/${organized.id}/save`,'POST',{version:saved.version,confirmed:true})
  requireCheck(replay.state==='saved'&&replay.result?.count===saved.result.count&&refsKey(replay)===refsKey(saved),'CHECK_SAVE_RETRY_REFERENCES')
  for(const[eventId,before]of beforeRetry)requireCheck((await eventRecords(eventId)).map(record=>record.id).sort().join(',')===before,'CHECK_DUPLICATE_RECORD_AFTER_RETRY')
  const eventsAfterRetry=await api('/api/events')
  requireCheck(Array.isArray(eventsAfterRetry)&&eventsAfterRetry.length===exactEventIds.size&&eventsAfterRetry.every(event=>exactEventIds.has(event.id)),'CHECK_DUPLICATE_EVENT_AFTER_RETRY')
  result.idempotent=true
  result.checks.push('repeated photo-derived save returns identical references and creates no extra record or event')
  result.passed=true
} catch (error) {
  if(memberId&&['professional_summary','readable_photo_only'].includes(stage))try{const draft=await api(`/api/members/${memberId}/ai-drafts`);result.syntheticDiagnostic={state:draft?.state,preview:draft?.preview?.text??null}}catch{}
  result.error = { ...([0,1].includes(error.recoveryAttempt)?{recoveryAttempt:error.recoveryAttempt}:{}),...(error.timeCoverage?{timeCoverage:error.timeCoverage}:{}),...(error.sourceSpans?{sourceSpans:error.sourceSpans,recoveryAttempt:error.recoveryAttempt}:{}),...(error.verificationCodes?{verificationCodes:error.verificationCodes}:{}),...(error.retryAfter?{retryAfterSeconds:error.retryAfter}:{}),...(error.validationMessage?{validationMessage:error.validationMessage}:{}),stage, code: error instanceof CheckError ? safeCode(error.code) : 'CHECK_INTERNAL_FAILURE', httpStatus: error instanceof CheckError ? error.status : null }
} finally {
  // Only the newly created member and source/draft-verified records may be removed.
  let cleanupOk = true
  if(memberId){
    try{
      const cleanup=await cleanupSyntheticMember({api,memberId,accountId,fullRaw:FULL_RAW,draftId:activeDraftId,saveAttempted})
      Object.assign(result.cleanup,cleanup)
      cleanupOk=cleanup.complete===true
    }catch{cleanupOk=false}
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
