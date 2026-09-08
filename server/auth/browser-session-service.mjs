import { SessionRepository, sessionTtlMs } from './session-repository.mjs'
import { accountTransaction } from './storage/transaction.mjs'
import { AuthError } from './auth-service.mjs'
import path from 'node:path'
import { JsonStore } from './storage/json-store.mjs'
import { withAccountLock } from './account-lock.mjs'
import { createHash } from 'node:crypto'
import { GuestDiagnostics } from './guest-diagnostics.mjs'

const cookieName = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT_ID ? '__Host-hoooho_session' : 'hoooho_session'
const cookieToken = (request) => String(request.headers.cookie ?? '').split(';').map((item) => item.trim()).find((item) => item.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) ?? ''
const guestRequestTtlMs = 10 * 60 * 1000
const hash = (value) => createHash('sha256').update(value).digest('hex')

export class BrowserSessionService {
  constructor(auth) {
    this.auth = auth
    this.sessions = new SessionRepository(auth.config.dataDirectory)
    this.sections = new JsonStore(path.join(auth.config.dataDirectory, 'health-profile-sections.json'), { sections: [] })
    this.guestRequests = new JsonStore(path.join(auth.config.dataDirectory, 'guest-creation-requests.json'), { requests: [] })
    this.diagnostics = new GuestDiagnostics(auth.config.dataDirectory)
    this.recoveryCodes = new JsonStore(path.join(auth.config.dataDirectory, 'guest-recovery-codes.json'), { codes: [] })
  }
  async recovery(request, response, input) {
    this.assertSameOrigin(request)
    const normalize = (value) => typeof value === 'string' ? value.replace(/[\s-]/g, '').toLowerCase() : ''
    const next = normalize(input.nextCode)
    const code = normalize(input.code)
    if (!/^[a-f0-9]{64}$/.test(next) || (input.mode === 'restore' && (!/^[a-f0-9]{64}$/.test(code) || code === next))) {
      throw new AuthError('恢复码格式无效', 400, 'INVALID_RECOVERY_CODE')
    }
    return this.cookieTransaction(response, async (draft) => {
      const current = await this.current(request)
      let user
      if (input.mode === 'restore') {
        if (current) throw new AuthError('当前已有使用账户，请先退出后再恢复', 409, 'SESSION_EXISTS')
        const entry = (await this.recoveryCodes.read()).codes.find((item) => item.tokenHash === hash(code) && item.expiresAt > Date.now())
        user = entry ? await this.auth.users.findById(entry.accountId) : null
        if (!user?.guest || user.mergedInto) throw new AuthError('恢复码无效、已使用或已过期', 401, 'INVALID_RECOVERY_CODE')
      } else if (input.mode === 'issue' || input.mode === 'revoke') {
        user = current?.user
        if (!user?.guest || user.mergedInto) throw new AuthError('请先恢复体验账户', 401, 'GUEST_REQUIRED')
      } else throw new AuthError('请求无效', 400, 'INVALID_RECOVERY_ACTION')
      await this.recoveryCodes.update((data) => ({ codes: [
        ...data.codes.filter((item) => item.accountId !== user.id && item.expiresAt > Date.now()),
        ...(input.mode === 'revoke' ? [] : [{ accountId: user.id, tokenHash: hash(next), expiresAt: Date.now() + sessionTtlMs }])
      ] }))
      draft.setHeader('Cache-Control', 'no-store')
      if (input.mode !== 'restore') return { success: true }
      await this.sessions.revokeAccount(user.id)
      return this.issue(request, draft, user)
    })
  }
  assertSameOrigin(request) {
    const origin = request.headers.origin
    const site = request.headers['sec-fetch-site']
    if (site === 'cross-site' || (origin && new URL(origin).host !== request.headers.host)) throw new AuthError('请求来源无效', 403, 'CSRF_REJECTED')
    if (!['GET', 'HEAD'].includes(request.method) && !String(request.headers['content-type'] ?? '').startsWith('application/json')) throw new AuthError('请求格式无效', 415, 'JSON_REQUIRED')
  }
  setCookie(request, response, token, maxAge = sessionTtlMs / 1000) {
    const secure = process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT_ID) || request.socket?.encrypted
    const expires = new Date(Date.now() + maxAge * 1000).toUTCString()
    response.setHeader('Set-Cookie', `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; Expires=${expires}${secure ? '; Secure' : ''}`)
    response.setHeader('Cache-Control', 'no-store')
  }
  async current(request) {
    const session = await this.sessions.find(cookieToken(request))
    if (!session) return null
    const user = await this.auth.users.findById(session.accountId)
    return user && !user.mergedInto ? { session, user } : null
  }
  async responseSession(request, response, current) {
    await this.sessions.renew(cookieToken(request))
    this.setCookie(request, response, cookieToken(request))
    return { token: this.auth.tokens.create({ ...current.user, browserSession: true }), user: current.user }
  }
  async restore(request, response, legacyToken = '') {
    this.assertSameOrigin(request)
    const current = await this.current(request)
    if (current) {
      await this.diagnostics.record(request, { event: 'session_restore_result', cookieToken: cookieToken(request), ...current })
      return this.responseSession(request, response, current)
    }
    if (legacyToken) {
      const payload = this.auth.tokens.verify(legacyToken)
      if (payload && !payload.purpose && !payload.browserSession) {
        const user = payload.guest ? await this.auth.users.createGuest(payload.sub) : await this.auth.users.findById(payload.sub)
        if (user && !user.mergedInto) return this.issue(request, response, user)
      }
    }
    await this.diagnostics.record(request, { event: 'session_restore_result', cookieToken: cookieToken(request) })
    return { unauthenticated: true }
  }
  async issue(request, response, user) {
    const { token } = await this.sessions.create(user.id)
    this.setCookie(request, response, token)
    return { token: this.auth.tokens.create({ ...user, browserSession: true }), user }
  }
  async create(request, response, legacyToken = '', idempotencyKey = '') {
    this.assertSameOrigin(request)
    await this.diagnostics.record(request, { event: 'guest_create_started', cookieToken: cookieToken(request), idempotencyKey })
    const current = await this.current(request)
    if (current) return this.responseSession(request, response, current)
    if (legacyToken) {
      const restored = await this.restore(request, response, legacyToken)
      if (!restored.unauthenticated) return restored
      throw new AuthError('原体验凭证已失效，请保留本机记录后联系支持', 401, 'LEGACY_SESSION_UNRECOVERABLE')
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
      throw new AuthError('请重试进入体验模式', 400, 'INVALID_IDEMPOTENCY_KEY')
    }
    return this.cookieTransaction(response, async (draftResponse) => {
      const restored = await this.current(request)
      if (restored) return this.responseSession(request, draftResponse, restored)
      const now = Date.now()
      const requestHash = hash(idempotencyKey)
      const existing = (await this.guestRequests.read()).requests.find((item) => item.tokenHash === requestHash && item.expiresAt > now)
      let user = existing ? await this.auth.users.findById(existing.accountId) : null
      if (!user || user.mergedInto) user = await this.auth.users.createGuest()
      await this.guestRequests.update((data) => ({ requests: [
        ...data.requests.filter((item) => item.expiresAt > now && item.tokenHash !== requestHash),
        { tokenHash: requestHash, accountId: user.id, createdAt: now, expiresAt: now + guestRequestTtlMs }
      ] }))
      const result = await this.issue(request, draftResponse, user)
      await this.diagnostics.record(request, { event: 'guest_create_response', idempotencyKey, user, setCookieSent: true })
      return result
    })
  }
  async cookieTransaction(response, operation) {
    const headers = new Map()
    const result = await accountTransaction(this.auth.config.dataDirectory, () => operation({ setHeader: (name, value) => headers.set(name, value) }))
    for (const [name, value] of headers) response.setHeader(name, value)
    return result
  }
  async completeLogin(request, response, formalSession, legacyToken = '') {
    this.assertSameOrigin(request)
    const before = await this.current(request)
    const lockId = before?.user.id ?? this.auth.tokens.verify(legacyToken)?.sub
    return withAccountLock(lockId, () => this.cookieTransaction(response, async (draftResponse) => {
      const current = await this.current(request)
      if (before?.user.guest && !current) throw new AuthError('使用状态已变化，请重新恢复后重试', 409, 'SESSION_CHANGED')
      const guestToken = current?.user.guest ? this.auth.tokens.create(current.user) : legacyToken
      const result = await this.auth.mergeGuestSession(formalSession, guestToken)
      if (current?.user.guest && current.user.currentMemberId && !formalSession.user.currentMemberId) {
        formalSession = { ...formalSession, user: await this.auth.users.update(formalSession.user.id, { currentMemberId: current.user.currentMemberId }) }
      }
      if (guestToken) {
        const payload = this.auth.tokens.verify(guestToken)
        if (payload?.guest) {
          await this.auth.users.update(payload.sub, { mergedInto: formalSession.user.id })
          await this.sessions.revokeAccount(payload.sub)
        }
      }
      return { ...await this.issue(request, draftResponse, formalSession.user), guestMerge: result.guestMerge }
    }))
  }
  async logout(request, response) {
    this.assertSameOrigin(request)
    const current = await this.current(request)
    if (current) await this.sessions.revokeAccount(current.user.id)
    this.setCookie(request, response, '', 0)
    return { success: true }
  }
  async profileSections(request, input) {
    this.assertSameOrigin(request)
    const current = await this.current(request)
    if (!current) throw new AuthError('使用状态已失效', 401, 'UNAUTHORIZED')
    const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? '')?.[1]
    if (bearer && this.auth.tokens.verify(bearer)?.sub !== current.user.id) throw new AuthError('账户已切换，请刷新后重试', 401, 'ACCOUNT_CHANGED')
    if (!input) return (await this.sections.read()).sections.filter((item) => item.accountId === current.user.id)
    const member = await this.auth.members.findById(input.memberId)
    if (!member || member.accountId !== current.user.id) throw new AuthError('记录对象不存在', 404, 'MEMBER_NOT_FOUND')
    if (!/^[a-z-]{1,60}$/.test(input.sectionId ?? '') || !Array.isArray(input.records) || input.records.length > 500) throw new AuthError('档案格式无效', 400, 'INVALID_PROFILE_SECTION')
    let saved
    await this.sections.update((data) => {
      const existing = data.sections.find((item) => item.accountId === current.user.id && item.memberId === member.id && item.sectionId === input.sectionId)
      if (input.importOnly && existing) { saved = existing; return data }
      if ((existing?.revision ?? 0) !== input.revision) throw new AuthError('档案已在其他页面更新，请刷新后重试', 409, 'PROFILE_CONFLICT')
      saved = { accountId: current.user.id, memberId: member.id, sectionId: input.sectionId, records: input.records, revision: (existing?.revision ?? 0) + 1 }
      return { ...data, sections: [...data.sections.filter((item) => item !== existing), saved] }
    })
    return saved
  }
  async selectMember(request, input) {
    this.assertSameOrigin(request)
    const current = await this.current(request)
    if (!current) throw new AuthError('使用状态已失效', 401, 'UNAUTHORIZED')
    const member = await this.auth.members.findById(input.memberId)
    if (!member || member.accountId !== current.user.id) throw new AuthError('记录对象不存在', 404, 'MEMBER_NOT_FOUND')
    await this.auth.users.update(current.user.id, { currentMemberId: member.id })
    return { currentMemberId: member.id }
  }
}
