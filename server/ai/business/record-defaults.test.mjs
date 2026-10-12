import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { FamilyMemberRepository } from '../../members/repositories/family-member-repository.mjs'
import { AIBusinessService } from './service.mjs'
import { normalizeRoutineActivity } from './extraction-quality.mjs'

async function fixture(t, raw, category='symptom', timeText=null) {
  const directory=await mkdtemp(path.join(os.tmpdir(),'hoooho-record-defaults-'))
  t.after(()=>rm(directory,{recursive:true,force:true}))
  const member=await new FamilyMemberRepository(directory).create({accountId:'synthetic-defaults',name:'合成录入验收',relationship:'child'})
  const model={structured:async()=>({value:{items:[{category,title:'供应商分类',timeText,archiveCategory:null,subject:'current',relationKey:null,fields:[{name:category==='activity'?'activity':'symptom',value:raw,quote:raw,sourceId:'input',page:1}]}]},diagnostics:{provider:'test'}})}
  const service=new AIBusinessService({dataDirectory:directory,model,now:()=>new Date('2026-10-11T16:05:00Z')})
  return {service,member,prepare:input=>service.prepare('synthetic-defaults',member.id,{text:raw,smartRecord:true,...input})}
}

test('晚间无时间晒黑：纠正供应商症状分类，重载和保存均保留录入时分及原话',async t=>{
  const raw='脸晒得有点黑',f=await fixture(t,raw)
  let draft=await f.prepare({confirmOccurrenceTime:true,selectedOccurredAt:'2026-10-11T21:37:42+08:00',timezone:'Asia/Shanghai'})
  for(const state of [draft,await f.service.read('synthetic-defaults',f.member.id,draft.id),await f.service.latest('synthetic-defaults',f.member.id)]) {
    const item=state.items[0]
    assert.equal(item.category,'activity');assert.deepEqual(item.journal.categories,['activity']);assert.equal(item.journal.symptom,undefined)
    assert.equal(item.time.resolvedStart,'2026-10-11T13:37:42.000Z');assert.equal(item.time.precision,'exact');assert.equal(item.time.defaulted,true)
    assert.equal(item.fields[0].value,raw);assert.equal(item.fields[0].sources[0].quote,raw);assert.equal(item.fields[0].name,'symptom')
    assert.ok(!state.questions.some(q=>q.field==='time'||q.field==='location'))
  }
  const saved=await f.service.save('synthetic-defaults',f.member.id,draft.id,{version:draft.version,confirmed:true})
  const record=await f.service.records.getOwnedRecord('synthetic-defaults',saved.result.records[0].recordId)
  assert.equal(record.type,'note');assert.equal(record.occurredAt,'2026-10-11T13:37:42.000Z');assert.equal(record.journal.timePrecision,'exact')
  assert.deepEqual(record.journal.categories,['activity']);assert.equal(record.sourceText,raw);assert.equal(record.journal.outdoorActivity.activityOtherText,raw)
  assert.doesNotMatch(record.content,/症状/)
})

test('独立连续录入保持各自时间；处理跨午夜仍使用原始录入时间',async t=>{
  const f=await fixture(t,'户外散步','activity'),times=['2026-10-11T21:37:42+08:00','2026-10-11T21:41:08+08:00']
  const records=[]
  for(const selectedOccurredAt of times){const d=await f.prepare({selectedOccurredAt});const saved=await f.service.save('synthetic-defaults',f.member.id,d.id,{version:d.version,confirmed:true});records.push(await f.service.records.getOwnedRecord('synthetic-defaults',saved.result.records[0].recordId))}
  assert.deepEqual(records.map(r=>r.occurredAt),times.map(at=>new Date(at).toISOString()))
})

test('明确历史时间和不记得不能被缺省录入时间覆盖，手改分类优先',async t=>{
  const f=await fixture(t,'昨天脸晒得有点黑','symptom','昨天')
  let d=await f.prepare({selectedOccurredAt:'2026-10-11T21:37:42+08:00'})
  assert.equal(d.items[0].time.precision,'day');assert.equal(d.items[0].time.defaulted,undefined);assert.equal(d.items[0].time.resolvedStart,'2026-10-09T16:00:00.000Z')
  d=await f.service.edit('synthetic-defaults',f.member.id,d.id,{version:d.version,itemId:d.items[0].id,field:'time',value:'不记得'})
  assert.equal(d.items[0].time.resolvedStart,null);assert.equal(d.items[0].time.precision,'unknown')
  d=await f.service.edit('synthetic-defaults',f.member.id,d.id,{version:d.version,itemId:d.items[0].id,category:'symptom'})
  assert.equal(d.items[0].category,'symptom')
})

test('晒伤和其他不适仍是症状；普通散步不能吞掉恶心或否定观察',()=>{
  for(const value of ['脸晒得有点黑而且疼','户外散步后恶心','晒黑后不痛不痒','脸晒伤红肿','晒黑后皮肤麻木']){
    const item=normalizeRoutineActivity({category:'symptom',archiveCategory:null,fields:[{name:'symptom',value}]})
    assert.equal(item.category,'symptom');assert.equal(item.fields[0].value,value)
  }
})

test('上传资料未知时间不替换成上传时刻，陪同文字的录入时间只用于文字事项',async t=>{
  const f=await fixture(t,'脸晒得有点黑')
  const draft={smartRecord:true,selectedOccurredAt:'2026-10-11T13:37:42.000Z',referenceNow:'2026-10-11T16:05:00Z',timezone:'Asia/Shanghai',documents:[{id:'document'}]}
  const item=sourceId=>({category:'activity',timeText:null,fields:[{name:'activity',value:'脸晒得有点黑',sources:[{sourceId,quote:'脸晒得有点黑'}]}]})
  assert.equal(f.service.resolve(item('document'),draft).time.resolvedStart,null)
  assert.equal(f.service.resolve(item('input'),draft).time.resolvedStart,draft.selectedOccurredAt)
})
