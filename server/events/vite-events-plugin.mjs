import { authConfig } from '../auth/config.mjs'
import { TokenService } from '../auth/token-service.mjs'
import { HealthEventError, HealthEventService } from './health-event-service.mjs'

const readJson = (request) => new Promise((resolve, reject) => {
  let body = ''
  let settled = false
  request.setEncoding('utf8')
  request.on('data', (chunk) => {
    if (settled) return
    body += chunk
    if (body.length > 16_384) {
      settled = true
      reject(new HealthEventError('请求内容过大', 413, 'PAYLOAD_TOO_LARGE'))
    }
  })
  request.on('end', () => {
    if (settled) return
    try {
      settled = true
      resolve(body ? JSON.parse(body) : {})
    } catch {
      settled = true
      reject(new HealthEventError('请求格式错误', 400, 'INVALID_JSON'))
    }
  })
  request.on('error', reject)
})

const sendJson = (response, status, data) => {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(data))
}

function readAccountId(request, tokenService) {
  const authorization = request.headers.authorization ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(authorization)
  const payload = match ? tokenService.verify(match[1]) : null
  if (!payload) throw new HealthEventError('登录状态无效或已过期', 401, 'UNAUTHORIZED')
  return payload.sub
}

export function eventsApiPlugin(options = {}) {
  const config = { ...authConfig, ...options }
  const events = options.service ?? new HealthEventService({ dataDirectory: config.dataDirectory })
  const tokens = options.tokens ?? new TokenService(config.tokenSecret, config.tokenTtlMs)

  return {
    name: 'hoooho-local-events-api',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
        const match = /^\/api\/events(?:\/([^/]+))?$/.exec(pathname)
        if (!match) return next()

        try {
          const accountId = readAccountId(request, tokens)
          const eventId = match[1] ? decodeURIComponent(match[1]) : null

          if (!eventId && request.method === 'GET') return sendJson(response, 200, await events.list(accountId))
          if (!eventId && request.method === 'POST') return sendJson(response, 201, await events.create(accountId, await readJson(request)))
          if (eventId && request.method === 'GET') return sendJson(response, 200, await events.get(accountId, eventId))
          if (eventId && request.method === 'PATCH') return sendJson(response, 200, await events.update(accountId, eventId, await readJson(request)))
          if (eventId && request.method === 'DELETE') return sendJson(response, 200, await events.delete(accountId, eventId))
          return sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
        } catch (error) {
          const status = error instanceof HealthEventError ? error.status : 500
          const code = error instanceof HealthEventError ? error.code : 'INTERNAL_ERROR'
          const message = error instanceof HealthEventError ? error.message : '服务器暂时不可用'
          if (!(error instanceof HealthEventError)) server.config.logger.error(error)
          return sendJson(response, status, { error: { code, message } })
        }
      })
    }
  }
}
