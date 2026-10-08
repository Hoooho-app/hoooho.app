import test from 'node:test'
import assert from 'node:assert/strict'
import { userInitial } from './userInitial'

test('conversation initial belongs to the recorder nickname, with Latin and Chinese support', () => {
  for (const [name, initial] of [['刘磊', 'L'], ['王', 'W'], ['张', 'Z'], ['陈', 'C'], ['李', 'L'], ['  alice ', 'A']]) assert.equal(userInitial(name), initial)
  assert.equal(userInitial(undefined), 'U')
  assert.equal(userInitial('123'), 'U')
})
