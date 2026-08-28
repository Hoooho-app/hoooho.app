import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clayFaceVariants,
  clayHairVariants,
  clayOutfitVariants,
  createClayAvatarConfig,
  cycleClayAvatarPart,
  parseClayAvatar,
  remapClayAvatarRole,
  resolveClayAvatarRole,
  serializeClayAvatar
} from './clayAvatar.ts'

const today = new Date('2026-08-28T12:00:00+08:00')

test('clay avatars generate a stable default from normalized family details', () => {
  const first = createClayAvatarConfig(' 刘磊 ', '1990-12-22', 'male', '', today)
  const second = createClayAvatarConfig('刘磊', '1990-12-22', 'male', '', today)
  assert.deepEqual(first, second)
  assert.equal(first.role, 'adult-male')
})

test('clay avatar roles follow the under-18, adult, and 60-plus boundaries', () => {
  assert.equal(resolveClayAvatarRole('2008-08-29', 'male', today), 'boy')
  assert.equal(resolveClayAvatarRole('2008-08-28', 'female', today), 'adult-female')
  assert.equal(resolveClayAvatarRole('1966-08-29', 'male', today), 'adult-male')
  assert.equal(resolveClayAvatarRole('1966-08-28', 'female', today), 'elder-female')
})

test('each avatar control changes only its own part and wraps at both ends', () => {
  const base = createClayAvatarConfig('测试', '1990-01-01', 'female', 'member-1', today)
  const hair = cycleClayAvatarPart({ ...base, hairVariant: clayHairVariants.at(-1)! }, 'hairVariant', 1)
  const face = cycleClayAvatarPart({ ...base, faceVariant: clayFaceVariants[0] }, 'faceVariant', -1)
  const outfit = cycleClayAvatarPart({ ...base, outfitVariant: clayOutfitVariants.at(-1)! }, 'outfitVariant', 1)
  assert.deepEqual(hair, { ...base, hairVariant: clayHairVariants[0] })
  assert.deepEqual(face, { ...base, faceVariant: clayFaceVariants.at(-1)! })
  assert.deepEqual(outfit, { ...base, outfitVariant: clayOutfitVariants[0] })
})

test('serialized clay configuration round-trips and role changes preserve chosen parts', () => {
  const base = createClayAvatarConfig('家人', '1990-01-01', 'male', 'member-2', today)
  assert.deepEqual(parseClayAvatar(serializeClayAvatar(base)), base)
  const elder = remapClayAvatarRole(base, '1950-01-01', 'male', today)
  assert.equal(elder.role, 'elder-male')
  assert.equal(elder.faceVariant, base.faceVariant)
  assert.equal(elder.hairVariant, base.hairVariant)
  assert.equal(elder.outfitVariant, base.outfitVariant)
  assert.equal(parseClayAvatar('virtual:man:1'), null)
})
