import path from 'node:path'
import { JsonStore } from '../auth/storage/json-store.mjs'
import { AuthError } from '../auth/auth-service.mjs'
import { UserRepository } from '../auth/repositories/user-repository.mjs'
import { AccountDataService } from './account-data-service.mjs'
import { AVATAR_PHOTO_MAX_DATA_URL_LENGTH } from '../../shared/avatar-photo-policy.mjs'
import { TokenService } from '../auth/token-service.mjs'

const nicknamePattern = /^\S{1,20}$/u
const providerLabels = { wechat: '微信', qq: 'QQ', apple: 'Apple' }

export class AccountService {
  constructor(options) {
    this.auth = options.auth
    this.users = options.users ?? new UserRepository(options.dataDirectory)
    this.data = options.data ?? new AccountDataService(options)
    this.profiles = new JsonStore(path.join(options.dataDirectory, 'account-profiles.json'), { profiles: [] })
    this.tokens = options.tokens ?? new TokenService(options.tokenSecret, 10 * 60 * 1000)
  }

  async get(accountId) {
    const user = await this.users.findById(accountId)
    if (!user) throw new AuthError('账户不存在', 404, 'ACCOUNT_NOT_FOUND')
    const data = await this.profiles.read()
    return this.publicAccount(user, data.profiles.find((item) => item.accountId === accountId))
  }

  publicAccount(user, profile) {
    return {
      id: user.id,
      nickname: profile?.nickname ?? (user.email?.split('@')[0] || 'Hoooho 用户'),
      avatar: profile?.avatar ?? null,
      phone: user.phone ?? null,
      email: user.email ?? null,
      membership: 'free',
      providers: Object.keys(providerLabels).map((provider) => {
        const binding = profile?.providers?.find((item) => item.provider === provider)
        return { provider, label: providerLabels[provider], bound: Boolean(binding), displayName: binding?.displayName ?? null }
      })
    }
  }

  async updateProfile(accountId, input, now = new Date()) {
    const current = await this.get(accountId)
    const changes = {}
    if (Object.hasOwn(input, 'nickname')) {
      const nickname = String(input.nickname ?? '').trim()
      if (!nicknamePattern.test(nickname)) throw new AuthError('昵称为 1–20 个字符，且不能包含空格', 400, 'INVALID_NICKNAME')
      changes.nickname = nickname
    }
    if (Object.hasOwn(input, 'avatar')) {
      const avatar = input.avatar === null ? null : String(input.avatar)
      if (avatar && (!avatar.startsWith('data:image/') || avatar.length > AVATAR_PHOTO_MAX_DATA_URL_LENGTH)) {
        throw new AuthError('头像格式或大小不符合要求', 400, 'INVALID_AVATAR')
      }
      changes.avatar = avatar
    }
    await this.profiles.update((data) => {
      const existing = data.profiles.find((item) => item.accountId === accountId)
      const next = { accountId, nickname: existing?.nickname ?? current.nickname, avatar: existing?.avatar ?? null, providers: existing?.providers ?? [], ...changes, updatedAt: now.toISOString() }
      return { ...data, profiles: existing ? data.profiles.map((item) => item.accountId === accountId ? next : item) : [...data.profiles, next] }
    })
    return this.get(accountId)
  }

  async sendBindingCode(accountId, kind, rawValue, now = Date.now()) {
    await this.get(accountId)
    if (kind === 'phone') return this.auth.sendCode(String(rawValue), now)
    if (kind === 'email') return this.auth.sendEmailCode(String(rawValue), now)
    throw new AuthError('不支持的绑定方式', 400, 'INVALID_BINDING_KIND')
  }

  async verifyCurrent(accountId, kind, code, now = Date.now()) {
    const user = await this.users.findById(accountId)
    const value = kind === 'phone' ? user?.phone : user?.email
    if (!value) throw new AuthError('当前账户没有可验证的登录方式', 409, 'NO_VERIFICATION_METHOD')
    if (kind === 'phone') await this.auth.verifyPhoneCode(value, String(code), now)
    else if (kind === 'email') await this.auth.verifyEmailCode(value, String(code), now)
    else throw new AuthError('不支持的验证方式', 400, 'INVALID_BINDING_KIND')
    return { changeToken: this.tokens.create({ id: accountId, purpose: `change:${kind}` }, now) }
  }

  async verifyDeletion(accountId, kind, code, now = Date.now()) {
    const user = await this.users.findById(accountId)
    const value = kind === 'phone' ? user?.phone : user?.email
    if (!value) throw new AuthError('当前账户没有可用的验证方式', 409, 'NO_VERIFICATION_METHOD')
    if (kind === 'phone') await this.auth.verifyPhoneCode(value, String(code), now)
    else if (kind === 'email') await this.auth.verifyEmailCode(value, String(code), now)
    else throw new AuthError('请选择当前可用的验证方式', 400, 'INVALID_BINDING_KIND')
    return { deleteToken: this.tokens.create({ id: accountId, purpose: 'delete-account' }, now) }
  }

  async bind(accountId, kind, rawValue, code, challengeToken = '', now = Date.now()) {
    if (kind === 'phone') {
      const phone = String(rawValue)
      const current = await this.users.findById(accountId)
      if (current?.phone && current.phone !== phone) {
        const challenge = this.tokens.verify(challengeToken, now)
        if (challenge?.sub !== accountId || challenge?.purpose !== 'change:phone') throw new AuthError('请先验证原手机号', 403, 'CURRENT_PHONE_REQUIRED')
      }
      const owner = await this.users.findByPhone(phone)
      if (owner && owner.id !== accountId) throw new AuthError('该手机号已被其他账户使用', 409, 'IDENTITY_IN_USE')
      await this.auth.verifyPhoneCode(phone, String(code), now)
      await this.users.update(accountId, { phone }, new Date(now))
    } else if (kind === 'email') {
      const email = this.auth.normalizeEmail(String(rawValue))
      const owner = await this.users.findByEmail(email)
      if (owner && owner.id !== accountId) throw new AuthError('该邮箱已被其他账户使用', 409, 'IDENTITY_IN_USE')
      await this.auth.verifyEmailCode(email, String(code), now)
      await this.users.update(accountId, { email }, new Date(now))
    } else throw new AuthError('不支持的绑定方式', 400, 'INVALID_BINDING_KIND')
    return this.get(accountId)
  }

  async providerAction(accountId, provider, action) {
    const account = await this.get(accountId)
    if (!providerLabels[provider]) throw new AuthError('不支持的第三方账户', 400, 'INVALID_PROVIDER')
    if (action === 'bind') throw new AuthError(`${providerLabels[provider]}登录暂未开放`, 503, 'OAUTH_NOT_CONFIGURED')
    const selected = account.providers.find((item) => item.provider === provider)
    if (!selected?.bound) return account
    const loginCount = Number(Boolean(account.email)) + Number(Boolean(account.phone)) + account.providers.filter((item) => item.bound).length
    if (loginCount <= 1) throw new AuthError('请先设置手机号或邮箱，再解除当前唯一登录方式', 409, 'LAST_LOGIN_METHOD')
    await this.profiles.update((data) => ({ ...data, profiles: data.profiles.map((profile) => profile.accountId === accountId ? { ...profile, providers: (profile.providers ?? []).filter((item) => item.provider !== provider) } : profile) }))
    return this.get(accountId)
  }

  async delete(accountId, input, now = Date.now()) {
    const user = await this.users.findById(accountId)
    if (!user) return { deleted: true, idempotent: true }
    const proof = this.tokens.verify(String(input.deleteToken ?? ''), now)
    if (proof?.sub !== accountId || proof?.purpose !== 'delete-account') throw new AuthError('请先完成身份验证', 403, 'DELETE_VERIFICATION_REQUIRED')
    await this.data.deleteAccount(accountId)
    await this.profiles.update((data) => ({ ...data, profiles: data.profiles.filter((item) => item.accountId !== accountId) }))
    await this.users.delete(accountId)
    return { deleted: true, idempotent: false }
  }
}
