import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { authConfig, mainlandPhonePattern } from './config.mjs'
import { UserRepository } from './repositories/user-repository.mjs'
import { VerificationCodeRepository } from './repositories/verification-code-repository.mjs'
import { TokenService } from './token-service.mjs'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'

export class AuthError extends Error {
  constructor(message, status = 400, code = 'AUTH_ERROR', details = {}) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

const hashCode = (phone, code, salt) => createHash('sha256').update(`${phone}:${code}:${salt}`).digest('hex')

export class AuthService {
  constructor(options = {}) {
    const config = { ...authConfig, ...options }
    this.config = config
    this.codes = options.codes ?? new VerificationCodeRepository(config.dataDirectory)
    this.users = options.users ?? new UserRepository(config.dataDirectory)
    this.members = options.members ?? new FamilyMemberRepository(config.dataDirectory)
    this.tokens = options.tokens ?? new TokenService(config.tokenSecret, config.tokenTtlMs)
    this.codeGenerator = options.codeGenerator ?? (() => String(randomInt(0, 1_000_000)).padStart(6, '0'))
    this.logger = options.logger ?? console.info
  }

  validatePhone(phone) {
    if (!mainlandPhonePattern.test(phone)) {
      throw new AuthError('请输入正确的中国大陆手机号', 400, 'INVALID_PHONE')
    }
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
    await this.codes.save({
      phone,
      codeHash: hashCode(phone, code, salt),
      salt,
      sentAt: now,
      expiresAt: now + this.config.codeTtlMs
    })
    this.logger(`[Hoooho auth] phone=${phone} code=${code} expires=${new Date(now + this.config.codeTtlMs).toISOString()}`)
    return { success: true, expiresIn: Math.floor(this.config.codeTtlMs / 1000), retryAfter: 60 }
  }

  async login(phone, code, now = Date.now()) {
    this.validatePhone(phone)
    if (!/^\d{6}$/.test(code)) throw new AuthError('请输入 6 位数字验证码', 400, 'INVALID_CODE_FORMAT')

    const entry = await this.codes.findByPhone(phone)
    if (!entry) throw new AuthError('请先获取验证码', 400, 'CODE_NOT_FOUND')
    if (entry.expiresAt <= now) {
      await this.codes.consume(phone)
      throw new AuthError('验证码已过期，请重新获取', 400, 'CODE_EXPIRED')
    }

    const provided = Buffer.from(hashCode(phone, code, entry.salt), 'hex')
    const expected = Buffer.from(entry.codeHash, 'hex')
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      throw new AuthError('验证码错误', 401, 'CODE_INCORRECT')
    }

    const user = await this.users.findOrCreateByPhone(phone, new Date(now))
    await this.members.ensureSelf(user.id, new Date(now))
    await this.codes.consume(phone)
    return { token: this.tokens.create(user, now), user }
  }
}
