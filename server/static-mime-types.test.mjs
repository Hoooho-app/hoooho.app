import assert from 'node:assert/strict'
import test from 'node:test'
import { getStaticContentType } from './static-mime-types.mjs'

test('serves login background media with browser-safe MIME types', () => {
  assert.equal(getStaticContentType('login-family-care.mp4'), 'video/mp4')
  assert.equal(getStaticContentType('login-family-care-poster.webp'), 'image/webp')
})

test('keeps unknown static files on the safe binary fallback', () => {
  assert.equal(getStaticContentType('download.unknown'), 'application/octet-stream')
})
