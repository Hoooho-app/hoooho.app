import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const pageSource = readFileSync(new URL('./EditFamilyMemberPage.tsx', import.meta.url), 'utf8')

test('孩子编辑页只呈现冻结的信息架构', () => {
  assert.match(pageSource, /title="编辑孩子资料"/)
  assert.match(pageSource, /childProfile/)
  assert.match(pageSource, /卡通形象|FamilyAvatarEditor/)
  assert.match(pageSource, /姓名/)
  assert.match(pageSource, /出生日期/)
  assert.match(pageSource, /性别/)
  assert.match(pageSource, /主要照顾者/)
  assert.match(pageSource, /可多选/)
  assert.match(pageSource, /其他亲属/)
  assert.match(pageSource, /其他照看者/)
  assert.match(pageSource, /过敏情况的及时变化，可以同步给其他照看者/)
  assert.match(pageSource, /保存修改/)
  assert.match(pageSource, /删除孩子资料/)
  for (const forbidden of ['就医联系人', '过敏安全', '记录管理', '出生体重', '主要想记录什么']) {
    assert.equal(pageSource.includes(forbidden), false)
  }
})

test('孩子编辑页使用真实数据、统一草稿和服务端回读确认', () => {
  assert.match(pageSource, /member\.caregivers \?\? \[\]/)
  assert.match(pageSource, /member\.otherRelative \?\? ''/)
  assert.match(pageSource, /member\.otherCaregiver \?\? ''/)
  assert.match(pageSource, /caregivers: draft\.caregivers/)
  assert.match(pageSource, /otherRelative: draft\.otherRelative\.trim\(\) \|\| null/)
  assert.match(pageSource, /otherCaregiver: draft\.otherCaregiver\.trim\(\) \|\| null/)
  assert.match(pageSource, /await familyMemberService\.getById\(memberId, token\)/)
  assert.match(pageSource, /caregiverDataMatches/)
  assert.match(pageSource, /draftFingerprint/)
  assert.equal(pageSource.includes('localStorage'), false)
})

test('孩子生日、照片、保存和删除交互有完整状态保护', () => {
  assert.match(pageSource, /validateChildBirthday/)
  assert.match(pageSource, /formatChildProfileAge/)
  assert.match(pageSource, /min=\{bounds\.min\}/)
  assert.match(pageSource, /max=\{bounds\.max\}/)
  assert.match(pageSource, /photo=\{draft\.photoAvatar\}/)
  assert.match(pageSource, /saveState === 'saving'/)
  assert.match(pageSource, /familyMemberService\.delete/)
  assert.match(pageSource, /title="删除孩子资料？"/)
  assert.match(pageSource, /删除后，这个孩子的资料及相关记录将无法恢复。/)
  assert.match(pageSource, /confirmLabel="确认删除"/)
  assert.match(pageSource, /cancelLabel="取消"/)
  assert.equal(pageSource.includes('window.confirm'), false)
})

test('照顾者固定选项完整且自定义项不是固定按钮', () => {
  for (const label of ['爸爸', '妈妈', '爷爷', '奶奶', '外公', '外婆', '保姆']) {
    assert.match(pageSource, new RegExp(`'${label}'`))
  }
  assert.match(pageSource, /placeholder="请输入称呼"/)
  assert.match(pageSource, /placeholder="请输入称呼或姓名"/)
})
