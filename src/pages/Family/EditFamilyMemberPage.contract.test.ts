import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const pageSource = readFileSync(new URL('./EditFamilyMemberPage.tsx', import.meta.url), 'utf8')

test('人物编辑页复用完整黏土头像编辑器', () => {
  assert.match(pageSource, /title="编辑家人资料"/)
  assert.match(pageSource, /<FamilyAvatarEditor/)
  assert.match(pageSource, /parseClayAvatar/)
  assert.match(pageSource, /serializeClayAvatar\(previewConfig\)/)
  assert.equal(pageSource.includes('cycleVirtualAvatarId'), false)
})

test('人物编辑页保留照片与删除角色流程', () => {
  assert.match(pageSource, /mode=\{draft\.avatarMode\}/)
  assert.match(pageSource, /photo=\{draft\.photoAvatar\}/)
  assert.match(pageSource, /请先选择一张照片/)
  assert.match(pageSource, /familyMemberService\.delete/)
  assert.match(pageSource, /!sourceMember\.isSelf/)
  assert.match(pageSource, /移除这位家人/)
  assert.equal(pageSource.includes('window.confirm'), false)
})

test('人物编辑页使用统一草稿、日期校验和应用内离开确认', () => {
  assert.match(pageSource, /interface FamilyEditorDraft/)
  assert.match(pageSource, /draftFingerprint/)
  assert.match(pageSource, /validateFamilyBirthday/)
  assert.match(pageSource, /useBlocker/)
  assert.match(pageSource, /beforeunload/)
  assert.match(pageSource, /保存修改/)
  assert.match(pageSource, /已保存/)
  assert.match(pageSource, /birthday: draft\.birthday \|\| null/)
})
