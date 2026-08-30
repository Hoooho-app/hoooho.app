import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AVATAR_PHOTO_MAX_BINARY_BYTES,
  AVATAR_PHOTO_MAX_DATA_URL_LENGTH,
  AVATAR_PHOTO_OUTPUT_STEPS
} from '../../shared/avatar-photo-policy.mjs'
import { getCenteredSquareCrop, isSupportedAvatarPhoto } from './prepareAvatarPhoto'

test('avatar photo payload policy accounts for Base64 inflation and uses all compression steps', () => {
  assert.ok(AVATAR_PHOTO_MAX_BINARY_BYTES < AVATAR_PHOTO_MAX_DATA_URL_LENGTH)
  assert.deepEqual(AVATAR_PHOTO_OUTPUT_STEPS, [
    { size: 512, quality: 0.82 },
    { size: 512, quality: 0.70 },
    { size: 384, quality: 0.65 },
    { size: 256, quality: 0.60 }
  ])
})

test('center crop is square for landscape and portrait photos', () => {
  assert.deepEqual(getCenteredSquareCrop(4000, 3000), { sx: 500, sy: 0, side: 3000 })
  assert.deepEqual(getCenteredSquareCrop(3000, 4000), { sx: 0, sy: 500, side: 3000 })
})

test('supported mobile photo formats include extension-only HEIC files', () => {
  assert.equal(isSupportedAvatarPhoto({ name: 'portrait.JPG', type: 'image/jpeg' }), true)
  assert.equal(isSupportedAvatarPhoto({ name: 'portrait.heic', type: '' }), true)
  assert.equal(isSupportedAvatarPhoto({ name: 'portrait.avif', type: 'image/avif' }), false)
})
