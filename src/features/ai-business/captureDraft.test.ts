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
