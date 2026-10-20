import { createHmac, randomBytes, randomInt, randomUUID } from 'node:crypto'
import path from 'node:path'
import { AuthError } from '../auth/auth-service.mjs'
import { JsonStore } from '../auth/storage/json-store.mjs'
import { withStorageLock } from '../auth/storage/transaction.mjs'
import { FamilyFinanceService } from './finance-service.mjs'
import { FamilyPolicyService } from './policy-service.mjs'
import { FAMILY_ACCESS_TTL_MS } from '../../shared/family-workspace.mjs'

const SESSION_TTL_MS = 8 * 60 * 60 * 1000
const RATE_WINDOW_MS = 15 * 60 * 1000
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const invalidCode = () => new AuthError('登录码无效、已到期或已被撤销，请联系 Ray 获取新的登录码。', 401, 'FAMILY_CODE_INVALID')

export class FamilyWorkspaceService {
  constructor({ auth, dataDirectory, tokenSecret, now = Date.now }) {
    this.auth = auth
    this.dataDirectory = dataDirectory
    this.secret = tokenSecret
    this.now = now
    this.finance = new FamilyFinanceService(this)
    this.policies = new FamilyPolicyService(this)
    this.store = new JsonStore(path.join(dataDirectory, 'family-workspace-access.json'), { codes: [], sessions: [], rates: [] })
  }

  hash(kind, value) {
    return createHmac('sha256', this.secret).update(`Hoooho family ${kind} v1\0`).update(value).digest('hex')
  }

  ownerEmail() { return this.auth.opsOwnerEmail() }

  async throttle(action, client, limit) {
    const now = this.now()
    const keys = [this.hash('rate', `${action}:${client}`), this.hash('rate', `${action}:global`)]
    let blocked = false
    await this.store.update(state => {
      const rates = state.rates.filter(rate => rate.until > now).map(rate => ({ ...rate }))
      keys.forEach((key, index) => {
        const rate = rates.find(item => item.key === key)
        const max = index ? limit * 20 : limit
        if (rate && rate.count >= max) blocked = true
      })
      if (!blocked) keys.forEach(key => {
        const rate = rates.find(item => item.key === key)
        if (rate) rate.count += 1
        else rates.push({ key, count: 1, until: now + RATE_WINDOW_MS })
      })
      return { ...state, rates: rates.slice(-5000) }
    })
    if (blocked) throw new AuthError('尝试过于频繁，请 15 分钟后再试。', 429, 'FAMILY_RATE_LIMITED')
  }

  async sendAdminCode(email, client) {
    await this.throttle('admin-email', client, 5)
    const normalized = this.auth.normalizeEmail(email)
    const owner = this.ownerEmail()
    if (normalized !== owner) return { success: true, retryAfter: 60 }
    return this.auth.sendEmailCodeForChannel('family-admin-email', owner, this.now())
  }

  async adminLogin(email, code, remember, client) {
    await this.throttle('admin-login', client, 10)
    const normalized = this.auth.normalizeEmail(email)
    if (normalized !== this.ownerEmail()) throw new AuthError('邮箱或验证码无效。', 403, 'FAMILY_ADMIN_FORBIDDEN')
    return withStorageLock(async () => {
      await this.auth.verifyEmailCodeForChannel('family-admin-email', normalized, String(code ?? ''), this.now())
      return this.createSession({ role: 'admin', name: 'Ray', email: normalized }, remember)
    })
  }

  normalizeCode(value) {
    if (typeof value !== 'string' || value.length > 80) throw invalidCode()
    const code = value.trim().toUpperCase().replace(/^RAY-/, '').replace(/[\s-]/g, '')
    if (!/^[A-HJ-NP-Z2-9]{20}$/.test(code)) throw invalidCode()
    return code
  }

  async memberLogin(value, remember, client) {
    await this.throttle('member-login', client, 15)
    const hash = this.hash('code', this.normalizeCode(value))
    return this.createSession({ role: 'member', codeHash: hash }, remember)
  }

  async createSession(identity, remember) {
    const now = this.now()
    const raw = randomBytes(32).toString('base64url')
    const session = { id: this.hash('session', raw), role: identity.role, name: identity.name, email: identity.email, createdAt: now, expiresAt: now + (remember ? FAMILY_ACCESS_TTL_MS : SESSION_TTL_MS) }
    await this.store.update(state => {
      const codes = state.codes.map(code => ({ ...code }))
      if (identity.role === 'member') {
        const code = codes.find(item => item.hash === identity.codeHash && !item.revokedAt && item.expiresAt > now)
        if (!code) throw invalidCode()
        session.codeId = code.id
        session.name = code.label
        session.expiresAt = Math.min(session.expiresAt, code.expiresAt)
        code.lastUsedAt = now
      }
      return { ...state, codes, sessions: [...state.sessions.filter(item => item.expiresAt > now), session].slice(-1000) }
    })
    return { raw, remember: Boolean(remember), session: this.publicSession(session) }
  }

  publicSession(session) {
    return { authenticated: true, role: session.role, name: session.name, expiresAt: session.expiresAt }
  }

  async current(raw, requireAdmin = false) {
    if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(raw)) return null
    const state = await this.store.read()
    const session = state.sessions.find(item => item.id === this.hash('session', raw) && item.expiresAt > this.now())
    if (!session) return null
    if (session.role === 'admin') {
      if (session.email !== this.ownerEmail()) return null
    } else if (session.role === 'member') {
      if (!state.codes.some(code => code.id === session.codeId && !code.revokedAt && code.expiresAt > this.now())) return null
    } else return null
    if (requireAdmin && session.role !== 'admin') throw new AuthError('只有 Ray 可以管理家人登录码。', 403, 'FAMILY_ADMIN_REQUIRED')
    return session
  }

  async requireAdmin(raw) {
    const session = await this.current(raw, true)
    if (!session) throw new AuthError('请先用管理员邮箱登录。', 401, 'FAMILY_LOGIN_REQUIRED')
    return session
  }

  async createCode(raw, label) {
    await this.requireAdmin(raw)
    if (typeof label !== 'string' || !label.trim() || label.trim().length > 30 || /[\u0000-\u001f\u007f]/.test(label)) {
      throw new AuthError('请输入 1–30 字的家人称呼。', 400, 'FAMILY_LABEL_INVALID')
    }
    const now = this.now()
    const text = Array.from({ length: 20 }, () => alphabet[randomInt(alphabet.length)]).join('')
    const code = { id: randomUUID(), label: label.trim(), hash: this.hash('code', text), createdAt: now, expiresAt: now + FAMILY_ACCESS_TTL_MS, revokedAt: null, lastUsedAt: null }
    await this.store.update(state => {
      if (state.codes.filter(item => !item.revokedAt && item.expiresAt > now).length >= 100) throw new AuthError('有效登录码已达上限，请先撤销不再使用的登录码。', 400, 'FAMILY_CODE_LIMIT')
      return { ...state, codes: [...state.codes, code].slice(-2000) }
    })
    return { ...this.publicCode(code), loginCode: `RAY-${text.match(/.{4}/g).join('-')}` }
  }

  publicCode(code) {
    return { id: code.id, label: code.label, createdAt: code.createdAt, expiresAt: code.expiresAt, lastUsedAt: code.lastUsedAt, status: code.revokedAt ? 'revoked' : code.expiresAt <= this.now() ? 'expired' : 'active' }
  }

  async listCodes(raw) {
    await this.requireAdmin(raw)
    return { codes: (await this.store.read()).codes.map(code => this.publicCode(code)).reverse() }
  }

  async revokeCode(raw, id) {
    await this.requireAdmin(raw)
    await this.store.update(state => {
      if (!state.codes.some(code => code.id === id)) throw new AuthError('登录码不存在。', 404, 'FAMILY_CODE_NOT_FOUND')
      return { ...state, codes: state.codes.map(code => code.id === id ? { ...code, revokedAt: code.revokedAt ?? this.now() } : code), sessions: state.sessions.filter(session => session.codeId !== id) }
    })
    return { success: true }
  }

  async logout(raw) {
    if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(raw)) return { success: true }
    const id = typeof raw === 'string' ? this.hash('session', raw) : ''
    await this.store.update(state => ({ ...state, sessions: state.sessions.filter(session => session.id !== id && session.expiresAt > this.now()) }))
    return { success: true }
  }
}
