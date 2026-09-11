import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { journalMemoryCopies } from './journalMemoryCopies.ts'

test('keeps the approved reminder copy in exact order', () => {
  assert.equal(journalMemoryCopies.length, 15)
  assert.deepEqual(journalMemoryCopies.slice(0, 5), ['不舒服就记下来', '吃了什么、睡得怎么样，都可以记', '不用组织语言，点一点，就能记', '一次记不完没关系，之后能补充', '之前的事情也能记，修改时间即可'])
  assert.equal(journalMemoryCopies.at(-1), '点滴记录连起来，就是孩子完整的健康轨迹')
})

test('uses one random state initializer, instant clearing and cancellable timeouts', () => {
  const source = readFileSync(new URL('./JournalMemoryTypewriter.tsx', import.meta.url), 'utf8')
  assert.match(source, /useState\(\(\) => Math\.floor\(Math\.random\(\)/)
  assert.match(source, /HOLD_DELAY = 1650/)
  assert.match(source, /EMPTY_DELAY = 220/)
  assert.match(source, /setVisibleLength\(-1\)/)
  assert.match(source, /clearTimeout/)
  assert.doesNotMatch(source, /setInterval|mask-image/)
})
