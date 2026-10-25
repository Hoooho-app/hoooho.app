import test from 'node:test'
import assert from 'node:assert/strict'
import {confirmRawSaveTarget,frontHasOriginalFiles,frontOriginalsConfirmed,rawSaveTargetMatches,retainRawSaveTarget,type RawSaveTarget} from './frontOriginalSave.ts'
import {restoreFrontContext,type FrontContext} from './frontDeskRecord.ts'
import type {CaptureDraft} from './captureDraft.ts'
import {hasCaptureContent} from './captureDraft.ts'

const context=():FrontContext=>({id:'context',version:3,originalsVersion:1,originalsSubjectConfirmed:false,updatedAt:'2026-10-26T02:00:00Z',resultKind:'conversation',subject:{kind:'current',memberId:'member',confirmed:true},messages:[{id:'photo',contextId:'context',kind:'image',text:'',status:'completed',originalFileCount:1,files:[],voices:[]}]})
const target=():RawSaveTarget=>({memberId:'member',contextId:'context',contextVersion:3,originalsVersion:1,state:'requested'})
test('safe media metadata includes failed originals and voice files but ordinary chat has no original entry',()=>{
 assert.equal(frontHasOriginalFiles(context()),true)
 assert.equal(frontHasOriginalFiles({...context(),messages:[{...context().messages[0],originalFileCount:0,kind:'text',text:'？'}]}),false)
 assert.equal(frontHasOriginalFiles({...context(),messages:[{...context().messages[0],originalFileCount:0,kind:'voice',voices:[{name:'原音.wav',mimeType:'audio/wav',dataUrl:''}]}]}),true)
})
test('confirmed factual subject cannot authorize a newer unconfirmed set of originals',()=>{
 assert.equal(frontOriginalsConfirmed(context(),'member'),false)
 assert.equal(frontOriginalsConfirmed({...context(),originalsSubjectConfirmed:true},'member'),true)
 assert.equal(frontOriginalsConfirmed({...context(),originalsSubjectConfirmed:true},'other-member'),false)
})
test('raw save intent is bound to exact member, context, context version and original version',()=>{
 assert.equal(rawSaveTargetMatches(target(),context(),'member'),true)
 for(const changed of [{id:'different'}, {version:4}, {originalsVersion:2}])assert.equal(rawSaveTargetMatches(target(),{...context(),...changed},'member'),false)
 assert.equal(rawSaveTargetMatches(target(),context(),'other-member'),false)
})
test('subject confirmation advances only the explicitly requested original version',()=>{
 const confirmed={...context(),version:4,originalsSubjectConfirmed:true}
 assert.deepEqual(confirmRawSaveTarget(target(),context(),confirmed,'member'),{...target(),contextVersion:4})
 assert.equal(confirmRawSaveTarget(target(),context(),{...confirmed,originalsVersion:2},'member'),undefined)
 assert.equal(confirmRawSaveTarget(target(),context(),confirmed,'other-member'),undefined)
})
test('refresh retains the exact intent and new composer content but invalidates changed attachments',()=>{
 const photo=new File(['raw'],'原图.png',{type:'image/png'}),local:CaptureDraft={text:'',files:[photo],requestId:'context',occurredAt:'',timeUnknown:true,frontContextId:'context',rawSaveTarget:target(),conversationInput:'未发送的新内容'}
 const restored=restoreFrontContext(context(),local)
 assert.equal(hasCaptureContent({...local,files:[],conversationInput:''}),true)
 assert.deepEqual(restored.rawSaveTarget,target());assert.equal(restored.files[0],photo);assert.equal(restored.conversationInput,local.conversationInput)
 assert.equal(restoreFrontContext({...context(),originalsVersion:2},local).rawSaveTarget,undefined)
})
test('failed requests wait for explicit retry; in-flight persisted requests can recover their exact receipt',()=>{
 assert.equal(retainRawSaveTarget({...target(),state:'failed'},context())?.state,'failed')
 assert.equal(retainRawSaveTarget({...target(),state:'saving'},context())?.state,'requested')
 assert.equal(retainRawSaveTarget({...target(),state:'saving'},{...context(),saved:true,version:4})?.contextVersion,3)
 assert.equal(retainRawSaveTarget({...target(),state:'saving'},{...context(),saved:true,version:4,originalsVersion:2}),undefined)
})
