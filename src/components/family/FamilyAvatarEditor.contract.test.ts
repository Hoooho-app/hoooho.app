import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./FamilyAvatarEditor.tsx', import.meta.url), 'utf8')

test('family avatar editor exposes only a complete avatar switch and photo mode', () => {
  assert.match(source, /cycleClayAvatar\(config\)/)
  assert.match(source, /RefreshCw/)
  assert.match(source, /换一个头像/)
  assert.match(source, /aria-label=\{text\.change\}/)
  assert.match(source, /min-h-11 min-w-11/)
  assert.equal(source.includes('hairVariant'), false)
  assert.equal(source.includes('faceVariant'), false)
  assert.equal(source.includes('outfitVariant'), false)
  assert.equal(source.includes('ChevronLeft'), false)
  assert.equal(source.includes('ChevronRight'), false)
})

test('avatar artwork and border share one fixed circular frame', () => {
  assert.match(source, /compact \? 'h-20 w-20' : 'h-28 w-28'/)
  assert.match(source, /border-2 border-primary bg-surface shadow-card/)
  assert.equal(source.includes('bg-surface p-0.5 shadow-card'), false)
})

test('family avatar editor offers a compact onboarding layout without shrinking touch targets', () => {
  assert.match(source, /compact\?: boolean/)
  assert.match(source, /compact \? 'mt-2 w-44' : 'mt-3 w-48'/)
  assert.match(source, /min-h-11/)
  assert.match(source, /compact \? 'h-8 w-8' : 'h-11 w-11'/)
  assert.match(source, /size=\{compact \? 16 : 20\}/)
})

test('family avatar editor keeps localized, RTL-safe cartoon and photo controls', () => {
  assert.match(source, /language\.toLowerCase\(\)\.startsWith\('ar'\)/)
  assert.match(source, /dir=\{isRtl \? 'rtl' : 'ltr'\}/)
  assert.match(source, /Choose another avatar/)
  assert.match(source, /تغيير الصورة الكرتونية/)
  assert.match(source, /onModeChange\('photo'\)/)
})
