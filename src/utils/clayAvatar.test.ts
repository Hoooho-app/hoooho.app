import assert from 'node:assert/strict'
import test from 'node:test'
import {
  appearancePresets,
  clayAvatarRoles,
  createClayAvatarConfig,
  cycleClayAvatar,
  getClayAvatarAssetPath,
  parseClayAvatar,
  remapClayAvatarRole,
  serializeClayAvatar
} from './clayAvatar.ts'

const today = new Date(2026, 7, 28, 12)

test('adult and elder clay avatars remain stable outside the child replacement', () => {
  const adult = createClayAvatarConfig('刘磊', '1990-12-22', 'male', 'member-1', today)
  assert.equal(adult.role, 'adult-male')
  assert.deepEqual(parseClayAvatar(serializeClayAvatar(adult)), adult)
  assert.equal(remapClayAvatarRole(adult, '1950-01-01', 'female', today).role, 'elder-female')
})

test('adult avatar cycling and all 24 retained assets remain valid', () => {
  const base = createClayAvatarConfig('家人', '1990-01-01', 'female', 'member-2', today)
  let current = base
  for (let index = 0; index < appearancePresets.length; index += 1) current = cycleClayAvatar(current)
  assert.deepEqual(current, base)

  const paths = clayAvatarRoles.flatMap((role) => appearancePresets.map((appearance) => getClayAvatarAssetPath({ version: 1, role, appearance })))
  assert.equal(paths.length, 24)
  assert.equal(new Set(paths).size, 24)
  assert.ok(paths.every((path) => /^\/avatars\/clay\/v1\/.+\.[a-f0-9]{10}\.webp$/.test(path)))
})

test('removed child clay roles no longer parse while adult layered history remains compatible', () => {
  assert.equal(parseClayAvatar('clay:v1:baby-girl:east-asian'), null)
  assert.equal(parseClayAvatar('clay:v1:girl:european'), null)
  assert.ok(parseClayAvatar('clay:v1:adult-male:warm:brown-side-part:teal'))
  assert.equal(parseClayAvatar('virtual:man:1'), null)
  assert.equal(parseClayAvatar('data:image/webp;base64,AAAA'), null)
})
