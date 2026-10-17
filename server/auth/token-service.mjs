import { createHmac, timingSafeEqual } from 'node:crypto'

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')

export class TokenService {
  constructor(secret, ttlMs) {
    this.secret = secret
    this.ttlMs = ttlMs
  }

  credentialRevision(passwordHash) {
    return createHmac('sha256', this.secret).update('Hoooho credential revision v1\0').update(passwordHash).digest('hex')
  }

  isCurrentForUser(payload, user) {
    if (!payload || !user || payload.sub !== user.id || payload.purpose || Boolean(payload.guest) !== Boolean(user.guest)) return false
    if (Object.hasOwn(payload, 'credentialRevision')) {
      if (!user.passwordHash || typeof payload.credentialRevision !== 'string' || !/^[a-f0-9]{64}$/.test(payload.credentialRevision)) return false
      return timingSafeEqual(Buffer.from(payload.credentialRevision, 'hex'), Buffer.from(this.credentialRevision(user.passwordHash), 'hex'))
    }
    // Unchanged legacy bcrypt accounts and passwordless accounts may retain
    // their old tokens. A reset or a versioned hash requires a fresh revision.
    return !user.passwordChangedAt && !String(user.passwordHash ?? '').startsWith('hoooho-sha256-bcrypt-v1:')
  }

  create(user, now = Date.now()) {
    const header = encode({ alg: 'HS256', typ: 'JWT' })
    const payload = encode({ sub: user.id, ...(user.passwordHash ? { credentialRevision: this.credentialRevision(user.passwordHash) } : {}), ...(user.browserSession ? { browserSession: true } : {}), ...(user.email ? { email: user.email } : {}), ...(user.phone ? { phone: user.phone } : {}), ...(user.guest ? { guest: true } : {}), ...(user.purpose ? { purpose: user.purpose } : {}), iat: now, exp: now + this.ttlMs })
    const signature = createHmac('sha256', this.secret).update(`${header}.${payload}`).digest('base64url')
    return `${header}.${payload}.${signature}`
  }

  verify(token, now = Date.now()) {
    try {
      const [header, payload, signature] = token.split('.')
      if (!header || !payload || !signature) return null
      const expected = createHmac('sha256', this.secret).update(`${header}.${payload}`).digest('base64url')
      const actualBuffer = Buffer.from(signature)
      const expectedBuffer = Buffer.from(expected)
      if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
      return typeof decoded.sub === 'string' && decoded.exp > now ? decoded : null
    } catch {
      return null
    }
  }
}
