import assert from 'node:assert/strict'
import test from 'node:test'
import {
  childAvatarAges,
  childAvatarVariants,
  createChildAvatarSelection,
  cycleChildAvatar,
  getChildAvatarAge,
  parseStoredChildAvatar,
  remapChildAvatarSelection,
  resolveChildAvatar,
  serializeChildAvatar
} from './childAvatar.ts'

test('child avatar age uses pure calendar dates across required boundaries', () => {
  const cases = [
    ['2026-09-04', '2026-09-04', 0],
    ['2025-09-05', '2026-09-04', 0],
    ['2025-09-04', '2026-09-04', 1],
    ['2024-09-04', '2026-09-04', 2],
    ['2020-09-04', '2026-09-04', 6],
    ['2019-09-04', '2026-09-04', 7],
    ['2024-02-29', '2025-02-28', 0],
    ['2024-02-29', '2025-03-01', 1],
    ['2019-12-31', '2026-12-30', 6],
    ['2019-12-31', '2026-12-31', 7]
  ] as const
  for (const [birthDate, today, expected] of cases) assert.equal(getChildAvatarAge(birthDate, today), expected)
})

test('Shanghai and Tokyo midnight do not use the UTC server date', () => {
  const instant = new Date('2026-09-03T16:30:00.000Z')
  assert.equal(getChildAvatarAge('2025-09-04', instant, 'Asia/Shanghai'), 1)
  assert.equal(getChildAvatarAge('2025-09-04', instant, 'Asia/Tokyo'), 1)
  assert.equal(getChildAvatarAge('2025-09-04', instant, 'UTC'), 0)
  assert.equal(getChildAvatarAge('2026-09-04', instant, 'Asia/Shanghai'), 0)
})

test('gender and birthday changes preserve the selected variant', () => {
  const current = { age: 4, gender: 'girl', variant: 'african' } as const
  assert.deepEqual(remapChildAvatarSelection(current, '2022-09-04', 'male', '2026-09-04'), {
    age: 4, gender: 'boy', variant: 'african'
  })
  assert.deepEqual(remapChildAvatarSelection(current, '2021-09-04', 'female', '2026-09-04'), {
    age: 5, gender: 'girl', variant: 'african'
  })
})

test('change avatar follows the fixed three-variant loop without changing age or gender', () => {
  const first = createChildAvatarSelection('2022-09-04', 'female', '2026-09-04')
  const second = cycleChildAvatar(first)
  const third = cycleChildAvatar(second)
  const fourth = cycleChildAvatar(third)
  assert.equal(first.variant, 'east-asian')
  assert.equal(second.variant, 'european')
  assert.equal(third.variant, 'african')
  assert.deepEqual(fourth, first)
})

test('all 48 age, gender, and variant combinations resolve to unique hashed WebP files', () => {
  const paths = childAvatarAges.flatMap((age) => (
    (['girl', 'boy'] as const).flatMap((gender) => childAvatarVariants.map((variant) => resolveChildAvatar({ age, gender, variant })))
  ))
  assert.equal(paths.length, 48)
  assert.equal(new Set(paths).size, 48)
  assert.ok(paths.every((path) => /^\/avatars\/children\/v1\/.+\.[a-f0-9]{10}\.webp$/.test(path)))
})

test('saved selections round-trip and legacy child IDs migrate without treating photos as cartoons', () => {
  const selection = { age: 4, gender: 'girl', variant: 'european' } as const
  assert.deepEqual(parseStoredChildAvatar(serializeChildAvatar(selection)), selection)
  assert.deepEqual(parseStoredChildAvatar('clay:v1:toddler-girl:african', '2022-09-04', 'female'), {
    age: 4, gender: 'girl', variant: 'african'
  })
  assert.deepEqual(parseStoredChildAvatar('clay:v1:girl:south-asian', '2022-09-04', 'female'), {
    age: 4, gender: 'girl', variant: 'east-asian'
  })
  assert.deepEqual(parseStoredChildAvatar('virtual:baby-boy:2', '2026-09-04', 'male'), {
    age: 0, gender: 'boy', variant: 'african'
  })
  assert.equal(parseStoredChildAvatar('data:image/webp;base64,AAAA', '2022-09-04', 'female'), null)
  assert.equal(parseStoredChildAvatar('https://example.com/photo.webp', '2022-09-04', 'female'), null)
})
