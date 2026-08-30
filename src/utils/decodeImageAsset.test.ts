import assert from 'node:assert/strict'
import test from 'node:test'
import { clearDecodedImageAssetCache, decodeImageAsset } from './decodeImageAsset.ts'

test('decoded image requests are shared and wait for decode before resolving', async () => {
  const OriginalImage = globalThis.Image
  let instances = 0
  let decodes = 0

  class FakeImage {
    complete = true
    decoding = 'auto'
    fetchPriority = 'auto'
    naturalWidth = 512
    onerror: (() => void) | null = null
    onload: (() => void) | null = null

    constructor() { instances += 1 }
    set src(_value: string) { queueMicrotask(() => this.onload?.()) }
    async decode() { decodes += 1 }
  }

  Object.assign(globalThis, { Image: FakeImage })
  clearDecodedImageAssetCache()
  try {
    const first = decodeImageAsset('/avatar.webp', 'high')
    const second = decodeImageAsset('/avatar.webp', 'low')
    assert.equal(first, second)
    await Promise.all([first, second])
    assert.equal(instances, 1)
    assert.equal(decodes, 1)
  } finally {
    clearDecodedImageAssetCache()
    Object.assign(globalThis, { Image: OriginalImage })
  }
})

test('a failed image is evicted so a later request can retry', async () => {
  const OriginalImage = globalThis.Image
  let instances = 0

  class FakeImage {
    complete = false
    decoding = 'auto'
    fetchPriority = 'auto'
    naturalWidth = 0
    onerror: (() => void) | null = null
    onload: (() => void) | null = null

    constructor() { instances += 1 }
    set src(_value: string) { queueMicrotask(() => this.onerror?.()) }
  }

  Object.assign(globalThis, { Image: FakeImage })
  clearDecodedImageAssetCache()
  try {
    await assert.rejects(decodeImageAsset('/broken.webp'))
    await assert.rejects(decodeImageAsset('/broken.webp'))
    assert.equal(instances, 2)
  } finally {
    clearDecodedImageAssetCache()
    Object.assign(globalThis, { Image: OriginalImage })
  }
})
