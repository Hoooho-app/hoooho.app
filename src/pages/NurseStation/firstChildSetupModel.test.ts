import assert from 'node:assert/strict'
import test from 'node:test'
import { firstChildStorageKey, firstIncompleteField, newFirstChildDraft, parseChildBirthday, parseFirstChildAnswer, restoreFirstChildDraft } from './firstChildSetupModel'
const today = new Date('2026-10-24T12:00:00+08:00')

test('姓名保留原字，生日接受明确年月日而不从年龄猜测', () => {
  assert.deepEqual(parseFirstChildAnswer('name', '她叫小禾。', today), { value: '小禾' })
  assert.deepEqual(parseFirstChildAnswer('name', '欧阳·安', today), { value: '欧阳·安' })
  assert.ok(parseFirstChildAnswer('name', ' ', today).error)
  assert.ok(parseFirstChildAnswer('name', '禾'.repeat(51), today).error)
  assert.equal(parseChildBirthday('她是二零二四年一月十五日出生的'), '2024-01-15')
  assert.deepEqual(parseFirstChildAnswer('birthday', '2024年2月29日', today), { value: '2024-02-29' })
  for (const value of ['2岁', '昨天出生', '2023年2月29日', '2026-10-25', '2018-10-24']) assert.ok(parseFirstChildAnswer('birthday', value, today).error, value)
  for (const value of ['2024-01-150', '2024年1月151日', '12024-01-15', '2024-01-15 或 2024-02-16']) assert.equal(parseChildBirthday(value), '', value)
  assert.deepEqual(parseFirstChildAnswer('birthday', '2018-10-25', today), { value: '2018-10-25' })
  assert.deepEqual(parseFirstChildAnswer('birthday', '2026-10-24', today), { value: '2026-10-24' })
})

test('性别和照顾者须明确，含混回答不会自动猜测', () => {
  assert.deepEqual(parseFirstChildAnswer('gender', '她是个女孩', today), { value: 'female' })
  assert.deepEqual(parseFirstChildAnswer('gender', '男宝宝', today), { value: 'male' })
  assert.ok(parseFirstChildAnswer('gender', '男女都可以', today).error)
  assert.ok(parseFirstChildAnswer('gender', '我不是女孩', today).error)
  assert.ok(parseFirstChildAnswer('gender', '我不确定是男孩', today).error)
  assert.deepEqual(parseFirstChildAnswer('recorder', '我是孩子的妈妈', today), { value: 'mother' })
  assert.deepEqual(parseFirstChildAnswer('recorder', '外婆', today), { value: 'maternal_grandmother' })
  assert.ok(parseFirstChildAnswer('recorder', '爸爸妈妈', today).error)
})

test('四项完成才进入核对；恢复草稿重新校验，账号存储相互隔离', () => {
  const draft = newFirstChildDraft()
  assert.equal(firstIncompleteField(draft, today), 'name')
  Object.assign(draft, { name: '小禾', birthday: '2024-01-15', gender: 'female' })
  assert.equal(firstIncompleteField(draft, today), 'recorder')
  Object.assign(draft, { recorder: 'mother', step: 'review', variant: 'european' })
  assert.equal(firstIncompleteField(draft, today), 'review')
  assert.deepEqual(restoreFirstChildDraft(draft, today), draft)
  assert.equal(restoreFirstChildDraft({ ...draft, step: 'birthday' }, today).step, 'birthday')
  assert.equal(restoreFirstChildDraft({ ...draft, birthday: '2027-01-01' }, today).step, 'birthday')
  assert.equal(restoreFirstChildDraft({ ...draft, recorder: 'unknown' }, today).step, 'recorder')
  assert.notEqual(firstChildStorageKey('first'), firstChildStorageKey('second'))
})
