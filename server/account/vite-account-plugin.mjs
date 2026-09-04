import { AuthService } from '../auth/auth-service.mjs'
import { TokenService } from '../auth/token-service.mjs'
import { authConfig } from '../auth/config.mjs'
import { AccountService } from './account-service.mjs'

const json = (request) => new Promise((resolve, reject) => {
  let body = ''
  request.setEncoding('utf8')
  request.on('data', (chunk) => { body += chunk })
  request.on('end', () => { try { resolve(body ? JSON.parse(body) : {}) } catch (error) { reject(error) } })
  request.on('error', reject)
})
const send = (response, status, data) => {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(data))
}

export function accountApiPlugin(options = {}) {
  const config = { ...authConfig, ...options }
  const auth = new AuthService(config)
  const service = new AccountService({ ...config, auth, users: auth.users, data: auth.accountData })
  const tokens = new TokenService(config.tokenSecret, config.tokenTtlMs)
  return {
    name: 'hoooho-local-account-api',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
        if (!pathname.startsWith('/api/account/') || pathname === '/api/account/entry-state') return next()
        const token = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? '')?.[1]
        const payload = token ? tokens.verify(token) : null
        if (!payload || payload.guest) return send(response, 401, { error: { code: 'UNAUTHORIZED', message: '请先登录或注册' } })
        try {
          const body = request.method === 'GET' ? {} : await json(request)
          if (pathname === '/api/account/profile' && request.method === 'GET') return send(response, 200, await service.get(payload.sub))
          if (pathname === '/api/account/profile' && request.method === 'PATCH') return send(response, 200, await service.updateProfile(payload.sub, body))
          if (pathname === '/api/account/bind/send-code' && request.method === 'POST') return send(response, 200, await service.sendBindingCode(payload.sub, String(body.kind ?? ''), String(body.value ?? '')))
          if (pathname === '/api/account/bind/confirm' && request.method === 'POST') return send(response, 200, await service.bind(payload.sub, String(body.kind ?? ''), String(body.value ?? ''), String(body.code ?? ''), String(body.challengeToken ?? '')))
          if (pathname === '/api/account/bind/verify-current' && request.method === 'POST') return send(response, 200, await service.verifyCurrent(payload.sub, String(body.kind ?? ''), String(body.code ?? '')))
          if (pathname === '/api/account/provider' && request.method === 'POST') return send(response, 200, await service.providerAction(payload.sub, String(body.provider ?? ''), String(body.action ?? '')))
          if (pathname === '/api/account/delete/send-code' && request.method === 'POST') {
            const current = await service.get(payload.sub)
            const value = body.kind === 'phone' ? current.phone : current.email
            return send(response, 200, await service.sendBindingCode(payload.sub, String(body.kind ?? ''), value ?? ''))
          }
          if (pathname === '/api/account/delete/verify' && request.method === 'POST') return send(response, 200, await service.verifyDeletion(payload.sub, String(body.kind ?? ''), String(body.code ?? '')))
          if (pathname === '/api/account/delete' && request.method === 'POST') return send(response, 200, await service.delete(payload.sub, body))
          return send(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
        } catch (error) {
          server.config.logger.error(error)
          return send(response, error?.status ?? 500, { error: { code: error?.code ?? 'INTERNAL_ERROR', message: error?.message ?? '服务器暂时不可用', ...(error?.details ?? {}) } })
        }
      })
    }
  }
}
