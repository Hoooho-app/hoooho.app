import assert from 'node:assert/strict'
import test from 'node:test'
import { createVirtualAvatarId, cycleVirtualAvatarId, parseVirtualAvatarId } from './virtualAvatar.ts'

const today = new Date('2026-08-12T12:00:00+08:00')

test('virtual avatars map age and gender to distinct family roles', () => {
  const cases = [
    ['2025-08-12', 'male', 'virtual:baby-boy'],
    ['2025-08-12', 'female', 'virtual:baby-girl'],
    ['2018-08-12', 'male', 'virtual:boy'],
    ['2018-08-12', 'female', 'virtual:girl'],
    ['1990-08-12', 'male', 'virtual:man'],
    ['1990-08-12', 'female', 'virtual:woman'],
    ['1950-08-12', 'male', 'virtual:grandfather'],
    ['1950-08-12', 'female', 'virtual:grandmother'],
  ] as const

  for (const [birthday, gender, expected] of cases) {
    assert.equal(createVirtualAvatarId(birthday, gender, today), expected)
  }
})

test('virtual avatars keep their role while cycling through three variants', () => {
  const first = cycleVirtualAvatarId('virtual:woman', '1990-08-12', 'female')
  const second = cycleVirtualAvatarId(first, '1990-08-12', 'female')
  const third = cycleVirtualAvatarId(second, '1990-08-12', 'female')

  assert.deepEqual([first, second, third], ['virtual:woman:1', 'virtual:woman:2', 'virtual:woman:0'])
  assert.deepEqual(parseVirtualAvatarId(second), { kind: 'woman', variant: 2 })
})
