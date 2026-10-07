import { authConfig } from '../auth/config.mjs'
import { TokenService } from '../auth/token-service.mjs'
import { QuickRecordService } from './quick-record-service.mjs'
import { QuickRecordPhotoService } from './quick-record-photo-service.mjs'
import { withAccountLock } from '../auth/account-lock.mjs'
import { RoutineService } from '../routines/routine-service.mjs'

const sendJson = (response, status, data) => {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(data))
}

const readJson = (request, limit = 16_384) => new Promise((resolve, reject) => {
  let body = ''
  let settled = false
  request.setEncoding('utf8')
  request.on('data', (chunk) => {
    if (settled) return
    body += chunk
    if (body.length > limit) {
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
  const routines = options.routines ?? new RoutineService({ ...config, quickRecords: service })
  const photos = options.photos ?? new QuickRecordPhotoService(config)
  const tokens = options.tokens ?? new TokenService(config.tokenSecret, config.tokenTtlMs)
  return {
    name: 'hoooho-local-quick-records-api',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
        const photoRoute=/^\/api\/quick-records\/([A-Za-z0-9_-]{8,128})\/photos(?:\/([^/]+)(\/content)?)?$/.exec(pathname)
        if (pathname !== '/api/quick-records'&&!photoRoute) return next()
        try {
          const match = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? '')
          const payload = match ? tokens.verify(match[1]) : null
          if (!payload) {
            const error = new Error('登录状态无效或已过期')
            error.status = 401
            error.code = 'UNAUTHORIZED'
            throw error
          }
          if(photoRoute){
            const [,draftId,photoId,content]=photoRoute,memberId=String(request.headers['x-hoooho-member-id']??'')
            if(content&&request.method==='GET'){
              const file=await photos.read(payload.sub,memberId,draftId,photoId)
              response.statusCode=200;response.setHeader('Content-Type',file.mimeType);response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');response.end(file.buffer);return
            }
            if(!photoId&&request.method==='GET')return sendJson(response,200,await photos.list(payload.sub,memberId,draftId))
            if(!photoId&&request.method==='POST'){const body=await readJson(request,8*1024*1024);return sendJson(response,201,await withAccountLock(payload.sub,()=>photos.upload(payload.sub,draftId,body)))}
            if(!content&&request.method==='DELETE')return sendJson(response,200,await withAccountLock(payload.sub,()=>photoId?photos.delete(payload.sub,memberId,draftId,photoId):photos.cancel(payload.sub,memberId,draftId)))
            return sendJson(response,405,{error:{message:'请求方法不支持'}})
          }
          if (request.method !== 'POST') return sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
          const input = await readJson(request)
          return sendJson(response, 201, input.dailySettings || input.automaticInstanceId ? await routines.daily.saveWithRecord(payload.sub, input) : await service.create(payload.sub, input))
        } catch (error) {
          const status = Number.isInteger(error?.status) ? error.status : 500
          if (status >= 500) server.config.logger.error(error)
          return sendJson(response, status, { error: { code: error?.code ?? 'INTERNAL_ERROR', message: status >= 500 && error?.code !== 'DAILY_LINK_PENDING' ? '服务器暂时不可用' : error.message } })
        }
      })
    }
  }
}
