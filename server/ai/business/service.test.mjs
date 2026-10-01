import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { FamilyMemberRepository } from '../../members/repositories/family-member-repository.mjs'
import { AIBusinessService } from './service.mjs'

async function fixture(t){const dataDirectory=await mkdtemp(path.join(os.tmpdir(),'hoooho-ai-business-'));t.after(()=>rm(dataDirectory,{recursive:true,force:true}));const members=new FamilyMemberRepository(dataDirectory),member=await members.create({accountId:'synthetic-a',name:'测试人物',relationship:'self'});let calls=0,failed=false;const model={async structured(){calls++;if(failed)throw Object.assign(new Error('测试替身服务不可用'),{code:'AI_BUSINESS_UNAVAILABLE',status:503});return {value:{items:[{category:'symptom',title:'症状记录',timeText:null,fields:[{name:'symptom',value:'没有呕吐',quote:'没有呕吐',sourceId:'input',page:1}],subject:'current',archiveCategory:null,relationKey:null}]},diagnostics:{task:'test',elapsedMs:1,inputTokens:1,outputTokens:1}}}};return {service:new AIBusinessService({dataDirectory,model}),member,calls:()=>calls,fail:()=>{failed=true},members}}
test('同一输入只生成一次，确认后实际写入；重复保存幂等，原文可追溯',async t=>{const f=await fixture(t),d=await f.service.prepare('synthetic-a',f.member.id,{text:'没有呕吐'});assert.equal(d.state,'ready');assert.equal(d.questions.length,2);const cached=await f.service.prepare('synthetic-a',f.member.id,{id:d.id,version:d.version,text:'没有呕吐'});assert.equal(f.calls(),1);const saved=await f.service.save('synthetic-a',f.member.id,d.id,{version:cached.version,confirmed:true});assert.equal(saved.result.count,1);assert.equal((await f.service.save('synthetic-a',f.member.id,d.id,{version:cached.version,confirmed:true})).result.records[0].recordId,saved.result.records[0].recordId);const record=await f.service.records.getOwnedRecord('synthetic-a',saved.result.records[0].recordId);assert.equal(record.content,'症状原话：没有呕吐');assert.equal(record.journal.timePrecision,'unknown');assert.equal(record.aiProvenance.sources[0].quote,'没有呕吐');assert.equal(f.calls(),1)})
test('跨账号、跨成员读取及保存拒绝；失败保留原输入及上一版；跳过问题不再追问',async t=>{const f=await fixture(t),d=await f.service.prepare('synthetic-a',f.member.id,{text:'没有呕吐'});await assert.rejects(()=>f.service.get('synthetic-b',f.member.id,d.id));const other=await f.members.create({accountId:'synthetic-a',name:'其他人物',relationship:'other'});await assert.rejects(()=>f.service.get('synthetic-a',other.id,d.id));const edited=await f.service.edit('synthetic-a',f.member.id,d.id,{version:d.version,skipQuestion:d.questions[0].id});assert.equal(edited.questions.length,1);f.fail();await assert.rejects(()=>f.service.prepare('synthetic-a',f.member.id,{id:d.id,version:edited.version,text:'没有呕吐，补充原文'}));const failed=await f.service.get('synthetic-a',f.member.id,d.id);assert.equal(failed.state,'failed');assert.equal(failed.raw,'没有呕吐，补充原文');assert.equal(failed.items[0].fields[0].value,'没有呕吐');await f.service.cancel('synthetic-a',f.member.id,d.id);await assert.rejects(()=>f.service.get('synthetic-a',f.member.id,d.id))})
test('用户改字段不会被重新整理覆盖；保存后一键撤销不删已有重复记录',async t=>{const f=await fixture(t),d=await f.service.prepare('synthetic-a',f.member.id,{text:'没有呕吐'});const edited=await f.service.edit('synthetic-a',f.member.id,d.id,{version:d.version,itemId:d.items[0].id,field:'symptom',value:'只有恶心'});const next=await f.service.prepare('synthetic-a',f.member.id,{id:d.id,version:edited.version,text:'没有呕吐，补充'});assert.equal(next.items[0].fields[0].value,'只有恶心');const saved=await f.service.save('synthetic-a',f.member.id,d.id,{version:next.version,confirmed:true});await f.service.undo('synthetic-a',f.member.id,d.id);await assert.rejects(()=>f.service.records.getOwnedRecord('synthetic-a',saved.result.records[0].recordId))})
test('集中点击只产生一次请求；不同并发输入拒绝而不额外收费',async t=>{
  const f=await fixture(t),original=f.service.model.structured,wait=new Promise(resolve=>setTimeout(resolve,40))
  f.service.model.structured=async(...args)=>{await wait;return original(...args)}
  const input={text:'没有呕吐'},first=f.service.prepare('synthetic-a',f.member.id,input)
  await new Promise(resolve=>setTimeout(resolve,5))
  const duplicate=f.service.prepare('synthetic-a',f.member.id,input)
  await assert.rejects(()=>f.service.prepare('synthetic-a',f.member.id,{text:'另外的输入'}),{code:'AI_DRAFT_IN_PROGRESS'})
  const [a,b]=await Promise.all([first,duplicate]);assert.equal(a.id,b.id);assert.equal(f.calls(),1)
})
test('失败结果不能保存为有效记录；达到可配置请求上限后停止',async t=>{
  const f=await fixture(t);f.service.maxDraftCalls=2
  const d=await f.service.prepare('synthetic-a',f.member.id,{text:'没有呕吐'});f.fail()
  await assert.rejects(()=>f.service.prepare('synthetic-a',f.member.id,{id:d.id,version:d.version,text:'没有呕吐，补充'}))
  const failed=await f.service.read('synthetic-a',f.member.id,d.id)
  await assert.rejects(()=>f.service.save('synthetic-a',f.member.id,d.id,{version:failed.version,confirmed:true}),{status:409})
  await assert.rejects(()=>f.service.prepare('synthetic-a',f.member.id,{id:d.id,version:failed.version,text:'没有呕吐，再补充'}),{code:'AI_DRAFT_CALL_LIMIT'})
  assert.equal(f.calls(),2);assert.equal((await f.service.events.repository.findByAccountId('synthetic-a')).length,0)
})
test('取消后迟到响应不能复活草稿或保存',async t=>{
  const f=await fixture(t),original=f.service.model.structured
  let release;const gate=new Promise(resolve=>{release=resolve});f.service.model.structured=async(...args)=>{await gate;return original(...args)}
  const pending=f.service.prepare('synthetic-a',f.member.id,{text:'没有呕吐'})
  let id;for(let n=0;n<20;n++){id=(await f.service.store.read()).drafts[0]?.id;if(id)break;await new Promise(resolve=>setTimeout(resolve,5))}
  await f.service.cancel('synthetic-a',f.member.id,id);release();await assert.rejects(()=>pending)
  assert.equal((await f.service.store.read()).drafts.length,0)
})
test('不同结果归同次报告并列，不覆盖；撤销新变体不删除旧原件或记录',async t=>{
  const f=await fixture(t);let number='4.2'
  f.service.model.structured=async()=>({value:{items:[{category:'examination',title:'合成检查',subject:'current',archiveCategory:null,relationKey:null,timeText:'2026-09-29',fields:[['institution','测试机构'],['testName','红细胞'],['result',number],['unit','mmol/L']].map(([name,value])=>({name,value,quote:value,sourceId:'input',page:1}))}]},diagnostics:{}})
  const first=await f.service.prepare('synthetic-a',f.member.id,{text:'2026-09-29 测试机构 红细胞 4.2 mmol/L'})
  const saved=await f.service.save('synthetic-a',f.member.id,first.id,{version:first.version,confirmed:true})
  number='4.8';const next=await f.service.prepare('synthetic-a',f.member.id,{text:'2026-09-29 测试机构 红细胞 4.8 mmol/L'})
  const variant=await f.service.save('synthetic-a',f.member.id,next.id,{version:next.version,confirmed:true})
  assert.equal(saved.result.records[0].eventId,variant.result.records[0].eventId)
  assert.equal((await f.service.records.getOwnedRecord('synthetic-a',variant.result.records[0].recordId)).aiProvenance.conflictRecordIds[0],saved.result.records[0].recordId)
  await f.service.undo('synthetic-a',f.member.id,next.id)
  assert.match((await f.service.records.getOwnedRecord('synthetic-a',saved.result.records[0].recordId)).content,/4\.2/)
})
test('删除成员及已保存原记录后，派生草稿不再可恢复',async t=>{
  const f=await fixture(t),d=await f.service.prepare('synthetic-a',f.member.id,{text:'没有呕吐'})
  const saved=await f.service.save('synthetic-a',f.member.id,d.id,{version:d.version,confirmed:true})
  await f.service.records.delete('synthetic-a',saved.result.records[0].recordId)
  await assert.rejects(()=>f.service.read('synthetic-a',f.member.id,d.id),{status:404})
  const next=await f.service.prepare('synthetic-a',f.member.id,{text:'没有呕吐，另一份草稿'})
  await f.members.delete(f.member.id);await f.service.prune()
  assert.ok(!(await f.service.store.read()).drafts.some(x=>x.id===next.id))
})
test('手动时间和类型在后续提取中保持；原时间作为来源不被覆盖',async t=>{
  const f=await fixture(t),d=await f.service.prepare('synthetic-a',f.member.id,{text:'没有呕吐'})
  const edited=await f.service.edit('synthetic-a',f.member.id,d.id,{version:d.version,itemId:d.items[0].id,field:'time',value:'2026-09-29',category:'other'})
  const next=await f.service.prepare('synthetic-a',f.member.id,{id:d.id,version:edited.version,text:'没有呕吐，补充'})
  assert.equal(next.items[0].category,'other');assert.equal(next.items[0].timeText,'2026-09-29');assert.equal(next.items[0].timeEditedBy,'user')
})
test('缺失原文页码必须明确按不完整材料保存，提醒随记录进入来源',async t=>{
  const f=await fixture(t),d=await f.service.prepare('synthetic-a',f.member.id,{text:'没有呕吐'})
  const stored=await f.service.get('synthetic-a',f.member.id,d.id);stored.documentWarnings=['原件缺第2页'];await f.service.write(stored)
  await assert.rejects(()=>f.service.save('synthetic-a',f.member.id,d.id,{version:d.version,confirmed:true}),{code:'AI_DOCUMENT_PAGE_GAP'})
  const edited=await f.service.edit('synthetic-a',f.member.id,d.id,{version:d.version,confirmPageWarnings:true})
  const saved=await f.service.save('synthetic-a',f.member.id,d.id,{version:edited.version,confirmed:true})
  assert.match((await f.service.records.getOwnedRecord('synthetic-a',saved.result.records[0].recordId)).aiProvenance.notice,/缺第2页/)
})
test('同一草稿语音回复达到预算后停止，不影响查看或真实保存',async t=>{
  const f=await fixture(t),d=await f.service.prepare('synthetic-a',f.member.id,{text:'没有呕吐'});f.service.maxDraftCalls=2;let speechCalls=0;f.service.model.speak=async()=>{speechCalls++;return {mimeType:'audio/mpeg',data:'fixture'}}
  await f.service.speak('synthetic-a',f.member.id,d.id);await f.service.speak('synthetic-a',f.member.id,d.id);await assert.rejects(()=>f.service.speak('synthetic-a',f.member.id,d.id),{code:'AI_SPEECH_CALL_LIMIT'});assert.equal(speechCalls,2)
  const saved=await f.service.save('synthetic-a',f.member.id,d.id,{version:d.version,confirmed:true});assert.equal(saved.result.count,1)
})

test('重新识别资料后不能沿用上一版缺页确认',async t=>{
  const f=await fixture(t),d=await f.service.prepare('synthetic-a',f.member.id,{text:'没有呕吐'})
  const edited=await f.service.edit('synthetic-a',f.member.id,d.id,{version:d.version,confirmPageWarnings:true})
  assert.equal(edited.confirmPageWarnings,true)
  const next=await f.service.prepare('synthetic-a',f.member.id,{id:d.id,version:edited.version,text:'没有呕吐，补充材料'})
  assert.equal(next.confirmPageWarnings,false)
  assert.equal((await f.service.get('synthetic-a',f.member.id,next.id)).confirmPageWarnings,false)
})
