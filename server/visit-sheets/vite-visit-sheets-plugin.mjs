import { authConfig } from '../auth/config.mjs'
import { TokenService } from '../auth/token-service.mjs'
import { VisitSheetService } from './visit-sheet-service.mjs'
export function visitSheetsApiPlugin(options = {}) {
  const config = { ...authConfig, ...options },
    service = new VisitSheetService(config),
    tokens = new TokenService(config.tokenSecret, config.tokenTtlMs)
  return {
    name: 'hoooho-local-visit-sheets',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const match = /^\/api\/members\/([^/]+)\/visit-sheet(?:\/resources\/([a-f0-9]{24}))?$/.exec(
          (req.url ?? '').split('?')[0],
        )
        if (!match) return next()
        const send = (status, data) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify(data))
        }
        try {
          const payload = tokens.verify(
            /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')?.[1] ?? '',
          )
          if (!payload) return send(401, { error: { message: '请重新登录' } })
          const memberId = decodeURIComponent(match[1])
          if(match[2]){
            if(req.method!=='GET')return send(405,{error:{message:'请求方法不支持'}})
            const result=await service.readProfileResource(payload.sub,memberId,match[2])
            res.statusCode=200;res.setHeader('Content-Type',result.mimeType);res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(result.buffer);return
          }
          if (req.method === 'GET')
            return send(200, await service.get(payload.sub, memberId))
          if (req.method !== 'PUT')
            return send(405, { error: { message: '请求方法不支持' } })
          const body = await new Promise((resolve, reject) => {
            let raw = ''
            req.setEncoding('utf8')
            req.on('data', (chunk) => {
              raw += chunk
              if (raw.length > 60000)
                reject(
                  Object.assign(new Error('请求内容过大'), { status: 413 }),
                )
            })
            req.on('end', () => {
              try {
                resolve(JSON.parse(raw))
              } catch {
                reject(
                  Object.assign(new Error('请求格式错误'), { status: 400 }),
                )
              }
            })
            req.on('error', reject)
          })
          return send(200, await service.save(payload.sub, memberId, body))
        } catch (error) {
          send(error.status ?? 500, {
            error: {
              message: error.status ? error.message : '资料整理失败，请重试',
              code: error.code ?? 'VISIT_SHEET_ERROR',
            },
          })
        }
      })
    },
  }
}
