import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./NurseStationFactTypewriter.tsx', import.meta.url), 'utf8')

test('护士站事实轮播严格使用已确认的四条文案', () => {
  const facts = [
    '全球食物过敏率约3%～8%',
    '低龄儿童更容易发生食物过敏',
    '时间、诱因和频率都是重要线索',
    '早点留下记录，就能少一点麻烦'
  ]
  facts.forEach((fact) => assert.ok(source.includes(`'${fact}'`)))
  assert.doesNotMatch(source, /约1\/4人群|中国2岁内儿童|多个身体系统|更早一步/)
})

test('轮播快速输入、停留后整句回删，光标紧跟文字', () => {
  assert.match(source, /const TYPE_DELAY = 28/)
  assert.match(source, /const HOLD_DELAY = 1750/)
  assert.match(source, /const DELETE_DELAY = 16/)
  assert.match(source, /setVisibleLength\(-\(fact\.length \+ 1\)\)/)
  assert.match(source, /visibleLength < -1/)
  assert.ok(source.includes('<span aria-hidden="true">{highlighted(visibleText)}<i /></span>'))
  assert.doesNotMatch(source, /setInterval|mask-image/)
})
