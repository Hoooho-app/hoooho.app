import { authConfig } from '../auth/config.mjs'
import { TokenService } from '../auth/token-service.mjs'
import { assertOpsAccess } from '../ops/ops-service.mjs'
import { FeedbackService } from './feedback-service.mjs'

const readJson = (request, max = 29_000_000) => new Promise((resolve, reject) => {
  let body = '', settled = false
  request.setEncoding('utf8')
  request.on('data', (chunk) => { if (settled) return; body += chunk; if (body.length > max) { settled = true; reject(Object.assign(new Error('请求内容过大'), { status: 413, code: 'PAYLOAD_TOO_LARGE' })) } })
  request.on('end', () => { if (settled) return; try { resolve(body ? JSON.parse(body) : {}) } catch { reject(Object.assign(new Error('请求格式错误'), { status: 400, code: 'INVALID_JSON' })) } })
  request.on('error', reject)
})
const send = (response, status, data) => { response.statusCode = status; response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.setHeader('Cache-Control', 'no-store'); response.end(JSON.stringify(data)) }
const payload = (request, tokens) => {
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? '')?.[1]
  const value = token ? tokens.verify(token) : null
  if (!value) throw Object.assign(new Error('登录状态无效或已过期'), { status: 401, code: 'UNAUTHORIZED' })
  return value
}

export function feedbackApiPlugin(options = {}) {
  const service = new FeedbackService({ dataDirectory: options.dataDirectory ?? authConfig.dataDirectory, tokenSecret: authConfig.tokenSecret })
  const tokens = new TokenService(authConfig.tokenSecret, authConfig.tokenTtlMs)
  return { name: 'hoooho-local-feedback-api', configureServer(server) { server.middlewares.use(async (request, response, next) => {
    const url = new URL(request.url ?? '/', 'http://localhost'), pathname = url.pathname
    if (!pathname.startsWith('/api/feedback') && !pathname.startsWith('/api/ops/feedback')) return next()
    try {
      const attachmentMatch = /^\/api\/feedback\/attachments\/([^/]+)$/.exec(pathname)
      if (attachmentMatch && request.method === 'GET') {
        const item = await service.readAttachmentWithAccess(decodeURIComponent(attachmentMatch[1]), url.searchParams.get('expires'), url.searchParams.get('access'))
        response.statusCode = 200; response.setHeader('Content-Type', item.type); response.setHeader('Content-Length', String(item.buffer.length)); response.setHeader('Cache-Control', 'private, no-store'); response.end(item.buffer); return
      }
      const auth = payload(request, tokens)
      if (pathname.startsWith('/api/ops/feedback')) {
        assertOpsAccess(auth, { requireAllowlist: true })
        if (pathname === '/api/ops/feedback' && request.method === 'GET') return send(response, 200, await service.listForOps(Object.fromEntries(url.searchParams)))
        const messageMatch = /^\/api\/ops\/feedback\/([^/]+)\/messages$/.exec(pathname), itemMatch = /^\/api\/ops\/feedback\/([^/]+)$/.exec(pathname)
        if (messageMatch && request.method === 'POST') return send(response, 201, await service.addOpsMessage(auth.sub, decodeURIComponent(messageMatch[1]), await readJson(request)))
        if (itemMatch && request.method === 'GET') return send(response, 200, await service.getForOps(decodeURIComponent(itemMatch[1])))
        if (itemMatch && request.method === 'PATCH') return send(response, 200, await service.updateFromOps(auth.sub, decodeURIComponent(itemMatch[1]), await readJson(request)))
      } else {
        if (pathname === '/api/feedback' && request.method === 'GET') return send(response, 200, await service.listForAccount(auth.sub))
        if (pathname === '/api/feedback' && request.method === 'POST') return send(response, 201, await service.create(auth.sub, await readJson(request)))
        const messageMatch = /^\/api\/feedback\/([^/]+)\/messages$/.exec(pathname), itemMatch = /^\/api\/feedback\/([^/]+)$/.exec(pathname)
        if (messageMatch && request.method === 'POST') return send(response, 201, await service.addUserMessage(auth.sub, decodeURIComponent(messageMatch[1]), await readJson(request)))
        if (itemMatch && request.method === 'GET') return send(response, 200, await service.getForAccount(auth.sub, decodeURIComponent(itemMatch[1])))
        if (itemMatch && request.method === 'DELETE') return send(response, 200, await service.deleteForAccount(auth.sub, decodeURIComponent(itemMatch[1])))
      }
      return send(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
    } catch (error) {
      if ((error.status ?? 500) >= 500) server.config.logger.error(error)
      return send(response, error.status ?? 500, { error: { code: error.code ?? 'INTERNAL_ERROR', message: error.status >= 500 ? '服务器暂时不可用' : error.message } })
    }
  }) } }
}
