import { authConfig } from '../auth/config.mjs'
import { TokenService } from '../auth/token-service.mjs'
import { HealthEventRecordError, HealthEventRecordService } from './health-event-record-service.mjs'

const readJson = (request) => new Promise((resolve, reject) => {
  let body = ''
  let settled = false
  request.setEncoding('utf8')
  request.on('data', (chunk) => {
    if (settled) return
    body += chunk
    if (body.length > 16_384) {
      settled = true
      reject(new HealthEventRecordError('请求内容过大', 413, 'PAYLOAD_TOO_LARGE'))
    }
  })
  request.on('end', () => {
    if (settled) return
    try {
      settled = true
      resolve(body ? JSON.parse(body) : {})
    } catch {
      settled = true
      reject(new HealthEventRecordError('请求格式错误', 400, 'INVALID_JSON'))
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
  if (!payload) throw new HealthEventRecordError('登录状态无效或已过期', 401, 'UNAUTHORIZED')
  return payload.sub
}

export function eventRecordsApiPlugin(options = {}) {
  const config = { ...authConfig, ...options }
  const records = options.service ?? new HealthEventRecordService({ dataDirectory: config.dataDirectory })
  const tokens = options.tokens ?? new TokenService(config.tokenSecret, config.tokenTtlMs)

  return {
    name: 'hoooho-local-event-records-api',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
        const eventRecordsMatch = /^\/api\/events\/([^/]+)\/records$/.exec(pathname)
        const recordMatch = /^\/api\/records\/([^/]+)$/.exec(pathname)
        const annotationMatch = /^\/api\/records\/([^/]+)\/change-annotations\/([^/]+)$/.exec(pathname)
        if (!eventRecordsMatch && !recordMatch && !annotationMatch) return next()

        try {
          const accountId = readAccountId(request, tokens)
          if (eventRecordsMatch) {
            const eventId = decodeURIComponent(eventRecordsMatch[1])
            if (request.method === 'GET') return sendJson(response, 200, await records.list(accountId, eventId))
            if (request.method === 'POST') {
              return sendJson(response, 201, await records.create(accountId, eventId, await readJson(request)))
            }
          }

          if (annotationMatch) {
            const recordId = decodeURIComponent(annotationMatch[1])
            const annotationId = decodeURIComponent(annotationMatch[2])
            if (request.method === 'PATCH') return sendJson(response, 200, await records.updateChangeAnnotation(accountId, recordId, annotationId, await readJson(request)))
            if (request.method === 'DELETE') return sendJson(response, 200, await records.deleteChangeAnnotation(accountId, recordId, annotationId))
          }

          if (recordMatch) {
            const recordId = decodeURIComponent(recordMatch[1])
            if (request.method === 'PATCH') {
              return sendJson(response, 200, await records.update(accountId, recordId, await readJson(request)))
            }
            if (request.method === 'DELETE') return sendJson(response, 200, await records.delete(accountId, recordId))
          }

          return sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
        } catch (error) {
          const status = error instanceof HealthEventRecordError ? error.status : 500
          const code = error instanceof HealthEventRecordError ? error.code : 'INTERNAL_ERROR'
          const message = error instanceof HealthEventRecordError ? error.message : '服务器暂时不可用'
          if (!(error instanceof HealthEventRecordError)) server.config.logger.error(error)
          return sendJson(response, status, { error: { code, message } })
        }
      })
    }
  }
}
