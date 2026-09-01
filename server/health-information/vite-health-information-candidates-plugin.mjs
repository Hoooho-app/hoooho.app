import { authConfig } from '../auth/config.mjs'
import { TokenService } from '../auth/token-service.mjs'
import { HealthInformationCandidateError, HealthInformationCandidateService } from './health-information-candidate-service.mjs'

const readJson = (request) => new Promise((resolve, reject) => {
  let body = ''
  request.setEncoding('utf8')
  request.on('data', (chunk) => { body += chunk })
  request.on('end', () => {
    try { resolve(body ? JSON.parse(body) : {}) }
    catch { reject(new HealthInformationCandidateError('请求格式错误', 400, 'INVALID_JSON')) }
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
  if (!payload) throw new HealthInformationCandidateError('登录状态无效或已过期', 401, 'UNAUTHORIZED')
  return payload.sub
}

export function healthInformationCandidatesApiPlugin(options = {}) {
  const config = { ...authConfig, ...options }
  const service = options.service ?? new HealthInformationCandidateService({ dataDirectory: config.dataDirectory, structuredMode: config.structuredMode })
  const tokens = options.tokens ?? new TokenService(config.tokenSecret, config.tokenTtlMs)
  return {
    name: 'hoooho-local-health-information-candidates-api',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
        const eventMatch = /^\/api\/events\/([^/]+)\/health-information-candidates(?:\/(discover))?$/.exec(pathname)
        const candidateMatch = /^\/api\/health-information-candidates\/([^/]+)$/.exec(pathname)
        if (!eventMatch && !candidateMatch) return next()
        try {
          const accountId = readAccountId(request, tokens)
          if (eventMatch) {
            const eventId = decodeURIComponent(eventMatch[1])
            if (!eventMatch[2] && request.method === 'GET') return sendJson(response, 200, await service.list(accountId, eventId))
            if (eventMatch[2] === 'discover' && request.method === 'POST') return sendJson(response, 200, await service.discover(accountId, eventId))
          }
          if (candidateMatch && request.method === 'PATCH') return sendJson(response, 200, await service.update(accountId, decodeURIComponent(candidateMatch[1]), await readJson(request)))
          return sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
        } catch (error) {
          const known = error instanceof HealthInformationCandidateError
          if (!known) server.config.logger.error(error)
          return sendJson(response, known ? error.status : 500, { error: { code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : '服务器暂时不可用' } })
        }
      })
    }
  }
}
