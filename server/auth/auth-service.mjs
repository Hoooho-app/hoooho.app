import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { authConfig, emailPattern, mainlandPhonePattern } from './config.mjs'
import { UserRepository } from './repositories/user-repository.mjs'
import { VerificationCodeRepository } from './repositories/verification-code-repository.mjs'
import { TokenService } from './token-service.mjs'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { EmailProviderError, ResendEmailVerificationProvider } from './providers/email-verification-provider.mjs'
import { AccountDataService } from '../account/account-data-service.mjs'
import { registerTransactionRoot } from './storage/transaction.mjs'
import bcrypt from 'bcryptjs'
import { PasswordAttemptRepository } from './repositories/password-attempt-repository.mjs'
import { hashRegistrationKey } from './repositories/user-repository.mjs'
import { SessionRepository } from './session-repository.mjs'
import { isValidNickname, normalizeNickname, nicknameKey } from './nickname.mjs'

const dummyPasswordHash = bcrypt.hashSync('Hoooho-dummy-password', 12)

export class AuthError extends Error {
  constructor(message, status = 400, code = 'AUTH_ERROR', details = {}) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

const hashCode = (channel, identifier, code, salt) => createHash('sha256').update(`${channel}:${identifier}:${code}:${salt}`).digest('hex')
const maskEmail = (email) => {
  const [local, domain] = email.split('@')
  return `${local.slice(0, 1)}***@${domain}`
}

export class AuthService {
  constructor(options = {}) {
    const config = { ...authConfig, ...options }
    this.config = config
    registerTransactionRoot(config.dataDirectory)
    this.codes = options.codes ?? new VerificationCodeRepository(config.dataDirectory)
    this.users = options.users ?? new UserRepository(config.dataDirectory)
    this.members = options.members ?? new FamilyMemberRepository(config.dataDirectory)
    this.tokens = options.tokens ?? new TokenService(config.tokenSecret, config.tokenTtlMs)
    this.emailProvider = options.emailProvider ?? new ResendEmailVerificationProvider({
      apiKey: config.resendApiKey,
      from: config.authEmailFrom
    })
    this.smsProvider = options.smsProvider ?? null
    this.codeGenerator = options.codeGenerator ?? (() => String(randomInt(0, 1_000_000)).padStart(6, '0'))
    this.logger = options.logger ?? console.info
    this.accountData = options.accountData ?? new AccountDataService(config)
    this.passwordAttempts = options.passwordAttempts ?? new PasswordAttemptRepository(config.dataDirectory)
    this.registrationAttempts = options.registrationAttempts ?? new PasswordAttemptRepository(config.dataDirectory, 'registration-attempts.json')
    this.sessions = options.sessions ?? new SessionRepository(config.dataDirectory)
  }

  validateNickname(value) {
    const nickname = normalizeNickname(value)
    if (!isValidNickname(nickname)) throw new AuthError('请输入 1–20 个中文、英文或数字', 400, 'INVALID_NICKNAME')
    return nickname
  }

  validatePassword(value) {
    const password = String(value ?? '')
    if (password.length < 6 || password.length > 64) throw new AuthError('密码需为 6–64 个字符', 400, 'INVALID_PASSWORD')
    return password
  }

  async register(nicknameValue, passwordValue, idempotencyKey, guestId = null, now = Date.now()) {
    const nickname = this.validateNickname(nicknameValue)
    const password = this.validatePassword(passwordValue)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
      throw new AuthError('请重试注册', 400, 'INVALID_IDEMPOTENCY_KEY')
    }
    const passwordHash = await bcrypt.hash(password, 12)
    let user
    try { user = await this.users.register({ nickname, passwordHash, registrationKeyHash: hashRegistrationKey(idempotencyKey), guestId }, new Date(now)) }
    catch (error) {
      if (error?.code === 'NICKNAME_IN_USE') throw new AuthError(error.message, 409, error.code)
      throw error
    }
    return { token: this.tokens.create(user, now), user }
  }

  async assertRegistrationAllowed(clientKey, now = Date.now()) {
    const key = `register:${String(clientKey || 'unknown')}`
    const retryAfter = await this.registrationAttempts.assertAllowed(key, now)
    if (retryAfter) throw new AuthError('注册请求过于频繁，请稍后再试', 429, 'REGISTER_RATE_LIMITED', { retryAfter })
    await this.registrationAttempts.fail(key, now)
  }

  async loginWithPassword(nicknameValue, passwordValue, clientKey = '', now = Date.now()) {
    const nickname = normalizeNickname(nicknameValue)
    const password = String(passwordValue ?? '')
    if (!isValidNickname(nickname) || password.length < 6 || password.length > 64) throw new AuthError('昵称或密码不正确', 401, 'INVALID_CREDENTIALS')
    const attemptKey = `${nicknameKey(nickname)}:${clientKey}`
    const retryAfter = await this.passwordAttempts.assertAllowed(attemptKey, now)
    if (retryAfter) throw new AuthError('昵称或密码不正确，请稍后再试', 429, 'PASSWORD_LOGIN_RATE_LIMITED', { retryAfter })
    const user = await this.users.findByNickname(nickname)
    const valid = await bcrypt.compare(password, user?.passwordHash ?? dummyPasswordHash) && Boolean(user?.passwordHash)
    if (!valid) {
      const failed = await this.passwordAttempts.fail(attemptKey, now)
      this.logger(`[Hoooho auth] password login rejected nicknameHash=${createHash('sha256').update(nicknameKey(nickname)).digest('hex').slice(0, 10)} failures=${failed.failures}`)
      throw new AuthError('昵称或密码不正确', 401, 'INVALID_CREDENTIALS')
    }
    await this.passwordAttempts.clear(attemptKey)
    this.logger(`[Hoooho auth] password login accepted nicknameHash=${createHash('sha256').update(nicknameKey(nickname)).digest('hex').slice(0, 10)}`)
    return { token: this.tokens.create(user, now), user }
  }

  async setPassword(accountId, input, now = Date.now()) {
    const user = await this.users.findById(accountId)
    if (!user || user.guest) throw new AuthError('账户不存在', 404, 'ACCOUNT_NOT_FOUND')
    const password = this.validatePassword(input.password)
    if (user.passwordHash) {
      if (!await bcrypt.compare(String(input.currentPassword ?? ''), user.passwordHash)) throw new AuthError('当前密码错误', 401, 'INVALID_CURRENT_PASSWORD')
    } else {
      if (!user.email) throw new AuthError('请先绑定邮箱后再设置密码', 409, 'EMAIL_REQUIRED')
      await this.verifyEmailCode(user.email, String(input.code ?? ''), now)
    }
    const passwordHash = await bcrypt.hash(password, 12)
    const updated = await this.users.update(user.id, { passwordHash, passwordChangedAt: new Date(now).toISOString() }, new Date(now))
    await this.sessions.revokeAccount(user.id, now)
    return { success: true }
  }

  validatePhone(phone) {
    if (!mainlandPhonePattern.test(phone)) {
      throw new AuthError('请输入正确的中国大陆手机号', 400, 'INVALID_PHONE')
    }
  }

  normalizeEmail(email) {
    const normalized = email.trim().toLowerCase()
    if (!normalized || normalized.length > 254 || !emailPattern.test(normalized)) {
      throw new AuthError('请输入正确的邮箱地址', 400, 'INVALID_EMAIL')
    }
    return normalized
  }

  async sendCode(phone, now = Date.now()) {
    this.validatePhone(phone)
    const previous = await this.codes.findByPhone(phone)
    if (previous && previous.sentAt + this.config.resendIntervalMs > now) {
      const retryAfter = Math.ceil((previous.sentAt + this.config.resendIntervalMs - now) / 1000)
      throw new AuthError(`请在 ${retryAfter} 秒后重新获取`, 429, 'CODE_RATE_LIMITED', { retryAfter })
    }

    const code = this.codeGenerator()
    const salt = randomBytes(16).toString('hex')
    if (!this.smsProvider?.sendVerificationCode) throw new AuthError('短信验证码服务尚未配置', 503, 'SMS_PROVIDER_NOT_CONFIGURED')
    try {
      await this.smsProvider.sendVerificationCode({ phone, code, expiresIn: Math.floor(this.config.codeTtlMs / 1000) })
    } catch {
      throw new AuthError('短信服务暂时不可用，请稍后重试', 503, 'SMS_PROVIDER_UNAVAILABLE')
    }
    await this.codes.save({
      channel: 'phone',
      identifier: phone,
      codeHash: hashCode('phone', phone, code, salt),
      salt,
      sentAt: now,
      expiresAt: now + this.config.codeTtlMs,
      failedAttempts: 0
    })
    return { success: true, expiresIn: Math.floor(this.config.codeTtlMs / 1000), retryAfter: 60 }
  }

  async login(phone, code, now = Date.now()) {
    await this.verifyPhoneCode(phone, code, now)
    const user = await this.users.findOrCreateByPhone(phone, new Date(now))
    return { token: this.tokens.create(user, now), user }
  }

  async verifyPhoneCode(phone, code, now = Date.now()) {
    this.validatePhone(phone)
    if (!/^\d{6}$/.test(code)) throw new AuthError('请输入 6 位数字验证码', 400, 'INVALID_CODE_FORMAT')

    const entry = await this.codes.findByPhone(phone)
    if (!entry) throw new AuthError('请先获取验证码', 400, 'CODE_NOT_FOUND')
    if (entry.expiresAt <= now) {
      await this.codes.consume(phone)
      throw new AuthError('验证码已过期，请重新获取', 400, 'CODE_EXPIRED')
    }

    const provided = Buffer.from(hashCode('phone', phone, code, entry.salt), 'hex')
    const expected = Buffer.from(entry.codeHash, 'hex')
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      const failed = await this.codes.recordFailedAttempt('phone', phone, this.config.maxFailedAttempts)
      if (failed.invalidated) throw new AuthError('验证码错误次数过多，请重新获取', 401, 'CODE_ATTEMPTS_EXCEEDED')
      throw new AuthError('验证码错误', 401, 'CODE_INCORRECT')
    }

    await this.codes.consume(phone)
    return true
  }

  async sendEmailCode(rawEmail, now = Date.now()) {
    const email = this.normalizeEmail(rawEmail)
    return this.sendEmailCodeForChannel('email', email, now)
  }

  opsOwnerEmail() {
    const email = String(this.config.opsOwnerEmail ?? '').trim().toLowerCase()
    if (!email || !emailPattern.test(email)) {
      throw new AuthError('运营后台暂时不可用', 503, 'OPS_OWNER_NOT_CONFIGURED')
    }
    return email
  }

  async sendOpsEmailCode(rawEmail, now = Date.now()) {
    const email = this.normalizeEmail(rawEmail)
    const ownerEmail = this.opsOwnerEmail()
    if (email !== ownerEmail) {
      return { success: true, expiresIn: Math.floor(this.config.codeTtlMs / 1000), retryAfter: Math.floor(this.config.resendIntervalMs / 1000) }
    }
    return this.sendEmailCodeForChannel('ops-email', email, now)
  }

  async sendEmailCodeForChannel(channel, email, now) {
    const previous = await this.codes.find(channel, email)
    if (previous && previous.sentAt + this.config.resendIntervalMs > now) {
      const retryAfter = Math.ceil((previous.sentAt + this.config.resendIntervalMs - now) / 1000)
      throw new AuthError(`请在 ${retryAfter} 秒后重新获取`, 429, 'CODE_RATE_LIMITED', { retryAfter })
    }

    const code = this.codeGenerator()
    const salt = randomBytes(16).toString('hex')
    const expiresIn = Math.floor(this.config.codeTtlMs / 1000)
    const providerStartedAt = Date.now()
    this.logger(`[Hoooho auth] verification email requested email=${maskEmail(email)}`)
    try {
      await this.emailProvider.sendVerificationCode({ email, code, expiresIn })
    } catch (error) {
      const errorCode = error instanceof EmailProviderError ? error.code : 'EMAIL_PROVIDER_NETWORK_ERROR'
      this.logger(`[Hoooho auth] verification provider error email=${maskEmail(email)} code=${errorCode} providerDurationMs=${Math.max(0, Date.now() - providerStartedAt)}`)
      if (errorCode === 'EMAIL_PROVIDER_NOT_CONFIGURED') {
        throw new AuthError('邮箱验证码服务尚未配置', 503, errorCode)
      }
      throw new AuthError('邮件服务暂时不可用，请稍后重试', 503, 'EMAIL_PROVIDER_UNAVAILABLE')
    }

    await this.codes.save({
      channel,
      identifier: email,
      codeHash: hashCode(channel, email, code, salt),
      salt,
      sentAt: now,
      expiresAt: now + this.config.codeTtlMs,
      failedAttempts: 0
    })
    this.logger(`[Hoooho auth] verification email sent email=${maskEmail(email)} providerDurationMs=${Math.max(0, Date.now() - providerStartedAt)}`)
    return { success: true, expiresIn, retryAfter: Math.floor(this.config.resendIntervalMs / 1000) }
  }

  async loginWithEmail(rawEmail, code, now = Date.now()) {
    const email = this.normalizeEmail(rawEmail)
    return this.loginWithEmailForChannel('email', email, code, now)
  }

  async loginOpsWithEmail(rawEmail, code, now = Date.now()) {
    const email = this.normalizeEmail(rawEmail)
    if (email !== this.opsOwnerEmail()) {
      throw new AuthError('邮箱或验证码无效', 403, 'OPS_FORBIDDEN')
    }
    return this.loginWithEmailForChannel('ops-email', email, code, now)
  }

  async loginWithEmailForChannel(channel, email, code, now) {
    await this.verifyEmailCodeForChannel(channel, email, code, now)
    const user = await this.users.findOrCreateByEmail(email, new Date(now))
    return { token: this.tokens.create(user, now), user }
  }

  async verifyEmailCode(rawEmail, code, now = Date.now()) {
    const email = this.normalizeEmail(rawEmail)
    return this.verifyEmailCodeForChannel('email', email, code, now)
  }

  async verifyEmailCodeForChannel(channel, email, code, now) {
    if (!/^\d{6}$/.test(code)) throw new AuthError('请输入 6 位数字验证码', 400, 'INVALID_CODE_FORMAT')

    const entry = await this.codes.find(channel, email)
    if (!entry) throw new AuthError('请先获取验证码', 400, 'CODE_NOT_FOUND')
    if (entry.expiresAt <= now) {
      await this.codes.consume(channel, email)
      throw new AuthError('验证码已过期，请重新获取', 400, 'CODE_EXPIRED')
    }

    const provided = Buffer.from(hashCode(channel, email, code, entry.salt), 'hex')
    const expected = Buffer.from(entry.codeHash, 'hex')
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      const failed = await this.codes.recordFailedAttempt(channel, email, this.config.maxFailedAttempts)
      if (failed.invalidated) throw new AuthError('验证码错误次数过多，请重新获取', 401, 'CODE_ATTEMPTS_EXCEEDED')
      throw new AuthError('验证码错误', 401, 'CODE_INCORRECT')
    }

    await this.codes.consume(channel, email)
    return true
  }

  async mergeGuestSession(session, guestToken, now = Date.now()) {
    if (!guestToken) return { ...session, guestMerge: { merged: false, idempotent: true } }
    const payload = this.tokens.verify(guestToken, now)
    if (!payload?.guest || !String(payload.sub).startsWith('guest:')) {
      throw new AuthError('历史会话无效，请在原浏览器中重试', 401, 'INVALID_GUEST_SESSION')
    }
    const guestMerge = await this.accountData.mergeGuest(payload.sub, session.user.id, new Date(now))
    return { ...session, guestMerge }
  }
}
