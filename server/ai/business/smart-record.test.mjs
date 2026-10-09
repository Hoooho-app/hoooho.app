import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {FamilyMemberRepository} from '../../members/repositories/family-member-repository.mjs'
import {AIBusinessService} from './service.mjs'
const raw='吃了半碗粥，脸颊有点红，没有呕吐，午睡睡了一个小时'
const extracted=[['diet',[['food','粥'],['amount','半碗']]],['symptom',[['symptom','脸颊有点红，没有呕吐'],['location','脸颊']]],['sleep',[['quality','午睡睡了一个小时']]]].map(([category,fields])=>({category,title:category,timeText:null,archiveCategory:null,subject:'current',relationKey:null,fields:fields.map(([name,value])=>({name,value,quote:value,sourceId:'input',page:1}))}))
async function setup(t){const directory=await mkdtemp(path.join(os.tmpdir(),'hoooho-smart-record-'));t.after(()=>rm(directory,{recursive:true,force:true}));const member=await new FamilyMemberRepository(directory).create({accountId:'synthetic',name:'合成测试儿童',relationship:'child'});let calls=0;const model={structured:async()=>{calls++;return {value:{items:structuredClone(extracted)},diagnostics:{provider:'test'}}}};const service=new AIBusinessService({dataDirectory:directory,model,now:()=>new Date('2026-10-09T14:00:00Z')});return {service,member,model,calls:()=>calls}}
test('一段原话拆成饮食、症状、睡眠，同一次情况批量保存，默认时间且原话否定可追溯',async t=>{
 const {service,member,calls}=await setup(t),draft=await service.prepare('synthetic',member.id,{text:raw,smartRecord:true,selectedOccurredAt:'2026-10-09T13:59:00Z'})
 assert.deepEqual(draft.items.map(i=>i.category),['diet','symptom','sleep']);assert.ok(draft.items.every(i=>i.time.defaulted&&i.time.precision==='exact'));assert.ok(!draft.questions.some(q=>q.field==='time'))
 const saved=await service.save('synthetic',member.id,draft.id,{version:draft.version,confirmed:true});assert.equal(saved.result.count,3);assert.equal(new Set(saved.result.records.map(r=>r.eventId)).size,1);assert.equal(calls(),1)
 for(const ref of saved.result.records){const record=await service.records.getOwnedRecord('synthetic',ref.recordId);assert.equal(record.sourceText,raw);assert.equal(record.occurredAt,'2026-10-09T13:59:00.000Z');assert.equal(record.journal.timePrecision,'exact')}
 const symptom=await service.records.getOwnedRecord('synthetic',saved.result.records[1].recordId);assert.match(symptom.content,/没有呕吐/)
 assert.equal((await service.save('synthetic',member.id,draft.id,{version:draft.version,confirmed:true})).result.count,3)
 await service.undo('synthetic',member.id,draft.id);assert.equal((await service.events.repository.findByAccountId('synthetic')).length,0)
})
test('智能记录未来默认时间在模型调用前拒绝，历史时间不被当前时间替换',async t=>{
 const {service,member,model,calls}=await setup(t)
 await assert.rejects(()=>service.prepare('synthetic',member.id,{text:raw,smartRecord:true,selectedOccurredAt:'2026-10-10T00:00:00Z'}),{status:422});assert.equal(calls(),0)
 model.structured=async()=>({value:{items:[{...extracted[1],timeText:'昨天',fields:[{...extracted[1].fields[0],quote:'昨天'+raw}]}]},diagnostics:{}})
 const draft=await service.prepare('synthetic',member.id,{text:'昨天'+raw,smartRecord:true});assert.equal(draft.items[0].time.precision,'day');assert.equal(draft.items[0].time.defaulted,undefined)
})
test('识别中断保留精确草稿及原话，重试沿用同一份草稿',async t=>{
 const {service,member,model}=await setup(t),controller=new AbortController();const original=model.structured
 model.structured=async()=>{controller.abort();throw new DOMException('Interrupted','AbortError')}
 await assert.rejects(()=>service.prepare('synthetic',member.id,{text:raw,smartRecord:true},controller.signal))
 const failed=await service.latest('synthetic',member.id);assert.equal(failed.state,'failed');assert.equal(failed.inputText,raw)
 model.structured=original
 const ready=await service.prepare('synthetic',member.id,{id:failed.id,version:failed.version,text:raw,smartRecord:true});assert.equal(ready.id,failed.id);assert.equal(ready.state,'ready')
})
test('首页护士确认发生时间，保留不确定；随记保存不默认加入跟进',async t=>{
 const {service,member}=await setup(t)
 let draft=await service.prepare('synthetic',member.id,{text:raw,smartRecord:true,confirmOccurrenceTime:true,followUp:false})
 assert.ok(draft.items.every(i=>!i.time.defaulted&&!i.time.resolvedStart));assert.ok(draft.questions.some(q=>q.field==='time'))
 draft=await service.edit('synthetic',member.id,draft.id,{version:draft.version,itemId:draft.items[0].id,field:'time',value:'昨天'})
 assert.equal(draft.items[0].time.precision,'day')
 const saved=await service.save('synthetic',member.id,draft.id,{version:draft.version,confirmed:true}),event=await service.events.get('synthetic',saved.result.records[0].eventId)
 assert.equal(event.caseTracking,false)
 const first=await service.records.getOwnedRecord('synthetic',saved.result.records[0].recordId);assert.equal(first.journal.timePrecision,'period')
 const unknown=await service.records.getOwnedRecord('synthetic',saved.result.records[1].recordId);assert.equal(unknown.journal.timePrecision,'unknown')
})
test('语音原件与拆分记录一起幂等保存，未发给视觉模型；原件移除后不重新附加',async t=>{
 const {service,member}=await setup(t),buffer=Buffer.alloc(1200);buffer.write('RIFF');buffer.write('WAVE',8)
 const voice={name:'原始语音.wav',mimeType:'audio/wav',dataUrl:`data:audio/wav;base64,${buffer.toString('base64')}`}
 let draft=await service.prepare('synthetic',member.id,{text:raw,smartRecord:true,voiceFiles:[voice],files:[]})
 const saved=await service.save('synthetic',member.id,draft.id,{version:draft.version,confirmed:true})
 const attachments=await service.attachments.findByEventId(saved.result.records[0].eventId)
 assert.equal(attachments.length,1);assert.equal(attachments[0].mimeType,'audio/wav');assert.equal(attachments[0].dataUrl,voice.dataUrl)
 await service.save('synthetic',member.id,draft.id,{version:draft.version,confirmed:true});assert.equal((await service.attachments.findByEventId(saved.result.records[0].eventId)).length,1)
 const original=await service.prepare('synthetic',member.id,{text:raw+'。补充',smartRecord:true,voiceFiles:[voice],deferRecognition:true})
 draft=await service.prepare('synthetic',member.id,{id:original.id,version:original.version,text:raw+'。补充',smartRecord:true,selectedOccurredAt:'2026-10-09T13:55:00Z',voiceFiles:[],files:[]})
 const removed=await service.save('synthetic',member.id,draft.id,{version:draft.version,confirmed:true})
 assert.equal((await service.attachments.findByEventId(removed.result.records[0].eventId)).length,0)
})

test('独立随记遇到已有跟进中的相同记录不取消原事项跟进',async t=>{
 const {service,member}=await setup(t)
 let draft=await service.prepare('synthetic',member.id,{text:raw,smartRecord:true,selectedOccurredAt:'2026-10-09T13:59:00Z'})
 const saved=await service.save('synthetic',member.id,draft.id,{version:draft.version,confirmed:true}),id=saved.result.records[0].eventId
 draft=await service.prepare('synthetic',member.id,{text:raw+'，补记',smartRecord:true,followUp:false,selectedOccurredAt:'2026-10-09T13:59:00Z'})
 await service.save('synthetic',member.id,draft.id,{version:draft.version,confirmed:true})
 assert.equal((await service.events.get('synthetic',id)).caseTracking,true)
})
