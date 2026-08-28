import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./FamilyAvatarEditor.tsx', import.meta.url), 'utf8')

test('family avatar editor keeps the fixed hair-face-outfit order and independent controls', () => {
  const hair = source.indexOf("part: 'hairVariant'")
  const face = source.indexOf("part: 'faceVariant'")
  const outfit = source.indexOf("part: 'outfitVariant'")
  assert.ok(hair > 0 && hair < face && face < outfit)
  assert.match(source, /cycleClayAvatarPart\(config, part, direction\)/)
  assert.equal(source.includes('RefreshCw'), false)
  assert.match(source, /min-h-11 min-w-11/)
})

test('family avatar editor provides localized text and RTL-safe previous-next semantics', () => {
  assert.match(source, /language\.toLowerCase\(\)\.startsWith\('ar'\)/)
  assert.match(source, /dir=\{isRtl \? 'rtl' : 'ltr'\}/)
  assert.match(source, /上一个/)
  assert.match(source, /السابق/)
  assert.match(source, /isRtl \? <ChevronRight/)
})
