import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

describe('ManualRecordButton', () => {
  it('opens the four-option record entry through the supplied action', async () => {
    const source = await readFile(new URL('./ManualRecordButton.tsx', import.meta.url), 'utf8')
    assert.match(source, /aria-label="记录"/)
    assert.match(source, /onClick=\{onClick\}/)
    assert.match(source, /<Plus \/>/)
    assert.doesNotMatch(source, /hoooho:timeline-prompt|target: 'symptom'/)
    assert.doesNotMatch(source, /MANUAL_RECORD_PROMPTS|setTimeout|setInterval|requestAnimationFrame|useEffect|prompt-window|caret/)
  })
})
