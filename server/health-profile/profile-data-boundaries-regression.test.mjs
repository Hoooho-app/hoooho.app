import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {AuthService} from '../auth/auth-service.mjs'
import {BrowserSessionService} from '../auth/browser-session-service.mjs'
import {ChildProfileListService} from './child-profile-list-service.mjs'
import {CareHandoffService} from '../care-handoff/care-handoff-service.mjs'
async function fixture(t){
 const directory=await mkdtemp(path.join(os.tmpdir(),'profile-boundaries-'));t.after(()=>rm(directory,{recursive:true,force:true}))
 const auth=new AuthService({dataDirectory:directory,tokenSecret:'synthetic-profile-boundary-secret',logger:()=>{}}),browser=new BrowserSessionService(auth),user=await auth.users.createGuest(),headers=new Map(),response={setHeader:(k,v)=>headers.set(k,v)},request={method:'POST',headers:{host:'localhost',origin:'http://localhost','content-type':'application/json'},socket:{encrypted:false}}
 await browser.issue(request,response,user);request.headers.cookie=headers.get('Set-Cookie').split(';')[0]
 const child=await auth.members.create({accountId:user.id,name:'虚构边界儿童',relationship:'child'}),other=await auth.members.create({accountId:user.id,name:'同胞',relationship:'child'}),service=new ChildProfileListService({dataDirectory:directory})
 const seed=async(sectionId,records)=>service.sections.update(d=>({...d,sections:[...d.sections.filter(s=>s.sectionId!==sectionId),{accountId:user.id,memberId:child.id,sectionId,revision:1,records}]}))
 const cmd=(kind,input)=>service.command(user.id,child.id,kind,{key:randomUUID(),...input})
 return {directory,auth,browser,user,request,child,other,service,seed,cmd}
}
test('session ingress rejects malformed known nested profile arrays atomically',async t=>{
 const f=await fixture(t)
 for(const [kind,records] of [['allergy',[{_allergyArchive:{items:{bad:true}}}]],['allergy',[{_allergyArchive:{items:[null]}}]],['family-history',[{relationship:'父亲',healthIssues:[null]}]]]){
  const before=await f.service.sections.read()
  await assert.rejects(()=>f.browser.profileSections(f.request,{memberId:f.child.id,sectionId:kind,revision:0,records}),{status:400,code:'INVALID_PROFILE_SECTION'})
  assert.deepEqual(await f.service.sections.read(),before)
 }
 await f.browser.profileSections(f.request,{memberId:f.child.id,sectionId:'allergy',revision:0,records:[{id:'legacy',name:'牛奶',category:'food',currentStatus:'confirmed',reactions:'旧版反应原话',history:['旧记录'],evidenceLinks:['原引用']}]})
 assert.equal((await f.service.list(f.user.id,f.child.id,'allergy')).rows.length,1)
 await f.browser.profileSections(f.request,{memberId:f.child.id,sectionId:'family-history',revision:0,records:[{relationship:'父亲',healthIssues:[{name:'鼻炎'}],customLegacy:{kept:true}}]})
 assert.equal((await f.service.list(f.user.id,f.child.id,'family-history')).rows[0].name,'鼻炎')
})
test('legacy malformed entries do not break valid allergy and family rows or mutate stored source',async t=>{
 const f=await fixture(t),payload={sections:[
  {accountId:f.user.id,memberId:f.child.id,sectionId:'allergy',records:[null,{_allergyArchive:{items:{bad:true}}},{id:'outer',_allergyArchive:{items:[null,{id:'milk',name:'牛奶',category:'food',currentStatus:'confirmed'}]}}]},
  {accountId:f.user.id,memberId:f.child.id,sectionId:'family-history',records:[{id:'family',relationship:'父亲',healthIssues:[null,{id:'issue',name:'鼻炎',onset:'40岁'}]}]}
 ]}
 const file=path.join(f.directory,'health-profile-sections.json');await writeFile(file,JSON.stringify(payload))
 const before=await readFile(file,'utf8')
 assert.deepEqual((await f.service.list(f.user.id,f.child.id,'allergy')).rows.map(r=>r.name),['牛奶'])
 assert.deepEqual((await f.service.list(f.user.id,f.child.id,'family-history')).rows.map(r=>r.name),['鼻炎'])
 assert.equal(await readFile(file,'utf8'),before)
})
test('legacy confirmed states agree between profile, dietary and handoff projections',async t=>{
 const f=await fixture(t)
 for(const currentStatus of ['医生确认','已确诊']){
  await f.seed('allergy',[{id:'milk',name:'牛奶',category:'food',currentStatus}])
  await f.seed('dietary-card',[{version:1,memberId:f.child.id,items:[],avoidCrossContact:false}])
  const list=await f.service.list(f.user.id,f.child.id,'allergy');assert.equal(list.rows.length,1);assert.equal(list.pendingAllergyRows.length,0)
  const card=(await f.service.sections.read()).sections.find(s=>s.sectionId==='dietary-card').records[0];assert.equal(card.items[0].group,'avoid')
  const hand=await new CareHandoffService({dataDirectory:f.directory}).preview(f.user.id,f.child.id);assert.equal(hand.sections.find(s=>s.id==='restrictions').rows[0].source,'已确认的过敏史')
 }
})
test('allergy and chronic group edits actually persist without dropping evidence or sibling data',async t=>{
 const f=await fixture(t)
 await f.seed('allergy',[{id:'old',name:'过敏项目',category:'food',currentStatus:'confirmed',tests:[{id:'report'}]}])
 let list=await f.service.list(f.user.id,f.child.id,'allergy'),row=list.rows[0]
 await f.cmd('allergy',{action:'edit',id:row.id,version:row.version,name:row.name,group:'药物'})
 list=await f.service.list(f.user.id,f.child.id,'allergy');assert.equal(list.rows[0].group,'药物')
 let raw=(await f.service.sections.read()).sections.find(s=>s.sectionId==='allergy').records[0];assert.deepEqual(raw.tests,[{id:'report'}])
 await f.seed('chronic',[{id:'chronic',name:'长期情况',profileCategory:'呼吸道',frequency:'每月',certainty:'待确认',note:'原备注'}])
 row=(await f.service.list(f.user.id,f.child.id,'chronic')).rows[0]
 await f.cmd('chronic',{action:'edit',id:row.id,version:row.version,name:row.name,group:'皮肤'})
 raw=(await f.service.sections.read()).sections.find(s=>s.sectionId==='chronic').records[0];assert.equal(raw.profileCategory,'皮肤');assert.equal(raw.certainty,'待确认');assert.equal(raw.frequency,'每月');assert.equal(raw.note,'原备注')
 assert.equal((await f.service.list(f.user.id,f.other.id,'chronic')).rows.length,0)
})
test('moving one family issue changes only that issue, keeping evidence and other relative issues',async t=>{
 const f=await fixture(t)
 await f.seed('family-history',[{id:'father',relationship:'父亲',note:'来源备注',healthIssues:[{id:'one',name:'鼻炎',certainty:'待确认',evidence:'来源1'},{id:'two',name:'哮喘',onset:'40岁'}]}])
 let list=await f.service.list(f.user.id,f.child.id,'family-history'),row=list.rows.find(r=>r.name==='鼻炎'),mother=list.groups.find(g=>g.name==='母亲').id
 list=await f.cmd('family-history',{action:'edit',id:row.id,version:row.version,name:'过敏性鼻炎',group:mother})
 assert.equal(list.rows.find(r=>r.name==='过敏性鼻炎').group,mother)
 assert.equal(list.rows.find(r=>r.name==='哮喘').group,list.groups.find(g=>g.name==='父亲').id)
 const raw=(await f.service.sections.read()).sections.find(s=>s.sectionId==='family-history').records,moved=raw.find(r=>r.relationId===mother)
 assert.equal(moved.healthIssues[0].id,'one');assert.equal(moved.healthIssues[0].evidence,'来源1');assert.equal(raw.find(r=>r.id==='father').healthIssues[0].onset,'40岁')
 row=list.rows.find(r=>r.name==='过敏性鼻炎');const grandma=list.groups.find(g=>g.name==='祖母').id,oldId=row.id
 list=await f.cmd('family-history',{action:'edit',id:row.id,version:row.version,name:row.name,group:grandma})
 assert.equal(list.rows.find(r=>r.id===oldId).group,grandma)
})
