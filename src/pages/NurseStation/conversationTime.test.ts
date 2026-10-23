import test from 'node:test'
import assert from 'node:assert/strict'
import {conversationTime,showConversationTime} from './conversationTime'
test('conversation timestamps preserve actual message time and never invent missing dates',()=>{
 assert.equal(conversationTime(undefined),null)
 assert.equal(conversationTime('not-a-time'),null)
 const at='2026-10-23T17:06:00.000Z'
 assert.equal(conversationTime(at)?.iso,at)
 assert.equal(showConversationTime(at),true)
 assert.equal(showConversationTime(Date.parse(at)+299999,at),false)
 assert.equal(showConversationTime(Date.parse(at)+300000,at),true)
})
