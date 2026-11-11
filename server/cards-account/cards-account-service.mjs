import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'
import path from 'node:path'
import { AuthError, AuthService } from '../auth/auth-service.mjs'
import { withAccountLock } from '../auth/account-lock.mjs'
import { PasswordAttemptRepository } from '../auth/repositories/password-attempt-repository.mjs'
import { VerificationCodeRepository } from '../auth/repositories/verification-code-repository.mjs'
import { JsonStore } from '../auth/storage/json-store.mjs'
import { accountTransaction } from '../auth/storage/transaction.mjs'
import { TokenService } from '../auth/token-service.mjs'

const dayMs = 24 * 60 * 60 * 1000
const sessionTtlMs = 30 * dayMs
const proofTtlMs = 10 * 60 * 1000
const scope = 'cards:account'
const otpPurposes = ['login', 'bind', 'verify-current', 'delete']
const otpChannel = (kind, purpose) => `cards:${kind}:${purpose}`
const hash = value => createHash('sha256').update(value).digest('hex')
const unauthorized = () => new AuthError('登录已过期，请重新登录', 401, 'UNAUTHORIZED')

export class CardsAccountService {
  constructor({ auth, account, secret }) {
    if (typeof secret !== 'string' || secret.length < 32 || secret === auth.config.tokenSecret) {
      throw new Error('Cards accounts require a separate secret of at least 32 characters')
    }
    const dataDirectory = auth.config.dataDirectory
    this.secret = secret
    this.directory = dataDirectory
    this.account = account
    this.users = auth.users
    this.codes = new VerificationCodeRepository(dataDirectory, 'cards-verification-codes.json', { pruneExpired: true })
    this.auth = new AuthService({
      ...auth.config, users: this.users, codes: this.codes,
      tokens: new TokenService(secret, proofTtlMs), accountData: auth.accountData,
      passwordAttempts: auth.passwordAttempts, codeGenerator: auth.codeGenerator,
      emailProvider: auth.emailProvider, smsProvider: auth.smsProvider, logger: () => {}
    })
    this.proofs = this.auth.tokens
    this.attempts = new PasswordAttemptRepository(dataDirectory, 'cards-code-attempts.json')
    this.sessions = new JsonStore(path.join(dataDirectory, 'cards-account-sessions.json'), { sessions: [] })
  }

  contact(kind, input) {
    const value = typeof input === 'string' ? input.trim() : ''
    if (kind === 'email') return this.auth.normalizeEmail(value)
    if (kind === 'phone') {
      this.auth.validatePhone(value)
      return value
    }
    throw new AuthError('请选择手机号或邮箱', 400, 'INVALID_BINDING_KIND')
  }

  async sendCode(kind, input, purpose, clientKey, now = Date.now()) {
    const value = this.contact(kind, input)
    const requester = `cards-code-client:${hash(clientKey || 'unknown')}`
    const destination = `cards-code-target:${hash(`${kind}:${value}`)}`
    return withAccountLock(requester, () => withAccountLock(destination, async () => {
      const retryAfter = await this.attempts.assertAllowed(requester, now)
      if (retryAfter) throw new AuthError('验证码请求较频繁，请稍后再试', 429, 'CODE_RATE_LIMITED', { retryAfter })
      const entries = await Promise.all(otpPurposes.map(item => this.codes.find(otpChannel(kind, item), value)))
      const lastSent = Math.max(0, ...entries.filter(Boolean).map(entry => entry.sentAt))
      if (lastSent && lastSent + this.auth.config.resendIntervalMs > now) {
        throw new AuthError('验证码请求较频繁，请稍后再试', 429, 'CODE_RATE_LIMITED', {
          retryAfter: Math.ceil((lastSent + this.auth.config.resendIntervalMs - now) / 1000)
        })
      }
      await this.attempts.fail(requester, now)
      const channel = otpChannel(kind, purpose)
      return kind === 'email'
        ? this.auth.sendEmailCodeForChannel(channel, value, now)
        : this.auth.sendPhoneCodeForChannel(channel, value, now)
    }))
  }

  async verifyCode(kind, value, code, purpose, now) {
    const channel = otpChannel(kind, purpose)
    return kind === 'email'
      ? this.auth.verifyEmailCodeForChannel(channel, value, String(code ?? ''), now)
      : this.auth.verifyPhoneCodeForChannel(channel, value, String(code ?? ''), now)
  }

  async transaction(action) {
    const result = await accountTransaction(this.directory, async () => {
      try { return { value: await action() } }
      catch (error) {
        // Persist invalid-code attempts. Unexpected storage failures still roll back.
        if (error instanceof AuthError) return { error }
        throw error
      }
    })
    if (result.error) throw result.error
    return result.value
  }

  async login(kind, input, code, now = Date.now()) {
    const value = this.contact(kind, input)
    return this.transaction(async () => {
      await this.verifyCode(kind, value, code, 'login', now)
      const user = kind === 'email'
        ? await this.users.findOrCreateByEmail(value, new Date(now))
        : await this.users.findOrCreateByPhone(value, new Date(now))
      return this.issue(user, now)
    })
  }

  async loginWithPassword(nickname, password, clientKey, now = Date.now()) {
    const { user } = await this.auth.loginWithPassword(nickname, password, clientKey, now)
    return withAccountLock(user.id, async () => {
      const current = await this.users.findById(user.id)
      if (current?.passwordHash !== user.passwordHash) throw unauthorized()
      return this.issue(current, now)
    })
  }

  digest(value) {
    return createHmac('sha256', this.secret).update('Hoooho Cards account session v1\0').update(value).digest('hex')
  }

  credentialRevision(user) {
    return user.passwordHash ? this.proofs.credentialRevision(user.passwordHash) : null
  }

  async issue(user, now) {
    if (!user || user.guest || user.mergedInto) throw unauthorized()
    const credential = randomBytes(32).toString('base64url')
    const session = {
      id: randomUUID(), accountId: user.id, digest: this.digest(credential),
      revision: this.credentialRevision(user), expiresAt: now + sessionTtlMs
    }
    await this.sessions.update(data => ({
      sessions: [...data.sessions.filter(item => item.expiresAt > now), session]
    }))
    return { scope, credential, user: this.publicUser(user) }
  }

  publicUser(user) {
    const { id, nickname, phone, email } = user
    return { id, nickname, phone, email }
  }

  async session(credential, now) {
    if (typeof credential !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(credential)) throw unauthorized()
    const digest = this.digest(credential)
    const session = (await this.sessions.read()).sessions.find(item => item.digest === digest && item.expiresAt > now)
    if (!session) throw unauthorized()
    const user = await this.users.findById(session.accountId)
    if (!user || user.guest || user.mergedInto || session.revision !== this.credentialRevision(user)) throw unauthorized()
    return { session, user }
  }

  async withSession(credential, action, now = Date.now()) {
    const initial = await this.session(credential, now)
    return withAccountLock(initial.user.id, async () => action(await this.session(credential, now)))
  }

  async restore(credential, now = Date.now()) {
    try {
      return await this.withSession(credential, ({ user }) => ({ scope, user: this.publicUser(user) }), now)
    } catch (error) {
      if (error.code === 'UNAUTHORIZED') return { unauthenticated: true }
      throw error
    }
  }

  async logout(credential, now = Date.now()) {
    try {
      return await this.withSession(credential, async ({ session }) => {
        await this.sessions.update(data => ({ sessions: data.sessions.filter(item => item.id !== session.id) }))
        return { success: true }
      }, now)
    } catch (error) {
      if (error.code === 'UNAUTHORIZED') return { success: true }
      throw error
    }
  }

  currentContact(user, kind) {
    if (kind !== 'email' && kind !== 'phone') throw new AuthError('请选择手机号或邮箱', 400, 'INVALID_BINDING_KIND')
    if (!user[kind]) throw new AuthError('当前账户没有可用的验证方式', 409, 'NO_VERIFICATION_METHOD')
    return user[kind]
  }

  async sendBindingCode(credential, input, clientKey, now = Date.now()) {
    return this.withSession(credential, ({ user }) => {
      const { kind, purpose } = input
      if (purpose === 'verify-current') {
        return this.sendCode(kind, this.currentContact(user, kind), purpose, clientKey, now)
      }
      if (purpose !== 'bind') throw new AuthError('验证用途无效', 400, 'INVALID_BINDING_PURPOSE')
      return this.sendCode(kind, input.value, purpose, clientKey, now)
    }, now)
  }

  changePurpose(session, kind, oldValue) {
    return `cards-change:${session.id}:${kind}:${this.digest(oldValue)}`
  }

  async verifyCurrent(credential, { kind, code }, now = Date.now()) {
    return this.withSession(credential, ({ session, user }) => this.transaction(async () => {
      const oldValue = this.currentContact(user, kind)
      await this.verifyCode(kind, oldValue, code, 'verify-current', now)
      return { changeToken: this.proofs.create({ id: user.id, purpose: this.changePurpose(session, kind, oldValue) }, now) }
    }), now)
  }

  async bind(credential, { kind, value: input, code, changeToken }, now = Date.now()) {
    return this.withSession(credential, ({ session, user }) => this.transaction(async () => {
      const value = this.contact(kind, input)
      const current = user[kind]
      if (current && current !== value) {
        const proof = this.proofs.verify(String(changeToken ?? ''), now)
        if (proof?.sub !== user.id || proof?.purpose !== this.changePurpose(session, kind, current)) {
          throw new AuthError('请先验证原来的联系方式', 403, 'CURRENT_CONTACT_REQUIRED')
        }
      }
      const owner = kind === 'email' ? await this.users.findByEmail(value) : await this.users.findByPhone(value)
      if (owner && owner.id !== user.id) throw new AuthError('此联系方式已被其他账号使用', 409, 'IDENTITY_IN_USE')
      await this.verifyCode(kind, value, code, 'bind', now)
      return this.publicUser(await this.users.bindVerifiedContact(user.id, kind, value, current, new Date(now)))
    }), now)
  }

  async sendDeletionCode(credential, { kind }, clientKey, now = Date.now()) {
    return this.withSession(credential, ({ user }) => {
      return this.sendCode(kind, this.currentContact(user, kind), 'delete', clientKey, now)
    }, now)
  }

  async verifyDeletion(credential, { kind, code }, now = Date.now()) {
    return this.withSession(credential, ({ session, user }) => this.transaction(async () => {
      await this.verifyCode(kind, this.currentContact(user, kind), code, 'delete', now)
      return { deleteToken: this.proofs.create({ id: user.id, purpose: `cards-delete:${session.id}` }, now) }
    }), now)
  }

  async delete(credential, input, now = Date.now()) {
    if (input.scopeConfirmation !== 'all-hoooho-apps') {
      throw new AuthError('请先确认注销对护护账号的影响', 400, 'DELETE_SCOPE_REQUIRED')
    }
    return this.withSession(credential, async ({ session, user }) => {
      const proof = this.proofs.verify(String(input.deleteToken ?? ''), now)
      if (proof?.sub !== user.id || proof?.purpose !== `cards-delete:${session.id}`) {
        throw new AuthError('请先完成身份验证', 403, 'DELETE_VERIFICATION_REQUIRED')
      }
      const result = await this.account.deleteVerifiedAccount(user.id)
      await this.sessions.update(data => ({ sessions: data.sessions.filter(item => item.accountId !== user.id) }))
      return result
    }, now)
  }
}
