import { authConfig } from '../auth/config.mjs'
import { TokenService } from '../auth/token-service.mjs'
import { QuickRecordService } from './quick-record-service.mjs'

const sendJson = (response, status, data) => {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(data))
}

const readJson = (request) => new Promise((resolve, reject) => {
  let body = ''
  let settled = false
  request.setEncoding('utf8')
  request.on('data', (chunk) => {
    if (settled) return
    body += chunk
    if (body.length > 16_384) {
      settled = true
      const error = new Error('请求内容过大')
      error.status = 413
      error.code = 'PAYLOAD_TOO_LARGE'
      reject(error)
    }
  })
  request.on('end', () => {
    if (settled) return
    try {
      settled = true
      resolve(body ? JSON.parse(body) : {})
    } catch {
      settled = true
      const error = new Error('请求格式错误')
      error.status = 400
      error.code = 'INVALID_JSON'
      reject(error)
    }
  })
  request.on('error', reject)
})

export function quickRecordsApiPlugin(options = {}) {
  const config = { ...authConfig, ...options }
  const service = options.service ?? new QuickRecordService({ dataDirectory: config.dataDirectory })
  const tokens = options.tokens ?? new TokenService(config.tokenSecret, config.tokenTtlMs)
  return {
    name: 'hoooho-local-quick-records-api',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
        if (pathname !== '/api/quick-records') return next()
        try {
          const match = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? '')
          const payload = match ? tokens.verify(match[1]) : null
          if (!payload) {
            const error = new Error('登录状态无效或已过期')
            error.status = 401
            error.code = 'UNAUTHORIZED'
            throw error
          }
          if (request.method !== 'POST') return sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
          return sendJson(response, 201, await service.create(payload.sub, await readJson(request)))
        } catch (error) {
          const status = Number.isInteger(error?.status) ? error.status : 500
          if (status >= 500) server.config.logger.error(error)
          return sendJson(response, status, { error: { code: error?.code ?? 'INTERNAL_ERROR', message: status >= 500 ? '服务器暂时不可用' : error.message } })
        }
      })
    }
  }
}
