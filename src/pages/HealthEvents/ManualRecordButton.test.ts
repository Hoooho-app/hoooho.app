import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

describe('ManualRecordButton', () => {
  it('opens the manual continuous record page with the generic record label', async () => {
    const source = await readFile(new URL('./ManualRecordButton.tsx', import.meta.url), 'utf8')
    assert.match(source, /window\.location\.assign\('\/health-events\/continuous\/new'\)/)
    assert.match(source, /aria-label="记录"/)
    assert.match(source, />记录<\/span>/)
    assert.doesNotMatch(source, /hoooho:timeline-prompt/)
    assert.doesNotMatch(source, /MANUAL_RECORD_PROMPTS|setTimeout|setInterval|requestAnimationFrame|useEffect|prompt-window|caret/)
  })
})
