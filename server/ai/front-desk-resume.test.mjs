import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {FrontDeskRecord} from './front-desk-record.mjs'
import {FamilyMemberRepository} from '../members/repositories/family-member-repository.mjs'
import {HealthEventService} from '../events/health-event-service.mjs'

async function fixture(t){
 const dataDirectory=await mkdtemp(path.join(os.tmpdir(),'hoooho-resume-'));t.after(()=>rm(dataDirectory,{recursive:true,force:true}))
 const members=new FamilyMemberRepository(dataDirectory)
 const member=await members.create({accountId:'synthetic',name:'测试孩子',relationship:'child'}),other=await members.create({accountId:'synthetic',name:'另一孩子',relationship:'child'})
 let clock=Date.parse('2026-10-25T00:00:00Z')
 const calls=[]
 const model={structured:async input=>{calls.push(input);return {value:{reply:'内容已收到。',contextId:'new',action:'record',questionId:null,emergency:{currentChild:false,quote:''}}}}}
 const service=new FrontDeskRecord({dataDirectory,events:new HealthEventService({dataDirectory}),business:{read:async()=>null},model,now:()=>new Date(clock++)})
 const send=(id,text,contextId)=>service.submit('synthetic',member.id,{id,kind:'text',text,...(contextId?{contextId}:{})})
 return {service,member,other,calls,send}
}

test('explicit resume reopens only the owned conversation and forces an older unsaved target',async t=>{
 const f=await fixture(t),old=await f.send('old','昨天脸颊发红')
 for(let i=0;i<7;i++)await f.send('other-'+i,'今天吃了粥，第'+i+'次')
 await f.service.closeSession('synthetic',f.member.id)
 await assert.rejects(()=>f.send('closed','没有明显变化',old.context.id),{code:'FRONT_RECORD_CLOSED'})
 await assert.rejects(()=>f.service.resume('synthetic',f.other.id,old.context.id),{code:'FRONT_RECORD_NOT_FOUND'})
 await assert.rejects(()=>f.service.resume('foreign',f.member.id,old.context.id))
 const resumed=await f.service.resume('synthetic',f.member.id,old.context.id)
 assert.equal(resumed.id,old.context.id)
 const continued=await f.send('continued','现在颜色淡了一些',resumed.id)
 assert.equal(continued.context.id,old.context.id,'explicit selection wins over provider choosing new')
 assert.equal(continued.context.messages.filter(m=>m.kind==='text').length,2)
 assert.equal(continued.context.messages.some(m=>m.text.includes('吃了粥')),false)
 assert.ok(JSON.parse(f.calls.at(-1).input[0].content[0].text).history.some(c=>c.id===old.context.id))
 assert.equal((await f.service.latest('synthetic',f.member.id)).id,old.context.id)
 const data=await f.service.store.read()
 assert.equal(data.contexts.filter(c=>!c.closedAt&&!c.provisional).length,1)
})

test('saved conversation continues with a separate fact intent and persistent grouped history',async t=>{
 const f=await fixture(t),first=await f.send('first','昨天脸颊发红')
 await f.service.store.update(data=>({...data,contexts:data.contexts.map(c=>c.id===first.context.id?{...c,saved:true,recordResult:{count:1,records:[{recordId:'kept-record'}]}}:c)}))
 await f.service.closeSession('synthetic',f.member.id)
 const resumed=await f.service.resume('synthetic',f.member.id,first.context.id)
 assert.equal(resumed.saved,true)
 const second=await f.send('second','今天颜色淡了一些',resumed.id)
 assert.notEqual(second.context.id,first.context.id)
 assert.equal(second.context.conversationId,first.context.id)
 assert.equal(second.context.continuedFromId,first.context.id)
 assert.deepEqual(second.context.messages.filter(m=>m.kind==='text').map(m=>m.text),['今天颜色淡了一些'])
 assert.deepEqual((await f.service.conversation('synthetic',f.member.id,second.context.id)).previousMessages.filter(m=>m.kind==='text').map(m=>m.text),['昨天脸颊发红'])
 const exact=await f.service.snapshot('synthetic',f.member.id,second.context.id)
 assert.equal(exact.previousMessages,undefined)
 assert.deepEqual(exact.messages.filter(m=>m.kind==='text').map(m=>m.text),['今天颜色淡了一些'],'recognition raw excludes saved facts')
 const history=await f.service.history('synthetic',f.member.id)
 assert.equal(history.items.length,1)
 assert.equal(history.items[0].id,first.context.id)
 assert.equal(history.items[0].messageCount,4)
 assert.equal((await f.service.history('synthetic',f.member.id,{query:'淡了一些'})).items[0].id,first.context.id)
 const reloaded=await f.service.conversation('synthetic',f.member.id,first.context.id)
 assert.equal(reloaded.id,second.context.id)
 assert.equal(reloaded.previousMessages.length,2)
 assert.equal((await f.service.latest('synthetic',f.member.id)).previousMessages.length,2)
 assert.equal((await f.service.snapshot('synthetic',f.member.id,first.context.id)).recordResult.records[0].recordId,'kept-record')
 await f.service.closeSession('synthetic',f.member.id)
 const resumedAgain=await f.service.resume('synthetic',f.member.id,first.context.id)
 assert.equal(resumedAgain.id,second.context.id)
 const third=await f.send('third','没有新增表现',resumedAgain.id)
 assert.equal(third.context.id,second.context.id)
 assert.equal((await f.service.history('synthetic',f.member.id)).items.length,1)
 assert.equal(await f.service.conversation('synthetic',f.other.id,first.context.id),null)
})

test('explicit target is immutable for retries and cannot conflict with an answer target',async t=>{
 const f=await fixture(t),a=await f.send('a','昨天脸颊发红'),b=await f.send('b','今天吃粥')
 await f.send('continued','现在淡了一些',a.context.id)
 const count=f.calls.length
 await f.send('continued','现在淡了一些',a.context.id)
 assert.equal(f.calls.length,count)
 await assert.rejects(()=>f.send('continued','现在淡了一些',b.context.id),{code:'FRONT_RECORD_ID_CONFLICT'})
 await assert.rejects(()=>f.service.submit('synthetic',f.member.id,{id:'bad-answer',kind:'text',text:'没有',contextId:a.context.id,answerTo:{contextId:b.context.id,questionId:'resp-effort'}}),{code:'FRONT_CONTEXT_INVALID'})
 await assert.rejects(()=>f.send('missing','补充观察','missing-context'),{code:'FRONT_RECORD_NOT_FOUND'})
})

test('cancelled continued draft is not restored through an open saved ancestor',async t=>{
 const f=await fixture(t),first=await f.send('saved-original','昨天脸颊发红')
 await f.service.store.update(data=>({...data,contexts:data.contexts.map(c=>c.id===first.context.id?{...c,saved:true}:c)}))
 const next=await f.send('continued-cancelled','今天颜色淡了一些',first.context.id)
 await f.service.closeMessages('synthetic',f.member.id,['continued-cancelled'])
 assert.equal(await f.service.latest('synthetic',f.member.id),null)
 assert.equal((await f.service.conversation('synthetic',f.member.id,first.context.id)).id,next.context.id)
})

test('immutable successful-message retry after resuming child tolerates a closed saved ancestor',async t=>{
 const f=await fixture(t),first=await f.send('root','昨天脸颊发红')
 await f.service.store.update(data=>({...data,contexts:data.contexts.map(c=>c.id===first.context.id?{...c,saved:true}:c)}))
 const next=await f.send('child','今天颜色淡了一些',first.context.id)
 await f.service.closeSession('synthetic',f.member.id)
 await f.service.resume('synthetic',f.member.id,first.context.id)
 const retry=await f.send('child','今天颜色淡了一些',first.context.id)
 assert.equal(retry.context.id,next.context.id)
 assert.equal(retry.context.messages.filter(m=>m.kind==='text').length,1)
})
