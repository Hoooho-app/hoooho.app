import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { MANUAL_RECORD_PROMPTS } from './manualRecordPrompts'

describe('ManualRecordButton', () => {
  it('keeps the approved prompt order and wording', () => {
    assert.deepEqual([...MANUAL_RECORD_PROMPTS], [
      '不舒服就记下来',
      '吃了什么、睡得怎么样，都可以记',
      '不用组织语言，点一点，就能记',
      '一次记不完没关系，之后能补充',
      '之前的事情也能记，修改时间即可',
    ])
  })

  it('uses cancellable timeouts instead of a continuous animation loop', async () => {
    const source = await readFile(new URL('./ManualRecordButton.tsx', import.meta.url), 'utf8')
    assert.match(source, /window\.setTimeout/)
    assert.match(source, /window\.clearTimeout/)
    assert.match(source, /visibilitychange/)
    assert.match(source, /prefers-reduced-motion/)
    assert.doesNotMatch(source, /setInterval|requestAnimationFrame/)
  })
})
