import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./NurseStationFactTypewriter.tsx', import.meta.url), 'utf8')

test('护士站事实轮播严格使用已确认的六条文案', () => {
  const facts = [
    '全球食物过敏率约3%～8%',
    '约1/4人群受各类过敏疾病影响',
    '中国2岁内儿童食物过敏检出率约3.5%～7.7%',
    '过敏反应可能涉及多个身体系统',
    '时间、诱因和频率都是重要线索',
    '你已经更早一步留下判断线索'
  ]
  facts.forEach((fact) => assert.ok(source.includes(`'${fact}'`)))
})

test('轮播快速输入、停留后整句回删，光标紧跟文字', () => {
  assert.match(source, /const TYPE_DELAY = 28/)
  assert.match(source, /const HOLD_DELAY = 1750/)
  assert.match(source, /setVisibleLength\(-1\)/)
  assert.ok(source.includes('<span aria-hidden="true">{highlighted(visibleText)}</span><i aria-hidden="true" />'))
  assert.doesNotMatch(source, /setInterval|mask-image/)
})
