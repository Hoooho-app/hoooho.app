import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

describe('ManualRecordButton', () => {
  it('uses a centered plus and concise static label without a prompt loop', async () => {
    const source = await readFile(new URL('./ManualRecordButton.tsx', import.meta.url), 'utf8')
    assert.match(source, /<Plus[^>]*size=\{22\}/)
    assert.match(source, /aria-label="记一下"/)
    assert.match(source, />记一下<\/span>/)
    assert.doesNotMatch(source, /MANUAL_RECORD_PROMPTS|setTimeout|setInterval|requestAnimationFrame|useEffect|prompt-window|caret/)
  })
})
