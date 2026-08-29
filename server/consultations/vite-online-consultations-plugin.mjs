import { authConfig } from '../auth/config.mjs'
import { TokenService } from '../auth/token-service.mjs'
import { OnlineConsultationError, OnlineConsultationService } from './online-consultation-service.mjs'

const readJson = (request) => new Promise((resolve, reject) => {
  let body = ''
  let settled = false
  request.setEncoding('utf8')
  request.on('data', (chunk) => {
    if (settled) return
    body += chunk
    if (body.length > 32_768) {
      settled = true
      reject(new OnlineConsultationError('请求内容过大', 413, 'PAYLOAD_TOO_LARGE'))
    }
  })
  request.on('end', () => {
    if (settled) return
    try { settled = true; resolve(body ? JSON.parse(body) : {}) }
    catch { settled = true; reject(new OnlineConsultationError('请求格式错误', 400, 'INVALID_JSON')) }
  })
  request.on('error', reject)
})

const sendJson = (response, status, data) => {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(data))
}

function readAccountId(request, tokens) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? '')
  const payload = match ? tokens.verify(match[1]) : null
  if (!payload) throw new OnlineConsultationError('登录状态无效或已过期', 401, 'UNAUTHORIZED')
  return payload.sub
}

export function onlineConsultationsApiPlugin(options = {}) {
  const config = { ...authConfig, ...options }
  const service = options.service ?? new OnlineConsultationService({ dataDirectory: config.dataDirectory })
  const tokens = options.tokens ?? new TokenService(config.tokenSecret, config.tokenTtlMs)

  return {
    name: 'hoooho-local-online-consultations-api',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
        const match = /^\/api\/events\/([^/]+)\/online-consultation(?:\/(questions|refresh|complete))?$/.exec(pathname)
        if (!match) return next()
        try {
          const accountId = readAccountId(request, tokens)
          const eventId = decodeURIComponent(match[1])
          const action = match[2]
          if (!action && request.method === 'GET') return sendJson(response, 200, await service.get(accountId, eventId))
          if (!action && request.method === 'PATCH') return sendJson(response, 200, await service.updateStatus(accountId, eventId, await readJson(request)))
          if (action === 'questions' && request.method === 'POST') return sendJson(response, 201, await service.addQuestion(accountId, eventId, await readJson(request)))
          if (action === 'refresh' && request.method === 'POST') return sendJson(response, 200, await service.touchWaiting(accountId, eventId))
          if (action === 'complete' && request.method === 'POST') return sendJson(response, 200, await service.complete(accountId, eventId, await readJson(request)))
          return sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
        } catch (error) {
          const status = error instanceof OnlineConsultationError ? error.status : 500
          const code = error instanceof OnlineConsultationError ? error.code : 'INTERNAL_ERROR'
          const message = error instanceof OnlineConsultationError ? error.message : '服务器暂时不可用'
          if (!(error instanceof OnlineConsultationError)) server.config.logger.error(error)
          return sendJson(response, status, { error: { code, message } })
        }
      })
    }
  }
}
