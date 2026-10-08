import test from 'node:test'
import assert from 'node:assert/strict'
import { userInitial } from './userInitial'

test('conversation avatar uses the same first character as the recorder identity', () => {
  for (const [name, initial] of [['刘磊', '刘'], ['王', '王'], ['张', '张'], ['陈', '陈'], ['李', '李'], ['  alice ', 'a']]) assert.equal(userInitial(name), initial)
  assert.equal(userInitial(undefined), '用')
  assert.equal(userInitial('123'), '1')
})
