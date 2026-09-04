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
  assert.match(pageSource, /主要记录者/)
  assert.match(pageSource, /你是孩子的谁？/)
  assert.match(pageSource, /请选择关系/)
  assert.equal(pageSource.includes('>其他亲属</span>'), false)
  assert.equal(pageSource.includes('主要照顾者'), false)
  assert.equal(pageSource.includes('其他照看者'), false)
  assert.equal(pageSource.includes('过敏情况的及时变化'), false)
  assert.match(pageSource, /保存修改/)
  assert.match(pageSource, /删除孩子资料/)
  for (const forbidden of ['就医联系人', '过敏安全', '记录管理', '出生体重', '主要想记录什么']) {
    assert.equal(pageSource.includes(forbidden), false)
  }
})

test('孩子编辑页使用真实数据、统一草稿和服务端回读确认', () => {
  assert.match(pageSource, /familyMemberService\.getCachedById/)
  assert.match(pageSource, /isChildProfileMember/)
  assert.match(pageSource, /parseStoredChildAvatar/)
  assert.match(pageSource, /remapChildAvatarSelection/)
  assert.match(pageSource, /serializeChildAvatar/)
  assert.match(pageSource, /relationship: 'child'/)
  assert.match(pageSource, /member\.primaryRecorderRelationship/)
  assert.match(pageSource, /primaryRecorderRelationship: draft\.primaryRecorderRelationship \|\| null/)
  assert.equal(pageSource.includes('draft.caregivers'), false)
  assert.equal(pageSource.includes('draft.otherRelative'), false)
  assert.equal(pageSource.includes('draft.otherCaregiver'), false)
  assert.match(pageSource, /await familyMemberService\.getById\(memberId, token\)/)
  assert.match(pageSource, /savedDataMatches/)
  assert.match(pageSource, /draftFingerprint/)
  assert.equal(pageSource.includes('localStorage'), false)
  assert.equal(pageSource.includes('nationality'), false)
  assert.equal(pageSource.includes('国籍'), false)
})

test('孩子生日、照片、保存和删除交互有完整状态保护', () => {
  assert.match(pageSource, /validateChildBirthday/)
  assert.match(pageSource, /formatChildProfileAge/)
  assert.match(pageSource, /min=\{bounds\.min\}/)
  assert.match(pageSource, /max=\{bounds\.max\}/)
  assert.match(pageSource, /photo=\{draft\.photoAvatar\}/)
  assert.match(pageSource, /saveState === 'saving'/)
  assert.match(pageSource, /setSaveState\('saved'\)/)
  assert.match(pageSource, /setSaveState\('idle'\)/)
  assert.equal(pageSource.includes('window.setTimeout'), false)
  assert.equal(pageSource.includes('goBack'), false)
  assert.match(pageSource, /familyMemberService\.delete/)
  assert.match(pageSource, /title="删除孩子资料？"/)
  assert.match(pageSource, /删除后，这个孩子的资料及相关记录将无法恢复。/)
  assert.match(pageSource, /confirmLabel="确认删除"/)
  assert.match(pageSource, /cancelLabel="取消"/)
  assert.equal(pageSource.includes('window.confirm'), false)
})

test('主要记录者关系选项完整且照顾者模块已删除', () => {
  for (const label of ['爸爸', '妈妈', '爷爷', '奶奶', '外公', '外婆', '保姆']) {
    assert.match(pageSource, new RegExp(`'${label}'`))
  }
  assert.match(pageSource, /\['other', '其他'\]/)
  assert.equal(pageSource.includes('caregiverOpen'), false)
  assert.equal(pageSource.includes('caregiver-options'), false)
})

test('孩子基本资料使用紧凑但可触达的行高和控件高度', () => {
  assert.match(pageSource, /min-h-\[64px\]/)
  assert.match(pageSource, /h-11 min-w-0/)
  assert.equal(pageSource.includes('min-h-[72px]'), false)
})
