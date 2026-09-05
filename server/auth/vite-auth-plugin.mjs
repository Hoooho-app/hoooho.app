import { AuthError, AuthService } from './auth-service.mjs'
import { BrowserSessionService } from './browser-session-service.mjs'
import { withAccountLock } from './account-lock.mjs'

const readJson = (request, limit = 16_384) => new Promise((resolve, reject) => {
  let body = ''
  request.setEncoding('utf8')
  request.on('data', (chunk) => {
    body += chunk
    if (body.length > limit) reject(new AuthError('请求内容过大', 413, 'PAYLOAD_TOO_LARGE'))
  })
  request.on('end', () => {
    try {
      resolve(body ? JSON.parse(body) : {})
    } catch {
      reject(new AuthError('请求格式错误', 400, 'INVALID_JSON'))
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

export function authApiPlugin(options = {}) {
  const auth = new AuthService(options)
  const sessions = new BrowserSessionService(auth)
  return {
    name: 'hoooho-local-auth-api',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const token = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? '')?.[1]
        let accountId
        try { accountId = token ? auth.tokens.verify(token)?.sub : String(request.url).startsWith('/api/auth/') ? (await sessions.current(request))?.user.id : null }
        catch { return sendJson(response, 503, { error: { code: 'SESSION_UNAVAILABLE', message: '暂时无法恢复使用状态，请重试' } }) }
        if (!accountId) return next()
        void withAccountLock(accountId, () => new Promise((resolve) => {
          response.once('finish', resolve)
          response.once('close', resolve)
          next()
        }))
      })
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
        if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/')) {
          try {
            const token = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? '')?.[1]
            const payload = token ? auth.tokens.verify(token) : null
            if (payload?.guest) {
              const user = await auth.users.findById(payload.sub)
              if (user) {
                sessions.assertSameOrigin(request)
                if (user.mergedInto || (await sessions.current(request))?.user.id !== payload.sub) throw new AuthError('使用状态已失效，请重新恢复', 401, 'UNAUTHORIZED')
              }
            }
          } catch (error) { return sendJson(response, error.status ?? 503, { error: { code: error.code ?? 'SESSION_UNAVAILABLE', message: '暂时无法恢复使用状态，请重试' } }) }
        }
        if (!pathname.startsWith('/api/auth/') && !pathname.startsWith('/api/ops/auth/')) return next()

        try {
          if (pathname === '/api/auth/profile-sections' && ['GET', 'POST'].includes(request.method)) {
            const input = request.method === 'GET' ? undefined : await readJson(request, 20_000_000)
            return sendJson(response, 200, await sessions.profileSections(request, input))
          }
          if (pathname === '/api/auth/session' && request.method === 'GET') {
            const token = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? '')?.[1] ?? ''
            return sendJson(response, 200, await sessions.restore(request, response, token))
          }
          if (request.method !== 'POST') return sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '仅支持 POST 请求' } })
          const body = await readJson(request)
          if (pathname === '/api/auth/current-member') return sendJson(response, 200, await sessions.selectMember(request, body))
          if (pathname === '/api/auth/guest') {
            return sendJson(response, 200, await sessions.create(request, response, String(body.guestToken ?? '')))
          }
          if (pathname === '/api/auth/logout') return sendJson(response, 200, await sessions.logout(request, response))
          if (pathname === '/api/auth/send-code') {
            return sendJson(response, 200, await auth.sendCode(String(body.phone ?? '')))
          }
          if (pathname === '/api/auth/login') {
            const session = await auth.login(String(body.phone ?? ''), String(body.code ?? ''))
            return sendJson(response, 200, await sessions.completeLogin(request, response, session, String(body.guestToken ?? '')))
          }
          if (pathname === '/api/auth/email/send-code') {
            return sendJson(response, 200, await auth.sendEmailCode(String(body.email ?? '')))
          }
          if (pathname === '/api/auth/email/login') {
            const session = await auth.loginWithEmail(String(body.email ?? ''), String(body.code ?? ''))
            return sendJson(response, 200, await sessions.completeLogin(request, response, session, String(body.guestToken ?? '')))
          }
          if (pathname === '/api/ops/auth/email/send') {
            return sendJson(response, 200, await auth.sendOpsEmailCode(String(body.email ?? '')))
          }
          if (pathname === '/api/ops/auth/email/verify') {
            return sendJson(response, 200, await auth.loginOpsWithEmail(String(body.email ?? ''), String(body.code ?? '')))
          }
          return sendJson(response, 404, { error: { code: 'NOT_FOUND', message: '接口不存在' } })
        } catch (error) {
          const status = error instanceof AuthError ? error.status : 500
          const code = error instanceof AuthError ? error.code : 'INTERNAL_ERROR'
          const message = error instanceof AuthError ? error.message : '服务器暂时不可用'
          if (!(error instanceof AuthError)) server.config.logger.error(error)
          return sendJson(response, status, { error: { code, message, ...(error.details ?? {}) } })
        }
      })
    }
  }
}
