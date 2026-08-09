import { authConfig } from '../auth/config.mjs'
import { TokenService } from '../auth/token-service.mjs'
import { HealthRecordOrganizationError, HealthRecordOrganizationService } from './health-record-organization-service.mjs'

const readJson = (request) => new Promise((resolve, reject) => {
  let body = ''
  let settled = false
  request.setEncoding('utf8')
  request.on('data', (chunk) => {
    if (settled) return
    body += chunk
    if (body.length > 16_384) {
      settled = true
      reject(new HealthRecordOrganizationError('请求内容过大', 413, 'PAYLOAD_TOO_LARGE'))
    }
  })
  request.on('end', () => {
    if (settled) return
    try {
      settled = true
      resolve(body ? JSON.parse(body) : {})
    } catch {
      settled = true
      reject(new HealthRecordOrganizationError('请求格式错误', 400, 'INVALID_JSON'))
    }
  })
  request.on('error', reject)
})

function sendJson(response, status, data) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(data))
}

function readAccountId(request, tokens) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? '')
  const payload = match ? tokens.verify(match[1]) : null
  if (!payload) throw new HealthRecordOrganizationError('登录状态无效或已过期', 401, 'UNAUTHORIZED')
  return payload.sub
}

export function aiApiPlugin(options = {}) {
  const config = { ...authConfig, ...options }
  const service = options.service ?? new HealthRecordOrganizationService({ dataDirectory: config.dataDirectory })
  const tokens = options.tokens ?? new TokenService(config.tokenSecret, config.tokenTtlMs)

  return {
    name: 'hoooho-local-ai-api',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
        const match = /^\/api\/events\/([^/]+)\/organizations$/.exec(pathname)
        if (!match) return next()

        try {
          const accountId = readAccountId(request, tokens)
          const eventId = decodeURIComponent(match[1])
          if (request.method === 'GET') return sendJson(response, 200, await service.list(accountId, eventId))
          if (request.method === 'POST') return sendJson(response, 201, await service.organize(accountId, eventId, await readJson(request)))
          return sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
        } catch (error) {
          const status = Number.isInteger(error?.status) ? error.status : 500
          const message = status >= 500 ? '服务器暂时不可用' : error.message
          if (status >= 500) server.config.logger.error(error)
          return sendJson(response, status, { error: { code: error?.code ?? 'INTERNAL_ERROR', message } })
        }
      })
    }
  }
}
