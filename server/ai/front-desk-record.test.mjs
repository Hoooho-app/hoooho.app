import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import {FrontDeskRecord} from './front-desk-record.mjs'
import {FamilyMemberRepository} from '../members/repositories/family-member-repository.mjs'
import {HealthEventService} from '../events/health-event-service.mjs'

async function setup(t){
 const dataDirectory=await mkdtemp(path.join(os.tmpdir(),'hoooho-front-record-'));t.after(()=>rm(dataDirectory,{recursive:true,force:true}))
 const members=new FamilyMemberRepository(dataDirectory),member=await members.create({accountId:'synthetic',name:'测试孩子',relationship:'child'}),other=await members.create({accountId:'synthetic',name:'另一个孩子',relationship:'child'})
 const calls=[],model={structured:async input=>{calls.push(input);return {value:{reply:'收到这次观察。',contextId:'new',action:'record'},diagnostics:{provider:'test'}}}}
 const service=new FrontDeskRecord({dataDirectory,events:new HealthEventService({dataDirectory}),business:{read:async()=>null},model})
 return {service,member,other,calls,model}
}
test('durable per-message retry, scope isolation, latest update ordering and independent new intents',async t=>{
 const f=await setup(t),a={id:'turn-1',kind:'text',text:'今天吃了粥'}
 const first=await f.service.submit('synthetic',f.member.id,a)
 const retry=await f.service.submit('synthetic',f.member.id,a)
 assert.equal(first.context.id,retry.context.id);assert.equal(f.calls.length,1);assert.equal(retry.context.messages.length,2)
 await assert.rejects(()=>f.service.submit('synthetic',f.member.id,{...a,text:'改写'}),{code:'FRONT_RECORD_ID_CONFLICT'})
 const second=await f.service.submit('synthetic',f.member.id,{id:'turn-2',kind:'text',text:'昨天睡得很好'})
 assert.notEqual(first.context.id,second.context.id);assert.equal(second.context.messages.length,2)
 f.model.structured=async input=>({value:{reply:'接着刚才的饮食记录。',contextId:first.context.id,action:'record'},diagnostics:{provider:'test'}})
 await f.service.submit('synthetic',f.member.id,{id:'turn-3',kind:'text',text:'继续刚才的吃粥，吃了半碗'})
 const latest=await f.service.latest('synthetic',f.member.id)
 assert.equal(latest.id,first.context.id);assert.equal(latest.messages.filter(m=>m.kind==='text').length,2)
 assert.equal(latest.messages.some(m=>m.text.includes('睡得')),false)
 assert.equal(await f.service.latest('synthetic',f.other.id),null)
 await assert.rejects(()=>f.service.latest('foreign',f.member.id))
})
test('image bytes reach vision, multiple selections remain separate messages, current media only',async t=>{
 const f=await setup(t),bytes=await sharp({create:{width:40,height:40,channels:3,background:'#ff0000'}}).png().toBuffer()
 const image={name:'测试红方块.png',mimeType:'image/png',dataUrl:`data:image/png;base64,${bytes.toString('base64')}`,lastModified:42}
 const first=await f.service.submit('synthetic',f.member.id,{id:'picture-1',kind:'image',text:'',files:[image]})
 assert.equal(f.calls[0].vision,true);assert.equal(f.calls[0].input[0].content[1].type,'input_image')
 assert.ok(f.calls[0].instructions.includes(JSON.stringify(f.calls[0].schema)),'the vision instruction carries the exact reply contract instead of relying only on supplier response_format')
 const decoded=Buffer.from(f.calls[0].input[0].content[1].image_url.split(',')[1],'base64')
 assert.equal((await sharp(decoded).metadata()).format,'jpeg');assert.equal(first.context.messages[0].files[0].lastModified,42)
 await f.service.submit('synthetic',f.member.id,{id:'picture-2',kind:'image',text:'',files:[image,image]})
 assert.equal(f.calls[1].input[0].content.filter(c=>c.type==='input_image').length,1)
 assert.equal(JSON.stringify(f.calls[1].input[0].content[0]).includes(bytes.toString('base64')),false)
 assert.equal((await f.service.store.read()).messages.filter(m=>m.kind==='image').length,2)
})
test('provider failure retains original message and bytes, retry never retranscribes or duplicates',async t=>{
 const f=await setup(t);f.model.structured=async()=>{throw Object.assign(new Error('provider failure'),{code:'AI_BUSINESS_UNAVAILABLE'})}
 const wav=Buffer.alloc(400);wav.write('RIFF');wav.write('WAVE',8)
 const input={id:'voice-1',kind:'voice',text:'今天没有呕吐',voiceFiles:[{name:'原件.wav',mimeType:'audio/wav',dataUrl:`data:audio/wav;base64,${wav.toString('base64')}`}]}
 await assert.rejects(()=>f.service.submit('synthetic',f.member.id,input),{code:'AI_BUSINESS_UNAVAILABLE'})
 assert.equal((await f.service.latest('synthetic',f.member.id)).messages[0].status,'failed')
 f.model.structured=async()=>({value:{reply:'这段观察已收到。',contextId:'new',action:'record'},diagnostics:{provider:'test'}})
 const result=await f.service.submit('synthetic',f.member.id,input)
 assert.equal(result.context.messages.length,2);assert.equal(result.context.messages[0].voices[0].dataUrl,input.voiceFiles[0].dataUrl)
})
test('review checkpoint is immutable, exact-context scoped, saved context is not offered for duplicate organization',async t=>{
 const f=await setup(t),first=await f.service.submit('synthetic',f.member.id,{id:'review-source',kind:'text',text:'今天吃了粥'})
 f.service.business.get=async()=>({id:'review-1',raw:'今天吃了粥',state:'ready'})
 await f.service.checkpoint('synthetic',f.member.id,first.context.id,{draftId:'review-1'})
 assert.equal((await f.service.latest('synthetic',f.member.id)).draftId,'review-1')
 f.service.business.get=async()=>({id:'review-1',raw:'另一件事情',state:'ready'})
 await assert.rejects(()=>f.service.checkpoint('synthetic',f.member.id,first.context.id,{draftId:'review-1'}),{code:'FRONT_RECORD_CHANGED'})
 f.service.business.get=async()=>({id:'review-1',raw:'今天吃了粥',state:'saved'})
 await f.service.checkpoint('synthetic',f.member.id,first.context.id,{draftId:'review-1'})
 const second=await f.service.submit('synthetic',f.member.id,{id:'new-after-save',kind:'text',text:'现在想记睡眠'})
 assert.notEqual(first.context.id,second.context.id)
 assert.deepEqual(f.calls.at(-1).schema.properties.contextId.enum,['new',first.context.id])
})
test('legacy originals migrate once, retain wrong recorder declaration and never consume model calls',async t=>{
 const f=await setup(t),wav=Buffer.alloc(400);wav.write('RIFF');wav.write('WAVE',8)
 const original={name:'旧原件.webm',mimeType:'audio/webm',lastModified:42,dataUrl:`data:audio/webm;base64,${wav.toString('base64')}`}
 const input={requestId:'legacy-draft',updatedAt:123456,turns:[{text:'昨天吃了粥'}],voiceFiles:[original]}
 const first=await f.service.retainLegacy('synthetic',f.member.id,input),again=await f.service.retainLegacy('synthetic',f.member.id,input)
 assert.equal(first.id,again.id);assert.equal(first.messages.length,2);assert.equal(first.messages[1].voices[0].dataUrl,original.dataUrl);assert.equal(first.messages[1].voices[0].unreadable,true);assert.equal(f.calls.length,0)
 assert.equal(await f.service.latest('synthetic',f.other.id),null)
})
test('explicit removal archives only failed message; completed submissions and other member stay intact',async t=>{
 const f=await setup(t),completed=await f.service.submit('synthetic',f.member.id,{id:'submitted',kind:'text',text:'今天吃了粥'})
 await assert.rejects(()=>f.service.discard('synthetic',f.member.id,'submitted'),{code:'FRONT_RECORD_ALREADY_SUBMITTED'})
 f.model.structured=async()=>{throw new Error('temporary unavailable')}
 await assert.rejects(()=>f.service.submit('synthetic',f.member.id,{id:'failed',kind:'text',text:'未提交内容'}))
 await f.service.discard('synthetic',f.member.id,'failed')
 assert.equal((await f.service.latest('synthetic',f.member.id)).id,completed.context.id)
 assert.equal((await f.service.store.read()).messages.find(m=>m.id==='failed').status,'discarded')
})
