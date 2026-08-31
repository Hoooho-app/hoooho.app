import { authConfig } from '../auth/config.mjs'
import { TokenService } from '../auth/token-service.mjs'
import { EventAttachmentError, EventAttachmentService } from './event-attachment-service.mjs'

const readJson = (request) => new Promise((resolve, reject) => {
  let body = ''
  let settled = false
  request.setEncoding('utf8')
  request.on('data', (chunk) => {
    if (settled) return
    body += chunk
    if (body.length > 7_100_000) {
      settled = true
      reject(new EventAttachmentError('附件内容过大', 413, 'PAYLOAD_TOO_LARGE'))
    }
  })
  request.on('end', () => {
    if (settled) return
    try { settled = true; resolve(body ? JSON.parse(body) : {}) }
    catch { settled = true; reject(new EventAttachmentError('请求格式错误', 400, 'INVALID_JSON')) }
  })
  request.on('error', reject)
})

function sendJson(response, status, data) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(data))
}

export function eventAttachmentsApiPlugin(options = {}) {
  const config = { ...authConfig, ...options }
  const service = options.service ?? new EventAttachmentService({ dataDirectory: config.dataDirectory })
  const tokens = options.tokens ?? new TokenService(config.tokenSecret, config.tokenTtlMs)
  return {
    name: 'hoooho-local-event-attachments-api',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
        const match = /^\/api\/events\/([^/]+)\/attachments(?:\/(preview))?$/.exec(pathname)
        if (!match) return next()
        try {
          const tokenMatch = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? '')
          const payload = tokenMatch ? tokens.verify(tokenMatch[1]) : null
          if (!payload) throw new EventAttachmentError('登录状态无效或已过期', 401, 'UNAUTHORIZED')
          const eventId = decodeURIComponent(match[1])
          if (request.method === 'POST' && match[2] === 'preview') return sendJson(response, 200, await service.preview(payload.sub, eventId, await readJson(request)))
          if (request.method === 'GET') return sendJson(response, 200, await service.list(payload.sub, eventId))
          if (request.method === 'POST') return sendJson(response, 201, await service.create(payload.sub, eventId, await readJson(request)))
          return sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
        } catch (error) {
          const status = Number.isInteger(error?.status) ? error.status : 500
          if (status >= 500) server.config.logger.error(error)
          return sendJson(response, status, { error: { code: error?.code ?? 'INTERNAL_ERROR', message: status >= 500 ? '服务器暂时不可用' : error.message } })
        }
      })
    }
  }
}
