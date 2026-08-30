import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import test from 'node:test'
import {
  appearancePresets,
  clayAvatarRoles,
  createClayAvatarConfig,
  cycleClayAvatar,
  getClayAvatarAssetPath,
  getClayAvatarViewport,
  parseClayAvatar,
  remapClayAvatarRole,
  resolveClayAvatarRole,
  serializeClayAvatar
} from './clayAvatar.ts'

const today = new Date('2026-08-28T12:00:00+08:00')

test('complete clay avatars generate a stable default from normalized family details', () => {
  const first = createClayAvatarConfig(' 刘磊 ', '1990-12-22', 'male', '', today)
  const second = createClayAvatarConfig('刘磊', '1990-12-22', 'male', '', today)
  assert.deepEqual(first, second)
  assert.equal(first.role, 'adult-male')
  assert.ok(appearancePresets.includes(first.appearance))
})

test('avatar roles follow infant, toddler, child, adult, and elder boundaries', () => {
  assert.equal(resolveClayAvatarRole('2025-09-29', 'male', today), 'baby-boy')
  assert.equal(resolveClayAvatarRole('2025-08-28', 'female', today), 'toddler-girl')
  assert.equal(resolveClayAvatarRole('2023-08-29', 'male', today), 'toddler-boy')
  assert.equal(resolveClayAvatarRole('2023-08-28', 'female', today), 'girl')
  assert.equal(resolveClayAvatarRole('2008-08-28', 'female', today), 'adult-female')
  assert.equal(resolveClayAvatarRole('1966-08-29', 'male', today), 'adult-male')
  assert.equal(resolveClayAvatarRole('1966-08-28', 'female', today), 'elder-female')
})

test('change avatar cycles all six appearances once before wrapping and preserves role', () => {
  const base = { version: 1, role: 'adult-female', appearance: appearancePresets[0] } as const
  const seen = new Set([base.appearance])
  let current = base
  for (let index = 1; index < appearancePresets.length; index += 1) {
    current = cycleClayAvatar(current)
    assert.equal(current.role, base.role)
    assert.equal(seen.has(current.appearance), false)
    seen.add(current.appearance)
  }
  assert.equal(seen.size, 6)
  assert.deepEqual(cycleClayAvatar(current), base)
})

test('serialization round-trips and profile changes preserve appearance', () => {
  const base = createClayAvatarConfig('家人', '1990-01-01', 'male', 'member-2', today)
  assert.deepEqual(parseClayAvatar(serializeClayAvatar(base)), base)
  const elder = remapClayAvatarRole(base, '1950-01-01', 'male', today)
  assert.equal(elder.role, 'elder-male')
  assert.equal(elder.appearance, base.appearance)
  const female = remapClayAvatarRole(base, '1950-01-01', 'female', today)
  assert.equal(female.role, 'elder-female')
  assert.equal(female.appearance, base.appearance)
})

test('all role and appearance pairs resolve to versioned complete-avatar assets', () => {
  const paths = clayAvatarRoles.flatMap((role) => appearancePresets.map((appearance) => getClayAvatarAssetPath({ version: 1, role, appearance })))
  assert.equal(paths.length, 60)
  assert.equal(new Set(paths).size, 60)
  assert.ok(paths.every((path) => /^\/avatars\/clay\/v1\/.+\.[a-f0-9]{10}\.webp$/.test(path)))
  assert.ok(paths.every((path) => existsSync(new URL(`../../public${path}`, import.meta.url))))
})

test('approved avatar sheets use focal-point viewports that centre every appearance', () => {
  const viewports = appearancePresets.map((appearance) => getClayAvatarViewport({ version: 1, role: 'adult-male', appearance }))
  assert.ok(viewports.every((viewport) => viewport.height === '120%' && viewport.width === '120%'))
  assert.equal(new Set(viewports.map((viewport) => viewport.left)).size, appearancePresets.length)
  assert.ok(viewports.every((viewport) => Number.parseFloat(viewport.left) >= -22 && Number.parseFloat(viewport.left) <= 2))
  assert.ok(viewports.every((viewport) => Number.parseFloat(viewport.top) >= -12 && Number.parseFloat(viewport.top) <= -2))
})

test('each role uses its own horizontal subject focal point', () => {
  const appearance = 'middle-eastern-north-african' as const
  const adultMale = getClayAvatarViewport({ version: 1, role: 'adult-male', appearance })
  const boy = getClayAvatarViewport({ version: 1, role: 'boy', appearance })
  const elderMale = getClayAvatarViewport({ version: 1, role: 'elder-male', appearance })

  assert.equal(adultMale.left, '-9.88%')
  assert.equal(boy.left, '-9.4%')
  assert.equal(elderMale.left, '-11.68%')
  assert.equal(adultMale.top, boy.top)
  assert.equal(adultMale.top, elderMale.top)
})

test('previous layered avatar values migrate safely while photos and virtual ids remain separate', () => {
  const legacy = 'clay:v1:boy:warm:brown-side-part:teal'
  const first = parseClayAvatar(legacy)
  assert.ok(first)
  assert.deepEqual(parseClayAvatar(legacy), first)
  assert.equal(first.role, 'boy')
  assert.ok(appearancePresets.includes(first.appearance))
  assert.equal(parseClayAvatar('virtual:man:1'), null)
  assert.equal(parseClayAvatar('data:image/webp;base64,AAAA'), null)
})
