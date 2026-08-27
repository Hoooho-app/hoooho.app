import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const pageSource = readFileSync(new URL('./EditFamilyMemberPage.tsx', import.meta.url), 'utf8')

test('人物编辑页提供清晰的头像类型切换和对齐描边', () => {
  assert.match(pageSource, /title="编辑家人信息"/)
  assert.match(pageSource, /\['cartoon', '卡通头像'\]/)
  assert.match(pageSource, /\['photo', '照片头像'\]/)
  assert.match(pageSource, /overflow-hidden rounded-full border-2 border-primary bg-surface p-0\.5/)
  assert.match(pageSource, /\[&_img\]:-translate-x-0\.5 \[&_img\]:scale-\[1\.12\]/)
  assert.equal(pageSource.includes('>更换头像<'), false)
})

test('照片模式先显示可点击相机，上传后保留相机更换入口', () => {
  assert.match(pageSource, /avatarMode === 'photo' && !photoAvatar/)
  assert.match(pageSource, /<Camera aria-hidden="true" size=\{34\}/)
  assert.match(pageSource, /photoAvatar \? '更换照片头像' : '上传照片头像'/)
  assert.match(pageSource, /\(avatarMode === 'cartoon' \|\| photoAvatar\)/)
  assert.match(pageSource, /请先点击相机上传照片头像/)
  const modeHandler = pageSource.slice(pageSource.indexOf('const selectAvatarMode'), pageSource.indexOf('const selectPhoto'))
  assert.equal(modeHandler.includes('photoInputRef.current?.click'), false)
})
