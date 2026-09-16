import { randomUUID } from 'node:crypto'

const endpoints = new Set(['/api/auth/session', '/api/auth/nickname/login', '/api/auth/register', '/api/auth/logout'])
const allowed = (value, choices) => choices.includes(value) ? value : 'unknown'

// Deliberately exclude cookie/token values, account identifiers, nicknames,
// full user agents, URLs, IP addresses and request bodies.
export function observeSessionRequest(request, response, pathname, logger = console.info) {
  if (!endpoints.has(pathname)) return
  const started = Date.now()
  const suppliedId = String(request.headers['x-hoooho-request-id'] ?? '')
  const requestId = /^[A-Za-z0-9_-]{8,64}$/.test(suppliedId) ? suppliedId : randomUUID()
  const build = String(request.headers['x-hoooho-client-build'] ?? '')
  const agent = String(request.headers['user-agent'] ?? '')
  const cookieNames = String(request.headers.cookie ?? '').split(';').map((item) => item.trim().split('=')[0])
  response.setHeader('X-Hoooho-Request-ID', requestId)
  response.once('finish', () => logger(`[Hoooho session] ${JSON.stringify({
    requestId,
    endpoint: pathname,
    status: response.statusCode,
    durationMs: Date.now() - started,
    clientBuild: /^[a-f0-9]{7,40}$/.test(build) ? build : 'unknown',
    browser: /iPhone|iPad/.test(agent) ? 'ios' : 'other',
    secureCookiePresent: cookieNames.includes('__Host-hoooho_session'),
    legacyCookiePresent: cookieNames.includes('hoooho_session'),
    nicknameStorage: allowed(request.headers['x-hoooho-nickname-storage'], ['present', 'absent', 'unavailable']),
    rememberPreference: allowed(request.headers['x-hoooho-remember-preference'], ['true', 'false', 'unset', 'unavailable']),
    outcome: response.getHeader('X-Hoooho-Session-Outcome') ?? 'not-checked',
    persistence: response.getHeader('X-Hoooho-Session-Persistence') ?? 'unchanged'
  })}`))
}
