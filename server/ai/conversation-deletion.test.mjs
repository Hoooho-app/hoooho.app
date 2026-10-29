import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {FrontDeskRecord} from './front-desk-record.mjs'
import {AIBusinessService} from './business/service.mjs'
import {FamilyMemberRepository} from '../members/repositories/family-member-repository.mjs'
import {EventAttachmentService} from '../events/event-attachment-service.mjs'

async function fixture(t){
 const directory=await mkdtemp(path.join(os.tmpdir(),'conversation-delete-'));t.after(()=>rm(directory,{recursive:true,force:true}))
 const members=new FamilyMemberRepository(directory),member=await members.create({accountId:'owner',name:'合成孩子',relationship:'child'}),other=await members.create({accountId:'owner',name:'其他孩子',relationship:'child'})
 const model={structured(){assert.fail('deletion must not call a model')}},business=new AIBusinessService({dataDirectory:directory,model,logger:{info(){},warn(){}}})
 const front=new FrontDeskRecord({dataDirectory:directory,business,events:business.events,model}),at=new Date().toISOString(),bytes=Buffer.from('exact original bytes')
 const context={id:'root',accountId:'owner',memberId:member.id,version:1,evidenceVersion:0,originalsVersion:1,subject:{kind:'current',memberId:member.id,confirmed:true,confirmedBy:'user',confirmation:{originalsVersion:1}},createdAt:at,updatedAt:at}
 const message={id:'message',accountId:'owner',memberId:member.id,contextId:'root',kind:'text',status:'completed',text:'发烧，还没量',at,inputAt:Date.parse(at),files:[{id:'photo',name:'source.png',mimeType:'image/png',dataUrl:'data:image/png;base64,'+bytes.toString('base64')}],voices:[]}
 await front.store.update(()=>({contexts:[context,{...context,id:'other',memberId:other.id}],messages:[message,{...message,id:'other-message',contextId:'other',memberId:other.id}]}))
 return {front,business,member,other,bytes}
}
test('deleting the whole conversation preserves a real saved record and exact attachment bytes, blocks old access and is idempotent',async t=>{
 const f=await fixture(t)
 await f.front.saveOriginal('owner',f.member.id,'root',{confirmed:true,expectedContextVersion:1})
 const records=await f.business.records.repository.findByAccountId('owner'),record=records[0],event=await f.business.events.get('owner',record.eventId)
 const attachments=await f.business.attachments.findByEventId(record.eventId)
 assert.equal(records.length,1);assert.equal(attachments.length,1)
 await f.front.store.update(d=>({...d,contexts:[...d.contexts,{...d.contexts[0],id:'continued',conversationId:'root',continuedFromId:'root'}],messages:[...d.messages,{...d.messages[0],id:'next-message',contextId:'continued'}]}))
 const before=(await f.front.store.read()).messages
 assert.deepEqual((await f.front.deleteConversation('owner',f.member.id,'continued')).contextIds,['root','continued'])
 assert.equal((await f.front.history('owner',f.member.id)).items.length,0)
 assert.deepEqual((await f.front.history('owner',f.member.id)).deletedContextIds,['root','continued'])
 assert.equal(await f.front.latest('owner',f.member.id),null)
 assert.equal(await f.front.conversation('owner',f.member.id,'root'),null)
 assert.equal(await f.front.snapshot('owner',f.member.id,'continued'),null)
 await assert.rejects(()=>f.front.resume('owner',f.member.id,'root'),e=>e.status===404)
 await assert.rejects(()=>f.front.submit('owner',f.member.id,{id:'late',contextId:'root',kind:'text',text:'后来补充'}),e=>e.code==='FRONT_CONVERSATION_DELETED')
 await f.front.deleteConversation('owner',f.member.id,'root')
 assert.deepEqual((await f.front.store.read()).messages,before)
 assert.deepEqual(await f.business.records.repository.findByAccountId('owner'),records)
 assert.deepEqual(await f.business.events.get('owner',record.eventId),event)
 assert.deepEqual(await f.business.attachments.findByEventId(record.eventId),attachments)
 const reader=new EventAttachmentService({dataDirectory:f.front.directory})
 assert.deepEqual((await reader.read('owner',record.eventId,attachments[0].id)).buffer,f.bytes)
 assert.equal((await f.front.history('owner',f.other.id)).items.length,1)
})
test('deletion enforces account/member ownership and leaves a busy conversation untouched for retry',async t=>{
 const f=await fixture(t),before=await f.front.store.read()
 await assert.rejects(()=>f.front.deleteConversation('intruder',f.member.id,'root'),e=>e.status===404||e.status===403)
 await assert.rejects(()=>f.front.deleteConversation('owner',f.other.id,'root'),e=>e.status===404)
 f.front.inFlight.set(JSON.stringify(['owner',f.member.id]),{})
 await assert.rejects(()=>f.front.deleteConversation('owner',f.member.id,'root'),e=>e.code==='FRONT_RECORD_BUSY')
 assert.deepEqual(await f.front.store.read(),before)
 f.front.inFlight.clear();assert.equal((await f.front.deleteConversation('owner',f.member.id,'root')).deleted,true)
})

test('history recorded status requires a real saved record and disappears when that record is removed',async t=>{
 const f=await fixture(t)
 assert.equal((await f.front.history('owner',f.member.id)).items[0].recorded,false)
 await f.front.saveOriginal('owner',f.member.id,'root',{confirmed:true,expectedContextVersion:1})
 assert.equal((await f.front.history('owner',f.member.id)).items[0].recorded,true)
 const [record]=await f.business.records.repository.findByAccountId('owner')
 await f.business.records.repository.delete(record.id)
 assert.equal((await f.front.history('owner',f.member.id)).items[0].recorded,false)
})
