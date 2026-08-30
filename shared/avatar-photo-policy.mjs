export const AVATAR_PHOTO_MAX_DATA_URL_LENGTH = 300_000
export const AVATAR_PHOTO_MAX_REQUEST_LENGTH = 310_000

// Keep enough room for the longest supported data URL prefix and Base64 padding.
export const AVATAR_PHOTO_MAX_BINARY_BYTES = Math.floor(
  (AVATAR_PHOTO_MAX_DATA_URL_LENGTH - 'data:image/jpeg;base64,'.length) / 4
) * 3 - 2

export const AVATAR_PHOTO_OUTPUT_STEPS = Object.freeze([
  Object.freeze({ size: 512, quality: 0.82 }),
  Object.freeze({ size: 512, quality: 0.70 }),
  Object.freeze({ size: 384, quality: 0.65 }),
  Object.freeze({ size: 256, quality: 0.60 })
])

export const AVATAR_PHOTO_MIME_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp'
])
