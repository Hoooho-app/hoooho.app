import { OPS_SNAPSHOT_REQUEST_MAX_LENGTH, OpsService, assertOpsAccess } from './ops-service.mjs'
import { TokenService } from '../auth/token-service.mjs'
import { authConfig } from '../auth/config.mjs'

const readJson = (request, maxLength = 16_384) => new Promise((resolve, reject) => {
  let body = '', settled = false
  request.setEncoding('utf8')
  request.on('data', (chunk) => {
    if (settled) return
    body += chunk
    if (body.length > maxLength) { settled = true; reject(Object.assign(new Error('请求内容过大'), { status: 413, code: 'PAYLOAD_TOO_LARGE' })) }
  })
  request.on('end', () => {
    if (settled) return
    try { settled = true; resolve(body ? JSON.parse(body) : {}) } catch { settled = true; reject(Object.assign(new Error('请求格式错误'), { status: 400, code: 'INVALID_JSON' })) }
  })
  request.on('error', reject)
})
const send = (response, status, data) => { response.statusCode = status; response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.setHeader('Cache-Control', 'no-store'); response.end(JSON.stringify(data)) }
const decode = (value) => { try { return decodeURIComponent(value) } catch { throw Object.assign(new Error('请求路径格式错误'), { status: 400, code: 'INVALID_PATH' }) } }

export function opsApiPlugin(options = {}) {
  const service = options.service ?? new OpsService({ dataDirectory: options.dataDirectory ?? authConfig.dataDirectory })
  const tokens = options.tokens ?? new TokenService(options.tokenSecret ?? authConfig.tokenSecret, options.tokenTtlMs ?? authConfig.tokenTtlMs)
  const ownerEmail = options.opsOwnerEmail ?? authConfig.opsOwnerEmail
  return { name: 'hoooho-local-ops-api', configureServer(server) { server.middlewares.use(async (request, response, next) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
    if (!pathname.startsWith('/api/ops')) return next()
    try {
      const token = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? '')?.[1]
      const payload = token ? tokens.verify(token) : null
      if (!payload) throw Object.assign(new Error('登录状态无效或已过期'), { status: 401, code: 'UNAUTHORIZED' })
      assertOpsAccess(payload, { ownerEmail })
      if (pathname === '/api/ops/session' && request.method === 'GET') return send(response, 200, { authenticated: true, authorized: true, email: payload.email })
      if (pathname === '/api/ops/sources' && request.method === 'GET') return send(response, 200, await service.list())
      if (pathname === '/api/ops/sources' && request.method === 'POST') return send(response, 201, await service.create(await readJson(request)))
      if (pathname === '/api/ops/refresh' && request.method === 'POST') return send(response, 200, await service.refreshAll())
      const image = /^\/api\/ops\/sources\/([^/]+)\/snapshots\/([^/]+)\/image$/.exec(pathname)
      if (image && request.method === 'GET') {
        const file = await service.readSnapshot(decode(image[1]), decode(image[2]))
        response.statusCode = 200; response.setHeader('Content-Type', file.type); response.setHeader('Content-Length', String(file.buffer.length)); response.setHeader('Cache-Control', 'private, no-store'); response.setHeader('Content-Disposition', 'inline'); response.end(file.buffer); return
      }
      const snapshot = /^\/api\/ops\/sources\/([^/]+)\/snapshots\/([^/]+)$/.exec(pathname)
      if (snapshot && request.method === 'PATCH') return send(response, 200, await service.updateSnapshot(decode(snapshot[1]), decode(snapshot[2]), await readJson(request)))
      const history = /^\/api\/ops\/sources\/([^/]+)\/snapshots$/.exec(pathname)
      if (history && request.method === 'GET') return send(response, 200, await service.history(decode(history[1])))
      if (history && request.method === 'POST') return send(response, 201, await service.addManualSnapshot(decode(history[1]), await readJson(request, OPS_SNAPSHOT_REQUEST_MAX_LENGTH)))
      const refresh = /^\/api\/ops\/sources\/([^/]+)\/refresh$/.exec(pathname)
      if (refresh && request.method === 'POST') return send(response, 200, await service.refresh(decode(refresh[1])))
      const source = /^\/api\/ops\/sources\/([^/]+)$/.exec(pathname)
      if (source && request.method === 'PATCH') return send(response, 200, await service.update(decode(source[1]), await readJson(request)))
      return send(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
    } catch (error) {
      if ((error.status ?? 500) >= 500) server.config.logger.error(error)
      return send(response, error.status ?? 500, { error: { code: error.code ?? 'INTERNAL_ERROR', message: (error.status ?? 500) >= 500 ? '服务器暂时不可用' : error.message } })
    }
  }) } }
}
