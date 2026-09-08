import { createHash } from 'node:crypto'
import path from 'node:path'
import { JsonStore } from './storage/json-store.mjs'

export const authProtocolVersion = 'guest-cookie-v3'
const idPattern = /^[A-Za-z0-9_-]{16,64}$/
const eventPattern = /^(client_loaded|route_decision|guest_create_started|guest_create_response|guest_confirmed|guest_confirmation_failed|session_restore_result)$/
const retentionMs = 48 * 60 * 60 * 1000
const hashPrefix = (value) => value ? createHash('sha256').update(String(value)).digest('hex').slice(0, 12) : null

function userAgentFamily(value = '') {
  if (/MicroMessenger/i.test(value)) return 'wechat'
  if (/iP(?:hone|ad|od).+Version\/.+Safari/i.test(value)) return 'ios-safari'
  if (/Safari/i.test(value) && !/Chrome|Chromium|Android/i.test(value)) return 'safari'
  if (/Chrome|Chromium/i.test(value)) return 'chromium'
  return value ? 'other' : 'unknown'
}

export class GuestDiagnostics {
  constructor(dataDirectory) {
    this.store = new JsonStore(path.join(dataDirectory, 'guest-auth-diagnostics.json'), { events: [] })
  }
  validId(value) { return idPattern.test(String(value ?? '')) ? String(value) : '' }
  async record(request, input = {}) {
    const diagnosticTestId = this.validId(request.headers['x-hoooho-diagnostic-id'] ?? input.diagnosticTestId)
    if (!diagnosticTestId) return null
    const event = eventPattern.test(String(input.event ?? '')) ? String(input.event) : 'session_restore_result'
    const now = Date.now()
    const observedCookie = input.cookieToken ?? String(request.headers.cookie ?? '')
    const item = {
      diagnosticTestId,
      timestamp: new Date(now).toISOString(),
      requestId: String(request.headers['x-hoooho-request-id'] ?? '').slice(0, 64) || null,
      buildCommit: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.BUILD_COMMIT || 'local',
      buildTimestamp: process.env.BUILD_TIMESTAMP || process.env.RAILWAY_DEPLOYMENT_ID || 'runtime',
      authProtocolVersion,
      hostname: String(request.headers['x-forwarded-host'] ?? request.headers.host ?? '').split(',')[0].slice(0, 120),
      requestPath: String(request.url ?? '').split('?')[0].slice(0, 120),
      userAgentFamily: userAgentFamily(String(request.headers['user-agent'] ?? '')),
      isSafari: /Safari/i.test(String(request.headers['user-agent'] ?? '')) && !/Chrome|Chromium|Android/i.test(String(request.headers['user-agent'] ?? '')),
      cookiePresent: Boolean(observedCookie),
      cookieHashPrefix: hashPrefix(observedCookie),
      sessionFound: Boolean(input.session),
      accountBound: Boolean(input.user),
      accountHashPrefix: hashPrefix(input.user?.id ?? input.accountId),
      sessionExpiresAt: input.session?.expiresAt ? new Date(input.session.expiresAt).toISOString() : null,
      guestCreateCalled: event === 'guest_create_started' || event === 'guest_create_response',
      setCookieSent: Boolean(input.setCookieSent),
      guestIdempotencyHashPrefix: hashPrefix(input.idempotencyKey),
      currentMemberPresent: Boolean(input.user?.currentMemberId ?? input.currentMemberPresent),
      serviceWorkerVersion: String(input.serviceWorkerVersion ?? '').slice(0, 80) || null,
      routeDecision: String(input.routeDecision ?? '').slice(0, 40) || null,
      clientBuildCommit: String(input.clientBuildCommit ?? '').slice(0, 80) || null,
      event
    }
    await this.store.update((data) => ({ events: [...data.events.filter((entry) => Date.parse(entry.timestamp) > now - retentionMs), item].slice(-5000) }))
    console.info(`[Hoooho guest diagnostic] ${JSON.stringify({ ...item, diagnosticTestId: hashPrefix(diagnosticTestId) })}`)
    return item
  }
  async list(id) {
    const diagnosticTestId = this.validId(id)
    if (!diagnosticTestId) return null
    return (await this.store.read()).events.filter((item) => item.diagnosticTestId === diagnosticTestId)
  }
}
