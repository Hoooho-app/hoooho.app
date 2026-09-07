import assert from 'node:assert/strict'
import test from 'node:test'
import type { Member } from '../../types'
import { getChildMembers, resolveCurrentChildId } from './currentChild'

const members: Member[] = [
  { id: 'self-member', name: '刘璟宜', age: '成人', relation: '本人' },
  { id: 'ray', name: 'ray', age: '未满1个月', relation: '子女' },
  { id: 'second-child', name: '啊是的请问', age: '未满1个月', relation: '子女' }
]

test('当前记录对象只能来自我的孩子列表', () => {
  assert.deepEqual(getChildMembers(members).map((member) => member.id), ['ray', 'second-child'])
  assert.equal(resolveCurrentChildId(members, 'second-child'), 'second-child')
  assert.equal(resolveCurrentChildId(members, 'self-member'), 'ray')
  assert.equal(resolveCurrentChildId(members, 'missing-member'), 'ray')
  assert.equal(resolveCurrentChildId(members.slice(0, 1), 'self-member'), 'self')
})
