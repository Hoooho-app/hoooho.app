import { authConfig } from '../auth/config.mjs'
import { TokenService } from '../auth/token-service.mjs'
import { HealthEventService } from '../events/health-event-service.mjs'
import { HealthEventRecordService } from '../events/health-event-record-service.mjs'
import { QuickRecordService } from '../events/quick-record-service.mjs'
import { RoutineError, RoutineService } from './routine-service.mjs'

const send = (response, status, data) => { response.statusCode = status; response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.setHeader('Cache-Control', 'no-store'); response.end(JSON.stringify(data)) }
const body = (request) => new Promise((resolve, reject) => { let text = ''; request.setEncoding('utf8'); request.on('data', (chunk) => { text += chunk }); request.on('end', () => { try { resolve(text ? JSON.parse(text) : {}) } catch { reject(new RoutineError('请求格式错误', 400, 'INVALID_JSON')) } }); request.on('error', reject) })
const account = (request, tokens) => { const match = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? ''); const value = match ? tokens.verify(match[1]) : null; if (!value) throw new RoutineError('登录状态无效或已过期', 401, 'UNAUTHORIZED'); return value.sub }

export function routinesApiPlugin(options = {}) {
  const config = { ...authConfig, ...options }
  const events = new HealthEventService(config); const records = new HealthEventRecordService(config); const quickRecords = new QuickRecordService({ ...config, events, records })
  const service = options.service ?? new RoutineService({ ...config, events, records, quickRecords })
  const tokens = options.tokens ?? new TokenService(config.tokenSecret, config.tokenTtlMs)
  return { name: 'hoooho-local-routines-api', configureServer(server) { server.middlewares.use(async (request, response, next) => {
    const url = new URL(request.url ?? '/', 'http://localhost'); const match = /^\/api\/routines\/([^/]+)(?:\/tracks\/([^/]+))?$/.exec(url.pathname); if (!match) return next()
    try {
      const accountId = account(request, tokens); const memberId = decodeURIComponent(match[1]); const itemKey = match[2] ? decodeURIComponent(match[2]) : null; const timeZone = request.headers['x-hoooho-timezone'] || 'Asia/Shanghai'
      if (!itemKey && request.method === 'GET') return send(response, 200, await service.getDay(accountId, memberId, String(url.searchParams.get('day') ?? ''), timeZone))
      if (!itemKey && request.method === 'PATCH') { const input = await body(request); return send(response, 200, input.status ? await service.setPreference(accountId, memberId, input.status, new Date(), timeZone) : await service.saveTemplateVersion(accountId, memberId, input)) }
      if (itemKey && request.method === 'POST') { const input = await body(request); return send(response, 200, await service.setOverride(accountId, memberId, input.day, itemKey, input, new Date(), timeZone)) }
      return send(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
    } catch (error) { const known = error instanceof RoutineError; if (!known) server.config.logger.error(error); return send(response, known ? error.status : 500, { error: { code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : '服务器暂时不可用' } }) }
  }) } }
}
