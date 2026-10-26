import test from 'node:test'
import assert from 'node:assert/strict'
import {completedFrontSaveReplyIds,restoreFrontContext,type FrontContext} from './frontDeskRecord.ts'
import type {CaptureDraft} from './captureDraft.ts'
import type {SmartRecordDraft} from './smartRecordTypes.ts'

const review=(inputText='昨晚碰到右脚小趾'):SmartRecordDraft=>({id:'candidate',version:3,state:'ready',inputText,result:null,items:[{id:'fact',category:'injury',title:'右脚小趾碰伤',timeText:'昨晚',time:{resolvedStart:null,precision:'unknown'},fields:[{name:'symptom',value:inputText,sources:[{quote:inputText}]}]}]})
const local=():CaptureDraft=>({text:'昨晚碰到右脚小趾',files:[],requestId:'task-1',occurredAt:'2026-10-25T10:00',capturedAt:'2026-10-25T02:00:00Z',timeUnknown:true,conversationInput:'新的未发送内容',smartReview:review(),frontContextId:'task-1'})
const response=(kind:FrontContext['resultKind']='conversation'):FrontContext=>({id:'task-1',updatedAt:'2026-10-26T02:00:00Z',resultKind:kind,understanding:{responseMode:'answer',recordChanges:[]},messages:[{id:'thanks',kind:'text',text:'谢谢',contextId:'task-1',status:'completed'},{id:'reply',kind:'assistant',text:'不客气，需要时可以接着说。',contextId:'task-1',status:'completed'}]})

test('conversation and no-change responses retain the real candidate and append the natural reply',()=>{
 for(const kind of ['conversation','no_change'] as const){
  const before=local(),after=restoreFrontContext(response(kind),before)
  assert.equal(after.smartReview,before.smartReview);assert.equal(after.text,before.text)
  assert.equal(after.capturedAt,before.capturedAt);assert.equal(after.conversationInput,before.conversationInput)
  assert.equal(after.conversationTurns?.at(-1)?.text,'不客气，需要时可以接着说。')
 }
})
test('an unchanged partial result and explicit save request do not erase the candidate or media bytes',async()=>{
 const photo=new File(['original-photo'],'原图.png',{type:'image/png',lastModified:42})
 const before={...local(),files:[photo]},context=response('partial')
 context.understanding!.requestedAction={type:'save',candidateId:'candidate',version:3}
 const after=restoreFrontContext(context,before)
 assert.equal(after.smartReview,before.smartReview);assert.equal(after.files[0],photo)
 assert.equal(await after.files[0].text(),'original-photo')
})
test('a conversation with no new facts restores ready only for the same server-acknowledged candidate version',()=>{
 const before=local();before.smartReview={...before.smartReview!,state:'changed'}
 const context={...response('no_change'),review:review()}
 assert.equal(restoreFrontContext(context,before).smartReview?.state,'ready')
 assert.equal(restoreFrontContext({...context,review:{...review(),version:4}},before).smartReview?.state,'changed')
})
test('explicit withdrawal can produce zero candidates without resurrecting the old source text',()=>{
 const context={...response('candidates'),review:{...review(''),version:4,items:[]},understanding:{recordChanges:[{operation:'retract',sourceIds:['original']}]}}
 const after=restoreFrontContext(context,local())
 assert.deepEqual(after.smartReview?.items,[]);assert.equal(after.text,'')
 assert.equal(after.conversationTurns?.at(-1)?.text,'不客气，需要时可以接着说。')
})
test('a sourced correction uses the acknowledged draft input instead of joining superseded chat messages',()=>{
 const context={...response('candidates'),review:{...review('不是右脚，是左脚小趾'),version:4},understanding:{recordChanges:[{operation:'correct',sourceIds:['correction']}]}}
 const after=restoreFrontContext(context,local())
 assert.equal(after.text,'不是右脚，是左脚小趾');assert.equal(after.smartReview?.version,4)
})
test('saved contexts still clear current candidates, while legacy contexts retain their existing restoration behavior',()=>{
 const before=local()
 assert.equal(restoreFrontContext({...response('saved'),saved:true},before).smartReview,undefined)
 const legacy={...response(),resultKind:undefined,understanding:undefined}
 assert.equal(restoreFrontContext(legacy,before).smartReview,undefined)
 assert.equal(restoreFrontContext(legacy,before).text,'谢谢')
})
test('an older saved context cannot clear a newer candidate or its unsent input and photo',()=>{
 const photo=new File(['new-photo'],'新的照片.png',{type:'image/png',lastModified:61})
 const before={...local(),frontContextId:'new-context',frontContextVersion:4,files:[photo]}
 const saved={...response('saved'),saved:true,review:{...review(),id:'older-candidate',state:'saved' as const}}
 const after=restoreFrontContext(saved,before)
 assert.equal(after.smartReview,before.smartReview);assert.equal(after.text,before.text)
 assert.equal(after.files[0],photo);assert.equal(after.conversationInput,before.conversationInput)
 assert.equal(after.frontContextId,'new-context');assert.equal(after.frontContextVersion,4)
})
test('legacy nonrecordable replies remain visible but do not become record input; protocol3 keeps its ledger semantics',()=>{
 const legacy={...response(),resultKind:undefined,understanding:undefined,messages:response().messages.map(message=>message.kind==='text'?{...message,protocolVersion:2,recordable:false}:message)}
 const restored=restoreFrontContext(legacy,local())
 assert.equal(restored.text,'');assert.equal(restored.conversationTurns?.[0].text,'谢谢')
 assert.equal(restoreFrontContext({...legacy,messages:legacy.messages.map(message=>({...message,protocolVersion:3}))},local()).text,'谢谢')
})


test('only the exact persisted save receipt supersedes its pending reply and keeps the message original',()=>{
 const context=response('saved')
 context.messages=[{id:'save-input:reply',kind:'assistant',text:'正在保存这条记录。',contextId:context.id,status:'completed'},{id:'natural:reply',kind:'assistant',text:'原来的自然回复。',contextId:context.id,status:'completed'}]
 const saved={...review(),state:'saved' as const,result:{count:1,records:[{recordId:'saved-record',eventId:'saved-event',category:'sleep' as const}]}}
 context.operationReceipts=[{operationId:'save-input:save:3',type:'save',targetId:'candidate',targetVersion:3,state:'saved',savedDraft:saved,recordIds:['saved-record']}]
 assert.deepEqual([...completedFrontSaveReplyIds(context)],['save-input:reply'])
 const after=restoreFrontContext(context,local())
 assert.equal(after.conversationTurns?.find(turn=>turn.id==='save-input:reply')?.completedOperation,true)
 assert.equal(after.conversationTurns?.find(turn=>turn.id==='save-input:reply')?.text,'正在保存这条记录。')
 assert.equal(after.conversationTurns?.find(turn=>turn.id==='natural:reply')?.completedOperation,undefined)
 const following=restoreFrontContext({...response(),previousMessages:context.messages},after)
 assert.equal(following.conversationTurns?.find(turn=>turn.id==='save-input:reply')?.completedOperation,true)
})

test('a requested save and incomplete or unrelated receipts do not hide the reply',()=>{
 const context=response('saved')
 context.messages=[{id:'save-input:reply',kind:'assistant',text:'我来保存这份记录。',contextId:context.id,status:'completed'}]
 assert.deepEqual([...completedFrontSaveReplyIds(context)],[])
 context.operationReceipts=[{operationId:'save-input:save:3',type:'save',targetId:'candidate',targetVersion:3,state:'saved',savedDraft:{...review(),state:'saved',result:{count:0,records:[]}},recordIds:[]}]
 assert.deepEqual([...completedFrontSaveReplyIds(context)],[])
 context.operationReceipts[0]={...context.operationReceipts[0],operationId:'other-input:save:3',savedDraft:{...review(),state:'saved',result:{count:1,records:[{recordId:'record',eventId:'event',category:'sleep'}]}}}
 assert.deepEqual([...completedFrontSaveReplyIds(context)],[])
})
