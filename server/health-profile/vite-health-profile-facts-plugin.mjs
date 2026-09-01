import { authConfig } from '../auth/config.mjs'
import { TokenService } from '../auth/token-service.mjs'
import { HealthProfileFactError, HealthProfileFactService } from './health-profile-fact-service.mjs'

const readJson = (request) => new Promise((resolve, reject) => {
  let body = ''
  request.setEncoding('utf8')
  request.on('data', (chunk) => {
    body += chunk
    if (body.length > 16_384) reject(new HealthProfileFactError('请求内容过大', 413, 'PAYLOAD_TOO_LARGE'))
  })
  request.on('end', () => {
    try { resolve(body ? JSON.parse(body) : {}) }
    catch { reject(new HealthProfileFactError('请求格式错误', 400, 'INVALID_JSON')) }
  })
  request.on('error', reject)
})

const sendJson = (response, status, data) => {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(data))
}

export function healthProfileFactsApiPlugin(options = {}) {
  const config = { ...authConfig, ...options }
  const service = options.service ?? new HealthProfileFactService({ dataDirectory: config.dataDirectory })
  const tokens = options.tokens ?? new TokenService(config.tokenSecret, config.tokenTtlMs)
  return {
    name: 'hoooho-local-health-profile-facts-api',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://localhost')
        const pathname = url.pathname
        const candidatesMatch = pathname === '/api/health-profile-facts/candidates'
        const sourcesMatch = /^\/api\/health-profile-facts\/([^/]+)\/sources$/.exec(pathname)
        const factMatch = /^\/api\/health-profile-facts\/([^/]+)$/.exec(pathname)
        const collectionMatch = pathname === '/api/health-profile-facts'
        if (!candidatesMatch && !sourcesMatch && !factMatch && !collectionMatch) return next()
        try {
          const match = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? '')
          const payload = match ? tokens.verify(match[1]) : null
          if (!payload) throw new HealthProfileFactError('登录状态无效或已过期', 401, 'UNAUTHORIZED')
          if (candidatesMatch && request.method === 'GET') return sendJson(response, 200, await service.listCandidates(payload.sub, url.searchParams.get('memberId') ?? ''))
          if (collectionMatch && request.method === 'GET') return sendJson(response, 200, await service.list(payload.sub, url.searchParams.get('memberId') ?? ''))
          if (collectionMatch && request.method === 'POST') return sendJson(response, 201, await service.create(payload.sub, await readJson(request)))
          if (sourcesMatch && request.method === 'POST') return sendJson(response, 200, await service.addSource(payload.sub, decodeURIComponent(sourcesMatch[1]), await readJson(request)))
          if (factMatch && request.method === 'GET') return sendJson(response, 200, await service.get(payload.sub, decodeURIComponent(factMatch[1])))
          if (factMatch && request.method === 'PATCH') return sendJson(response, 200, await service.update(payload.sub, decodeURIComponent(factMatch[1]), await readJson(request)))
          return sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
        } catch (error) {
          const known = error instanceof HealthProfileFactError
          if (!known) server.config.logger.error(error)
          return sendJson(response, known ? error.status : 500, { error: { code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : '服务器暂时不可用' } })
        }
      })
    }
  }
}
