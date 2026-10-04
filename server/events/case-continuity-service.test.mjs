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
import { VisitSheetService } from '../visit-sheets/visit-sheet-service.mjs'
import { caseFollowupView } from './case-followup-view.mjs'

test('列表描述不重复原文，不推断诊断；最近时间排除未知与补录录入时间', () => {
  const event={title:'早上起来的时候就开始其实有点头晕但不是头疼发烧',startTime:'2026-10-04T09:00:00Z'}
  const records=[{id:'b',content:event.title,occurredAt:'2026-10-03T01:00:00Z',createdAt:'2026-10-04T02:00:00Z'}, {id:'a',content:'补录',occurredAt:'2026-10-01T01:00:00Z',createdAt:'2026-10-04T03:00:00Z'}, {id:'c',content:'未提供',occurredAt:'2026-10-04T05:00:00Z',createdAt:'2026-10-04T05:00:00Z',caseContext:{timeUnknown:true}}]
  const view=caseFollowupView(event,records)
  assert.equal(view.firstOccurredAt,records[1].occurredAt);assert.equal(view.latestOccurredAt,records[0].occurredAt);assert.equal(view.recordCount,3);assert.equal(view.hasUnknownTime,true);assert.equal(view.supplement,null)
  assert.equal(records[0].content,event.title);assert.ok(!view.title.includes('过敏'))
  const structured=caseFollowupView(event,[{...records[0],journal:{symptom:{generatedSummary:'脸颊发红、瘙痒',shortNote:'夜间更明显'}}}])
  assert.equal(structured.title,'脸颊发红、瘙痒');assert.equal(structured.supplement,'夜间更明显')
})

test('康复/撤销/恢复真实幂等、保留历史；未知旧归档不伪造康复，跨成员拒绝',async t=>{
  const f=await fixture(t),saved=await f.capture(),id=saved.eventId
  await f.service.archive('synthetic-account',f.member.id,id,true)
  let legacy=(await f.service.list('synthetic-account',f.member.id)).archived[0]
  assert.equal(legacy.event.caseArchiveReason,'general');assert.equal(legacy.event.caseRecoveryMarkedAt,null)
  await f.service.archive('synthetic-account',f.member.id,id,false)
  const input={action:'recover',requestId:'recover-1',expectedArchivedAt:null}
  let event=await f.service.recovery('synthetic-account',f.member.id,id,input)
  assert.equal(event.caseArchiveReason,'user_recovered');assert.equal(event.caseRecoveryMarkedAt,'2026-10-02T08:00:00.000Z')
  const historyLength=event.caseStateHistory.length
  event=await f.service.recovery('synthetic-account',f.member.id,id,input);assert.equal(event.caseStateHistory.length,historyLength)
  assert.equal((await f.service.list('synthetic-account',f.member.id)).archived[0].followup.recordCount,1)
  await assert.rejects(()=>f.capture({eventId:id}),/已归档/)
  await f.service.recovery('synthetic-account',f.member.id,id,{action:'undo',requestId:'undo-1',undoRequestId:'recover-1',expectedArchivedAt:event.caseArchivedAt})
  assert.equal((await f.service.list('synthetic-account',f.member.id)).active.length,1)
  event=await f.service.recovery('synthetic-account',f.member.id,id,{action:'recover',requestId:'recover-2'})
  await f.service.recovery('synthetic-account',f.member.id,id,{action:'restore',requestId:'restore-1',expectedArchivedAt:event.caseArchivedAt})
  await assert.rejects(()=>f.service.recovery('synthetic-account',f.member.id,id,{action:'undo',requestId:'stale',undoRequestId:'recover-2'}),/新操作/)
  const other=await f.members.create({accountId:'synthetic-account',name:'合成其他人物',relationship:'other'})
  await assert.rejects(()=>f.service.recovery('synthetic-account',other.id,id,{action:'recover',requestId:'cross-member'}))
  assert.equal((await f.service.records.list('synthetic-account',id)).length,1)
})

test('同一保存标识不能被用于另一次情况',async t=>{
  const f=await fixture(t),first=await f.capture({requestId:'one-record'}),second=await f.capture()
  await assert.rejects(()=>f.capture({eventId:second.eventId,requestId:'one-record'}),/另一次情况/)
  assert.notEqual(first.eventId,second.eventId)
})

test('资料核对复用原记录与原件、保持就诊时间和原文；拒绝跨情况/版本覆盖',async t=>{
  const f=await fixture(t,{model:{async structured(){throw Object.assign(new Error('合成识别故障'),{status:503,code:'AI_BUSINESS_UNAVAILABLE'})}}})
  const file={name:'合成病历.png',mimeType:'image/png',dataUrl:`data:image/png;base64,${(await sharp({create:{width:30,height:30,channels:3,background:'#ffffff'}}).png().toBuffer()).toString('base64')}`}
  const a=await f.capture(),material=await f.capture({eventId:a.eventId,text:'合成原始资料',identity:'medical_consultation',occurredAt:'2026-10-01T01:00:00Z',files:[file]})
  const input={text:'合成原始资料',files:[file],eventId:a.eventId,sourceRecordId:material.recordId,sourceIdentity:'medical_consultation',task:'report'}
  await assert.rejects(()=>f.service.business.prepare('synthetic-account',f.member.id,input))
  const failed=await f.service.business.latest('synthetic-account',f.member.id)
  const ready=await f.service.business.edit('synthetic-account',f.member.id,failed.id,{version:failed.version,manualOriginal:true,note:'合成手动补充'})
  const saved=await f.service.business.save('synthetic-account',f.member.id,failed.id,{version:ready.version,confirmed:true})
  assert.equal(saved.result.records[0].recordId,material.recordId)
  const records=await f.service.records.list('synthetic-account',a.eventId)
  assert.equal(records.length,2);const updated=records.find(r=>r.id===material.recordId)
  assert.equal(updated.sourceText,'合成原始资料');assert.equal(updated.occurredAt,'2026-10-01T01:00:00.000Z');assert.equal(updated.caseContext.timeUnknown,false)
  assert.equal((await f.service.attachments.findByEventId(a.eventId)).length,1)
  await f.service.business.undo('synthetic-account',f.member.id,failed.id)
  assert.equal((await f.service.records.getOwnedRecord('synthetic-account',material.recordId)).content,'合成原始资料')
  const b=await f.capture();await assert.rejects(()=>f.service.business.prepare('synthetic-account',f.member.id,{...input,eventId:b.eventId}),/不属于这次情况/)
  await assert.rejects(()=>f.service.business.prepare('synthetic-account',f.member.id,{...input,text:'合成原始资料（第二次核对）'}))
  const failedAgain=await f.service.business.latest('synthetic-account',f.member.id)
  const draft=await f.service.business.edit('synthetic-account',f.member.id,failedAgain.id,{version:failedAgain.version,manualOriginal:true,note:'合成第二次核对'})
  await f.service.records.update('synthetic-account',material.recordId,{content:'合成后来人工校对'},f.service.now())
  await assert.rejects(()=>f.service.business.save('synthetic-account',f.member.id,draft.id,{version:draft.version,confirmed:true}),/已有修改/)
  await f.service.business.cancel('synthetic-account',f.member.id,draft.id)
  assert.equal((await f.service.records.getOwnedRecord('synthetic-account',material.recordId)).caseContext.aiDraftId,null)
})

async function fixture(t, options = {}) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(),'hoooho-continuity-synthetic-'))
  t.after(() => rm(dataDirectory,{recursive:true,force:true}))
  const members = new FamilyMemberRepository(dataDirectory), member = await members.create({accountId:'synthetic-account',name:'合成测试人物',relationship:'other'})
  let instant = new Date('2026-10-02T08:00:00Z')
  const service = new CaseContinuityService({dataDirectory,now:()=>instant,...options})
  return { service, members, member, now:value=>{instant=new Date(value)}, capture:(extra={})=>service.capture('synthetic-account',member.id,{text:'合成示例：皮肤变化',requestId:crypto.randomUUID(),occurredAt:instant.toISOString(),files:[],...extra}) }
}

test('复用症状表单保存结构化症状和照片，重试幂等、关联事件且拒绝跨人物照片', async t => {
  const f = await fixture(t)
  const png = await sharp({ create: { width: 30, height: 30, channels: 3, background: '#ffffff' } }).png().toBuffer()
  const draftId = 'symptom-synthetic-draft'
  const photo = await f.service.photos.upload('synthetic-account', draftId, { memberId: f.member.id, name: 'synthetic.png', mimeType: 'image/png', dataUrl: `data:image/png;base64,${png.toString('base64')}`, sortOrder: 0 })
  const input = { requestId: 'symptom-save-retry', photoDraftId: draftId, photoIds: [photo.id], journal: { categories: ['symptom'], symptom: { symptomCategory: 'skin', narrative: '合成：左肘窝发红', keywords: [], locations: [], descriptors: [], linkedRecordIds: {}, locationText: '左肘窝', impactLevel: 'some' } } }
  const saved = await f.capture(input), repeated = await f.capture(input)
  assert.equal(repeated.recordId, saved.recordId)
  const record = await f.service.records.getOwnedRecord('synthetic-account', saved.recordId)
  assert.deepEqual(record.journal.categories, ['symptom'])
  assert.equal(record.journal.symptom.impactLevel, 'some')
  assert.equal(record.journal.symptom.locationText, '左肘窝')
  assert.equal(record.caseContext.attachmentIds.length, 1)
  assert.equal((await f.service.photos.list('synthetic-account', f.member.id, draftId)).length, 0)
  const linked = await f.capture({ eventId: saved.eventId, journal: input.journal })
  assert.equal(linked.eventId, saved.eventId)
  const other = await f.members.create({ accountId: 'synthetic-account', name: '另一合成人物', relationship: 'other' })
  const otherPhoto = await f.service.photos.upload('synthetic-account', 'other-synthetic-draft', { memberId: other.id, name: 'synthetic.png', mimeType: 'image/png', dataUrl: `data:image/png;base64,${png.toString('base64')}`, sortOrder: 0 })
  const before = (await f.service.list('synthetic-account', f.member.id)).active.length
  await assert.rejects(() => f.capture({ photoDraftId: 'other-synthetic-draft', photoIds: [otherPhoto.id] }))
  await assert.rejects(() => f.capture({ journal: { categories: ['symptom'], symptom: { impactLevel: 'invalid' } } }))
  assert.equal((await f.service.list('synthetic-account', f.member.id)).active.length, before)
})

test('结构化开关开启时，无事实原话和待核对资料不清空情况标题，情况单仍可生成', async t => {
  const f = await fixture(t, { structuredMode:'enabled' })
  const narrative='合成示例，非真实患者资料：记录皮肤变化，原因未明确。'
  const saved=await f.capture({text:narrative})
  const originalTitle=narrative.slice(0,30)
  assert.equal((await f.service.events.get('synthetic-account',saved.eventId)).title,originalTitle)
  const pending=await f.capture({eventId:saved.eventId,text:'合成示例：外部AI说咳嗽、发热，来源尚未核对',identity:'pending'})
  assert.equal((await f.service.events.get('synthetic-account',saved.eventId)).title,originalTitle)
  const organization=(await f.service.records.organizations.repository.findByEventId(saved.eventId)).find(item => item.recordId===pending.recordId)
  assert.deepEqual(organization.healthAIOutput.facts,[])
  const sheets=new VisitSheetService({dataDirectory:f.service.directory,now:()=>new Date('2026-10-02T08:00:00Z')})
  const report=await sheets.save('synthetic-account',f.member.id,{expectedVersion:0,requestId:'raw-case-report',focus:{mode:'custom',text:originalTitle,caseEventId:saved.eventId},selection:{eventIds:[saved.eventId],includeBackground:false}})
  assert.equal(report.report.complaint,originalTitle)
  assert.deepEqual(report.report.selection.eventIds,[saved.eventId])
})

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
