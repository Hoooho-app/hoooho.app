import test from 'node:test'
import assert from 'node:assert/strict'
import { guestDraftKeys } from './captureDraft.ts'
import { recoverPreviousInteractionDraft, type CaptureDraft } from './captureDraft.ts'

test('回滚兼容只恢复未发送文字，保留原件且不重放新版保存意图',()=>{
 const file=new File(['immutable-original'],'report.png',{type:'image/png'})
 const original:CaptureDraft={text:'已提交原话',conversationInput:'新的未发送输入',files:[file],requestId:'same-request',occurredAt:'2026-01-01T10:00',timeUnknown:true,
  voiceTextDraft:{id:'voice-1',text:'尚未提交的部分转写',at:123,incomplete:true},
  rawSaveTarget:{memberId:'member-a',contextId:'context-a',contextVersion:4,originalsVersion:2,state:'saving'}}
 const recovered=recoverPreviousInteractionDraft(original)
 assert.equal(recovered.conversationInput,'新的未发送输入\n尚未提交的部分转写')
 assert.equal(recovered.text,original.text);assert.equal(recovered.requestId,original.requestId)
 assert.equal(recovered.files[0],file);assert.equal(recovered.timeUnknown,true)
 assert.equal(recovered.rawSaveTarget,undefined);assert.equal(recovered.voiceTextDraft,undefined)
 assert.equal(recovered.interactionRollbackRecovery?.rawSaveTarget,original.rawSaveTarget)
 assert.equal(recovered.interactionRollbackRecovery?.voiceTextDraft,original.voiceTextDraft)
 assert.equal(recoverPreviousInteractionDraft(recovered),recovered,'Repeated reads cannot append the same recovery twice')
 assert.equal(original.rawSaveTarget?.state,'saving','The source snapshot stays unchanged')
})

test('新版核对文字和不可变原话均保留，不自动改写候选或生成记录',()=>{
 const original:CaptureDraft={text:'不可变原话',conversationInput:'',files:[],requestId:'original-context',occurredAt:'',timeUnknown:true,
  manualTextReview:{contextId:'context-a',contextVersion:2,sourceText:'不可变原话',text:'用户更正的文字',open:true,requested:true}}
 const recovered=recoverPreviousInteractionDraft(original)
 assert.equal(recovered.conversationInput,'用户更正的文字');assert.equal(recovered.text,'不可变原话')
 assert.equal(recovered.smartReview,undefined);assert.equal(recovered.aiDraftId,undefined)
 assert.equal(recovered.interactionRollbackRecovery?.manualTextReview?.sourceText,'不可变原话')
 assert.equal(recovered.manualTextReview,undefined)
})

test('关闭的核对内容不复活，相同待发送文字不重复，旧草稿保持原行为',()=>{
 const old:CaptureDraft={text:'原话',conversationInput:'待发送',files:[],requestId:'same',occurredAt:'',timeUnknown:true}
 assert.equal(recoverPreviousInteractionDraft(old),old)
 const closed=recoverPreviousInteractionDraft({...old,manualTextReview:{contextId:'c',contextVersion:1,sourceText:'原话',text:'已取消核对',open:false,requested:false}})
 assert.equal(closed.conversationInput,'待发送')
 const same=recoverPreviousInteractionDraft({...old,voiceTextDraft:{id:'v',at:1,text:'待发送',incomplete:true}})
 assert.equal(same.conversationInput,'待发送')
})

test('快速返回同一成员只等待录音原件最终写入，不等待AI且不阻塞其他上下文',async()=>{
 const {beginCaptureFinalization,captureDraft}=await import('./captureDraft.ts'),previous=Object.getOwnPropertyDescriptor(globalThis,'indexedDB')
 const opened:string[]=[],stopped=new Error('intentional test database stop')
 Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:{open(){opened.push('open');const request:{error?:Error;onerror?:()=>void}={};queueMicrotask(()=>{request.error=stopped;request.onerror?.()});return request}}})
 const release=beginCaptureFinalization('account:member:context')
 try{
   const same=captureDraft('account:member:context').catch(e=>e);await new Promise(resolve=>setTimeout(resolve,0));assert.equal(opened.length,0)
   assert.equal(await captureDraft('account:other:context').catch(e=>e),stopped);assert.equal(opened.length,1)
   release();assert.equal(await same,stopped);assert.equal(opened.length,2);release()
 }finally{release();if(previous)Object.defineProperty(globalThis,'indexedDB',previous);else Reflect.deleteProperty(globalThis,'indexedDB')}
})

test('刷新检查点只存同上下文元数据和文件身份，不复制音频字节；禁用存储不抛错',async()=>{
  const {checkpointCaptureDraft}=await import('./captureDraft.ts')
  const previous=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage'),entries=new Map<string,string>()
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{setItem:(key:string,value:string)=>entries.set(key,value)}})
  try{
    const file=new File(['private-audio-bytes'],'voice.webm',{type:'audio/webm',lastModified:42})
    const draft={text:'合成观察',files:[file],pendingVoice:file,occurredAt:'2026-01-01T10:00',timeUnknown:false,requestId:'request-a'}
    checkpointCaptureDraft('home-smart:account-a:member-a:new',draft)
    checkpointCaptureDraft('home-smart:account-b:member-b:new',{...draft,text:'另一上下文'})
    assert.equal(entries.size,2)
    const saved=entries.get('hoooho-capture-checkpoint:home-smart:account-a:member-a:new')!
    assert.equal(saved.includes('private-audio-bytes'),false)
    assert.equal(JSON.parse(saved).metadata.requestId,'request-a')
    assert.equal(JSON.parse(saved).pendingVoice,JSON.parse(saved).files[0])
    Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{setItem:()=>{throw new Error('storage denied')}}})
    assert.doesNotThrow(()=>checkpointCaptureDraft('home-smart:account-a:member-a:new',draft))
  }finally{if(previous)Object.defineProperty(globalThis,'sessionStorage',previous);else Reflect.deleteProperty(globalThis,'sessionStorage')}
})
test('游客设备草稿只跟随服务器已核验的同成员及同上下文，不导入其他账号或任务',()=>{
  const owner={accountId:'formal-a',memberId:'member-a'}
  assert.deepEqual(guestDraftKeys('formal-a:member-a:event-a:task-a',['guest:old:member-a:event-a:task-a','guest:old:member-b:event-a:task-a','guest:old:member-a:event-b:task-a','formal-b:member-a:event-a:task-a','guest:old:member-a:event-a:task-b'],owner),['guest:old:member-a:event-a:task-a'])
  assert.deepEqual(guestDraftKeys('return:formal-a:member-a:event-a',['return:guest:old:member-a:event-a','guest:old:member-a:event-a:'],owner),['return:guest:old:member-a:event-a'])
  assert.deepEqual(guestDraftKeys('formal-b:member-a:event-a:',['guest:old:member-a:event-a:'],owner),[])
  assert.deepEqual(guestDraftKeys('guest:new:member-a:event-a:',['guest:old:member-a:event-a:'],{accountId:'guest:new',memberId:'member-a'}),[])
})

test('文件以字节快照保存，恢复后不依赖原系统文件且保留录音身份',async()=>{
  const {packCaptureDraft,unpackCaptureDraft}=await import('./captureDraft.ts')
  const {fileDataUrl}=await import('./draftFiles.ts')
  const file=new File(['recording-bytes'],'语音原件.webm',{type:'audio/webm',lastModified:12345})
  const value={text:'已有文字',files:[file],pendingVoice:file,occurredAt:'2026-01-01T10:00',timeUnknown:false,requestId:'request-1'}
  const saved=structuredClone(await packCaptureDraft(value))
  assert.equal(saved.files[0].kind,'bytes-v1')
  Object.defineProperty(file,'arrayBuffer',{value:()=>Promise.reject(new Error('native file revoked'))})
  const restored=unpackCaptureDraft(saved)
  assert.equal(restored.pendingVoice,restored.files[0])
  assert.equal(restored.files[0].lastModified,12345)
  assert.equal(restored.files[0].name,'语音原件.webm')
  assert.equal(await restored.files[0].text(),'recording-bytes')
  assert.equal(await fileDataUrl(restored.files[0]),'data:audio/webm;base64,cmVjb3JkaW5nLWJ5dGVz')
  assert.equal(unpackCaptureDraft(value).files[0],file,'旧版本地草稿仍能加载')
})

test('每次发送独立气泡，迁移旧文字，重试同一录音不重复追加',async()=>{
  const {appendCaptureTurn}=await import('./captureDraft.ts')
  const initial={text:'旧记录',files:[],occurredAt:'2026-01-01T10:00',timeUnknown:false,requestId:'request-1'}
  const next=appendCaptureTurn(initial,'新一段','voice-1')
  assert.deepEqual(next.conversationTurns,[{id:'legacy',text:'旧记录'},{id:'voice-1',text:'新一段'}])
  assert.equal(next.text,'旧记录\n新一段')
  assert.equal(appendCaptureTurn(next,'重复转写','voice-1').text,next.text)
  const again=appendCaptureTurn(next,'又一段','voice-2')
  assert.equal(again.conversationTurns?.length,3)
  assert.throws(()=>appendCaptureTurn(next,'长'.repeat(5001),'voice-3'),/先保存/)
})
