import test from 'node:test'
import assert from 'node:assert/strict'
import {buildVisitSheet} from './report-model.mjs'
import {visitFixture} from './fixtures.mjs'
const now=new Date('2026-09-26T00:00:00Z')
test('筛选只隐藏照片，不丢失选择；恢复全部带回原选照片',()=>{
 const f=visitFixture(),first=buildVisitSheet(f,{focus:{mode:'source',sourceId:'record:s0'}},now)
 first.photoSelections[first.photoKey]=['attachment:photo']
 first.photoDetails={'attachment:photo':{label:'已保存的说明',location:'前臂',capturedAt:'2026-09-12',capturePrecision:'day'}}
 const scoped=buildVisitSheet(f,{...first,selection:{eventIds:[f.events[0].id],from:'2026-09-25T00:00:00Z',includeBackground:false}},now)
 assert.deepEqual(scoped.selectedPhotoIds,[])
 const restored=buildVisitSheet(f,{...scoped,selection:undefined},now)
 assert.deepEqual(restored.selectedPhotoIds,['attachment:photo'])
 assert.equal(restored.photos.find(p=>p.sourceId==='attachment:photo').title,'已保存的说明')
 assert.equal(restored.photos.find(p=>p.sourceId==='attachment:photo').capturedAt,'2026-09-12')
 f.attachments=[]
 assert.deepEqual(buildVisitSheet(f,{...restored},now).photoDetails,{})
})
test('确认过敏、待排查与空观察计划分离，技术字段不外露，日常不是成长测量',()=>{
 const f=visitFixture();f.profiles=[{sectionId:'allergy',records:[{name:'确认项',currentStatus:'confirmed'},{name:'疑似项',currentStatus:'suspected',visible:true,group:'food',manuallyAdded:true,needsReview:true}]},{sectionId:'basic',records:[{aboBloodType:'A',rhBloodType:'positive',measurementDate:'2026-09-01'}]}]
 f.tasks[0].records=[]
 f.records.push({id:'daily',eventId:f.events[0].id,type:'note',content:'睡眠记录',occurredAt:'2026-09-25T00:00:00Z',journal:{categories:['sleep']}})
 const r=buildVisitSheet(f,{},now),allergy=r.chapters.find(c=>c.id==='allergy')
 assert.ok(allergy.overview.items.some(i=>i.title==='确认项'))
 assert.ok(!allergy.overview.items.some(i=>i.title==='疑似项'||i.title===f.tasks[0].displayName))
 assert.doesNotMatch(r.sources.map(s=>s.text).join(''),/visible|group|manuallyAdded|needsReview|aboBloodType|档案修订/)
 assert.match(r.sources.map(s=>s.text).join(''),/ABO血型/)
 assert.equal(r.sources.find(s=>s.id==='record:daily').category,'daily')
})
test('v6 概览与完整明细共存，两条病程保留两端，问题只来自当前焦点',()=>{
  const f=visitFixture();f.records[0].content+=' 想问鸡蛋是否有关？'
  const r=buildVisitSheet(f,{focus:{mode:'source',sourceId:'record:s7'}},now)
  assert.equal(r.schemaVersion,6);assert.ok(r.chapters.every(c=>c.overview));assert.equal(r.questionOrigin,'可参考的问题');assert.ok(!r.question.includes('鸡蛋'))
  const two=buildVisitSheet(f,{focus:{mode:'source',sourceId:'record:s0'}},now)
  assert.equal(two.chapters.find(c=>c.id==='course').overview.items.length,2);assert.equal(two.questionOrigin,'据家长记录整理')
  const custom=buildVisitSheet(f,{question:'',questionEdited:true,focus:{mode:'custom',text:'另一个问题'}},now)
  assert.equal(custom.question,'');assert.equal(custom.questionOrigin,'家长填写')
})
test('v6 状态未知不等于归档，周历快照仅含事实字段，未来不会算未用',()=>{
  const f=visitFixture();delete f.tasks[0].status
  const r=buildVisitSheet(f,{},now),allergy=r.chapters.find(c=>c.id==='allergy')
  assert.match(allergy.overview.items.map(i=>i.detail).join(''),/状态未提供/)
  assert.ok(!allergy.blocks.some(b=>b.title.includes('已归档')))
  assert.equal(r.medicationReminders.length,1);assert.equal(r.medicationReminders[0].occurrences.filter(o=>o.completed).length,5)
  assert.ok(!JSON.stringify(r.medicationReminders).includes('accountId'))
  assert.ok(!r.chapters.find(c=>c.id==='medication').overview.items.some(i=>i.title.includes('未来计划')))
})
test('v6 自填主题不默认带图，手工选已有资料可关联而不复制记录',()=>{
  const f=visitFixture(),r=buildVisitSheet(f,{focus:{mode:'custom',text:'皮肤发红'}},now)
  assert.deepEqual(r.selectedPhotoIds,[])
  f.warnings=[];const inputBefore=JSON.stringify(f)
  const saved=buildVisitSheet(f,{...r,photoSelections:{[r.photoKey]:['attachment:photo']}},now)
  assert.equal(JSON.stringify(f),inputBefore,'projection must not change fingerprint inputs')
  assert.deepEqual(saved.selectedPhotoIds,['attachment:photo'])
  const other=buildVisitSheet(f,{...saved,focus:{mode:'custom',text:'皮肤另一个问题'}},now)
  assert.deepEqual(other.selectedPhotoIds,[])
  const back=buildVisitSheet(f,{...other,focus:saved.focus},now);assert.deepEqual(back.selectedPhotoIds,['attachment:photo'])
})
test('v6 所有概览与未来周历引用闭合，凌晨日期按报告时区，旧档案无ID不丢失',()=>{
  const f=visitFixture();f.records[7].occurredAt='2026-09-25T18:30:00Z';f.profiles=[{sectionId:'allergy',records:[{name:'旧过敏资料',currentStatus:'confirmed'}]}]
  const r=buildVisitSheet(f,{},now),ids=new Set(r.sources.map(s=>s.id))
  for(const c of r.chapters)for(const item of c.overview.items)assert.ok(item.sourceIds.every(id=>ids.has(id)))
  for(const reminder of r.medicationReminders)assert.ok(reminder.occurrences.every(o=>ids.has(o.sourceId)))
  assert.match(r.chapters.find(c=>c.id==='course').overview.items.at(-1).detail,/9\/26/)
  assert.equal(r.chapters.find(c=>c.id==='allergy').overview.items[0].title,'旧过敏资料')
})
