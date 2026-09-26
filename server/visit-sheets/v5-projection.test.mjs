import test from 'node:test'
import assert from 'node:assert/strict'
import {buildVisitSheet} from './report-model.mjs'
import {visitFixture} from './fixtures.mjs'
const now=new Date('2026-09-26T00:00:00Z')
const section=(r,id)=>r.chapters.find(c=>c.id===id)

test('只有未来用药计划或空观察过程仍有真实来源，不算空资料',()=>{
  const f=visitFixture();f.records=[];f.growth=[];f.attachments=[];f.facts=[];f.profiles=[];f.events=[]
  f.reminders[0].occurrences=f.reminders[0].occurrences.map(o=>({...o,scheduledAt:'2030-01-01T08:00:00Z',completed:false,completion:null}))
  f.tasks[0].records=[]
  const r=buildVisitSheet(f,{},now)
  assert.ok(r.sources.some(s=>s.id.startsWith('medication-plan:')))
  assert.ok(r.sources.some(s=>s.id.startsWith('observation-plan:')))
  assert.ok(section(r,'medication').blocks.every(b=>b.sourceIds.length))
  assert.equal(r.focusSourceIds.length,0)
})

test('执行确认与关联记录时间冲突可追溯，删除关联记录不保留链接',()=>{
  const f=visitFixture(),o=f.reminders[0].occurrences.find(o=>o.completed)
  o.completion.completedAt='2026-09-26T01:00:00Z'
  const linked=f.records.find(r=>r.id===o.completion.recordId);linked.occurredAt='2026-09-25T01:00:00Z'
  let r=buildVisitSheet(f,{},now),s=r.sources.find(s=>s.id===`dose:${o.id}`)
  assert.equal(s.createdAt,o.completion.completedAt);assert.match(s.text,/与执行确认时间不同/)
  f.records=f.records.filter(r=>r.id!==linked.id)
  r=buildVisitSheet(f,{},now);s=r.sources.find(s=>s.id===`dose:${o.id}`)
  assert.equal(s.recordId,undefined);assert.match(s.text,/关联的使用记录已失效/)
})
test('v5 九章顺序、首章无装饰构成，资料完整无演示常量',()=>{
  const r=buildVisitSheet(visitFixture(),{},now)
  assert.deepEqual(r.chapters.map(c=>c.title),['病情数据','病程与变化','用药与处理','过敏与饮食观察','既往与相关背景','体温记录','成长与日常','就诊与检查','附件与完整依据'])
  assert.ok(!section(r,'overview').blocks.some(b=>b.distribution))
  assert.equal(new Set(r.sources.map(s=>s.code)).size,r.sources.length)
  assert.ok(r.sources.every(s=>s.destinations.includes('sources')))
  const ids=new Set(r.sources.map(s=>s.id))
  for(const c of r.chapters)for(const b of c.blocks){assert.ok(b.sourceIds.every(id=>ids.has(id)));for(const p of b.points??[])assert.ok(ids.has(p.sourceId));for(const e of b.entries??[])assert.ok(e.sourceIds.every(id=>ids.has(id)))}
  assert.ok(section(r,'medication').blocks.some(b=>b.lines.some(line=>line.includes('途径 口服'))))
})
test('默认照片保存、不静默替换，主题切回恢复、空选保留、无关联不套旧照片',()=>{
  const f=visitFixture();f.attachments=Array.from({length:4},(_,i)=>({id:`p${i}`,recordId:'s7',eventId:'event-a',mimeType:'image/png',name:`图${i}`,createdAt:`2026-09-2${i}T00:00:00Z`}))
  const first=buildVisitSheet(f,{},now);assert.equal(first.selectedPhotoIds.length,3)
  f.attachments.push({...f.attachments[0],id:'new',createdAt:'2026-09-25T00:00:00Z'})
  const next=buildVisitSheet(f,first,now);assert.deepEqual(next.selectedPhotoIds,first.selectedPhotoIds)
  const custom=buildVisitSheet(f,{...next,focus:{mode:'custom',text:'完全不同的问题'}},now);assert.equal(custom.selectedPhotoIds.length,0)
  const back=buildVisitSheet(f,{...custom,focus:{mode:'source',sourceId:'record:s7'}},now);assert.deepEqual(back.selectedPhotoIds,first.selectedPhotoIds)
  const empty=buildVisitSheet(f,{...back,photoSelections:{[back.photoKey]:[]}},now);assert.deepEqual(empty.selectedPhotoIds,[])
  assert.ok(first.photos.every(p=>!p.capturedAt&&p.timeKind.includes('上传')))
})
test('同部位不同类别不拼病程，未知/晚录时间不伪造',()=>{
  const f=visitFixture();f.records[7].journal.symptom.symptomCategory='pain'
  const r=buildVisitSheet(f,{},now);assert.deepEqual(r.focusSourceIds,['record:s7'])
  f.records[7].journal.timePrecision='unknown';f.records[7].createdAt='2026-01-01T00:00:00Z'
  const changed=buildVisitSheet(f,{},now);assert.notEqual(changed.complaintSourceId,'record:s7');assert.equal(changed.sources.find(s=>s.id==='record:s7').occurredAt,null)
})
test('否定、未来、其他成员结构化事实不得抢占焦点或温度',()=>{
  const f=visitFixture();f.organizations=[{recordId:'noise',healthAIOutput:{facts:[{type:'symptom',polarity:'negated'},{type:'temperature',subject:'other_person',temperature:{min:40,max:40}}]}}]
  const r=buildVisitSheet(f,{},now);assert.equal(r.complaintSourceId,'record:s7');assert.equal(section(r,'temperature').blocks.flatMap(b=>b.points).length,3)
})
test('同名不同计划/观察分别处理，父级用药途径不会丢失',()=>{
  const f=visitFixture();f.reminders.push({...f.reminders[0],id:'plan-two',plan:{...f.reminders[0].plan,amount:9,route:'topical'},occurrences:[]})
  f.tasks.push({...f.tasks[0],id:'task-two',records:[]})
  f.records.push({id:'medicine-parent',eventId:'event-a',type:'medication',content:'原始药品',occurredAt:'2026-09-24T00:00:00Z',journal:{medication:{administrationRoute:'topical',suggestedBy:'doctor',reasons:['前臂发红'],medications:[{medicationName:'药膏',amountValue:0,amountUnit:'g'}]}}})
  const r=buildVisitSheet(f,{},now),med=section(r,'medication')
  assert.match(med.blocks.find(b=>b.reminderId==='plan-two').lines.join(''),/9 mL.*外用/)
  assert.ok(!med.blocks.find(b=>b.reminderId==='plan').lines.join('').includes('9 mL'))
  assert.equal(section(r,'allergy').blocks.find(b=>b.taskId==='task-two').entries.length,0)
  assert.match(med.blocks.find(b=>b.sourceIds.includes('record:medicine-parent')).lines.join(''),/0 g.*外用.*前臂发红.*医生/)
})
test('混合测量条件、同刻冲突、零值、身长身高分开',()=>{
  const f=visitFixture();f.records.find(r=>r.id==='t0').measurementMethod='ear';f.records.find(r=>r.id==='t1').measurementMethod='axillary';f.records.find(r=>r.id==='t2').measurementMethod='ear';f.records.find(r=>r.id==='t2').occurredAt=f.records.find(r=>r.id==='t0').occurredAt
  f.growth[0].measurementType='length';f.growth[1].measurementType='height';f.growth[2].measurementType='length';f.growth[0].weightKg=0
  const r=buildVisitSheet(f,{},now);assert.equal(section(r,'temperature').blocks.length,2);assert.ok(section(r,'temperature').blocks.some(b=>b.lines.some(l=>l.includes('同一时刻'))));assert.equal(section(r,'growth').blocks.filter(b=>b.points).length,3);assert.equal(section(r,'growth').blocks.find(b=>b.title==='体重').points[0].value,0)
})
test('有内容的就诊与档案、转述身份、嵌套成员、问题来源',()=>{
  const f=visitFixture();f.records.push({id:'visit',eventId:'event-a',type:'visit',content:'复诊资料',occurredAt:'2026-09-25T00:00:00Z',journal:{timePrecision:'unknown',visit:{institutionName:'虚构机构',doctorStatement:'家长转述医生建议观察',examinationTypes:['血常规'],note:'想问后续如何记录？'}}})
  f.profiles=[{sectionId:'allergy',revision:2,records:[{_allergyArchive:{items:[{id:'background',name:'背景资料',memberId:f.member.id,reactions:[{memberId:'other-child',notes:'PRIVATE CHILD'},{notes:'保留本孩子观察'}]}]}}]}]
  const r=buildVisitSheet(f,{},now);assert.ok(!JSON.stringify(r).includes('PRIVATE CHILD'));const b=section(r,'visits').blocks[0];assert.match(b.lines.join(''),/发生：未提供/);assert.match(b.lines.join(''),/家长转述医生建议观察/);assert.equal(r.questionOrigin,'据家长记录整理')
  const edited=buildVisitSheet(f,{question:'我自己写的问题',questionEdited:true},now);assert.equal(edited.questionOrigin,'家长填写')
})
