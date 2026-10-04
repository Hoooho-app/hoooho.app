import test from 'node:test'
import assert from 'node:assert/strict'
import { matchProfileRecord, supplementJournal, uncertainVaccineAssociation } from './profile-batch-match.mjs'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { FamilyMemberRepository } from '../../members/repositories/family-member-repository.mjs'
import { AIBusinessService } from './service.mjs'

const item={category:'vaccination',time:{resolvedStart:'2026-09-28T16:00:00.000Z',precision:'day'},journal:{vaccination:{items:[{vaccineName:'乙肝疫苗',doseSequence:'dose_2',batchNumber:'新增批号'}]}},fields:[]}
const record={id:'manual',occurredAt:'2026-09-29T02:00:00Z',content:'用户原文',journal:{categories:['vaccination'],vaccination:{institutionName:'手动机构',items:[{id:'v',vaccineName:'乙肝疫苗',doseSequence:'dose_2',manufacturerName:'手动企业'}]}}}
test('同日同剂次回执匹配手动接种，不同日期/剂次及多候选不关联',()=>{
  assert.equal(matchProfileRecord([record],item,'Asia/Shanghai')?.id,'manual')
  assert.equal(matchProfileRecord([{...record,occurredAt:'2026-09-30T02:00:00Z'}],item),null)
  assert.equal(matchProfileRecord([record],{...item,journal:{vaccination:{items:[{vaccineName:'乙肝疫苗',doseSequence:'dose_3'}]}}}),null)
  assert.equal(matchProfileRecord([record,{...record,id:'ambiguous'}],item),null)
  assert.equal(matchProfileRecord([record],{...item,time:{precision:'unknown'}}),null)
  assert.equal(uncertainVaccineAssociation([record],{...item,time:{precision:'unknown'}}),true)
  assert.equal(uncertainVaccineAssociation([record],{...item,journal:{vaccination:{items:[{vaccineName:'乙肝疫苗',doseSequence:'dose_3'}]}}}),false)
})
test('仅补缺失字段，不改手动内容、已有字段及另一剂次',()=>{
  const supplemented=supplementJournal(record.journal,item.journal)
  assert.equal(supplemented.vaccination.institutionName,'手动机构')
  assert.equal(supplemented.vaccination.items[0].manufacturerName,'手动企业')
  assert.equal(supplemented.vaccination.items[0].batchNumber,'新增批号')
  assert.equal(supplemented.vaccination.items[0].id,'v')
  assert.equal(record.journal.vaccination.items[0].batchNumber,undefined)
})
test('其他病史不能只因名称相同匹配；日期和机构等事实需一致',()=>{
  const facts=[{name:'historyName',value:'阑尾切除术'},{name:'institution',value:'合成医院'}]
  const i={category:'other',archiveCategory:'surgery',time:item.time,fields:facts}
  const r={...record,aiProvenance:{category:'other',archiveCategory:'surgery',fields:facts}}
  assert.equal(matchProfileRecord([r],i)?.id,'manual')
  assert.equal(matchProfileRecord([r],{...i,fields:[facts[0]]}),null)
})
test('真实事务：手动疫苗回执仅关联原件，幂等、跨成员、不同剂次与失败重试',async t=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'profile-batch-'));t.after(()=>rm(directory,{recursive:true,force:true}))
  const repo=new FamilyMemberRepository(directory),child=await repo.create({accountId:'a',name:'合成孩子',relationship:'child'}),other=await repo.create({accountId:'a',name:'合成另一孩子',relationship:'child'})
  let dose='第2剂',fail=false,calls=0
  const service=new AIBusinessService({dataDirectory:directory,model:{structured:async({task,input})=>{
    calls++;if(fail)throw new Error('合成服务失败')
    const text=`2026-09-29 乙肝疫苗 ${dose} 新增批号`
    if(task==='document-page')return {value:{status:'readable',text},diagnostics:{provider:'test'}}
    const source=JSON.parse(input).sources[0]
    return {value:{items:[{category:'vaccination',subject:'current',title:'接种',archiveCategory:'vaccination',timeText:'2026-09-29',relationKey:null,fields:Object.entries({vaccineName:'乙肝疫苗',doseOriginal:dose,batchNumber:'新增批号'}).map(([name,value])=>({name,value,quote:value,sourceId:source.id,page:source.page}))}]},diagnostics:{provider:'test'}}
  }}})
  const event=await service.events.create('a',{memberId:child.id,title:'手动接种',category:'other',startTime:record.occurredAt})
  const manual=await service.records.create('a',event.id,{type:'note',occurredAt:record.occurredAt,content:record.content,journal:record.journal,sourceType:'text_record'})
  const bytes=await sharp({create:{width:20,height:20,channels:3,background:'#fff'}}).png().toBuffer(),files=[{name:'合成回执.png',mimeType:'image/png',dataUrl:`data:image/png;base64,${bytes.toString('base64')}`}]
  let draft=await service.prepare('a',child.id,{profileBatch:true,task:'archive',files})
  await assert.rejects(()=>service.save('a',other.id,draft.id,{version:draft.version,confirmed:true}))
  const saved=await service.save('a',child.id,draft.id,{version:draft.version,confirmed:true})
  assert.equal(saved.result.records[0].recordId,manual.id)
  assert.equal((await service.records.repository.findByAccountId('a')).length,1)
  assert.equal((await service.records.repository.findById(manual.id)).content,'用户原文')
  assert.equal((await service.attachments.findByEventId(event.id)).length,1)
  assert.deepEqual((await service.save('a',child.id,draft.id,{version:draft.version,confirmed:true})).result,saved.result)
  dose='第3剂';draft=await service.prepare('a',child.id,{profileBatch:true,task:'archive',files})
  await service.save('a',child.id,draft.id,{version:draft.version,confirmed:true})
  assert.equal((await service.records.repository.findByAccountId('a')).length,2)
  fail=true;await assert.rejects(()=>service.prepare('a',other.id,{profileBatch:true,files}))
  const failed=await service.latest('a',other.id);assert.equal(failed.state,'failed');assert.equal(failed.pages.length,1)
  const before=calls;await assert.rejects(()=>service.prepare('a',other.id,{profileBatch:true,files:[{...files[0],mimeType:'image/png',dataUrl:'data:image/png;base64,'+Buffer.from('video payload').toString('base64')}]}));assert.equal(calls,before)
  fail=false;const retry=await service.prepare('a',other.id,{id:failed.id,version:failed.version,profileBatch:true,files})
  await service.cancel('a',other.id,retry.id)
  assert.equal((await service.records.repository.findByAccountId('a')).length,2)
})
