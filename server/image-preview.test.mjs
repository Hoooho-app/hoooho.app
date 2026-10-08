import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { imagePreview } from './image-preview.mjs'
import { EventAttachmentService } from './events/event-attachment-service.mjs'

test('large clinical image gets a bounded thumbnail; original bytes and aspect ratio remain intact', async () => {
  const buffer = await sharp({ create: { width: 2560, height: 1600, channels: 3, background: '#a98365' } }).png().toBuffer()
  const original = Buffer.from(buffer)
  const file = { buffer, mimeType: 'image/png' }
  const preview = await imagePreview(file), metadata = await sharp(preview.buffer).metadata()
  assert.equal(preview.mimeType, 'image/webp')
  assert.ok(preview.buffer.length <= 80 * 1024)
  assert.equal(metadata.width, 640); assert.equal(metadata.height, 400)
  assert.deepEqual(buffer, original)
  assert.equal(await imagePreview(file), preview)
})

test('thumbnail endpoint checks account and event ownership before returning cached images', async () => {
  const buffer = await sharp({ create: { width: 1400, height: 1000, channels: 3, background: '#ddd' } }).png().toBuffer()
  const service = new EventAttachmentService({ records: {}, imageAnalysis: {}, events: { findById: async id => id === 'event-a' ? { accountId: 'account-a' } : null }, repository: { findById: async () => ({ accountId: 'account-a', eventId: 'event-a', dataUrl: `data:image/png;base64,${buffer.toString('base64')}` }) } })
  const thumbnail = await service.read('account-a', 'event-a', 'photo', 'preview')
  assert.equal(thumbnail.mimeType, 'image/webp')
  const original = await service.read('account-a', 'event-a', 'photo')
  assert.deepEqual(original.buffer, buffer)
  await assert.rejects(service.read('account-b', 'event-a', 'photo', 'preview'), { status: 404 })
  await assert.rejects(service.read('account-a', 'event-b', 'photo', 'preview'), { status: 404 })
})

test('non-image originals are unchanged', async () => {
  const file = { buffer: Buffer.from('original-video-or-pdf'), mimeType: 'application/pdf' }
  assert.equal(await imagePreview(file), file)
})
