import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./AskAIWorkspace.tsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../../../styles/index.css', import.meta.url), 'utf8')

test('Ask AI starts with a question and defaults to the complete information set', () => {
  assert.match(source, /这次你主要想问什么？/)
  assert.match(source, /useState<string\[\]>\(allItemIds\)/)
  for (const question of ['是否需要就医', '应该挂什么科', '还缺哪些信息', '就诊前准备']) assert.match(source, new RegExp(question))
  assert.match(source, />生成完整提问</)
})

test('complete preview is selectable, scrollable, and never line-clamped', () => {
  assert.match(source, /<pre aria-label="提示词完整预览" tabIndex=\{0\}>\{prompt\}<\/pre>/)
  assert.match(styles, /ask-ai-preview pre[^}]*max-height:\s*52dvh[^}]*overflow:\s*auto/)
  assert.match(styles, /ask-ai-preview pre[^}]*user-select:\s*text/)
  assert.doesNotMatch(styles, /ask-ai-preview pre[^}]*line-clamp/)
})

test('copy success, retry, failure fallback, and accessibility feedback are explicit', () => {
  assert.match(source, /✓ 已复制/)
  assert.match(source, /再次复制/)
  assert.match(source, /已复制，可以粘贴到任意 AI/)
  assert.match(source, /aria-live="polite"/)
  assert.match(source, /role="status"/)
})

test('mobile workspace uses white surfaces, safe-area padding, and 44px touch targets', () => {
  assert.match(styles, /ask-ai-workspace[^}]*bg-white/)
  assert.match(styles, /ask-ai-quick-questions button[^}]*min-h-11/)
  assert.match(styles, /ask-ai-actions[^}]*safe-area-inset-bottom/)
  assert.match(styles, /ask-ai-adjust-group__toggle[\s\S]*min-h-14/)
  assert.match(styles, /ask-ai-workspace[^}]*min-w-0/)
})

test('switching or returning to another member resets old prompt state by member and event scope', () => {
  assert.match(source, /contextKey = `\$\{context\.currentMemberId\}:\$\{context\.event\.id\}`/)
  assert.match(source, /setSelected\(allItemIds\)/)
  assert.match(source, /setPrompt\(''\)/)
  assert.match(source, /\}, \[contextKey\]\)/)
})
