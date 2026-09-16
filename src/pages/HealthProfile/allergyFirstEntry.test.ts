import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync(new URL('./AllergyProfilePage.tsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../../styles/product-polish.css', import.meta.url), 'utf8')

test('首次进入直接显示当前人物和带示例的六分类入口', () => {
  assert.match(page, /if \(items\.length\) return <Dashboard/)
  assert.match(page, /return <CategoryPage member=\{member\} parent="\/health-profile"/)
  assert.match(page, /<Identity member=\{member\}/)
  assert.match(page, /allergyCategoryExamples\[id\]/)
  for (const category of ['food', 'drug', 'environment', 'insect', 'contact', 'unknown']) assert.match(page, new RegExp(`id: '${category}'`))
})

test('页面统一使用过敏与反应记录且不存在旧空状态和独立成功页', () => {
  assert.match(page, /title="过敏与反应记录"/)
  for (const removed of ['allergy-empty', '暂无过敏信息', 'ShieldCheck', 'SuccessPage', "sub[1] === 'success'", '排敏测试进行中']) assert.doesNotMatch(page, new RegExp(removed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

test('页内返回使用明确父级和 replace 防止历史栈往返', () => {
  assert.match(page, /navigate\(parent, \{ replace: true \}\)/)
  assert.match(page, /Header parent="\/health-profile\/allergy\/choose"/)
  assert.match(page, /Header parent=\{itemPath\(item\.id\)\}/)
  assert.match(page, /Header parent="\/health-profile\/allergy"/)
  assert.match(page, /replace: true, state: \{ notice:/)
})

test('对象详情同时提供新增操作和真实症状检查回看入口', () => {
  assert.match(page, /症状记录（\$\{reactions\.length\}）/)
  assert.match(page, /检查与报告（\$\{tests\.length\}）/)
  assert.match(page, /reactions\/\$\{record\.id\}/)
  assert.match(page, /tests\/\$\{record\.id\}/)
  assert.match(page, /allergyReactionSummary\(record\)/)
  assert.match(page, /allergyTestResultLabel\(record\.result\)/)
})

test('症状页提前标注最低保存条件并保留可选具体表现', () => {
  assert.match(page, /required title="出现了哪些表现？"/)
  assert.match(page, /具体表现（选填）/)
  assert.match(page, /required title="接触后多久出现？"/)
  assert.match(page, /说不清/)
  assert.match(page, /disabled=\{!systems\.length \|\| !latency\}/)
  assert.match(page, /正在记录与该对象相关的症状/)
})

test('深层页面均显示紧凑当前成员身份并校验成员归属', () => {
  assert.ok((page.match(/<Identity compact member=\{member\}/g) ?? []).length >= 7)
  assert.match(page, /candidate\.memberId === member\.id/)
  assert.match(page, /record\.memberId === member\.id/)
  assert.match(page, /没有找到属于当前家庭成员的这条记录/)
})

test('尚未明确跳过名称选择并直接创建独立对象进入症状记录', () => {
  assert.match(page, /if \(id === 'unknown'\)/)
  assert.match(page, /createUnknownAllergyItem\(member\.id, accountId\)/)
  assert.match(page, /navigate\(`\$\{itemPath\(unknown\.id\)\}\/reaction`, \{ replace: true \}\)/)
})

test('重复对象可查看继续补充且不会计入选择数量', () => {
  assert.doesNotMatch(page, /disabled=\{duplicate\}/)
  assert.match(page, /查看／继续补充/)
  assert.match(page, /onOpenExisting\(duplicate\.id\)/)
})

test('检查表单按类型适配字段并提供真实附件状态', () => {
  assert.match(page, /testSupportsStructuredResult\(type\)/)
  assert.match(page, /testSupportsNumericValue\(type\)/)
  assert.match(page, /补充信息（选填）/)
  assert.match(page, /reader\.readAsDataURL\(file\)/)
  assert.match(page, /未上传／待补充/)
  assert.match(page, /移除附件/)
})

test('iPhone SE 布局保留点击面积和底部安全空间', () => {
  assert.match(styles, /@media \(max-height: 667px\) and \(max-width: 430px\)/)
  assert.match(styles, /allergy-content\.allergy-content--with-action[^}]*safe-area-inset-bottom/)
  assert.match(styles, /\.allergy-choice button\{[^}]*min-height:44px/)
  assert.match(styles, /@media\(prefers-reduced-motion:reduce\)/)
})
