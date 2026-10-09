import { authConfig } from '../auth/config.mjs'
import { TokenService } from '../auth/token-service.mjs'
import { CareHandoffService, CareHandoffError } from './care-handoff-service.mjs'

export function handoffRoute(pathname) {
  const shared = /^\/api\/care-handoffs\/shared\/([^/]+)$/.exec(pathname)
  const owned = /^\/api\/members\/([^/]+)\/care-handoff(?:\/(share))?$/.exec(pathname)
  return shared ? { shared: decodeURIComponent(shared[1]) } : owned ? { memberId: decodeURIComponent(owned[1]), share: Boolean(owned[2]) } : null
}
export async function handoffResult(service, accountId, route, method, input) {
  if (route.shared && method === 'GET') return service.shared(route.shared)
  if (!route.shared && method === 'GET' && !route.share) return service.preview(accountId, route.memberId)
  if (!route.shared && method === 'POST' && route.share) return service.share(accountId, route.memberId, input)
  throw new CareHandoffError('请求方法不支持', 405)
}
export function careHandoffApiPlugin(options = {}) {
  const config = { ...authConfig, ...options }, service = new CareHandoffService(config), tokens = new TokenService(config.tokenSecret, config.tokenTtlMs)
  return { name: 'hoooho-care-handoff', configureServer(server) { server.middlewares.use(async (request, response, next) => {
    const route = handoffRoute(new URL(request.url ?? '/', 'http://localhost').pathname)
    if (!route) return next()
    let status = 200, result
    try {
      const payload = route.shared ? null : tokens.verify(/^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? '')?.[1] ?? '')
      if (!route.shared && !payload) throw new CareHandoffError('登录状态无效', 401)
      let input
      if (request.method === 'POST') {
        let body = ''; for await (const chunk of request) { body += chunk; if (body.length > 1024) throw new CareHandoffError('请求过大', 413) }
        try { input = JSON.parse(body) } catch { throw new CareHandoffError('请求格式错误') }
      }
      result = await handoffResult(service, payload?.sub, route, request.method, input)
    } catch (e) { status = e.status ?? 500; result = { error: { code: e.code ?? 'CARE_HANDOFF_UNAVAILABLE', message: e.status ? e.message : '暂时无法读取照看资料，请重试' } } }
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); response.end(JSON.stringify(result))
  }) } }
}
