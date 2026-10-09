import test from 'node:test'
import assert from 'node:assert/strict'
import { guestDraftKeys } from './captureDraft.ts'
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
