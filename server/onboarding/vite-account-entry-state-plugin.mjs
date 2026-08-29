import { authConfig } from '../auth/config.mjs'
import { TokenService } from '../auth/token-service.mjs'
import { AccountEntryStateService } from './account-entry-state-service.mjs'

function sendJson(response, status, data) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(data))
}

export function accountEntryStateApiPlugin(options = {}) {
  const config = { ...authConfig, ...options }
  const service = options.service ?? new AccountEntryStateService({ dataDirectory: config.dataDirectory })
  const tokens = options.tokens ?? new TokenService(config.tokenSecret, config.tokenTtlMs)

  return {
    name: 'hoooho-local-account-entry-state-api',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
        if (pathname !== '/api/account/entry-state') return next()
        if (request.method !== 'GET') return sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })

        try {
          const authorization = request.headers.authorization ?? ''
          const match = /^Bearer\s+(.+)$/i.exec(authorization)
          const payload = match ? tokens.verify(match[1]) : null
          if (!payload) return sendJson(response, 401, { error: { code: 'UNAUTHORIZED', message: '登录状态无效或已过期' } })
          return sendJson(response, 200, await service.get(payload.sub))
        } catch (error) {
          server.config.logger.error(error)
          return sendJson(response, 500, { error: { code: 'INTERNAL_ERROR', message: '服务器暂时不可用' } })
        }
      })
    }
  }
}
