import assert from 'node:assert/strict'
import test from 'node:test'
import { compactSummaryTags } from './eventSummaryPresentation.ts'

test('事件摘要标签合并同义症状并限制为三个', () => {
  assert.deepEqual(compactSummaryTags({
    title: '发烧伴咳嗽',
    summary: '今天高烧并出现体温升高，精神差、头痛，症状仍在持续。'
  }), ['发热', '咳嗽', '精神不佳'])
})

test('事件摘要没有可靠规范标签时不生成占位', () => {
  assert.deepEqual(compactSummaryTags({ title: '健康情况', summary: '今天补充了一条记录。' }), [])
})
