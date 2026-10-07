import assert from 'node:assert/strict'
import Ajv from 'ajv'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { NurseService } from './nurse-service.mjs'
import { confirmedCurrentEmergency } from './nurse-emergency.mjs'
import { validateNurseMetadata } from './nurse-contract.mjs'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { HealthEventService } from '../events/health-event-service.mjs'
import { HealthEventRecordService } from '../events/health-event-record-service.mjs'
import { QuickRecordService } from '../events/quick-record-service.mjs'
import { AccountDataService } from '../account/account-data-service.mjs'

const at = '2026-10-06T01:00:00.000Z'
test('SDP includes only necessary current context; network failure is safe and counted once',async t=>{
 const f=await fixture(t);f.nurse.env={BAILIAN_API_KEY:'synthetic-placeholder',BAILIAN_BASE_URL:'https://fixture.cn-beijing.maas.aliyuncs.com/compatible-mode/v1'}
 let calls=0;f.nurse.fetch=async(url,init)=>{calls++;assert.equal(init.headers['Content-Type'],'application/sdp');assert.match(url,/api\/v1\/webrtc\/realtime/);return new Response('v=0\r\nsynthetic answer')}
 const input={sdp:'v=0\r\nm=audio 9 RTP/AVP 0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel'}
 const result=await f.nurse.sdp('qa-nurse',f.member.id,f.draft.id,input);assert.match(result.instructions,/currentTime/);assert.match(result.instructions,/Asia\/Shanghai/);assert.ok(!result.instructions.includes('synthetic-placeholder'));assert.equal(calls,1)
 f.nurse.fetch=async()=>{calls++;throw Object.assign(new TypeError('private transport details'),{code:'ETIMEDOUT'})}
 await assert.rejects(()=>f.nurse.sdp('qa-nurse',f.member.id,f.draft.id,input),e=>e.code==='NURSE_RTC_NETWORK_UNAVAILABLE'&&!e.message.includes('private'))
 assert.equal(calls,2);const usage=(await f.nurse.store.read()).usage;assert.equal(usage.length,2);assert.equal(usage[1].failureCode,'ETIMEDOUT');assert.equal(usage[1].retries,0)
})
const output = (change = {}) => ({ reply: '痒有没有影响睡眠？', intent: 'continue', emergency: { currentChild: false, quote: '' }, fields: { narrative: '脸颊发红发痒。', locationText: '脸颊', impactLevel: '', triggerText: '', trend: '' }, fieldEvidence: [{ field: 'narrative', sourceTurnId: 'user-1', quote: '脸颊发红发痒' }, { field: 'locationText', sourceTurnId: 'user-1', quote: '脸颊' }], symptomObservations:{t1:'脸颊发红发痒'}, notes: [], ...change })
const modelResponse=(value,options)=>{
 const rules=JSON.parse(options.body).text.format.schema.properties.concernCoverage?.properties
 const concernCoverage=rules?Object.fromEntries(Object.entries(rules).map(([id,rule])=>[id,rule.enum.includes('')?'':value.notes.find(note=>note.category==='parent_concern'&&rule.enum.includes(note.quote))?.quote??rule.enum.find(text=>text.startsWith('我担心'))??rule.enum[0]])):undefined
 const observations=JSON.parse(options.body).text.format.schema.properties.symptomObservations?.properties
 const symptomObservations=observations?Object.fromEntries(Object.entries(observations).map(([id,rule])=>[id,value.fieldEvidence.find(e=>e.field==='narrative'&&rule.enum.includes(e.quote))?.quote??''])):undefined
 return Response.json({output:[{content:[{text:JSON.stringify({...value,...(concernCoverage?{concernCoverage,symptomObservations}: {})})}]}],usage:{input_tokens:15,output_tokens:20}})
}
async function fixture(t, make = () => output()) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-nurse-test-'))
  t.after(() => rm(dataDirectory, { recursive: true, force: true }))
  const members = new FamilyMemberRepository(dataDirectory)
  const member = await members.create({ accountId: 'qa-nurse', name: '合成验证人物', relationship: 'other' })
  const events = new HealthEventService({ dataDirectory })
  const provider = { baseUrl: 'https://fixture.invalid', model: 'fixture', fetch: async (url,options) => modelResponse(await make(),options) }
  const nurse = new NurseService({ dataDirectory, events, provider, now: () => new Date(at) })
  let draft = await nurse.open('qa-nurse', member.id, { scope: `${member.id}:event-a:task-a` })
  const user = { id: 'user-1', role: 'user', text: '脸颊发红发痒。我担心是鸡蛋过敏，但没有喘。', at, final: true, status: 'completed' }
  const append = async () => { draft = await nurse.change('qa-nurse', member.id, draft.id, { version: draft.version, turn: user }); return draft }
  return { nurse, events, members, member, dataDirectory, user, append, get draft() { return draft } }
}
test('empty conversation cannot be organized; resume same scope, child and account isolation', async t => {
  const f = await fixture(t)
  assert.equal((await f.nurse.open('qa-nurse', f.member.id, { scope: `${f.member.id}:event-a:task-a` })).id, f.draft.id)
  await assert.rejects(() => f.nurse.generate('qa-nurse', f.member.id, f.draft.id, { version: 0, organize: true }), /先说出/)
  const other = await f.members.create({ accountId: 'qa-nurse', name: '另一个合成人物', relationship: 'other' })
  await assert.rejects(() => f.nurse.owned('qa-nurse', other.id, f.draft.id), /当前人物/)
  await assert.rejects(() => f.nurse.owned('other-account', f.member.id, f.draft.id))
})
test('final transcripts, corrections and interrupted replies survive; interim and assistant-as-source rejected', async t => {
  const f = await fixture(t); await f.append()
  await assert.rejects(() => f.nurse.change('qa-nurse', f.member.id, f.draft.id, { version: 1, turn: { ...f.user, id: 'interim', final: false } }), /最终/)
  const metadata = { version: 'nurse-v1', draftId: f.draft.id, turns: f.draft.turns, professionalNotes: [{ id: 'note', category: 'parent_concern', heading: '家长担心', text: '担心鸡蛋过敏', sourceTurnIds: [f.draft.turns[0].id], certainty: 'uncertain', attribution: 'parent', editedByUser: false, createdAt: at, updatedAt: at }] }
  assert.throws(() => validateNurseMetadata(metadata), /家长原话/)
  assert.throws(() => validateNurseMetadata({ ...metadata, turns: [{ ...f.user, correctsTurnId: 'missing' }] }), /更正来源/)
})
test('organization requires exact user quote; suspicion stays uncertain without allergy-history mutation', async t => {
  const f = await fixture(t, () => output({ notes: [{ category: 'parent_concern', heading: '家长担心鸡蛋相关', text: '家长担心鸡蛋过敏，尚未确认。', sourceTurnId: 'user-1', quote: '我担心是鸡蛋过敏', certainty: 'uncertain', attribution: 'parent' }] }))
  await f.append(); const next = await f.nurse.generate('qa-nurse', f.member.id, f.draft.id, { version: 1, organize: true })
  assert.equal(next.notes[0].certainty, 'uncertain'); assert.equal(next.turns.length, 2); assert.equal(next.step, 'review')
  const bad = await fixture(t, () => output({ notes: [{ category: 'prior_action', heading: '处理', text: '已服药', sourceTurnId: 'user-1', quote: '吃了药', certainty: 'reported', attribution: 'parent' }] }))
  await bad.append(); await assert.rejects(() => bad.nurse.generate('qa-nurse', bad.member.id, bad.draft.id, { version: 1, organize: true }), /来源未通过/)
})
test('late result cannot overwrite a changed or discarded draft', async t => {
  let resolve, entered; const wait = new Promise(r => { resolve = r }), started = new Promise(r => { entered = r })
  const f = await fixture(t, async () => { entered(); await wait; return output() }); await f.append()
  const pending = f.nurse.generate('qa-nurse', f.member.id, f.draft.id, { version: 1, organize: true })
  await started
  await f.nurse.change('qa-nurse', f.member.id, f.draft.id, { version: 1, discard: true }); resolve()
  await assert.rejects(() => pending, /迟到结果/)
})
test('current emergency stops normal questions, cannot use an older turn as current evidence', async t => {
  const f = await fixture(t, () => output({ emergency: { currentChild: true, quote: '没有喘' } })); await f.append()
  // Semantic decision is supplied by the model; quote provenance is independently enforced.
  const next = await f.nurse.generate('qa-nurse', f.member.id, f.draft.id, { version: 1 })
  assert.equal(next.emergency, false)
  const danger = await f.nurse.change('qa-nurse', f.member.id, f.draft.id, { version: next.version, turn: { ...f.user, id: 'user-danger', text: '刚才没有喘，但现在孩子呼吸困难。' } })
  f.nurse.provider.fetch = async () => Response.json({ output: [{ content: [{ text: JSON.stringify(output({ emergency: { currentChild: true, quote: '现在孩子呼吸困难' } })) }] }] })
  const urgent = await f.nurse.generate('qa-nurse', f.member.id, f.draft.id, { version: danger.version })
  assert.equal(urgent.emergency, true); assert.match(urgent.turns.at(-1).text, /当地急救/); assert.ok(!urgent.turns.at(-1).text.includes('120'))
})
test('review cannot persist audio or change immutable transcript; account deletion removes drafts', async t => {
  const f = await fixture(t); await f.append()
  const metadata = { version: 'nurse-v1', draftId: f.draft.id, turns: f.draft.turns, professionalNotes: [], snapshots: [] }
  const next = await f.nurse.change('qa-nurse', f.member.id, f.draft.id, { version: 1, review: { fields: { narrative: '发红', rawAudio: 'data:audio/raw' }, metadata: { ...metadata, rawAudio: 'data:audio/raw' }, deletedNoteIds: [], rawAudio: 'data:audio/raw' } })
  assert.ok(!JSON.stringify(next).includes('rawAudio'))
  await assert.rejects(() => f.nurse.change('qa-nurse', f.member.id, next.id, { version: next.version, review: { fields: {}, metadata: { ...metadata, turns: [{ ...f.user, text: '篡改原话' }] } } }), /原话来源/)
  await new AccountDataService({ dataDirectory: f.dataDirectory }).deleteAccount('qa-nurse')
  await assert.rejects(() => f.nurse.owned('qa-nurse', f.member.id, next.id))
})
test('atomic save metadata+transcript, idempotent same record, failed validation creates nothing; original text immutable on edit', async t => {
  const f = await fixture(t); await f.append()
  const event = await f.events.create('qa-nurse', { memberId: f.member.id, title: '合成症状', category: 'other', startTime: at })
  const records = new HealthEventRecordService({ dataDirectory: f.dataDirectory })
  const aiNurse = { version: 'nurse-v1', draftId: f.draft.id, turns: f.draft.turns, professionalNotes: [], snapshots: [] }
  const input = { type: 'note', content: '脸颊发红', occurredAt: at, journal: { categories: ['symptom'], symptom: { symptomCategory: 'skin', narrative: '脸颊发红', locations: [], descriptors: [] }, aiNurse } }
  await assert.rejects(() => records.create('qa-nurse', event.id, { ...input, content: '' }))
  assert.equal((await records.list('qa-nurse', event.id)).length, 0); assert.ok(!(await f.nurse.owned('qa-nurse', f.member.id, f.draft.id)).saved)
  const first = await records.create('qa-nurse', event.id, input); const second = await records.create('qa-nurse', event.id, input)
  assert.equal(first.id, second.id); assert.equal((await records.list('qa-nurse', event.id)).length, 1)
  assert.equal((await f.nurse.owned('qa-nurse', f.member.id, f.draft.id)).saved.recordId, first.id)
  await assert.rejects(() => records.update('qa-nurse', first.id, { journal: { ...input.journal, aiNurse: { ...aiNurse, turns: [{ ...f.user, text: '伪造' }] } } }), /原文只读/)
  const updated = await records.update('qa-nurse', first.id, { journal: { categories: ['other'] } })
  assert.deepEqual(updated.journal.aiNurse.turns, first.journal.aiNurse.turns)
})


test('failed media association rolls back event, record, idempotency marker and saved draft together', async t => {
  const f = await fixture(t); await f.append()
  const records = new HealthEventRecordService({ dataDirectory: f.dataDirectory })
  const quick = new QuickRecordService({ dataDirectory: f.dataDirectory, events: f.events, records, photos: { prepareForSave: async () => [], attach: async () => { throw new Error('fixture-media-failure') } } })
  const input = { idempotencyKey: 'nurse-atomic-media', memberId: f.member.id, title: '合成症状', content: '脸颊发红', occurredAt: at, inputChannel: 'text', journal: { categories: ['symptom'], symptom: { symptomCategory: 'skin', narrative: '脸颊发红', locations: [], descriptors: [] }, aiNurse: { version: 'nurse-v1', draftId: f.draft.id, turns: f.draft.turns, professionalNotes: [], snapshots: [] } } }
  await assert.rejects(() => quick.create('qa-nurse', input), /fixture-media-failure/)
  assert.equal((await f.events.repository.findByAccountId('qa-nurse')).length, 0)
  assert.equal((await records.repository.findByAccountId('qa-nurse')).length, 0)
  assert.equal(await quick.requests.find('qa-nurse', input.idempotencyKey), null)
  assert.ok(!(await f.nurse.owned('qa-nurse', f.member.id, f.draft.id)).saved)
  quick.photos = null
  const saved = await quick.create('qa-nurse', input)
  const again = await quick.create('qa-nurse', input)
  assert.equal(again.recordId, saved.recordId)
})

test('semantic voice intent appends no duplicate normal assistant turn; field provenance rejects assistant questions', async t => {
  const f = await fixture(t, () => output({ reply: '', intent: 'organize' })); await f.append()
  const assessed = await f.nurse.generate('qa-nurse', f.member.id, f.draft.id, { version: 1, assessOnly: true })
  assert.equal(assessed.organizeSuggested, true); assert.equal(assessed.turns.length, 2)
  const bad = await fixture(t); await bad.append()
  bad.nurse.provider.fetch = async () => Response.json({ output: [{ content: [{ text: JSON.stringify(output({ fieldEvidence: [{ field: 'narrative', sourceTurnId: bad.draft.turns[0].id, quote: '孩子哪里不舒服' }] })) }] }] })
  await assert.rejects(() => bad.nurse.generate('qa-nurse', bad.member.id, bad.draft.id, { version: 1, organize: true }), /字段来源/)
})

test('reorganization protects human fields, changed headings, deleted notes and body/time review controls', async t => {
  const note = { category: 'parent_concern', heading: '担心', text: '担心鸡蛋相关', sourceTurnId: 'user-1', quote: '我担心是鸡蛋过敏', certainty: 'uncertain', attribution: 'parent' }
  const f = await fixture(t, () => output({ notes: [note] })); await f.append()
  const first = await f.nurse.generate('qa-nurse', f.member.id, f.draft.id, { version: 1, organize: true })
  const metadata = { version: 'nurse-v1', draftId: first.id, turns: first.turns, professionalNotes: [], snapshots: first.snapshots }
  const reviewed = await f.nurse.change('qa-nurse', f.member.id, first.id, { version: first.version, review: { fields: { ...first.fields, narrative: '人工核对的症状', locationText: '' }, metadata, deletedNoteIds: first.notes.map(n => n.id), form: { categories: ['symptom'], symptom: { symptomCategory: 'skin', narrative: '人工核对的症状', locations: [], descriptors: [], shortNote: '人工补充' }, timePrecision: 'unknown' } } })
  const next = await f.nurse.generate('qa-nurse', f.member.id, first.id, { version: reviewed.version, organize: true })
  assert.equal(next.notes.length, 0); assert.equal(next.fields.narrative, '人工核对的症状'); assert.equal(next.fields.locationText, '')
  assert.equal(next.review.form.symptom.shortNote, '人工补充'); assert.equal(next.review.form.timePrecision, 'unknown')
  const resend = await f.nurse.change('qa-nurse', f.member.id, first.id, { version: 0, turn: f.user })
  assert.equal(resend.version, next.version)
})

test('absence of consciousness is danger, not a negated consciousness symptom', () => {
 assert.equal(confirmedCurrentEmergency({currentChild:true,quote:'孩子现在没有意识了'},{text:'孩子现在没有意识了'}),true)
 assert.equal(confirmedCurrentEmergency({currentChild:true,quote:'没有意识异常'},{text:'没有意识异常，现在反应正常'}),false)
})


test('manual form context is owned, bounded and does not forge dialogue; fuzzy time has exact user provenance',async t=>{
 const f=await fixture(t);await f.append()
 const current=await f.nurse.change('qa-nurse',f.member.id,f.draft.id,{version:1,formContext:{categories:['symptom'],symptom:{symptomCategory:'skin',narrative:'手动填写的左臂红点',locations:[],descriptors:[]},timePrecision:'unknown',timeLabel:'本周，日期待确认'}})
 assert.equal(current.formContext.timeLabel,'本周，日期待确认');assert.equal(current.turns.length,2)
 await assert.rejects(()=>f.nurse.change('qa-nurse',f.member.id,current.id,{version:current.version,formContext:{categories:['medication']}}),/表单背景/)
 const next=await f.nurse.change('qa-nurse',f.member.id,current.id,{version:current.version,turn:{...f.user,id:'time',text:'应该就是本周，具体日期不详'}})
 let instructions='';f.nurse.provider.fetch=async(url,options)=>{instructions=JSON.parse(options.body).instructions;return modelResponse(output({fields:{...output().fields,timeText:'本周'},fieldEvidence:[...output().fieldEvidence,{field:'timeText',sourceTurnId:'time',quote:'本周，具体日期不详'}]}),options)}
 const organized=await f.nurse.generate('qa-nurse',f.member.id,next.id,{version:next.version,organize:true})
 assert.equal(organized.fields.timeText,'本周，具体日期不详');assert.deepEqual(organized.fieldSources.timeText,['time']);assert.ok(instructions.includes('手动填写的左臂红点'));assert.equal(organized.turns.length,3)
})

test('empty initial form opens the same nurse draft without a fake complaint or user turn', async t => {
  const f = await fixture(t)
  const changed = await f.nurse.change('qa-nurse', f.member.id, f.draft.id, { version: 0, formContext: { categories: ['symptom'], symptom: { symptomCategory: 'other', narrative: '', locations: [], descriptors: [] }, timePrecision: 'exact', occurredAt: at } })
  assert.equal(changed.turns.length, 1)
  assert.equal(changed.formContext.occurredAt, at)
  assert.ok(!changed.formContext.symptom.narrative)
  assert.equal((await f.nurse.open('qa-nurse', f.member.id, { scope: changed.scope })).id, changed.id)
  await assert.rejects(() => f.nurse.generate('qa-nurse', f.member.id, changed.id, { version: changed.version, organize: true }), /请先/)
})

test('unused chat extraction cannot block conversation; organization still rejects untraceable notes', async t => {
 const f=await fixture(t,()=>output({notes:[{category:'context',heading:'未采纳建议',text:'不能成为事实',sourceTurnId:'user-1',quote:'用户没有说过的话',certainty:'uncertain',attribution:'parent'}]}));await f.append()
 const chat=await f.nurse.generate('qa-nurse',f.member.id,f.draft.id,{version:1})
 assert.equal(chat.turns.length,3);assert.equal(chat.notes.length,0);assert.deepEqual(chat.fields,{})
 await assert.rejects(()=>f.nurse.generate('qa-nurse',f.member.id,chat.id,{version:chat.version,organize:true}),/整理来源/)
 assert.equal((await f.nurse.owned('qa-nurse',f.member.id,chat.id)).turns[1].text,f.user.text)
})

test('short model references resolve to immutable user IDs; alias of assistant cannot supply facts', async t => {
 const f=await fixture(t);await f.append()
 let modelTurns
 f.nurse.provider.fetch=async(url,options)=>{
  modelTurns=JSON.parse(JSON.parse(options.body).input)
  return modelResponse(output({fieldEvidence:output().fieldEvidence.map(e=>({...e,sourceTurnId:'t1'})),notes:[{category:'parent_concern',heading:'担心',text:'不采纳改写',sourceTurnId:'t1',quote:'我担心是鸡蛋过敏',certainty:'reported',attribution:'parent'}]}),options)
 }
 const result=await f.nurse.generate('qa-nurse',f.member.id,f.draft.id,{version:1,organize:true})
 assert.equal(modelTurns[1].id,'t1');assert.equal(result.turns[1].id,'user-1')
 assert.deepEqual(result.fieldSources.narrative,['user-1']);assert.deepEqual(result.notes[0].sourceTurnIds,['user-1'])
 assert.equal(result.notes[0].text,'我担心是鸡蛋过敏');assert.equal(result.notes[0].certainty,'uncertain')
 f.nurse.provider.fetch=async()=>Response.json({output:[{content:[{text:JSON.stringify(output({fieldEvidence:[{field:'narrative',sourceTurnId:'t0',quote:'孩子哪里不舒服'}]}))}]}]})
 await assert.rejects(()=>f.nurse.generate('qa-nurse',f.member.id,f.draft.id,{version:result.version,organize:true}),/字段来源/)
})

test('model schema requires source evidence and allows only existing quote fragments and explicit severity', async t => {
 const f=await fixture(t);await f.append();let schema
 f.nurse.provider.fetch=async(url,options)=>{schema=JSON.parse(options.body).text.format.schema;return modelResponse(output(),options)}
 const first=await f.nurse.generate('qa-nurse',f.member.id,f.draft.id,{version:1,organize:true})
 const validate=new Ajv({strict:false}).compile(schema)
 const value=output({concernCoverage:{t1:'我担心是鸡蛋过敏，但没有喘'},fields:{...output().fields,timeText:''},fieldEvidence:[{field:'narrative',sourceTurnId:'t1',quote:'脸颊发红发痒'},{field:'locationText',sourceTurnId:'t1',quote:'脸颊发红发痒'}]})
 assert.equal(validate(value),true)
 f.nurse.provider.fetch=async()=>Response.json({output:[{content:[{text:JSON.stringify({...value,fieldEvidence:[]})}]}]})
 await assert.rejects(()=>f.nurse.generate('qa-nurse',f.member.id,f.draft.id,{version:first.version,organize:true}),/缺少家长原话依据/)
 assert.equal(validate({...value,fields:{...value.fields,impactLevel:'little'}}),false)
 const rewritten={...value,fieldEvidence:[{field:'narrative',sourceTurnId:'t1',quote:'脸颊...发红'},{field:'locationText',sourceTurnId:'t1',quote:'脸颊发红发痒'}]}
 f.nurse.provider.fetch=async()=>Response.json({output:[{content:[{text:JSON.stringify(rewritten)}]}]})
 await assert.rejects(()=>f.nurse.generate('qa-nurse',f.member.id,f.draft.id,{version:first.version,organize:true}),/字段来源/)
 assert.equal(validate({...value,fieldEvidence:value.fieldEvidence.map(e=>({...e,sourceTurnId:'made-up'}))}),false)
})

test('form commands and unrelated quotes cannot become complaint, onset or body facts; manual context survives',async t=>{
 const f=await fixture(t)
 let d=await f.nurse.change('qa-nurse',f.member.id,f.draft.id,{version:0,formContext:{categories:['symptom'],symptom:{symptomCategory:'skin',narrative:'人工左手发红',locationText:'左手',locations:[],descriptors:[]},timePrecision:'unknown',timeLabel:'上周，日期待确认'}})
 d=await f.nurse.change('qa-nurse',f.member.id,d.id,{version:d.version,turn:{...f.user,text:'还不知道变化，先整理我填过的资料。'}})
 f.nurse.provider.fetch=async(url,options)=>modelResponse(output({fields:{...output().fields,narrative:'整理指令',timeText:'今天',locationText:'左手'},fieldEvidence:['narrative','timeText','locationText'].map(field=>({field,sourceTurnId:'t1',quote:'先整理我填过的资料'}))}),options)
 const organized=await f.nurse.generate('qa-nurse',f.member.id,d.id,{version:d.version,organize:true})
 assert.equal(organized.fields.narrative,'');assert.equal(organized.fields.timeText,'');assert.equal(organized.fields.locationText,'')
 assert.equal(organized.warnings.length,3);assert.deepEqual(organized.fieldSources,{})
 assert.equal(organized.formContext.symptom.narrative,'人工左手发红');assert.equal(organized.formContext.timeLabel,'上周，日期待确认')
 assert.equal(organized.turns[1].text,'还不知道变化，先整理我填过的资料。')
})

test('organization cannot omit an explicitly requested parent concern; quotes stay uncertain and deleted notes stay deleted',async t=>{
 const f=await fixture(t);await f.append()
 const question='我不知道是因为过敏，还是热了或者冷了，最近天气变化比较大。形成就诊情况单时请把我的疑问加进去。'
 let draft=await f.nurse.change('qa-nurse',f.member.id,f.draft.id,{version:1,turn:{...f.user,id:'question',text:question}})
 const quote='我不知道是因为过敏，还是热了或者冷了，最近天气变化比较大'
 const valid=output({symptomObservations:{t1:'脸颊发红发痒',t2:''},concernCoverage:{t1:'我担心是鸡蛋过敏',t2:quote},notes:[]})
 f.nurse.provider.fetch=async()=>Response.json({output:[{content:[{text:JSON.stringify(valid)}]}]})
 const first=await f.nurse.generate('qa-nurse',f.member.id,draft.id,{version:draft.version,organize:true})
 assert.equal(first.notes.length,2);assert.ok(first.notes.some(n=>n.text===quote&&n.certainty==='uncertain'&&n.sourceTurnIds[0]==='question'))
 assert.ok(!first.fields.narrative.includes('过敏'));assert.deepEqual(first.turns,draft.turns)
 f.nurse.provider.fetch=async()=>Response.json({output:[{content:[{text:JSON.stringify({...valid,concernCoverage:{t1:'我担心是鸡蛋过敏',t2:''}})}]}]})
 await assert.rejects(()=>f.nurse.generate('qa-nurse',f.member.id,draft.id,{version:first.version,organize:true}),/疑问来源/)
 assert.equal((await f.nurse.owned('qa-nurse',f.member.id,draft.id)).version,first.version)
 f.nurse.provider.fetch=async()=>Response.json({output:[{content:[{text:JSON.stringify({...valid,concernCoverage:{t1:'我担心是鸡蛋过敏',t2:'形成就诊情况单时请把我的疑问加进去'}})}]}]})
 await assert.rejects(()=>f.nurse.generate('qa-nurse',f.member.id,draft.id,{version:first.version,organize:true}),/疑问来源/)
 draft=await f.nurse.change('qa-nurse',f.member.id,draft.id,{version:first.version,review:{fields:first.fields,metadata:{version:'nurse-v1',draftId:first.id,turns:first.turns,professionalNotes:[],snapshots:first.snapshots},deletedNoteIds:first.notes.map(n=>n.id)}})
 f.nurse.provider.fetch=async()=>Response.json({output:[{content:[{text:JSON.stringify(valid)}]}]})
 const next=await f.nurse.generate('qa-nurse',f.member.id,draft.id,{version:draft.version,organize:true});assert.equal(next.notes.length,0)
})

test('compound input permits exact symptom and time spans after a prefix, without mixing concern or treatment into the complaint',async t=>{
 const f=await fixture(t)
 const text='合成验收，非真实患者：昨晚左肘窝发红发痒，没有发热。我担心鸡蛋相关，之前涂过保湿霜，好像没变化。'
 const draft=await f.nurse.change('qa-nurse',f.member.id,f.draft.id,{version:0,turn:{...f.user,text}});let schema
 const value=output({symptomObservations:{t1:'左肘窝发红发痒'},fields:{narrative:'左肘窝发红发痒，没有发热',timeText:'昨晚',locationText:'左肘窝',impactLevel:'',triggerText:'',trend:''},fieldEvidence:[{field:'narrative',sourceTurnId:'t1',quote:'左肘窝发红发痒'},{field:'narrative',sourceTurnId:'t1',quote:'没有发热'},{field:'timeText',sourceTurnId:'t1',quote:'昨晚'},{field:'locationText',sourceTurnId:'t1',quote:'左肘窝发红发痒'}],concernCoverage:{t1:'我担心鸡蛋相关'},notes:[{category:'prior_action',heading:'之前处理',text:'之前涂过保湿霜',quote:'之前涂过保湿霜',sourceTurnId:'t1',certainty:'reported',attribution:'parent'}]})
 f.nurse.provider.fetch=async(url,options)=>{schema=JSON.parse(options.body).text.format.schema;return Response.json({output:[{content:[{text:JSON.stringify(value)}]}]})}
 const organized=await f.nurse.generate('qa-nurse',f.member.id,draft.id,{version:draft.version,organize:true})
 assert.equal(new Ajv({strict:false}).compile(schema)(value),true);assert.equal(organized.fields.narrative,'左肘窝发红发痒；没有发热');assert.equal(organized.fields.timeText,'昨晚');assert.equal(organized.fields.locationText,'左肘窝')
 assert.equal(organized.notes.length,2);assert.ok(organized.notes.some(n=>n.text==='我担心鸡蛋相关'&&n.certainty==='uncertain'));assert.equal(organized.turns[1].text,text)
})

test('yesterday I said is a communication date, not symptom onset; today onset in the same correction remains usable',async t=>{
 const f=await fixture(t)
 const text='脸颊发红发痒。昨天说的手臂其实没红，今天脸上起了疹子。'
 const draft=await f.nurse.change('qa-nurse',f.member.id,f.draft.id,{version:0,turn:{...f.user,text}})
 const value=output({fields:{...output().fields,timeText:'昨天'},fieldEvidence:[...output().fieldEvidence,{field:'timeText',sourceTurnId:'t1',quote:'昨天'}],concernCoverage:{t1:''}})
 f.nurse.provider.fetch=async()=>Response.json({output:[{content:[{text:JSON.stringify(value)}]}]})
 const first=await f.nurse.generate('qa-nurse',f.member.id,draft.id,{version:draft.version,organize:true});assert.equal(first.fields.timeText,'');assert.ok(first.warnings.some(w=>w.includes('发生时间')))
 f.nurse.provider.fetch=async()=>Response.json({output:[{content:[{text:JSON.stringify({...value,fields:{...value.fields,timeText:'今天'},fieldEvidence:[...output().fieldEvidence,{field:'timeText',sourceTurnId:'t1',quote:'今天'}]})}]}]})
 const next=await f.nurse.generate('qa-nurse',f.member.id,draft.id,{version:first.version,organize:true});assert.equal(next.fields.timeText,'今天');assert.equal(next.turns[1].text,text)
})

test('ending a conversation cannot assert absence of fever; generated note headings are grounded and repeated complaint notes are omitted',async t=>{
 const f=await fixture(t);await f.append()
 const end=await f.nurse.change('qa-nurse',f.member.id,f.draft.id,{version:1,turn:{...f.user,id:'end',text:'没了。'}})
 const value=output({symptomObservations:{t1:'脸颊发红发痒',t2:''},concernCoverage:{t1:'我担心是鸡蛋过敏',t2:''},notes:[{category:'context',heading:'无发热',text:'无发热',quote:'没了。',sourceTurnId:'t2',certainty:'denied',attribution:'parent'},{category:'parent_concern',heading:'确诊鸡蛋过敏',text:'确诊',quote:'我担心是鸡蛋过敏',sourceTurnId:'t1',certainty:'reported',attribution:'parent'},{category:'context',heading:'症状',text:'发红',quote:'脸颊发红发痒',sourceTurnId:'t1',certainty:'reported',attribution:'parent'}]})
 f.nurse.provider.fetch=async()=>Response.json({output:[{content:[{text:JSON.stringify(value)}]}]})
 const organized=await f.nurse.generate('qa-nurse',f.member.id,end.id,{version:end.version,organize:true})
 assert.equal(organized.notes.length,1);assert.equal(organized.notes[0].heading,'我担心是鸡蛋过敏');assert.equal(organized.notes[0].certainty,'uncertain');assert.ok(!JSON.stringify({fields:organized.fields,notes:organized.notes}).includes('无发热'));assert.equal(organized.turns.at(-1).text,'没了。')
})

test('per-turn observed symptoms survive a body correction and do not remain duplicated in context notes',async t=>{
 const f=await fixture(t)
 let d=await f.nurse.change('qa-nurse',f.member.id,f.draft.id,{version:0,turn:{...f.user,text:'我只看到红点，不知道具体部位，时间也不确定。'}})
 d=await f.nurse.change('qa-nurse',f.member.id,d.id,{version:d.version,turn:{...f.user,id:'correction',text:'更正，昨天说的手臂其实没红，是脸上，但不知道左右。'}})
 const value=output({symptomObservations:{t1:'我只看到红点',t2:'是脸上'},concernCoverage:{t1:'',t2:''},fields:{...output().fields,narrative:'是脸上',locationText:'脸上',timeText:'时间也不确定'},fieldEvidence:[{field:'narrative',sourceTurnId:'t2',quote:'是脸上'},{field:'locationText',sourceTurnId:'t2',quote:'是脸上'},{field:'timeText',sourceTurnId:'t1',quote:'时间也不确定'}],notes:[{category:'context',heading:'红点观察',text:'红点',quote:'我只看到红点',sourceTurnId:'t1',certainty:'reported',attribution:'parent'}]})
 f.nurse.provider.fetch=async()=>Response.json({output:[{content:[{text:JSON.stringify(value)}]}]})
 const next=await f.nurse.generate('qa-nurse',f.member.id,d.id,{version:d.version,organize:true})
 assert.ok(next.fields.narrative.includes('红点'));assert.equal(next.fields.locationText,'面部');assert.equal(next.fields.timeText,'时间也不确定');assert.equal(next.notes.length,0);assert.deepEqual(new Set(next.fieldSources.narrative),new Set(['user-1','correction']));assert.equal(next.turns.length,3)
})

test('a known user alias with a unique exact quote is reconciled transparently; invented aliases and ambiguous matches are rejected',async t=>{
 const f=await fixture(t);await f.append()
 let d=await f.nurse.change('qa-nurse',f.member.id,f.draft.id,{version:1,turn:{...f.user,id:'second',text:'是脸上，但不知道左右。'}})
 const value=output({symptomObservations:{t1:'脸颊发红发痒',t2:'是脸上'},concernCoverage:{t1:'我担心是鸡蛋过敏',t2:''},fields:{...output().fields,locationText:'脸上，未明确左右'},fieldEvidence:[{field:'narrative',sourceTurnId:'t2',quote:'脸颊发红发痒'},{field:'locationText',sourceTurnId:'t2',quote:'是脸上'}]})
 f.nurse.provider.fetch=async()=>Response.json({output:[{content:[{text:JSON.stringify(value)}]}]})
 const next=await f.nurse.generate('qa-nurse',f.member.id,d.id,{version:d.version,organize:true});assert.equal(next.fields.locationText,'面部');assert.ok(next.fieldSources.narrative.includes('user-1'));assert.ok(next.warnings.some(w=>w.includes('唯一匹配')))
 f.nurse.provider.fetch=async()=>Response.json({output:[{content:[{text:JSON.stringify({...value,fieldEvidence:value.fieldEvidence.map(e=>({...e,sourceTurnId:'invented'}))})}]}]})
 await assert.rejects(()=>f.nurse.generate('qa-nurse',f.member.id,d.id,{version:next.version,organize:true}),/字段来源/)
 d=await f.nurse.change('qa-nurse',f.member.id,d.id,{version:next.version,turn:{...f.user,id:'duplicate',text:'脸颊发红发痒'}})
 f.nurse.provider.fetch=async()=>Response.json({output:[{content:[{text:JSON.stringify(value)}]}]})
 await assert.rejects(()=>f.nurse.generate('qa-nurse',f.member.id,d.id,{version:d.version,organize:true}),/字段来源/)
})
