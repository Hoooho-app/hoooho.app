import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'
import { deflateRawSync, inflateRawSync } from 'node:zlib'

const invalid = () => Object.assign(new Error('本次核对状态已过期，请重新识别照片'), { code: 'FOOD_CONTINUATION_EXPIRED', status: 409 })

// The browser retains the opaque continuation in this scan's component memory.
// No server cache, disk, persistent credential, personal records, or full-resolution photos.
// A process restart expires it; the client can then resubmit its existing photos.
export class FoodLabelContinuation {
  constructor({ now = Date.now, ttlMs = 10 * 60 * 1000 } = {}) {
    this.key = randomBytes(32)
    this.now = now
    this.ttlMs = ttlMs
  }
  create(value) {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    const plain = deflateRawSync(Buffer.from(JSON.stringify({ ...value, expiresAt: this.now() + this.ttlMs })))
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')
  }
  read(token, { accountId, memberId, scanId }) {
    try {
      if (typeof token !== 'string' || token.length > 2_000_000 || !/^[A-Za-z0-9_-]+$/.test(token)) throw invalid()
      const data = Buffer.from(token, 'base64url')
      const decipher = createDecipheriv('aes-256-gcm', this.key, data.subarray(0, 12))
      decipher.setAuthTag(data.subarray(12, 28))
      const plain = Buffer.concat([decipher.update(data.subarray(28)), decipher.final()])
      const value = JSON.parse(inflateRawSync(plain, { maxOutputLength: 2_000_000 }).toString())
      if (value.expiresAt <= this.now() || value.accountId !== accountId || value.memberId !== memberId || value.scanId !== scanId) throw invalid()
      return value
    } catch { throw invalid() }
  }
}
