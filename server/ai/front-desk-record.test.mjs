import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import {PDFDocument} from 'pdf-lib'
import {FrontDeskRecord} from './front-desk-record.mjs'
import {FamilyMemberRepository} from '../members/repositories/family-member-repository.mjs'
import {HealthEventService} from '../events/health-event-service.mjs'
import {AIBusinessService} from './business/service.mjs'

async function setup(t){
 const dataDirectory=await mkdtemp(path.join(os.tmpdir(),'hoooho-front-record-'));t.after(()=>rm(dataDirectory,{recursive:true,force:true}))
 const members=new FamilyMemberRepository(dataDirectory),member=await members.create({accountId:'synthetic',name:'测试孩子',relationship:'child'}),other=await members.create({accountId:'synthetic',name:'另一个孩子',relationship:'child'})
 const calls=[],model={structured:async input=>{calls.push(input);return {value:{reply:'收到这次观察。',contextId:'new',action:'record'},diagnostics:{provider:'test'}}}}
 const service=new FrontDeskRecord({dataDirectory,events:new HealthEventService({dataDirectory}),business:{read:async()=>null},model})
 return {service,member,other,calls,model}
}
test('record dialogue does not surface an unsolicited provider diagnosis without an observation domain',async t=>{
 const f=await setup(t)
 f.model.structured=async()=>({value:{reply:'可能是结膜炎，建议用药。',contextId:'new',action:'record',questionId:null,emergency:{currentChild:false,quote:''}}})
 const result=await f.service.submit('synthetic',f.member.id,{id:'unsupported-provider-claim',kind:'text',text:'孩子今天吃了半碗粥'})
 assert.equal(result.context.interview.question,null)
 assert.doesNotMatch(result.context.messages.find(m=>m.kind==='assistant').text,/结膜炎|用药/)
})
test('cold conversation persists relevant questions and contextual supplements without receipt or premature-save copy',async t=>{
 const f=await setup(t)
 f.model.structured=async()=>({value:{reply:'内容已收到，已保存。',contextId:'new',action:'record',questionId:null,emergency:{currentChild:false,quote:''}}})
 const first=await f.service.submit('synthetic',f.member.id,{id:'cold-first',kind:'text',text:'身体有点冷'})
 assert.equal(first.context.interview.question.id,'cold-observation')
 assert.match(first.context.messages.at(-1).text,/我了解了/)
 assert.doesNotMatch(first.context.messages.at(-1).text,/接收|已收到|已保存|核对整理结果/)
 const second=await f.service.submit('synthetic',f.member.id,{id:'cold-second',kind:'text',text:'摸着身体有点凉',answerTo:{contextId:first.context.id,questionId:'cold-observation'}})
 assert.equal(second.context.id,first.context.id)
 assert.equal(second.context.interview.question.id,'cold-onset')
 const last=await f.service.submit('synthetic',f.member.id,{id:'cold-third',kind:'text',text:'今天开始，大约十分钟',answerTo:{contextId:first.context.id,questionId:'cold-onset'}})
 assert.equal(last.context.interview.question,null)
 assert.deepEqual(last.context.messages.filter(m=>m.kind!=='assistant').map(m=>m.text),['身体有点冷','摸着身体有点凉','今天开始，大约十分钟'])
 assert.notEqual(last.context.saved,true)
 assert.equal((await f.service.latest('synthetic',f.member.id)).interview.status,'ready')
})
for(const [text,quote,expected] of [['孩子现在没有意识了','没有意识',true],['孩子现在一直抽搐','抽搐',true],['孩子没有呼吸困难','呼吸困难',false],['哥哥现在呼吸困难','呼吸困难',false]])test('front dialogue applies full-source emergency evidence: '+text,async t=>{
 const f=await setup(t)
 f.model.structured=async()=>({value:{reply:'再问一问',contextId:'new',action:'record',questionId:'resp-effort',emergency:{currentChild:true,quote}}})
 const result=await f.service.submit('synthetic',f.member.id,{id:'source-gate',kind:'text',text})
 assert.equal(result.context.interview.status==='urgent',expected)
 if(expected){assert.equal(result.context.interview.question,null);assert.match(result.context.messages.find(m=>m.kind==='assistant').text,/专业人员|急救/)}
})
test('discarded session is not restored or offered to the model; other members and saved records remain intact',async t=>{
 const f=await setup(t)
 const older=await f.service.submit('synthetic',f.member.id,{id:'older',kind:'text',text:'头皮发痒'})
 await f.service.submit('synthetic',f.member.id,{id:'newer',kind:'text',text:'脸颊发红'})
 const other=await f.service.submit('synthetic',f.other.id,{id:'other',kind:'text',text:'吃了粥'})
 await f.service.store.update(data=>({...data,contexts:data.contexts.map(c=>c.id===older.context.id?{...c,saved:true,recordResult:{count:1,records:[{id:'formal-record'}]}}:c)}))
 await assert.rejects(()=>f.service.closeSession('foreign',f.member.id))
 assert.ok(await f.service.latest('synthetic',f.member.id))
 assert.deepEqual(await f.service.closeSession('synthetic',f.member.id),{closed:true})
 assert.equal(await f.service.latest('synthetic',f.member.id),null)
 assert.equal((await f.service.latest('synthetic',f.other.id)).id,other.context.id)
 const preserved=await f.service.snapshot('synthetic',f.member.id,older.context.id)
 assert.equal(preserved.recordResult.records[0].id,'formal-record')
 assert.equal(preserved.messages.length,2)
 const next=await f.service.submit('synthetic',f.member.id,{id:'fresh',kind:'text',text:'今天头皮发痒'})
 assert.notEqual(next.context.id,older.context.id)
 assert.deepEqual(JSON.parse(f.calls.at(-1).input[0].content[0].text).history,[])
 assert.equal((await f.service.latest('synthetic',f.member.id)).id,next.context.id)
})
test('discard cancels an outstanding reply so its late completion cannot revive a session',async t=>{
 const f=await setup(t)
 let entered,release
 const started=new Promise(resolve=>{entered=resolve}),gate=new Promise(resolve=>{release=resolve})
 f.model.structured=async()=>{entered();await gate;return {value:{reply:'收到。',contextId:'new',action:'record'}}}
 const sending=f.service.submit('synthetic',f.member.id,{id:'slow',kind:'text',text:'今天头皮发痒'})
 await started
 const closing=f.service.closeSession('synthetic',f.member.id)
 const result=sending.catch(error=>{assert.ok(error.name==='AbortError'||error.code==='FRONT_RECORD_CLOSED');return null})
 release();await result;await closing
 assert.equal(await f.service.latest('synthetic',f.member.id),null)
})
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
 const history=JSON.parse(f.calls[1].input[0].content[0].text).history
 assert.equal(history[0].turns[0].kind,'image');assert.equal(history[0].turns[0].files[0].name,image.name)
 assert.equal(f.calls[1].input[0].content.filter(c=>c.type==='input_image').length,1)
 assert.equal(JSON.stringify(f.calls[1].input[0].content[0]).includes(bytes.toString('base64')),false)
 assert.equal((await f.service.store.read()).messages.filter(m=>m.kind==='image').length,2)
 f.model.structured=async()=>({value:{reply:'找到了这张图片。',contextId:first.context.id,action:'history'},diagnostics:{provider:'test'}})
 await f.service.store.update(data=>({...data,contexts:data.contexts.map(c=>c.id===first.context.id?{...c,saved:true}:c)}))
 const recalled=await f.service.submit('synthetic',f.member.id,{id:'recall-picture',kind:'text',text:'找刚才红方块的图片'})
 assert.equal(recalled.context.saved,true);assert.equal(recalled.context.messages[0].files[0].dataUrl,image.dataUrl)
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
test('protocol2 checkpoint excludes courtesy while new factual input and foreign scope still invalidate it',async t=>{
 const f=await setup(t),first=await f.service.submit('synthetic',f.member.id,{id:'legacy-fact',kind:'text',text:'今天咳嗽'})
 await f.service.store.update(data=>({...data,contexts:data.contexts.map(({understanding,...context})=>context.id===first.context.id?{...context,semanticVersion:2}:{...context,understanding}),messages:[...data.messages.map(message=>message.id==='legacy-fact'?{...message,recordable:true}:message),{id:'courtesy',contextId:first.context.id,accountId:'synthetic',memberId:f.member.id,kind:'text',text:'谢谢',status:'completed',recordable:false,inputAt:Date.now()+1}]}))
 // A program-held receipt is supplied here; actual persistence is exercised
 // separately by the browser and business transaction tests.
 f.service.business.get=async()=>({id:'saved-draft',raw:'今天咳嗽',state:'saved',result:{count:1,records:[{recordId:'receipt-record',eventId:'receipt-event'}]}})
 await f.service.checkpoint('synthetic',f.member.id,first.context.id,{draftId:'saved-draft'})
 assert.equal((await f.service.snapshot('synthetic',f.member.id,first.context.id)).saved,true)
 await assert.rejects(()=>f.service.checkpoint('synthetic',f.other.id,first.context.id,{draftId:'saved-draft'}),{code:'FRONT_RECORD_NOT_FOUND'})
 await f.service.store.update(data=>({...data,messages:[...data.messages,{id:'new-fact',contextId:first.context.id,accountId:'synthetic',memberId:f.member.id,kind:'text',text:'还有头疼',status:'completed',recordable:true,inputAt:Date.now()+2}]}))
 await assert.rejects(()=>f.service.checkpoint('synthetic',f.member.id,first.context.id,{draftId:'saved-draft'}),{code:'FRONT_RECORD_CHANGED'})
})
test('migrated originals retain a confirmable version and can be explicitly saved once without a model',async t=>{
 const f=await setup(t),raw='这段合成原话只用于迁移保存验收。'
 const business=new AIBusinessService({dataDirectory:f.service.directory,model:{async structured(){throw new Error('Original preservation must not call a model')}},logger:{info(){},warn(){}}})
 f.service.business=business
 const input={requestId:'legacy-version-save',turns:[{text:raw}]}
 const migrated=await f.service.retainLegacy('synthetic',f.member.id,input)
 assert.equal(migrated.version,1);assert.equal(migrated.evidenceVersion,0)
 // Also repair pre-existing legacy contexts that lack these counters.
 await f.service.store.update(data=>({...data,contexts:data.contexts.map(({version,evidenceVersion,originalsVersion,...context})=>context.id===migrated.id?context:{...context,version,evidenceVersion,originalsVersion})}))
 const restored=await f.service.retainLegacy('synthetic',f.member.id,input)
 assert.equal(restored.version,1);assert.equal(restored.originalsVersion,0)
 const confirmed=await f.service.confirmSubject('synthetic',f.member.id,restored.id,{expectedVersion:restored.version})
 const request={confirmed:true,expectedContextVersion:confirmed.version}
 const saved=await f.service.saveOriginal('synthetic',f.member.id,restored.id,request)
 const again=await f.service.saveOriginal('synthetic',f.member.id,restored.id,request)
 assert.deepEqual(again.savedDraft.result,saved.savedDraft.result)
 const record=await business.records.getOwnedRecord('synthetic',saved.savedDraft.result.records[0].recordId)
 assert.equal(record.sourceText,raw);assert.equal(record.aiProvenance.provider,'manual')
 assert.equal((await business.records.repository.findByAccountId('synthetic')).length,1);assert.equal(f.calls.length,0)
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
test('restored codec MIME aliases reuse the exact voice message; changed text or forged WAV container remain rejected',async t=>{
 const f=await setup(t),wav=Buffer.alloc(400);wav.write('RIFF');wav.write('WAVE',8)
 const original={name:'原件.wav',mimeType:'audio/wav;codecs=pcm',dataUrl:`data:audio/wav;codecs=pcm;base64,${wav.toString('base64')}`},input={id:'codec-voice',kind:'voice',text:'昨天睡了一个小时',voiceFiles:[original]}
 f.model.structured=async()=>{throw new Error('temporary reply failure')};await assert.rejects(()=>f.service.submit('synthetic',f.member.id,input))
 f.model.structured=async()=>({value:{reply:'这段观察已收到。',contextId:'new',action:'record'},diagnostics:{provider:'test'}})
 const restored={...input,voiceFiles:[{...original,mimeType:'audio/wav',dataUrl:`data:audio/wav;base64,${wav.toString('base64')}`}]}
 const result=await f.service.submit('synthetic',f.member.id,restored);assert.equal(result.context.messages.length,2)
 assert.equal(result.context.messages[0].voices[0].dataUrl.split(',')[1],original.dataUrl.split(',')[1])
 assert.equal(result.context.messages[0].voices[0].originalMimeType,original.mimeType)
 await assert.rejects(()=>f.service.submit('synthetic',f.member.id,{...restored,text:'改写原话'}),{code:'FRONT_RECORD_ID_CONFLICT'})
 await assert.rejects(()=>f.service.submit('synthetic',f.member.id,{...restored,voiceFiles:[{...original,mimeType:'audio/wav',dataUrl:`data:audio/wav;base64,${Buffer.alloc(400).toString('base64')}`}]}),{code:'VOICE_ORIGINAL_FORMAT_MISMATCH'})
})
test('supplier acknowledgement cannot claim that unconfirmed input was formally saved',async t=>{
 const f=await setup(t)
 f.model.structured=async()=>({value:{reply:'收到，已记录体温38.2度。孩子精神怎么样？',contextId:'new',action:'record'}})
 const result=await f.service.submit('synthetic',f.member.id,{id:'unconfirmed',kind:'text',text:'今天体温38.2度'})
 const reply=result.context.messages.find(message=>message.kind==='assistant').text
 assert.match(reply,/我了解了/);assert.doesNotMatch(reply,/已记录|已保存/);assert.notEqual(result.context.saved,true)
})

test('history is an owned, paginated summary of closed and current conversations without original media',async t=>{
 const f=await setup(t)
 const old=await f.service.submit('synthetic',f.member.id,{id:'history-old',kind:'text',text:'昨天脸颊发红'})
 await f.service.closeSession('synthetic',f.member.id)
 const fresh=await f.service.submit('synthetic',f.member.id,{id:'history-new',kind:'text',text:'今天睡得很好'})
 await f.service.submit('synthetic',f.other.id,{id:'history-other',kind:'text',text:'其他孩子的记录'})
 await f.service.store.update(data=>({...data,messages:data.messages.map(m=>m.contextId===old.context.id?{...m,files:[{name:'原始照片.jpg',dataUrl:'data:image/jpeg;base64,private'}],voices:[{dataUrl:'private-audio'}]}:m)}))
 const before=JSON.stringify(await f.service.store.read()),history=await f.service.history('synthetic',f.member.id)
 assert.equal(history.items.length,2)
 assert.ok(history.items.some(i=>i.id===old.context.id&&i.closed))
 assert.ok(history.items.some(i=>i.id===fresh.context.id&&!i.closed))
 assert.doesNotMatch(JSON.stringify(history),/dataUrl|private-audio|private|accountId|memberId/)
 assert.deepEqual((await f.service.history('synthetic',f.member.id,{query:'脸颊'})).items.map(i=>i.id),[old.context.id])
 assert.equal((await f.service.history('synthetic',f.member.id,{offset:30})).items.length,0)
 await assert.rejects(()=>f.service.history('foreign',f.member.id))
 await assert.rejects(()=>f.service.history('synthetic',f.member.id,{offset:-1}),{code:'FRONT_HISTORY_INVALID'})
 assert.equal(JSON.stringify(await f.service.store.read()),before)
 assert.equal((await f.service.snapshot('synthetic',f.member.id,old.context.id)).messages[0].files[0].name,'原始照片.jpg')
})


test('PDF pages reach vision as rendered images while the complete original remains intact',async t=>{
 const f=await setup(t),pdf=await PDFDocument.create();pdf.addPage([160,200]);pdf.addPage([160,220])
 const dataUrl=`data:application/pdf;base64,${Buffer.from(await pdf.save()).toString('base64')}`
 const result=await f.service.submit('synthetic',f.member.id,{id:'pdf-pages',kind:'image',text:'',files:[{name:'两页原件.pdf',mimeType:'application/pdf',dataUrl}]})
 assert.equal(f.calls[0].vision,true)
 const image=f.calls[0].input[0].content.find(c=>c.type==='input_image')
 assert.equal((await sharp(Buffer.from(image.image_url.split(',')[1],'base64')).metadata()).format,'jpeg')
 assert.equal(result.context.messages[0].files[0].dataUrl,dataUrl)
 assert.equal(result.context.messages[0].files[0].mimeType,'application/pdf')
})
