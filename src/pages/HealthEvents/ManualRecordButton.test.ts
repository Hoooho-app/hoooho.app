import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

describe('ManualRecordButton', () => {
  it('uses the symptom icon and opens the direct symptom flow', async () => {
    const source = await readFile(new URL('./ManualRecordButton.tsx', import.meta.url), 'utf8')
    assert.match(source, /<JournalCategoryIcon category="symptom"/)
    assert.match(source, /aria-label="记录症状"/)
    assert.match(source, /target: 'symptom'/)
    assert.doesNotMatch(source, /MANUAL_RECORD_PROMPTS|setTimeout|setInterval|requestAnimationFrame|useEffect|prompt-window|caret/)
  })
})
