import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import {mergeNarratedIncidents} from '../../../shared/narrated-incident.mjs'
import {resolveItemTime} from './contract.mjs'
import {AIBusinessService} from './service.mjs'
import {FamilyMemberRepository} from '../../members/repositories/family-member-repository.mjs'

const now='2026-10-17T18:25:37.000Z',timezone='Asia/Shanghai'
const context={referenceNow:now,timezone,resolve:item=>resolveItemTime(item,{referenceNow:now,timezone})}
const input='上嘴唇的那个地方有点那个一个线有点断裂，有出血。\n上传资料。\n然后去医院，医生说没事，但是那个牙齿是需要观察的。'
const field=(name,value,sourceId='input')=>({name,value,sources:[{sourceId,page:1,quote:value}],editedBy:'model'})
const item=(id,category,fields,more={})=>({id,category,fields,timeText:null,archiveCategory:null,relationKey:null,...more})
const fragments=()=>[
  item('injury','symptom',[field('symptom','上嘴唇的那个地方有点那个一个线有点断裂，有出血')]),
  item('upload','activity',[field('activity','上传资料')]),
  item('doctor','examination',[field('result','医生说没事')]),
  item('followup','other',[field('doctorStatement','牙齿是需要观察的')]),
]
const merge=(items,text=input)=>mergeNarratedIncidents(items,[{id:'input',text}],context)

test('one oral injury, attached material, clinician statement and followup remain one occurrence with exact evidence',()=>{
  const before=fragments(),merged=merge(before)
  assert.equal(merged.length,1)
  assert.equal(merged[0].id,'injury')
  assert.deepEqual(merged[0].mergedIds,['upload','doctor','followup'])
  assert.ok(merged[0].fields.some(f=>f.name==='followUp'&&f.value==='牙齿是需要观察的'))
  assert.deepEqual(before,fragments(),'input objects are never mutated')
  for(const f of merged[0].fields)assert.ok(f.sources.every(s=>s.quote.includes(f.value)))
  const sameNames=fragments();sameNames[1].fields=[field('conclusion','上传资料')];sameNames[2].fields=[field('conclusion','医生说没事')]
  assert.equal(merge(sameNames).length,1,'an upload placeholder cannot conflict with a real clinical field')
  const shortStatement=fragments();shortStatement[2].fields=[field('result','没事')]
  assert.equal(merge(shortStatement).length,1,'a short quoted result retains its explicit clinician attribution from the same source clause')
})
test('independent diet, sleep, medication, tests, other episodes and archives never collapse into the clinical narration',()=>{
  const independent=[item('food','diet',[field('food','奶')]),item('sleep','sleep',[field('quality','午睡')]),item('drug','medication',[field('medicationName','药品')]),item('test','examination',[field('testName','血常规'),field('result','正常')]),item('other-symptom','symptom',[field('symptom','咳嗽')]),item('archive','other',[field('doctorStatement','医生说没事')],{archiveCategory:'allergy'})]
  for(const separateItem of independent){const rows=merge([...fragments(),separateItem]);assert.ok(rows.some(i=>i.id===separateItem.id))}
  assert.equal(merge([fragments()[0],fragments()[2]],input+'另外一件事。').length,2)
})
test('same model relation key does not override distinct dates, clocks, source pages or conflicting facts',()=>{
  const [anchor,,,followup]=fragments()
  for(const [a,b] of [['昨天','今天'],['2026-10-17T17:00:00Z','2026-10-17T18:00:00Z'],[null,'昨天']]){
    assert.equal(merge([{...anchor,timeText:a,relationKey:'oral'},{...followup,timeText:b,relationKey:'oral'}]).length,2)
  }
  assert.equal(merge([{...anchor,relationKey:'oral'},{...followup,relationKey:'oral',fields:[field('doctorStatement','牙齿是需要观察的','document-1')]}]).length,2)
  assert.equal(merge([{...anchor,relationKey:'oral'},{...followup,relationKey:'separate-visit'}]).length,2)
  assert.equal(merge([{...anchor,fields:[...anchor.fields,field('result','异常')]},fragments()[2]]).length,2)
})
test('saved smart narration contains one record, three original photos and recording clock; repeated save is idempotent',async t=>{
  const dataDirectory=await mkdtemp(path.join(os.tmpdir(),'hoooho-narrated-incident-'));t.after(()=>rm(dataDirectory,{recursive:true,force:true}))
  const member=await new FamilyMemberRepository(dataDirectory).create({accountId:'synthetic',name:'口腔事件（虚构）',relationship:'child'})
  const model={structured:async request=>request.vision?{value:{text:'本次口腔情况的照片',status:'readable'},diagnostics:{provider:'test'}}:{value:{items:fragments().map(({id,...row})=>({...row,title:'原话',subject:'current',fields:row.fields.map(f=>({name:f.name,value:f.value,quote:f.value,sourceId:'input',page:1}))}))},diagnostics:{provider:'test'}}}
  const service=new AIBusinessService({dataDirectory,model,now:()=>new Date(now),logger:{info(){}}})
  const files=await Promise.all([0,1,2].map(async n=>({name:`original-${n}.png`,mimeType:'image/png',dataUrl:`data:image/png;base64,${(await sharp({create:{width:40,height:40,channels:3,background:{r:n*40,g:50,b:60}}}).png().toBuffer()).toString('base64')}`})))
  const draft=await service.prepare('synthetic',member.id,{text:input,files,smartRecord:true,frontDeskRecord:true,selectedOccurredAt:now})
  assert.equal(draft.items.length,1)
  assert.equal(draft.items[0].time.resolvedStart,now)
  assert.equal(draft.items[0].time.precision,'exact')
  const result=await service.save('synthetic',member.id,draft.id,{version:draft.version,confirmed:true})
  assert.equal(result.result.count,1)
  const saved=await service.records.getOwnedRecord('synthetic',result.result.records[0].recordId)
  assert.equal(saved.sourceText,input)
  assert.match(saved.content,/医生说没事/)
  assert.match(saved.content,/牙齿是需要观察的/)
  assert.equal(saved.occurredAt,now)
  assert.equal((await service.attachments.findByEventId(saved.eventId)).length,3)
  await service.save('synthetic',member.id,draft.id,{version:draft.version,confirmed:true})
  assert.equal((await service.records.repository.findByAccountId('synthetic')).length,1)
})
