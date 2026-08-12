import assert from 'node:assert/strict'
import test from 'node:test'
import { createVirtualAvatarId, cycleVirtualAvatarId, parseVirtualAvatarId, remapVirtualAvatarId } from './virtualAvatar.ts'

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

test('legacy virtual avatar ids remain compatible', () => {
  assert.deepEqual(parseVirtualAvatarId('virtual:baby-boy:2'), { kind: 'baby-boy', variant: 2 })
  assert.deepEqual(parseVirtualAvatarId('virtual:girl:8'), { kind: 'girl', variant: 2 })
  assert.deepEqual(parseVirtualAvatarId('virtual:grandfather'), { kind: 'grandfather', variant: 0 })
})

test('profile changes remap virtual avatar roles and preserve variants', () => {
  const cases = [
    ['virtual:woman:1', '1956-08-12', 'female', 'virtual:grandmother:1'],
    ['virtual:man:2', '1961-08-12', 'male', 'virtual:grandfather:2'],
    ['virtual:grandmother:1', '1991-08-12', 'female', 'virtual:woman:1'],
    ['virtual:girl:2', '2008-08-12', 'female', 'virtual:woman:2'],
    ['virtual:man:1', '1966-08-12', 'male', 'virtual:grandfather:1'],
    ['virtual:mother:2', '1956-08-12', 'female', 'virtual:grandmother:2'],
  ] as const

  for (const [avatar, birthday, gender, expected] of cases) {
    assert.equal(remapVirtualAvatarId(avatar, birthday, gender), expected)
  }
})

test('profile changes do not replace custom avatar images', () => {
  assert.equal(
    remapVirtualAvatarId('https://example.com/avatar.jpg', '1956-08-12', 'female'),
    'https://example.com/avatar.jpg',
  )
})
