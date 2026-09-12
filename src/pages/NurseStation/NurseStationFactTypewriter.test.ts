import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./NurseStationFactTypewriter.tsx', import.meta.url), 'utf8')

test('护士站事实轮播严格使用已确认的六条文案', () => {
  const facts = [
    '全球食物过敏发生率约为 3%～8%',
    '全球约 25% 的人群受到各类过敏性疾病影响',
    '中国 2 岁以内儿童食物过敏检出率约为 3.5%～7.7%',
    '食物过敏可能同时影响皮肤、消化道和呼吸系统',
    '症状发生的时间诱因和频率都是重要判断线索',
    '你已经更早一步为孩子留下了判断线索'
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
