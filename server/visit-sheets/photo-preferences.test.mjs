import assert from 'node:assert/strict'
import { mkdtemp,rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import sharp from 'sharp'
import { FamilyMemberService } from '../members/family-member-service.mjs'
import { VisitSheetService } from './visit-sheet-service.mjs'
import { photoDetails } from './photo-preferences.mjs'
async function setup(t){
  const dataDirectory=await mkdtemp(path.join(os.tmpdir(),'visit-v6-photos-'));t.after(()=>rm(dataDirectory,{recursive:true,force:true}))
  const member=await new FamilyMemberService({dataDirectory}).create('account-a',{name:'测试孩子',relationship:'child',gender:'female',birthday:'2024-01-01'})
  const svc=new VisitSheetService({dataDirectory}),buffer=await sharp({create:{width:18,height:14,channels:3,background:'#349786'}}).webp().toBuffer()
  const upload=()=>svc.photos.upload('account-a','v6_draft_12345678',{memberId:member.id,name:'本地测试照片.webp',mimeType:'image/webp',dataUrl:`data:image/webp;base64,${buffer.toString('base64')}`,sortOrder:0})
  return {svc,member,upload}
}
test('报告照片事务：真实上传，未知拍摄时间，主题隔离，幂等、刷新与说明精度',async t=>{
  const {svc,member,upload}=await setup(t),m=member.id,p=await upload(),id=`draft:${p.id}`
  const body={expectedVersion:0,requestId:'save-photo',focus:{mode:'custom',text:'问题甲'},photoDraft:{draftId:p.draftId,photoIds:[p.id]},selectedPhotoIds:[id],photoDetails:{[id]:{label:'家长部位图',location:'左前臂'}}}
  const {report}=await svc.save('account-a',m,body),photo=report.photos[0]
  assert.equal(report.schemaVersion,6);assert.equal(photo.capturedAt,null);assert.equal(photo.title,'家长部位图');assert.equal(report.candidates.length,0);assert.equal((await svc.records.findByAccountId('account-a')).length,1);assert.ok((await svc.attachments.findById(photo.sourceId.slice(11))).recordId)
  assert.equal((await svc.save('account-a',m,body)).report.version,1);assert.equal((await svc.records.findByAccountId('account-a')).length,1)
  const loaded=await svc.get('account-a',m)
  assert.equal(loaded.report.photos[0].location,'左前臂');assert.equal(loaded.stale,false);assert.deepEqual(loaded.warnings,[])
  const b=await svc.save('account-a',m,{expectedVersion:1,requestId:'theme-b',focus:{mode:'custom',text:'问题乙'}});assert.equal(b.report.selectedPhotoIds.length,0)
  const a=await svc.save('account-a',m,{expectedVersion:2,requestId:'theme-a',focus:{mode:'custom',text:'问题甲'},photoDetails:{[photo.sourceId]:{capturedAt:'2026-09-01T03:04:05.000Z',capturePrecision:'exact'}}});assert.deepEqual(a.report.selectedPhotoIds,[photo.sourceId])
  const edited=await svc.save('account-a',m,{expectedVersion:3,requestId:'description',photoDetails:{[photo.sourceId]:{label:'新的说明'}}})
  assert.equal(edited.report.photos[0].capturedAt,'2026-09-01T03:04:05.000Z');assert.equal(edited.report.photos[0].capturePrecision,'exact')
  await svc.photos.cancel('account-a',m,p.draftId)
  assert.ok((await svc.attachments.findById(photo.sourceId.slice(11))).storageKey)
  await assert.rejects(svc.save('foreign',m,{...body,requestId:'foreign'}),{status:404})
})
test('报告保存失败原子回滚附件和容器，保留上传草稿，冲突不消费',async t=>{
  const {svc,member,upload}=await setup(t),m=member.id,p=await upload()
  const body={expectedVersion:0,requestId:'retry-photo',photoDraft:{draftId:p.draftId,photoIds:[p.id]},selectedPhotoIds:[`draft:${p.id}`]}
  const update=svc.store.update.bind(svc.store);svc.store.update=async()=>{throw new Error('injected storage failure')}
  await assert.rejects(svc.save('account-a',m,body),/injected/)
  assert.equal((await svc.events.findByAccountId('account-a')).length,0);assert.equal((await svc.photos.list('account-a',m,p.draftId)).length,1)
  svc.store.update=update
  await assert.rejects(svc.save('account-a',m,{...body,expectedVersion:99}),{status:409})
  assert.equal((await svc.photos.list('account-a',m,p.draftId)).length,1)
  const saved=await svc.save('account-a',m,body);assert.equal(saved.report.photos.length,1);assert.equal((await svc.photos.list('account-a',m,p.draftId)).length,0)
})
test('照片说明白名单和日期精度不会隐式截断',()=>{
  const exact={a:{capturedAt:'2026-09-01T03:04:05.000Z',capturePrecision:'exact'}}
  assert.equal(photoDetails(exact,{a:{label:'仅改说明'}}).a.capturedAt,exact.a.capturedAt)
  assert.throws(()=>photoDetails({}, {a:{accountId:'foreign'}}),/字段无效/)
  assert.throws(()=>photoDetails({}, {a:{capturedAt:'2026-09-01',capturePrecision:'exact'}}),/精度不一致/)
  assert.throws(()=>photoDetails({}, {a:{capturedAt:'2099-01-01'}}),/未来/)
  assert.throws(()=>photoDetails({}, {a:{capturedAt:'2026-02-30'}}),/日期无效/)
})

test('已有症状的影像保存复用随记记录，选已有照片不复制附件',async t=>{
  const {svc,member,upload}=await setup(t),m=member.id,event=await svc.events.create({accountId:'account-a',memberId:m,title:'颈部观察',category:'other',status:'observing',startTime:new Date().toISOString()}),record=await svc.records.create({accountId:'account-a',eventId:event.id,type:'symptom',content:'脖子红点',occurredAt:new Date().toISOString(),journal:{categories:['symptom'],symptom:{symptomCategory:'skin',narrative:'脖子红点',locations:[],descriptors:[]}}})
  const p=await upload(),saved=await svc.save('account-a',m,{expectedVersion:0,requestId:'linked-photo',focus:{mode:'source',sourceId:`record:${record.id}`},photoDraft:{draftId:p.draftId,photoIds:[p.id]},selectedPhotoIds:[`draft:${p.id}`]})
  const photo=saved.report.photos[0],attachment=await svc.attachments.findById(photo.sourceId.slice(11))
  assert.equal(attachment.eventId,event.id);assert.equal(attachment.recordId,record.id);assert.deepEqual(photo.relatedSourceIds,[`record:${record.id}`]);assert.equal((await svc.records.findByAccountId('account-a')).length,1)
  await svc.save('account-a',m,{expectedVersion:1,requestId:'select-existing',selectedPhotoIds:[photo.sourceId]})
  assert.equal((await svc.attachments.findByEventId(event.id)).length,1);assert.equal((await svc.records.findByAccountId('account-a')).length,1)
})
