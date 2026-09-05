import { createHash, randomBytes, randomUUID } from 'node:crypto'
import path from 'node:path'
import { JsonStore } from './storage/json-store.mjs'

export const sessionTtlMs = 180 * 24 * 60 * 60 * 1000
const hash = (token) => createHash('sha256').update(token).digest('hex')

export class SessionRepository {
  constructor(dataDirectory) {
    this.store = new JsonStore(path.join(dataDirectory, 'browser-sessions.json'), { sessions: [] })
  }

  async create(accountId, now = Date.now()) {
    const token = randomBytes(32).toString('base64url')
    const session = { id: randomUUID(), accountId, tokenHash: hash(token), createdAt: now, expiresAt: now + sessionTtlMs, lastSeenAt: now }
    await this.store.update((data) => ({ ...data, sessions: [...data.sessions, session] }))
    return { token, session }
  }

  async find(token, now = Date.now()) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token ?? '')) return null
    return (await this.store.read()).sessions.find((item) => item.tokenHash === hash(token) && !item.revokedAt && item.expiresAt > now) ?? null
  }

  async renew(token, now = Date.now()) {
    let session = null
    await this.store.update((data) => ({ ...data, sessions: data.sessions.map((item) => {
      if (item.tokenHash !== hash(token) || item.revokedAt || item.expiresAt <= now) return item
      session = { ...item, lastSeenAt: now, expiresAt: now + sessionTtlMs }
      return session
    }) }))
    return session
  }

  async attach(token, accountId) {
    let attached = false
    await this.store.update((data) => ({ ...data, sessions: data.sessions.map((item) => {
      if (item.tokenHash !== hash(token) || item.accountId || item.revokedAt || item.expiresAt <= Date.now()) return item
      attached = true
      return { ...item, accountId }
    }) }))
    if (!attached) throw new Error('Browser session could not be attached')
  }

  async revokeAccount(accountId, now = Date.now()) {
    await this.store.update((data) => ({ ...data, sessions: data.sessions.map((item) => item.accountId === accountId ? { ...item, revokedAt: now } : item) }))
  }
}
