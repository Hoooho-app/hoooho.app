import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const pageSource = readFileSync(new URL('./EditFamilyMemberPage.tsx', import.meta.url), 'utf8')

test('人物编辑页复用完整黏土头像编辑器', () => {
  assert.match(pageSource, /title="编辑家人信息"/)
  assert.match(pageSource, /<FamilyAvatarEditor/)
  assert.match(pageSource, /parseClayAvatar/)
  assert.match(pageSource, /serializeClayAvatar\(previewConfig!\)/)
  assert.equal(pageSource.includes('cycleVirtualAvatarId'), false)
})

test('人物编辑页保留照片与删除角色流程', () => {
  assert.match(pageSource, /mode=\{avatarMode\}/)
  assert.match(pageSource, /photo=\{photoAvatar\}/)
  assert.match(pageSource, /请先点击相机上传照片头像/)
  assert.match(pageSource, /familyMemberService\.delete/)
})
