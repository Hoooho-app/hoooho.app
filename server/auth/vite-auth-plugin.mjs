import { AuthError, AuthService } from './auth-service.mjs'

const readJson = (request) => new Promise((resolve, reject) => {
  let body = ''
  request.setEncoding('utf8')
  request.on('data', (chunk) => {
    body += chunk
    if (body.length > 16_384) reject(new AuthError('请求内容过大', 413, 'PAYLOAD_TOO_LARGE'))
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
  return {
    name: 'hoooho-local-auth-api',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
        if (!pathname.startsWith('/api/auth/') && !pathname.startsWith('/api/ops/auth/')) return next()
        if (request.method !== 'POST') return sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '仅支持 POST 请求' } })

        try {
          const body = await readJson(request)
          if (pathname === '/api/auth/guest') {
            return sendJson(response, 200, auth.createGuestSession(String(body.guestId ?? '')))
          }
          if (pathname === '/api/auth/send-code') {
            return sendJson(response, 200, await auth.sendCode(String(body.phone ?? '')))
          }
          if (pathname === '/api/auth/login') {
            const session = await auth.login(String(body.phone ?? ''), String(body.code ?? ''))
            return sendJson(response, 200, await auth.mergeGuestSession(session, String(body.guestToken ?? '')))
          }
          if (pathname === '/api/auth/email/send-code') {
            return sendJson(response, 200, await auth.sendEmailCode(String(body.email ?? '')))
          }
          if (pathname === '/api/auth/email/login') {
            const session = await auth.loginWithEmail(String(body.email ?? ''), String(body.code ?? ''))
            return sendJson(response, 200, await auth.mergeGuestSession(session, String(body.guestToken ?? '')))
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
