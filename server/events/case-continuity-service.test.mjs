import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { CaseContinuityService } from './case-continuity-service.mjs'
import { projectJournalRecord, validateJournal } from './journal-metadata.mjs'
import { AccountDataService } from '../account/account-data-service.mjs'

async function fixture(t) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(),'hoooho-continuity-synthetic-'))
  t.after(() => rm(dataDirectory,{recursive:true,force:true}))
  const members = new FamilyMemberRepository(dataDirectory), member = await members.create({accountId:'synthetic-account',name:'合成测试人物',relationship:'other'})
  let instant = new Date('2026-10-02T08:00:00Z')
  const service = new CaseContinuityService({dataDirectory,now:()=>instant})
  return { service, members, member, now:value=>{instant=new Date(value)}, capture:(extra={})=>service.capture('synthetic-account',member.id,{text:'合成示例：皮肤变化',requestId:crypto.randomUUID(),occurredAt:instant.toISOString(),files:[],...extra}) }
}

test('拍照原件先进入既有AI草稿；无模型也可保存、恢复并核对；跨成员草稿拒绝', async t => {
  const f = await fixture(t), png = await sharp({create:{width:60,height:60,channels:3,background:'#e8f5ee'}}).png().toBuffer()
  const draft = await f.service.business.prepare('synthetic-account',f.member.id,{deferRecognition:true,text:'合成待核对',sourceIdentity:'pending',files:[{name:'合成原件.png',mimeType:'image/png',dataUrl:`data:image/png;base64,${png.toString('base64')}`}]})
  assert.equal(draft.state,'changed'); assert.equal(draft.items.length,0); assert.equal(draft.pages.length,1)
  const captured = await f.capture({aiDraftId:draft.id})
  assert.equal((await f.service.records.getOwnedRecord('synthetic-account',captured.recordId)).caseContext.aiDraftId,draft.id)
  const bound = await f.service.business.edit('synthetic-account',f.member.id,draft.id,{version:draft.version,eventId:captured.eventId,sourceIdentity:'parent'})
  assert.equal(bound.version,draft.version+1)
  const other = await f.members.create({accountId:'synthetic-account',name:'合成其他人物',relationship:'other'})
  await assert.rejects(() => f.service.capture('synthetic-account',other.id,{aiDraftId:draft.id,text:'串成员',files:[],requestId:'cross-draft',occurredAt:'2026-10-02T08:00:00Z'}))
})
test('游客正式资料、观察与既有AI草稿使用原合并机制，幂等且旧账号不可读',async t=>{
  const f=await fixture(t),guest='guest:continuity-synthetic',formal='formal-continuity-synthetic',member=await f.members.create({accountId:guest,name:'合成游客',relationship:'other'})
  const draft=await f.service.business.prepare(guest,member.id,{text:'合成待确认原话',deferRecognition:true,files:[],sourceIdentity:'parent'})
  const captured=await f.service.capture(guest,member.id,{text:'合成游客记录',files:[],requestId:'guest-capture',aiDraftId:draft.id,occurredAt:'2026-10-02T08:00:00Z'})
  await f.service.observation(guest,member.id,captured.eventId,{item:'合成观察',startsOn:'2026-10-02',endsOn:'2026-10-04',timesPerDay:1,requestId:'guest-observation'})
  const accountData=new AccountDataService({dataDirectory:f.service.directory})
  assert.equal((await accountData.mergeGuest(guest,formal)).merged,true)
  assert.equal((await accountData.mergeGuest(guest,formal)).idempotent,true)
  const list=await f.service.list(formal,member.id);assert.equal(list.active.length,1);assert.equal(list.active[0].observations.length,1)
  assert.equal((await f.service.business.get(formal,member.id,draft.id)).raw,'合成待确认原话')
  await assert.rejects(()=>f.service.list(guest,member.id))
})

test('原话先保存，数量按情况不按任务；重试幂等，未知时间不伪装精确',async t=>{
  const f=await fixture(t), first=await f.capture({requestId:'same-request',timeUnknown:true})
  const retry=await f.capture({requestId:'same-request',timeUnknown:true})
  assert.equal(retry.recordId,first.recordId)
  const record=await f.service.records.getOwnedRecord('synthetic-account',first.recordId)
  assert.equal(projectJournalRecord(record).journal.timePrecision,'unknown')
  assert.equal((await f.service.list('synthetic-account',f.member.id)).active.length,1)
  await f.capture({eventId:first.eventId,text:'接着记录：无变化'})
  assert.equal((await f.service.list('synthetic-account',f.member.id)).active.length,1)
  await assert.rejects(()=>f.capture({text:''}),/不保存空情况/)
})
test('人物/账号隔离及错误归属拒绝，生产历史不因归档被删除或当作康复',async t=>{
  const f=await fixture(t), record=await f.capture(), other=await f.members.create({accountId:'synthetic-account',name:'合成其他人物',relationship:'other'})
  assert.equal((await f.service.list('synthetic-account',other.id)).active.length,0)
  await assert.rejects(()=>f.service.capture('synthetic-account',other.id,{eventId:record.eventId,text:'串成员',files:[],requestId:'other',occurredAt:'2026-10-02T08:00:00Z'}))
  await assert.rejects(()=>f.service.list('other-account',f.member.id))
  await f.service.archive('synthetic-account',f.member.id,record.eventId,true)
  assert.equal((await f.service.list('synthetic-account',f.member.id)).archived.length,1)
  assert.equal((await f.service.events.get('synthetic-account',record.eventId)).status,'observing')
  assert.equal((await f.service.records.list('synthetic-account',record.eventId)).length,1)
})
test('观察有明确期限、实际未观察单列、到期不康复；恢复归档不自动重开观察',async t=>{
  const f=await fixture(t), saved=await f.capture(), input={item:'合成皮肤观察',startsOn:'2026-10-02',endsOn:'2026-10-04',timesPerDay:1,timezone:'Asia/Shanghai',requestId:'task-one'}
  const e=await f.service.observation('synthetic-account',f.member.id,saved.eventId,input), task=e.observationTasks[0]
  await f.service.observation('synthetic-account',f.member.id,saved.eventId,input)
  assert.equal((await f.service.list('synthetic-account',f.member.id)).active[0].observations.length,1)
  await f.capture({eventId:saved.eventId,taskId:task.id,result:'not_observed',text:'今天没有观察'})
  const today=(await f.service.list('synthetic-account',f.member.id)).active[0].observations[0]
  assert.equal(today.todayRecorded,1);assert.equal(today.todayNotObserved,1)
  await assert.rejects(()=>f.service.observation('synthetic-account',f.member.id,saved.eventId,{...input,requestId:'reminder',reminderEnabled:true}),{code:'OBSERVATION_NOTIFICATION_UNAVAILABLE'})
  f.now('2026-10-05T08:00:00Z')
  assert.equal((await f.service.list('synthetic-account',f.member.id)).active[0].observations[0].state,'expired')
  assert.equal((await f.service.list('synthetic-account',f.member.id)).active[0].observations[0].todayTarget,0)
  await f.service.archive('synthetic-account',f.member.id,saved.eventId,true);await f.service.archive('synthetic-account',f.member.id,saved.eventId,false)
  assert.equal((await f.service.list('synthetic-account',f.member.id)).active[0].observations[0].state,'paused')
  await assert.rejects(()=>f.service.observation('synthetic-account',f.member.id,saved.eventId,{id:task.id,action:'resume'}),/已到期/)
  assert.equal((await f.service.events.get('synthetic-account',saved.eventId)).status,'observing')
  await assert.rejects(()=>f.service.observation('synthetic-account',f.member.id,saved.eventId,{...input,endsOn:'2026-99-99'}))
})
test('合成三类资料：原件→来源核对→确认；外部AI不能成为医生观察要求',async t=>{
  const f=await fixture(t), png=await sharp({create:{width:60,height:60,channels:3,background:'#e8f5ee'}}).png().toBuffer()
  const cases=[
    {identity:'medical_consultation',text:'合成示例，非真实患者资料。2026-10-01 医生回复：记录皮肤变化和前后照片，观察到2026-10-04。诊断未明确。'},
    {identity:'examination_report',text:'合成示例，非真实患者资料。第1页，共1页。报告日期2026-10-01。血红蛋白 Hb 112 g/L。参考范围未提供。'},
    {identity:'external_ai',text:'合成示例，非真实患者资料。外部AI答复：可以整理皮肤照片供医生查看。这不是医生判断。'}
  ]
  for(const c of cases){
    const saved=await f.capture({...c,files:[{name:'合成原件.png',mimeType:'image/png',dataUrl:`data:image/png;base64,${png.toString('base64')}`}]})
    let record=await f.service.records.getOwnedRecord('synthetic-account',saved.recordId)
    assert.equal(record.caseContext.confirmed,undefined);assert.equal(record.caseContext.attachmentIds.length,1)
    assert.ok(await f.service.attachments.findById(saved.attachmentIds[0]))
    await f.service.confirmMaterial('synthetic-account',f.member.id,saved.eventId,saved.recordId,{identity:c.identity,content:c.text,confirmed:true})
    record=await f.service.records.getOwnedRecord('synthetic-account',saved.recordId)
    assert.equal(record.caseContext.confirmed,true);assert.equal(record.content,c.text)
    if(c.identity==='medical_consultation'){
      const event=await f.service.observation('synthetic-account',f.member.id,saved.eventId,{item:'皮肤变化',startsOn:'2026-10-02',endsOn:'2026-10-04',timesPerDay:1,timezone:'Asia/Shanghai',requestId:'doctor',sourceRecordId:record.id,sourceQuote:'记录皮肤变化和前后照片',sourcePage:1})
      assert.equal(event.observationTasks[0].source,'doctor_confirmed')
    }else if(c.identity==='external_ai'){
      await assert.rejects(()=>f.service.observation('synthetic-account',f.member.id,saved.eventId,{item:'皮肤变化',startsOn:'2026-10-02',endsOn:'2026-10-04',timesPerDay:1,requestId:'ai-doctor',sourceRecordId:record.id,sourceQuote:'整理皮肤照片'}))
      const organizations=await f.service.records.organizations.repository.findByEventId(saved.eventId)
      assert.equal(organizations.flatMap(o=>o.healthAIOutput.facts).length,0)
    }
  }
})
test('批量原件失败事务回滚，不产生半记录；身体涂抹与户外历史独立且未知不补0',async t=>{
  const f=await fixture(t), png=await sharp({create:{width:20,height:20,channels:3,background:'white'}}).png().toBuffer()
  f.service.attachments.createUnique=async()=>{throw new Error('合成上传故障')}
  await assert.rejects(()=>f.capture({files:[{name:'合成.png',mimeType:'image/png',dataUrl:`data:image/png;base64,${png.toString('base64')}`}]}),/合成上传故障/)
  assert.equal((await f.service.list('synthetic-account',f.member.id)).active.length,0)
  assert.deepEqual(validateJournal({categories:['care'],topical:{kind:'skincare',productName:'合成产品',bodyLocations:[]}}).topical,{kind:'skincare',productName:'合成产品',bodyLocations:[]})
  assert.equal(validateJournal({categories:['activity'],outdoorActivity:{activities:[],places:[],contacts:[],observations:[]}}).categories[0],'activity')
})
