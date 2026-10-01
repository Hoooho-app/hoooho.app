import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { FamilyMemberRepository } from '../../members/repositories/family-member-repository.mjs'
import { AIBusinessService } from './service.mjs'
import { archiveItem } from './archive.mjs'
import { buildJournal, validateExtraction } from './contract.mjs'

const item = (archiveCategory, fields, category='other') => ({ id:'i', archiveCategory, category, title:'原话', timeText:null, time:{precision:'unknown'}, fields:Object.entries(fields).map(([name,value])=>({name,value,sources:[]})) })
test('家族信息归入成员家族史，不生成孩子诊断；接种信息使用既有 journal 格式', () => {
  const family = item('family-history',{relationship:'父亲',historyName:'疑似哮喘'})
  const sections = archiveItem([],family,{accountId:'a',memberId:'m',eventId:'e',recordId:'r',attachmentIds:['f'],now:new Date()})
  assert.equal(sections[0].sectionId,'family-history')
  assert.equal(sections[0].records[0].healthIssues[0].certainty,'待确认')
  assert.equal(sections[0].records[0].relationship,'父亲')
  const vaccine = buildJournal(item('vaccination',{vaccineName:'乙肝疫苗',doseOriginal:'第2剂'},'vaccination'))
  assert.equal(vaccine.vaccination.items[0].vaccineName,'乙肝疫苗')
  assert.equal(vaccine.vaccination.items[0].doseSequence,'dose_2')
})
test('异常指标不能仅通过模型栏目进入慢性病史，疑似过敏不成为已明确', () => {
  const context={accountId:'a',memberId:'m',eventId:'e',recordId:'r',attachmentIds:[],now:new Date()}
  assert.deepEqual(archiveItem([],item('chronic',{testName:'嗜酸性粒细胞',result:'升高'},'examination'),context),[])
  const allergy=archiveItem([],item('allergy',{allergen:'牛奶',allergyStatus:'疑似',doctorStatement:'医生建议排查'},'examination'),context)
  assert.equal(allergy[0].records[0].currentStatus,'investigating')
})
test('family/vaccine extraction remains source grounded and respects other-member scope', () => {
  const output={items:[{category:'other',subject:'current',title:'家族史',archiveCategory:'family-history',timeText:null,relationKey:null,fields:[{name:'relationship',value:'父亲',sourceId:'f',page:1,quote:'父亲哮喘'},{name:'historyName',value:'哮喘',sourceId:'f',page:1,quote:'父亲哮喘'}]}]}
  assert.equal(validateExtraction(output,[{id:'f',page:1,text:'父亲哮喘'}]).length,1)
  output.items[0].subject='other'
  assert.equal(validateExtraction(output,[{id:'f',page:1,text:'父亲哮喘'}]).length,0)
})
test('同一来源重复归档幂等，保留用户已有过敏属性与状态',()=>{
  const existing=[{accountId:'a',memberId:'m',sectionId:'allergy',revision:1,records:[{id:'a1',memberId:'m',name:'牛奶',category:'food',currentStatus:'excluded',customName:'用户命名',sourceLabel:'用户记录',dietaryAction:'原有说明',history:[]}]}]
  const context={accountId:'a',memberId:'m',eventId:'e',recordId:'r',attachmentIds:[],now:new Date()}
  const once=archiveItem(existing,item('allergy',{allergen:'牛奶',allergyStatus:'待排查'}),context)
  assert.equal(once[0].records[0].currentStatus,'excluded');assert.equal(once[0].records[0].sourceLabel,'用户记录')
  assert.equal(once[0].records[0].customName,'用户命名');assert.deepEqual(archiveItem(once,item('allergy',{allergen:'牛奶'}),context),once)
})
test('失败原件可手动保留，取消不写正式档案，跨成员拒绝，保存重试幂等',async t=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'hp-smart-'));t.after(()=>rm(directory,{recursive:true,force:true}))
  const members=new FamilyMemberRepository(directory),member=await members.create({accountId:'a',name:'合成孩子',relationship:'child'})
  const service=new AIBusinessService({dataDirectory:directory,model:{structured:async()=>{throw Object.assign(new Error('识别不可用'),{status:503})}}})
  const bytes=await sharp({create:{width:20,height:20,channels:3,background:'#ffffff'}}).png().toBuffer()
  await assert.rejects(()=>service.prepare('a',member.id,{files:[{name:'合成资料.png',mimeType:'image/png',dataUrl:`data:image/png;base64,${bytes.toString('base64')}`}]}))
  const d=await service.latest('a',member.id);assert.equal(d.state,'failed');assert.equal(d.pages.length,1)
  await assert.rejects(()=>service.read('other',member.id,d.id))
  assert.equal((await service.events.repository.findByAccountId('a')).length,0)
  const manual=await service.edit('a',member.id,d.id,{version:d.version,manualOriginal:true})
  assert.equal(manual.state,'ready')
  const saved=await service.save('a',member.id,d.id,{version:manual.version,confirmed:true})
  assert.equal((await service.attachments.findByEventId(saved.result.records[0].eventId)).length,1)
  assert.equal((await service.profiles.read()).sections.length,0)
  const repeated=await service.save('a',member.id,d.id,{version:manual.version,confirmed:true})
  assert.deepEqual(repeated.result,saved.result)
  const draft=await service.prepare('a',member.id,{text:'手动补充'}).catch(()=>service.latest('a',member.id))
  await service.cancel('a',member.id,draft.id)
  assert.equal((await service.events.repository.findByAccountId('a')).length,1)
})
test('相关档案保存前强制核对差异，归档后不覆盖用户已有内容',async t=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'hp-conflict-'));t.after(()=>rm(directory,{recursive:true,force:true}))
  const member=await new FamilyMemberRepository(directory).create({accountId:'a',name:'合成孩子',relationship:'child'})
  const service=new AIBusinessService({dataDirectory:directory,model:{structured:async()=>({value:{items:[{category:'other',archiveCategory:'chronic',subject:'current',title:'事项',timeText:null,relationKey:null,fields:[{name:'historyName',value:'哮喘',quote:'哮喘',sourceId:'input',page:1}]}]},diagnostics:{}})}})
  await service.profiles.update(()=>({sections:[{accountId:'a',memberId:member.id,sectionId:'chronic',revision:1,records:[{id:'existing',name:'哮喘',note:'用户原有管理情况'}]}]}))
  const initial=await service.prepare('a',member.id,{text:'哮喘'})
  const draft=await service.prepare('a',member.id,{text:'哮喘',reviewArchives:true})
  assert.equal(draft.id,initial.id);assert.equal(draft.version,initial.version+1)
  assert.equal(draft.conflicts.length,1)
  await assert.rejects(()=>service.save('a',member.id,draft.id,{version:draft.version,confirmed:true}),{code:'AI_ARCHIVE_REVIEW_REQUIRED'})
  const reviewed=await service.edit('a',member.id,draft.id,{version:draft.version,confirmConflicts:true})
  await service.save('a',member.id,draft.id,{version:reviewed.version,confirmed:true})
  assert.equal((await service.profiles.read()).sections[0].records[0].note,'用户原有管理情况')
})
