import assert from 'node:assert/strict'
import test from 'node:test'
import { addSmartTag, normalizeSmartTags, shouldCommitSmartTag, toggleSmartTag } from './smartTags.ts'

test('支持建议选择、自由输入、去重和删除', () => {
  let value = toggleSmartTag([], '疼痛')
  value = addSmartTag(value, '  麻木  ')
  value = addSmartTag(value, '疼痛')
  assert.deepEqual(value, ['疼痛', '麻木'])
  assert.deepEqual(toggleSmartTag(value, '疼痛'), ['麻木'])
  assert.deepEqual(normalizeSmartTags(['疼痛', '', '疼痛']), ['疼痛'])
})

test('中文输入法组合期间不会由回车提前提交', () => {
  assert.equal(shouldCommitSmartTag('Enter', true), false)
  assert.equal(shouldCommitSmartTag('Enter', false), true)
  assert.equal(shouldCommitSmartTag('Escape', false), false)
})

test('互斥标签基本不影响与其他生活影响不会并存', () => {
  const options = { exclusiveValue: '基本不影响' }
  assert.deepEqual(addSmartTag(['影响睡眠'], '基本不影响', options), ['基本不影响'])
  assert.deepEqual(addSmartTag(['基本不影响'], '影响工作', options), ['影响工作'])
})

test('空草稿不会新增且最大数量可配置', () => {
  assert.deepEqual(addSmartTag(['疼痛'], '   '), ['疼痛'])
  assert.deepEqual(addSmartTag(['疼痛'], '麻木', { maxTags: 1 }), ['疼痛'])
})
