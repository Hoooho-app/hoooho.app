import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

describe('ManualRecordButton', () => {
  it('uses concise copy without an icon and delegates the click to its caller', async () => {
    const source = await readFile(new URL('./ManualRecordButton.tsx', import.meta.url), 'utf8')
    assert.match(source, /aria-label="记一下"/)
    assert.match(source, />记一下</)
    assert.match(source, /onClick=\{onClick\}/)
    assert.doesNotMatch(source, /timeline-prompt|target: 'symptom'/)
    assert.doesNotMatch(source, /JournalCategoryIcon|journal-manual-record-action__icon/)
    assert.doesNotMatch(source, /MANUAL_RECORD_PROMPTS|setTimeout|setInterval|requestAnimationFrame|useEffect|prompt-window|caret/)
  })
})
