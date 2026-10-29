import test from 'node:test'
import assert from 'node:assert/strict'
import { conversationTitle } from '../../../shared/conversation-title.mjs'
import { drawerHistoryRows, type RetainedConversation } from './drawerHistory'

test('history extracts whole source keywords, later observations and uncertainty rather than a greeting or raw first line', () => {
  const result = conversationTitle({ texts: ['你好', '我这个对话记录，脸上有个小痘痘，不确定是包包还什么'] })
  assert.equal(result.title, '脸上 · 小痘痘 · 包包（待确认）')
  assert.doesNotMatch(result.title, /你好|对话记录|痤疮|确诊/)
  assert.match(conversationTitle({ texts: ['你好', '脸颊发红', '后来有点痒', '三天了'] }).title, /发红.*痒/)
})

test('valid saved keywords and current edits take precedence; negated and possible observations retain qualifiers', () => {
  const reading = '【情况概述】\n脸上小痘痘，性质不确定\n\n【关键词】\n脸上、小痘痘'
  assert.match(conversationTitle({ recordText: reading, texts: ['之前咳嗽了'] }).title, /脸上.*小痘痘.*待确认/)
  assert.doesNotMatch(conversationTitle({ recordText: reading, texts: ['之前咳嗽了'] }).title, /咳嗽/)
  assert.deepEqual(conversationTitle({ texts: ['没有发热，今天咳嗽'] }).keywords, ['无发热', '咳嗽'])
  assert.match(conversationTitle({ texts: ['是不是湿疹'] }).title, /湿疹（待确认）/)
  assert.match(conversationTitle({ texts: ['以前得过肺炎'] }).title, /以前.*肺炎|既往/)
  assert.equal(conversationTitle({ texts: ['谢谢', '嗯'] }).title, '对话记录')
  assert.equal(conversationTitle({ fallback: '语音记录' }).title, '语音记录')
})

const retained = (key: string, context: string, input: string, at = 2): RetainedConversation => ({ key, draft: { text: '', requestId: key, frontContextId: context, conversationInput: input, files: [], timeUnknown: true, occurredAt: '', updatedAt: at } })
test('one history destination retains the latest unsent device copy while keeping the established keyword title', () => {
  const server = [{ id: 'c', title: '脸上 · 小痘痘', updatedAt: new Date(1).toISOString() }]
  const original = JSON.stringify(server)
  const rows = drawerHistoryRows(server, [retained('older', 'c', '之前补充', 2), retained('newest', 'c', '还有呢', 3)])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].title, '脸上 · 小痘痘')
  assert.match(rows[0].destination, /draft=newest&from=sidebar$/)
  assert.equal(JSON.stringify(server), original)
  assert.match(drawerHistoryRows(server, [retained('current', 'c', '')])[0].destination, /\/conversation-history\/c\?from=sidebar$/)
  const continued = [{ ...server[0], contextIds: ['c', 'continued'] }]
  assert.equal(drawerHistoryRows(continued, [retained('newer', 'continued', '另外补充')]).length, 1)
  assert.equal(drawerHistoryRows(continued, [retained('newer', 'continued', '另外补充')])[0].title, '脸上 · 小痘痘')
})
