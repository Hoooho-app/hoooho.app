import path from 'node:path'
import { createHash } from 'node:crypto'
import { JsonStore } from '../storage/json-store.mjs'

const keyHash = (value) => createHash('sha256').update(value).digest('hex')

export class PasswordAttemptRepository {
  constructor(dataDirectory, filename = 'password-login-attempts.json') {
    this.store = new JsonStore(path.join(dataDirectory, filename), { attempts: [] })
  }

  async assertAllowed(key, now = Date.now()) {
    const entry = (await this.store.read()).attempts.find((item) => item.keyHash === keyHash(key))
    return entry?.lockedUntil > now ? Math.ceil((entry.lockedUntil - now) / 1000) : 0
  }

  async fail(key, now = Date.now()) {
    let result
    await this.store.update((data) => {
      const hashed = keyHash(key)
      const current = data.attempts.find((item) => item.keyHash === hashed && item.updatedAt > now - 24 * 60 * 60 * 1000)
      const failures = (current?.failures ?? 0) + 1
      const delayMs = failures < 5 ? 0 : Math.min(15 * 60 * 1000, 30_000 * (2 ** Math.min(failures - 5, 5)))
      result = { keyHash: hashed, failures, lockedUntil: now + delayMs, updatedAt: now }
      return { attempts: [...data.attempts.filter((item) => item.keyHash !== hashed && item.updatedAt > now - 24 * 60 * 60 * 1000), result] }
    })
    return result
  }

  async clear(key) {
    const hashed = keyHash(key)
    await this.store.update((data) => ({ attempts: data.attempts.filter((item) => item.keyHash !== hashed) }))
  }
}
