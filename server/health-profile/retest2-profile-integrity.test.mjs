import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {AuthService} from '../auth/auth-service.mjs'
import {BrowserSessionService} from '../auth/browser-session-service.mjs'
import {ChildProfileListService} from './child-profile-list-service.mjs'
async function fixture(t){
 const directory=await mkdtemp(path.join(os.tmpdir(),'retest2-profile-fix-'));t.after(()=>rm(directory,{recursive:true,force:true}))
 const auth=new AuthService({dataDirectory:directory,tokenSecret:'synthetic-retest2-profile-secret',logger:()=>{}}),browser=new BrowserSessionService(auth),user=await auth.users.createGuest(),headers=new Map(),request={method:'POST',headers:{host:'localhost',origin:'http://localhost','content-type':'application/json'},socket:{encrypted:false}}
 await browser.issue(request,{setHeader:(k,v)=>headers.set(k,v)},user);request.headers.cookie=headers.get('Set-Cookie').split(';')[0]
 const child=await auth.members.create({accountId:user.id,name:'虚构修复验收儿童',relationship:'child'}),service=new ChildProfileListService({dataDirectory:directory})
 const save=(kind,records,revision=0)=>browser.profileSections(request,{memberId:child.id,sectionId:kind,revision,records})
 const cmd=(kind,input)=>service.command(user.id,child.id,kind,{key:randomUUID(),...input})
 const read=async kind=>(await service.sections.read()).sections.find(s=>s.memberId===child.id&&s.sectionId===kind)?.records
 const legacy=(kind,records)=>service.sections.update(data=>({...data,sections:[...data.sections.filter(s=>!(s.accountId===user.id&&s.memberId===child.id&&s.sectionId===kind)),{accountId:user.id,memberId:child.id,sectionId:kind,revision:1,records}]}))
 return {directory,auth,browser,user,request,child,service,save,cmd,read,legacy}
}
test('legacy conditions project without mutation and editing the second issue preserves the first and raw history',async t=>{
 const f=await fixture(t),raw={id:'family',relationship:'父亲',conditions:['高血压','糖尿病'],age:'40多岁',diagnosed:'不确定',note:'长期原话',legacyAttachment:'report-1'}
 await f.save('family-history',[raw]);const file=path.join(f.directory,'health-profile-sections.json'),before=await readFile(file,'utf8')
 let list=await f.service.list(f.user.id,f.child.id,'family-history');assert.deepEqual(list.rows.map(r=>r.name),raw.conditions);assert.equal(await readFile(file,'utf8'),before)
 const second=list.rows[1];list=await f.cmd('family-history',{action:'edit',id:second.id,version:second.version,name:'糖尿病待确认',group:second.group})
 assert.deepEqual(list.rows.map(r=>r.name),['高血压','糖尿病待确认'])
 const stored=(await f.read('family-history'))[0];assert.deepEqual(stored.conditions,raw.conditions);assert.equal(stored.legacyAttachment,raw.legacyAttachment);assert.equal(stored.note,raw.note)
 assert.equal(stored.healthIssues[0].onset,'40多岁');assert.equal(stored.healthIssues[1].onset,'');assert.equal(stored.healthIssues[1].certainty,'')
 const first=list.rows[0],deleted=await f.cmd('family-history',{action:'delete',id:first.id,version:first.version}),restored=await f.cmd('family-history',{action:'restore',undoId:deleted.undoId})
 assert.deepEqual(restored.rows.map(r=>[r.id,r.name]),list.rows.map(r=>[r.id,r.name]))
})
test('moving one legacy condition materializes only on write and leaves other condition with its original relative',async t=>{
 const f=await fixture(t);await f.save('family-history',[{id:'family',relationship:'父亲',conditions:['鼻炎','哮喘'],age:'40岁',note:'旧共享原话'}])
 const list=await f.service.list(f.user.id,f.child.id,'family-history'),row=list.rows[1],mother=list.groups.find(g=>g.name==='母亲').id
 const changed=await f.cmd('family-history',{action:'edit',id:row.id,version:row.version,name:row.name,group:mother})
 assert.equal(changed.rows.find(r=>r.name==='哮喘').group,mother)
 assert.equal(changed.rows.find(r=>r.name==='鼻炎').group,list.groups.find(g=>g.name==='父亲').id)
 const stored=await f.read('family-history');assert.equal(stored.find(r=>r.id==='family').healthIssues[0].name,'鼻炎');assert.equal(stored.find(r=>r.relationId===mother).healthIssues[0].id,'family:legacy-2')
 assert.ok(stored.every(r=>r.note==='旧共享原话'))
})
test('legacy scalar disease keeps its old row identity and optional old fields stay compatible',async t=>{
 const f=await fixture(t);await f.save('family-history',[{id:'family',relationship:'父亲',disease:'鼻炎',onset:'旧起病时间',certainty:'待确认'}])
 const row=(await f.service.list(f.user.id,f.child.id,'family-history')).rows[0];assert.equal(row.id,'family/family:legacy')
 await f.cmd('family-history',{action:'edit',id:row.id,version:row.version,name:'过敏性鼻炎待确认',group:row.group})
 assert.equal((await f.service.list(f.user.id,f.child.id,'family-history')).rows[0].id,row.id)
 const allergy={id:'milk',name:'牛奶',category:'food',currentStatus:'confirmed',reactions:'旧原话',history:['旧历史'],evidenceLinks:['旧引用']};await f.save('allergy',[allergy]);assert.deepEqual((await f.read('allergy'))[0],allergy)
})
test('undo skips malformed legacy neighbours without deleting them or changing valid issue identity',async t=>{
 for(const kind of ['allergy','family-history']){
  const f=await fixture(t),good=kind==='allergy'?{id:'good',name:'牛奶',category:'food',currentStatus:'confirmed'}:{id:'good',name:'鼻炎',onset:'40岁'},outer=kind==='allergy'?{id:'outer',_allergyArchive:{items:[null,good]}}:{id:'outer',relationship:'父亲',healthIssues:[null,good]}
  await f.legacy(kind,[null,outer]);const row=(await f.service.list(f.user.id,f.child.id,kind)).rows[0],deleted=await f.cmd(kind,{action:'delete',id:row.id,version:row.version}),restored=await f.cmd(kind,{action:'restore',undoId:deleted.undoId})
  assert.deepEqual(restored.rows.map(r=>[r.id,r.name]),[[row.id,row.name]])
  const raw=await f.read(kind);assert.equal(raw[0],null);assert.equal((kind==='allergy'?raw[1]._allergyArchive.items:raw[1].healthIssues)[0],null)
 }
})
test('session rejects duplicate explicit, fallback, nested and flattened family IDs atomically',async t=>{
 const inputs=[
  ['surgery',[{id:'dup',name:'第一手术'},{id:'dup',name:'第二手术'}]],
  ['surgery',[{name:'无ID旧项'},{id:'legacy-surgery-1',name:'碰撞旧项'}]],
  ['allergy',[{id:'outer',_allergyArchive:{items:[{id:'dup',name:'牛奶'},{id:'dup',name:'鸡蛋'}]}}]],
  ['allergy',[{id:'flat',name:'牛奶'},{id:'outer',_allergyArchive:{items:[{id:'flat',name:'鸡蛋'}]}}]],
  ['family-history',[{id:'family',relationship:'父亲',healthIssues:[{id:'dup',name:'鼻炎'},{id:'dup',name:'哮喘'}]}]],
  ['family-history',[{id:1,relationship:'父亲',healthIssues:[{id:'issue',name:'鼻炎'}]},{id:'1',relationship:'母亲',healthIssues:[{id:'issue',name:'哮喘'}]}]],
  ['family-history',[{id:'family',relationship:'父亲',healthIssues:[{id:1,name:'鼻炎'},{id:'1',name:'哮喘'}]}]],
  ['family-history',[{id:'a/b',relationship:'父亲',healthIssues:[{id:'c',name:'鼻炎'}]},{id:'a',relationship:'母亲',healthIssues:[{id:'b/c',name:'哮喘'}]}]],
  ['family-history',[{id:1,relationship:'父亲',conditions:['鼻炎']},{id:'1',relationship:'母亲',conditions:['哮喘']}]],
 ]
 for(const [kind,records] of inputs){const f=await fixture(t),before=await f.service.sections.read();await assert.rejects(()=>f.save(kind,records),{status:400,code:'PROFILE_IDENTITY_CONFLICT'});assert.deepEqual(await f.service.sections.read(),before)}
})
test('pre-existing duplicate identities remain readable but edit/delete/restore fail explicitly without wrong-target writes',async t=>{
 for(const kind of ['surgery','allergy']){
  const f=await fixture(t),items=kind==='surgery'?[{id:'dup',name:'第一手术'},{id:'dup',name:'第二手术'}]:[{id:'dup',name:'牛奶',category:'food',currentStatus:'confirmed'},{id:'dup',name:'鸡蛋',category:'food',currentStatus:'confirmed'}],records=kind==='surgery'?items:[{id:'outer',_allergyArchive:{items}}]
  await f.legacy(kind,records);const file=path.join(f.directory,'health-profile-sections.json'),before=await readFile(file,'utf8'),list=await f.service.list(f.user.id,f.child.id,kind),row=list.rows[0];assert.equal(list.rows.length,2)
  for(const action of ['edit','delete'])await assert.rejects(()=>f.cmd(kind,{action,id:row.id,version:row.version,name:'不能错写',group:kind==='allergy'?'食物':''}),{status:409,code:'PROFILE_IDENTITY_CONFLICT'})
  assert.equal(await readFile(file,'utf8'),before)
 }
 const f=await fixture(t);await f.save('surgery',[{id:'one',name:'第一手术'},{id:'two',name:'第二手术'}]);const row=(await f.service.list(f.user.id,f.child.id,'surgery')).rows[0],deleted=await f.cmd('surgery',{action:'delete',id:row.id,version:row.version}),raw=structuredClone(await f.read('surgery'));raw[1].id='one';await f.legacy('surgery',raw);const before=await f.read('surgery');await assert.rejects(()=>f.cmd('surgery',{action:'restore',undoId:deleted.undoId}),{status:409,code:'PROFILE_IDENTITY_CONFLICT'});assert.deepEqual(await f.read('surgery'),before)
})
test('valid scoped IDs and missing legacy IDs still edit the chosen row only',async t=>{
 const f=await fixture(t);await f.save('family-history',[{id:'father',relationship:'父亲',healthIssues:[{id:'issue',name:'鼻炎'}]},{id:'mother',relationship:'母亲',healthIssues:[{id:'issue',name:'哮喘'}]}]);assert.equal((await f.service.list(f.user.id,f.child.id,'family-history')).rows.length,2)
 await f.save('surgery',[{name:'第一手术'},{name:'第二手术'}]);let list=await f.service.list(f.user.id,f.child.id,'surgery'),row=list.rows[1];await f.cmd('surgery',{action:'edit',id:row.id,version:row.version,name:'第二手术已改',group:''});assert.deepEqual((await f.read('surgery')).map(r=>r.name),['第一手术','第二手术已改'])
})

test('raw opaque IDs preserve spaces, width and scalar types and target each intended record independently',async t=>{
 for(const kind of ['surgery','allergy','family-history']){
  const f=await fixture(t),ids=kind==='family-history'?['A','Ａ',' A ']:['A','Ａ',' A ',1,'1'],records=ids.map((id,i)=>({id,name:`原始项目${i}`,category:'food',currentStatus:'confirmed',...(kind==='family-history'?{relationship:'父亲',healthIssues:[{id:'issue',name:`原始项目${i}`}]}:{})}))
  await f.save(kind,records)
  let list=await f.service.list(f.user.id,f.child.id,kind)
  assert.deepEqual(list.rows.map(r=>r.id),ids.map(id=>kind==='family-history'?`${id}/issue`:id))
  for(const [i,id] of ids.entries()){
   const row=list.rows.find(r=>r.id===(kind==='family-history'?`${id}/issue`:id))
   list=await f.cmd(kind,{action:'edit',id:row.id,version:row.version,name:`独立修改${i}`,group:row.group})
   assert.deepEqual(list.rows.map(r=>r.name),ids.map((_,n)=>n<=i?`独立修改${n}`:`原始项目${n}`))
  }
  const stored=await f.read(kind);assert.deepEqual(stored.map(r=>r.id),ids)
  assert.deepEqual(stored.map(r=>kind==='family-history'?r.healthIssues[0].name:r.name),ids.map((_,i)=>`独立修改${i}`))
 }
 // Family composite IDs stringify numeric segments; distinct issue strings stay scoped.
 const f=await fixture(t);await f.save('family-history',[{id:1,relationship:'父亲',healthIssues:[{id:2,name:'数字身份问题'}]},{id:'1',relationship:'母亲',healthIssues:[{id:'different',name:'字符串身份问题'}]}])
 let list=await f.service.list(f.user.id,f.child.id,'family-history');assert.deepEqual(list.rows.map(r=>r.id),['1/2','1/different'])
 for(const row of list.rows)await f.cmd('family-history',{action:'edit',id:row.id,version:row.version,name:`${row.name}已改`,group:row.group})
 assert.deepEqual((await f.read('family-history')).map(r=>r.id),[1,'1'])
})
