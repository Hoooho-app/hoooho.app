import { OpsService, assertOpsAccess } from './ops-service.mjs'
import { TokenService } from '../auth/token-service.mjs'
import { authConfig } from '../auth/config.mjs'

const readJson = (request) => new Promise((resolve, reject) => { let body=''; request.setEncoding('utf8'); request.on('data',(c)=>{body+=c}); request.on('end',()=>{try{resolve(body?JSON.parse(body):{})}catch{reject(Object.assign(new Error('请求格式错误'),{status:400,code:'INVALID_JSON'}))}}); request.on('error',reject) })
const send = (response,status,data) => { response.statusCode=status; response.setHeader('Content-Type','application/json; charset=utf-8'); response.setHeader('Cache-Control','no-store'); response.end(JSON.stringify(data)) }

export function opsApiPlugin(options = {}) {
  const service = new OpsService({ dataDirectory: options.dataDirectory ?? authConfig.dataDirectory })
  const tokens = new TokenService(authConfig.tokenSecret, authConfig.tokenTtlMs)
  return { name:'hoooho-local-ops-api', configureServer(server) { server.middlewares.use(async (request,response,next) => {
    const pathname = new URL(request.url ?? '/','http://localhost').pathname
    if (!pathname.startsWith('/api/ops')) return next()
    try {
      const token = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? '')?.[1]
      const payload = token ? tokens.verify(token) : null
      if (!payload) throw Object.assign(new Error('登录状态无效或已过期'),{status:401,code:'UNAUTHORIZED'})
      const access = assertOpsAccess(payload)
      if (pathname === '/api/ops/resources' && request.method === 'GET') return send(response,200,{...await service.list(),accessMode:access.mode})
      if (pathname === '/api/ops/resources' && request.method === 'POST') return send(response,201,await service.create(await readJson(request)))
      const match = /^\/api\/ops\/resources\/([^/]+)$/.exec(pathname)
      if (match && request.method === 'PATCH') return send(response,200,await service.update(decodeURIComponent(match[1]),await readJson(request)))
      if (pathname === '/api/ops/sync' && request.method === 'POST') return send(response,200,await service.sync())
      return send(response,405,{error:{code:'METHOD_NOT_ALLOWED',message:'请求方法不支持'}})
    } catch(error) { server.config.logger.error(error); return send(response,error.status ?? 500,{error:{code:error.code ?? 'INTERNAL_ERROR',message:error.status >= 500 ? '服务器暂时不可用' : error.message}}) }
  }) } }
}
