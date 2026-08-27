import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const pageSource = readFileSync(new URL('./EditFamilyMemberPage.tsx', import.meta.url), 'utf8')

test('人物编辑页提供清晰的头像类型切换和对齐描边', () => {
  assert.match(pageSource, /title="编辑家人信息"/)
  assert.match(pageSource, /\['cartoon', '卡通头像'\]/)
  assert.match(pageSource, /\['photo', '照片头像'\]/)
  assert.match(pageSource, /rounded-full border-2 border-primary bg-surface p-0\.5/)
  assert.equal(pageSource.includes('>更换头像<'), false)
})
