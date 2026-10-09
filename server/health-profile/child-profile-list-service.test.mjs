import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {randomUUID} from 'node:crypto'
import {FamilyMemberRepository} from '../members/repositories/family-member-repository.mjs'
import {ChildProfileListService,vaccinationAgeGroup} from './child-profile-list-service.mjs'
import {matchProfileRecord} from '../ai/business/profile-batch-match.mjs'
import {validateJournal,projectJournalRecord} from '../events/journal-metadata.mjs'
import {FamilyMemberService} from '../members/family-member-service.mjs'
import {AccountDataService} from '../account/account-data-service.mjs'
async function setup(t){
  const directory=await mkdtemp(path.join(os.tmpdir(),'hoooho-inline-profile-'));t.after(()=>rm(directory,{recursive:true,force:true}))
  const service=new ChildProfileListService({dataDirectory:directory,now:()=>new Date('2026-10-05T02:00:00Z')})
  const members=new FamilyMemberRepository(directory),child=await members.create({accountId:'a',name:'合成孩子',birthday:'2024-12-20',gender:'female',relationship:'child'}),other=await members.create({accountId:'b',name:'另一账号',birthday:'2024-12-20',gender:'female',relationship:'child'})
  const command=(kind,input)=>service.command('a',child.id,kind,{key:randomUUID(),...input})
  const seed=(kind,records)=>service.sections.update(data=>({...data,sections:[...data.sections,{accountId:'a',memberId:child.id,sectionId:kind,revision:1,records}]}))
  return {service,child,other,command,seed}
}
test('接种年龄用生日周年及纯日期，缺失和超龄不猜测',()=>{
  assert.equal(vaccinationAgeGroup('2024-12-20','2025-12-19'),'1岁内')
  assert.equal(vaccinationAgeGroup('2024-12-20','2025-12-20'),'1岁')
  assert.equal(vaccinationAgeGroup('2020-02-29','2021-02-28'),'1岁内')
  assert.equal(vaccinationAgeGroup('2020-02-29','2021-03-01'),'1岁')
  assert.equal(vaccinationAgeGroup('2010-01-01','2026-01-01'),'7岁及以上')
  assert.equal(vaccinationAgeGroup('','2026-01-01'),'年龄待确认')
  assert.equal(vaccinationAgeGroup('2024-12-20','','2岁'),'2岁')
  assert.equal(vaccinationAgeGroup('2024-12-20','2024-12-19'),'年龄待确认')
})
test('旧序列化移除隐藏行后撤销按身份恢复，不覆盖原位置上的另一条',async t=>{
  const {service,child,command,seed}=await setup(t)
  await seed('allergy',[{id:'first',name:'牛奶',category:'food',currentStatus:'confirmed',attachmentIds:['original']},{id:'next',name:'花生',category:'food',currentStatus:'confirmed'}])
  const row=(await service.list('a',child.id,'allergy')).rows[0]
  const deleted=await command('allergy',{action:'delete',id:row.id,version:row.version})
  await service.sections.update(data=>({...data,sections:data.sections.map(s=>({...s,records:s.records.filter(r=>r.id!=='first')}))}))
  const restored=await command('allergy',{action:'restore',undoId:deleted.undoId})
  assert.deepEqual(restored.rows.map(r=>r.name).sort(),['牛奶','花生'].sort())
  assert.deepEqual((await service.sections.read()).sections[0].records.find(r=>r.id==='first').attachmentIds,['original'])
})
test('新增关系/撤销和幂等状态随成员及账号删除清理，其他孩子不受影响',async t=>{
  const {service,child,other,command}=await setup(t)
  await command('family-history',{action:'relation',name:'姑姑'})
  await service.command('b',other.id,'family-history',{action:'relation',name:'姐姐',key:randomUUID()})
  await new FamilyMemberService({dataDirectory:service.directory}).delete('a',child.id)
  let state=await service.state.read();assert.equal(state.members.some(s=>s.memberId===child.id),false);assert.equal(state.requests.some(s=>s.memberId===child.id),false);assert.equal(state.members.some(s=>s.memberId===other.id),true)
  await new AccountDataService({dataDirectory:service.directory}).deleteAccount('b')
  state=await service.state.read();assert.deepEqual(state.members,[]);assert.deepEqual(state.requests,[])
})
test('过敏只展示明确五类：待排查和未分类原数据保留；局部更新及撤销不损失来源',async t=>{
  const {service,child,command,seed}=await setup(t)
  const originals=[{id:'confirmed',name:'牛奶',currentStatus:'confirmed',category:'food',tests:[{id:'test',value:'原报告值'}],attachmentIds:['existing'],sourceType:'clinician'},{id:'pending',name:'鸡蛋',category:'food',currentStatus:'investigating',reaction:'原症状'},{id:'unknown',name:'尘螨',currentStatus:'confirmed',category:'unknown'}]
  await seed('allergy',originals)
  let list=await service.list('a',child.id,'allergy');assert.equal(list.rows.length,1);assert.equal(list.compatibility.pendingAllergies,1);assert.deepEqual(list.pendingAllergyRows,[{id:'pending',name:'鸡蛋',group:'食物'}]);assert.equal(list.compatibility.confirmedUnknownCategory,1)
  list=await command('allergy',{action:'edit',id:'confirmed',version:list.rows[0].version,name:'牛奶蛋白',group:'食物'})
  let raw=(await service.sections.read()).sections[0].records;assert.deepEqual(raw[0].tests,originals[0].tests);assert.deepEqual(raw[0].attachmentIds,['existing']);assert.deepEqual(raw[1],originals[1])
  await command('allergy',{action:'add',name:'花生',group:'食物'});await assert.rejects(()=>command('allergy',{action:'add',name:' 花生 ',group:'食物'}),/已有/)
  list=await command('allergy',{action:'delete',id:'confirmed',version:list.rows[0].version});assert.equal(list.rows.some(r=>r.id==='confirmed'),false)
  list=await command('allergy',{action:'restore',undoId:list.undoId});assert.equal(list.rows.some(r=>r.id==='confirmed'),true)
  raw=(await service.sections.read()).sections[0].records;assert.equal(raw[0].sourceType,'clinician');assert.equal(raw[1].currentStatus,'investigating')
})
test('慢性五频率持久化，旧频率及其他详细字段编辑名称时不被覆盖',async t=>{
  const {service,child,command,seed}=await setup(t)
  await seed('chronic',[{id:'old',name:'长期问题',frequency:'偶尔',note:'保留说明',bodyLocations:[{id:'原位置'}]}])
  let list=await service.list('a',child.id,'chronic'),row=list.rows[0]
  list=await command('chronic',{action:'edit',id:row.id,version:row.version,name:'新的描述',group:row.group})
  assert.equal(list.rows[0].frequency,'偶尔');assert.equal((await service.sections.read()).sections[0].records[0].note,'保留说明')
  for(const frequency of ['每天','每周','每月','每季度','每年']){row=list.rows[0];list=await command('chronic',{action:'edit',id:row.id,version:row.version,name:row.name,group:row.group,frequency});assert.equal((await service.list('a',child.id,'chronic')).rows[0].frequency,frequency)}
  await assert.rejects(()=>command('chronic',{action:'edit',id:row.id,version:row.version,name:row.name,group:row.group,frequency:'错误'}))
  await command('chronic',{action:'add',name:'哮喘',group:'呼吸道'});await assert.rejects(()=>command('chronic',{action:'add',name:'哮喘',group:'呼吸道'}),/已有/)
})
test('家族默认四关系与空自定义关系持久化、稳定ID；旧多问题逐条保留',async t=>{
  const {service,child,command,seed}=await setup(t)
  await seed('family-history',[{id:'old',relationship:'其他',customRelationship:'姑姑',note:'旧备注',healthIssues:[{id:'i1',name:'鼻炎',certainty:'明确',onset:'40岁'},{id:'i2',name:'哮喘'}]}])
  let list=await service.list('a',child.id,'family-history');assert.deepEqual(list.groups.slice(0,4).map(g=>g.name),['父亲','母亲','祖父','祖母']);assert.equal(list.rows.length,2)
  list=await command('family-history',{action:'relation',name:' 姐姐 '});const id=list.groups.at(-1).id
  assert.equal((await service.list('a',child.id,'family-history')).groups.at(-1).id,id)
  await assert.rejects(()=>command('family-history',{action:'relation',name:'姐姐'}),/存在/)
  await command('family-history',{action:'add',name:'湿疹',group:id});await assert.rejects(()=>command('family-history',{action:'add',name:'湿疹',group:id}),/已有/)
  const row=list.rows[0];list=await command('family-history',{action:'edit',id:row.id,version:row.version,name:'过敏性鼻炎',group:row.group})
  const raw=(await service.sections.read()).sections[0].records[0];assert.equal(raw.note,'旧备注');assert.equal(raw.healthIssues[0].onset,'40岁');assert.equal(raw.healthIssues[1].name,'哮喘')
  list=await command('family-history',{action:'delete',id:list.rows[0].id,version:list.rows[0].version});assert.equal(list.rows.some(r=>r.name==='过敏性鼻炎'),false)
  list=await command('family-history',{action:'restore',undoId:list.undoId});assert.equal(list.rows.some(r=>r.name==='过敏性鼻炎'),true)
})
test('手术合并全部分类，无空条目，允许同名不同次且保留旧麻醉原件',async t=>{
  const {service,child,command,seed}=await setup(t)
  await seed('surgery',[{id:'s1',name:'同名手术',category:'腿',anesthesia:'原麻醉',date:'2024-01-01',attachments:['原附件']},{id:'s2',name:'另一手术',category:'头'},{id:'blank',name:''}])
  let list=await service.list('a',child.id,'surgery');assert.equal(list.rows.length,2);assert.equal(list.groups.length,0)
  list=await command('surgery',{action:'add',name:'同名手术',group:''});assert.equal(list.rows.length,3)
  const row=list.rows[0];await command('surgery',{action:'edit',id:row.id,version:row.version,name:'修正名称',group:''})
  const raw=(await service.sections.read()).sections[0].records[0];assert.equal(raw.anesthesia,'原麻醉');assert.equal(raw.date,'2024-01-01');assert.deepEqual(raw.attachments,['原附件'])
  await assert.rejects(()=>command('surgery',{action:'add',name:' ',group:''}),/填写/)
})
test('疫苗复用journal：缺日期暂记、同名多次、单项日历日期、旧剂次附件和其他疫苗不被覆盖',async t=>{
  const {service,child,command}=await setup(t)
  let list=await command('vaccination',{action:'add',name:'乙肝疫苗',group:'2岁',date:''});const first=list.rows[0]
  assert.equal(first.date,'');assert.equal(first.group,'2岁')
  const key=randomUUID();await command('vaccination',{action:'add',name:'乙肝疫苗',group:'1岁',date:'2026-09-29',key});list=await command('vaccination',{action:'add',name:'乙肝疫苗',group:'1岁',date:'2026-09-29',key});assert.equal(list.rows.length,2)
  list=await command('vaccination',{action:'edit',id:first.id,version:first.version,name:first.name,group:first.group,date:'2025-12-19'});assert.match(list.notice,/1岁内/);assert.equal(list.rows.find(r=>r.id===first.id).date,'2025-12-19')
  const record=(await service.records.findByAccountId('a')).find(r=>first.id.startsWith(r.id)),journal=structuredClone(record.journal)
  Object.assign(journal.vaccination.items[0],{doseSequence:'dose_2',manufacturerName:'原企业',batchNumber:'原批号'})
  journal.vaccination.items.push({id:'second',vaccineName:'另一疫苗',doseSequence:'dose_1'})
  await service.records.update(record.id,{journal,aiProvenance:{attachmentIds:['original']}})
  list=await service.list('a',child.id,'vaccination');let row=list.rows.find(r=>r.id===first.id)
  list=await command('vaccination',{action:'edit',id:row.id,version:row.version,name:row.name,group:row.group,date:'2025-12-20'})
  const current=await service.records.findById(record.id);assert.equal(current.journal.vaccination.items[1].administeredOn,undefined);assert.equal(current.journal.vaccination.items[0].batchNumber,'原批号');assert.deepEqual(current.aiProvenance.attachmentIds,['original'])
  const receipt={category:'vaccination',time:{resolvedStart:'2025-12-20T00:00:00+08:00',precision:'day'},journal:{vaccination:{items:[{vaccineName:'乙肝疫苗',doseSequence:'dose_2'}]}}}
  assert.equal(matchProfileRecord([current],receipt)?.id,current.id)
  list=await command('vaccination',{action:'delete',id:row.id,version:list.rows.find(r=>r.id===row.id).version});assert.equal(projectJournalRecord(await service.records.findById(record.id)).journal.vaccination.items.length,1)
  list=await command('vaccination',{action:'restore',undoId:list.undoId});assert.equal(list.rows.some(r=>r.id===first.id),true)
  assert.throws(()=>validateJournal({categories:['vaccination'],vaccination:{items:[{id:'x',vaccineName:'x',doseSequence:'unknown',administeredOn:'2026-02-30'}]}}))
})
test('所有读写与恢复校验成员；冲突/失败不丢数据，重复提交只有一条',async t=>{
  const {service,child,other,command}=await setup(t)
  for(const kind of ['allergy','chronic','family-history','surgery','vaccination'])await assert.rejects(()=>service.list('a',other.id,kind))
  const key=randomUUID();await command('surgery',{action:'add',name:'唯一手术',group:'',key});let list=await command('surgery',{action:'add',name:'唯一手术',group:'',key});assert.equal(list.rows.length,1)
  const row=list.rows[0];await command('surgery',{action:'edit',id:row.id,version:row.version,name:'一次修改',group:''})
  await assert.rejects(()=>command('surgery',{action:'edit',id:row.id,version:row.version,name:'过期修改',group:''}),/记录已更新/)
  list=await service.list('a',child.id,'surgery');assert.equal(list.rows[0].name,'一次修改')
  await assert.rejects(()=>service.command('a',other.id,'surgery',{action:'add',name:'错账号',key:randomUUID()}))
})
