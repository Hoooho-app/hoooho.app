import { authConfig } from '../auth/config.mjs'
import { TokenService } from '../auth/token-service.mjs'
import { DesensitizationTestError, DesensitizationTestService } from './desensitization-test-service.mjs'

const send = (response, status, data) => { response.statusCode = status; response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.setHeader('Cache-Control', 'no-store'); response.end(JSON.stringify(data)) }
const body = (request) => new Promise((resolve, reject) => { let text = ''; request.setEncoding('utf8'); request.on('data', (chunk) => { text += chunk; if (text.length > 32_768) reject(new DesensitizationTestError('请求内容过大', 413, 'PAYLOAD_TOO_LARGE')) }); request.on('end', () => { try { resolve(text ? JSON.parse(text) : {}) } catch { reject(new DesensitizationTestError('请求格式错误', 400, 'INVALID_JSON')) } }); request.on('error', reject) })
const account = (request, tokens) => { const match = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? ''); const payload = match ? tokens.verify(match[1]) : null; if (!payload) throw new DesensitizationTestError('登录状态无效或已过期', 401, 'UNAUTHORIZED'); return payload.sub }

export function desensitizationTestsApiPlugin(options = {}) {
  const config = { ...authConfig, ...options }
  const service = options.service ?? new DesensitizationTestService(config)
  const tokens = options.tokens ?? new TokenService(config.tokenSecret, config.tokenTtlMs)
  return { name: 'hoooho-local-desensitization-tests-api', configureServer(server) { server.middlewares.use(async (request, response, next) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    if (!url.pathname.startsWith('/api/desensitization-tests')) return next()
    try {
      const accountId = account(request, tokens); const timeZone = String(request.headers['x-hoooho-timezone'] || 'Asia/Shanghai')
      const collection = url.pathname === '/api/desensitization-tests'
      const recordMatch = /^\/api\/desensitization-tests\/([^/]+)\/records(?:\/([^/]+)(?:\/(withdraw|restore|undo-update))?)?$/.exec(url.pathname)
      const actionMatch = /^\/api\/desensitization-tests\/([^/]+)\/(archive|restore|undo-delete|plan)$/.exec(url.pathname)
      const taskMatch = /^\/api\/desensitization-tests\/([^/]+)$/.exec(url.pathname)
      if (collection && request.method === 'GET') return send(response, 200, await service.list(accountId, String(url.searchParams.get('memberId') ?? ''), new Date(), timeZone))
      if (collection && request.method === 'POST') return send(response, 201, await service.create(accountId, await body(request), new Date(), timeZone))
      if (recordMatch) { const taskId = decodeURIComponent(recordMatch[1]); const recordId = recordMatch[2] ? decodeURIComponent(recordMatch[2]) : ''; const action = recordMatch[3]
        if (!recordId && request.method === 'POST') return send(response, 201, await service.saveRecord(accountId, taskId, await body(request)))
        if (recordId && !action && request.method === 'PATCH') return send(response, 200, await service.updateRecord(accountId, taskId, recordId, await body(request)))
        if (recordId && action === 'withdraw' && request.method === 'POST') { const input = await body(request); return send(response, 200, await service.withdrawRecord(accountId, taskId, recordId, Number.isInteger(input.version) ? input.version : null)) }
        if (recordId && action === 'restore' && request.method === 'POST') { const input = await body(request); return send(response, 200, await service.restoreRecord(accountId, taskId, recordId, Number(input.version))) }
        if (recordId && action === 'undo-update' && request.method === 'POST') { const input = await body(request); return send(response, 200, await service.undoRecordUpdate(accountId, taskId, recordId, Number(input.version))) }
      }
      if (actionMatch) { const id = decodeURIComponent(actionMatch[1]); const action = actionMatch[2]
        if (action === 'plan' && request.method === 'PUT') return send(response, 200, await service.savePlan(accountId, id, await body(request)))
        if (request.method === 'POST') { const input = await body(request); return send(response, 200, await service.mutateTask(accountId, id, action, new Date(), Number.isInteger(input.version) ? input.version : null)) }
      }
      if (taskMatch && request.method === 'PATCH') return send(response, 200, await service.updateName(accountId, decodeURIComponent(taskMatch[1]), await body(request)))
      if (taskMatch && request.method === 'DELETE') { const input = await body(request); return send(response, 200, await service.mutateTask(accountId, decodeURIComponent(taskMatch[1]), 'delete', new Date(), Number.isInteger(input.version) ? input.version : null)) }
      return send(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
    } catch (error) {
      const known = error instanceof DesensitizationTestError || Number.isInteger(error?.status)
      if (!known) server.config.logger.error(error)
      return send(response, known ? error.status : 500, { error: { code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : '服务器暂时不可用', ...(error?.details ? { details: error.details } : {}) } })
    }
  }) } }
}
