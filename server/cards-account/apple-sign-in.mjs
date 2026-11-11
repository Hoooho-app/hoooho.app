import { createCipheriv, createDecipheriv, createHmac, createPrivateKey, createPublicKey, randomBytes, sign, verify } from 'node:crypto'
import path from 'node:path'
import { JsonStore } from '../auth/storage/json-store.mjs'
import { AuthError } from '../auth/auth-service.mjs'

const issuer = 'https://appleid.apple.com'
const clientId = 'com.hoooho.cards'
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
const rejected = () => new AuthError('Apple 授权已失效，请重新验证', 400, 'APPLE_AUTHORIZATION_INVALID')
const unavailable = () => new AuthError('暂时无法连接 Apple 登录服务，请稍后重试', 503, 'APPLE_UNAVAILABLE')

export function createCardsAppleSignIn(secret, env = process.env) {
  const teamId = env.HOOOHO_CARDS_APPLE_TEAM_ID
  const keyId = env.HOOOHO_CARDS_APPLE_KEY_ID
  const pem = env.HOOOHO_CARDS_APPLE_PRIVATE_KEY
  if (!/^[A-Z0-9]{10}$/.test(teamId ?? '') || !/^[A-Z0-9]{10}$/.test(keyId ?? '') || !pem || secret.length < 32) return null
  try {
    const key = createPrivateKey(pem.replaceAll('\\n', '\n'))
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') return null
    return new CardsAppleSignIn({ teamId, keyId, key, secret })
  } catch {
    return null
  }
}

export class CardsAppleSignIn {
  constructor({ teamId, keyId, key, secret, fetch = globalThis.fetch }) {
    this.teamId = teamId
    this.keyId = keyId
    this.key = key
    this.encryptionKey = createHmac('sha256', secret).update('Cards Apple refresh tokens v1').digest()
    this.fetch = fetch
    this.keys = []
    this.keysExpireAt = 0
  }

  clientSecret(now) {
    const iat = Math.floor(now / 1000)
    const data = `${encode({ alg: 'ES256', kid: this.keyId })}.${encode({
      iss: this.teamId, iat, exp: iat + 300, aud: issuer, sub: clientId
    })}`
    const signature = sign('sha256', Buffer.from(data), { key: this.key, dsaEncoding: 'ieee-p1363' })
    return `${data}.${signature.toString('base64url')}`
  }

  async request(path, values) {
    try {
      return await this.fetch(issuer + path, {
        ...(values ? { method: 'POST', body: new URLSearchParams(values) } : {}),
        redirect: 'error',
        signal: AbortSignal.timeout(10_000)
      })
    } catch {
      throw unavailable()
    }
  }

  async signingKey(keyId, now) {
    const previous = this.keys.find(key => key.kid === keyId)
    if (previous && this.keysExpireAt > now) return previous
    const response = await this.request('/auth/keys')
    if (!response.ok) throw unavailable()
    const data = await response.json().catch(() => null)
    if (!Array.isArray(data?.keys)) throw unavailable()
    this.keys = data.keys.filter(key => key.kty === 'RSA' && key.alg === 'RS256' && key.use === 'sig')
    this.keysExpireAt = now + 60 * 60 * 1000
    return this.keys.find(key => key.kid === keyId)
  }

  async verifiedSubject(token, nonce, now) {
    const parts = String(token ?? '').split('.')
    if (parts.length !== 3 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) throw rejected()
    const [header, payload, signature] = parts
    let metadata, claims
    try {
      metadata = JSON.parse(Buffer.from(header, 'base64url').toString())
      claims = JSON.parse(Buffer.from(payload, 'base64url').toString())
    } catch {
      throw rejected()
    }
    if (metadata?.alg !== 'RS256' || typeof metadata.kid !== 'string') throw rejected()
    const jwk = await this.signingKey(metadata.kid, now)
    if (!jwk || !verify('RSA-SHA256', Buffer.from(`${header}.${payload}`),
      createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(signature, 'base64url'))) throw rejected()
    const seconds = Math.floor(now / 1000)
    if (claims?.iss !== issuer || claims.aud !== clientId || (nonce !== null && claims.nonce !== nonce) ||
        !Number.isFinite(claims.exp) || claims.exp <= seconds ||
        !Number.isFinite(claims.iat) || claims.iat > seconds + 60 ||
        typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255) throw rejected()
    return claims.sub
  }

  seal(token, subject) {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv)
    cipher.setAAD(Buffer.from(subject))
    const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')
  }

  unseal(binding) {
    const data = Buffer.from(binding.refreshToken, 'base64url')
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, data.subarray(0, 12))
    decipher.setAAD(Buffer.from(binding.subject))
    decipher.setAuthTag(data.subarray(12, 28))
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8')
  }

  async exchange(code, identityToken, nonce, now = Date.now()) {
    if (typeof code !== 'string' || !code || code.length > 2048) throw rejected()
    if (typeof identityToken !== 'string' || identityToken.length > 8192) throw rejected()
    const subject = await this.verifiedSubject(identityToken, nonce, now)
    const response = await this.request('/auth/token', {
      client_id: clientId,
      client_secret: this.clientSecret(now),
      grant_type: 'authorization_code',
      code
    })
    const result = await response.json().catch(() => null)
    if (result?.error === 'invalid_grant') throw rejected()
    if (!response.ok || !result) throw unavailable()
    if (await this.verifiedSubject(result.id_token, null, now) !== subject) throw rejected()
    if (typeof result.refresh_token !== 'string' || !result.refresh_token) throw unavailable()
    return { subject, refreshToken: this.seal(result.refresh_token, subject) }
  }

  async revoke(binding) {
    const response = await this.request('/auth/revoke', {
      client_id: clientId,
      client_secret: this.clientSecret(Date.now()),
      token_type_hint: 'refresh_token',
      token: this.unseal(binding)
    })
    if (!response.ok) throw unavailable()
  }
}

export class CardsAppleBindings {
  constructor(directory) {
    this.store = new JsonStore(path.join(directory, 'cards-apple-bindings.json'), { bindings: [] })
  }

  async forAccount(accountId) {
    return (await this.store.read()).bindings.find(binding => binding.accountId === accountId)
  }

  async forSubject(subject) {
    return (await this.store.read()).bindings.find(binding => binding.subject === subject)
  }

  async save(accountId, binding) {
    await this.store.update(data => {
      if (data.bindings.some(item =>
        (item.accountId === accountId && item.subject !== binding.subject) ||
        (item.accountId !== accountId && item.subject === binding.subject)
      )) {
        throw new AuthError('这个 Apple 账号或当前账号已有其他绑定', 409, 'APPLE_IDENTITY_IN_USE')
      }
      return { bindings: [...data.bindings.filter(item => item.accountId !== accountId), { ...binding, accountId }] }
    })
  }

  async remove(accountId) {
    await this.store.update(data => ({ bindings: data.bindings.filter(item => item.accountId !== accountId) }))
  }
}
