import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./CurrentChildSheet.tsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('./current-child-sheet.css', import.meta.url), 'utf8')
const drawer = readFileSync(new URL('./SideDrawer.tsx', import.meta.url), 'utf8')

test('current child sheet uses real members and keeps header and add action fixed around a scrolling list', () => {
  assert.match(source, /const members = useAppStore/)
  assert.match(source, /members\.filter\(\(member\) => member\.relation === '子女'\)/)
  assert.match(source, /<h2>我的孩子<\/h2>/)
  assert.doesNotMatch(source, /选择健康内容的记录对象/)
  assert.match(source, />添加孩子<\/button>/)
  assert.match(styles, /grid-template-rows:\s*auto auto minmax\(0, 1fr\) auto/)
  assert.match(styles, /\.current-child-sheet__list\s*\{[^}]*overflow-y:\s*auto/s)
  assert.match(styles, /env\(safe-area-inset-bottom\)/)
})

test('selection is server-first, guarded against repeats, and only commits after success', () => {
  assert.match(source, /if \(switchingId \|\| memberId === currentMemberId\) return/)
  assert.match(source, /await postAuthRequest<\{ success: true \}>\('\/api\/auth\/current-member'/)
  assert.match(source, /setCurrentMemberId\(memberId, \{ sync: false \}\)/)
  assert.match(source, /catch \(requestError\)/)
  assert.match(source, /role="alert"/)
})

test('edit and add reuse existing routes while edit stops propagation', () => {
  assert.match(source, /event\.stopPropagation\(\)/)
  assert.match(source, /onNavigate\(`\/family\/\$\{encodeURIComponent\(member\.id\)\}\/edit`\)/)
  assert.match(source, /onNavigate\('\/family\/new'\)/)
  assert.match(source, /<SquarePen/)
  assert.match(drawer, /navigate\(to, \{ state: \{ returnTo:/)
})

test('sheet supports backdrop, close button and thresholded handle dragging', () => {
  assert.match(source, /current-child-sheet-backdrop/)
  assert.match(source, /aria-label="关闭我的孩子"/)
  assert.match(source, /const closeThreshold = 72/)
  assert.match(source, /onPointerMove=\{moveDrag\}/)
  assert.match(source, /dragOffset >= closeThreshold/)
})
