import { authConfig } from '../auth/config.mjs'
import { TokenService } from '../auth/token-service.mjs'
import { HealthEventService } from '../events/health-event-service.mjs'
import { HealthEventRecordService } from '../events/health-event-record-service.mjs'
import { MedicationReminderError, MedicationReminderService } from './medication-reminder-service.mjs'

const send = (response, status, data) => { response.statusCode = status; response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.setHeader('Cache-Control', 'no-store'); response.end(JSON.stringify(data)) }
const body = (request) => new Promise((resolve, reject) => { let text = ''; request.setEncoding('utf8'); request.on('data', (chunk) => { text += chunk }); request.on('end', () => { try { resolve(text ? JSON.parse(text) : {}) } catch { reject(new MedicationReminderError('请求格式错误', 400, 'INVALID_JSON')) } }); request.on('error', reject) })
const account = (request, tokens) => { const match = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? ''); const value = match ? tokens.verify(match[1]) : null; if (!value) throw new MedicationReminderError('登录状态无效或已过期', 401, 'UNAUTHORIZED'); return value.sub }

export function medicationRemindersApiPlugin(options = {}) {
  const config = { ...authConfig, ...options }
  const events = new HealthEventService(config)
  const records = new HealthEventRecordService(config)
  const service = options.service ?? new MedicationReminderService({ ...config, events, records })
  const tokens = options.tokens ?? new TokenService(config.tokenSecret, config.tokenTtlMs)
  return { name: 'hoooho-local-medication-reminders-api', configureServer(server) { server.middlewares.use(async (request, response, next) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const collection = url.pathname === '/api/medication-reminders'
    const match = /^\/api\/medication-reminders\/([^/]+)(?:\/(complete|undo|archive))?$/.exec(url.pathname)
    if (!collection && !match) return next()
    try {
      const accountId = account(request, tokens)
      const timeZone = request.headers['x-hoooho-timezone'] || 'Asia/Shanghai'
      if (collection && request.method === 'GET') return send(response, 200, await service.list(accountId, String(url.searchParams.get('memberId') ?? '')))
      if (collection && request.method === 'POST') return send(response, 201, await service.create(accountId, await body(request), new Date(), timeZone))
      const id = decodeURIComponent(match[1]); const action = match[2]
      if (action === 'complete' && request.method === 'POST') { const input = await body(request); return send(response, 200, await service.complete(accountId, id, String(input.occurrenceId ?? ''), input)) }
      if (action === 'undo' && request.method === 'POST') return send(response, 200, await service.undo(accountId, id))
      if (action === 'archive' && request.method === 'POST') return send(response, 200, await service.archive(accountId, id))
      if (!action && request.method === 'DELETE') return send(response, 200, await service.delete(accountId, id))
      return send(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
    } catch (error) {
      const known = error instanceof MedicationReminderError || Number.isInteger(error?.status)
      if (!known) server.config.logger.error(error)
      return send(response, known ? error.status : 500, { error: { code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : '服务器暂时不可用' } })
    }
  }) } }
}
