import { ProductAnalyticsService } from './service.mjs'
import { analyticsControlCatalog } from '../../scripts/analytics-instrumentation.mjs'
import { AuthService } from '../auth/auth-service.mjs'
import { BrowserSessionService } from '../auth/browser-session-service.mjs'
import { authConfig } from '../auth/config.mjs'
import { assertOpsAccess } from '../ops/ops-service.mjs'
import { parseJsonObject } from '../json-input.mjs'

export function productAnalyticsApiPlugin(options = {}) {
  const config = { ...authConfig, ...options }, auth = new AuthService(config), sessions = new BrowserSessionService(auth)
  return { name: 'hoooho-local-product-analytics', async configureServer(server) {
    const service = new ProductAnalyticsService({ dataDirectory: config.dataDirectory, secret: config.tokenSecret, controls: await analyticsControlCatalog(server.config.root), ownerEmail: config.opsOwnerEmail })
    server.httpServer?.once('close', () => service.close())
    server.middlewares.use(async (request, response, next) => {
      const url = new URL(request.url || '/', 'http://localhost')
      if (!['/api/analytics/events', '/api/ops/analytics'].includes(url.pathname)) return next()
      const send = (status, body) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(body)) }
      try {
        const token = /^Bearer\s+(.+)$/i.exec(request.headers.authorization || '')?.[1]
        const payload = token ? auth.tokens.verify(token) : null
        const candidate = payload ? await auth.users.findById(payload.sub) : null
        const user = auth.tokens.isCurrentForUser(payload, candidate) ? candidate : null
        if (url.pathname === '/api/ops/analytics') {
          if (!user) throw Object.assign(new Error('请登录运营后台'), { status: 401 })
          assertOpsAccess(payload, { ownerEmail: config.opsOwnerEmail })
          if (request.method !== 'GET') return send(405, { error: { message: '仅支持GET' } })
          return send(200, service.report(url.searchParams))
        }
        sessions.assertSameOrigin(request)
        if (request.method !== 'POST') return send(405, { error: { message: '仅支持POST' } })
        let body = ''
        for await (const chunk of request) { body += chunk; if (Buffer.byteLength(body) > 80000) throw Object.assign(new Error('统计批次过大'), { status: 413 }) }
        return send(200, service.ingest(parseJsonObject(body), user))
      } catch (cause) { return send(cause.status || 500, { error: { message: cause.status ? cause.message : '统计暂时不可用', code: cause.code || 'ANALYTICS_UNAVAILABLE' } }) }
    })
  } }
}
