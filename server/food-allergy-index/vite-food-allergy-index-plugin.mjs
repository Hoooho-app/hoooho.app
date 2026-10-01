import { authConfig } from '../auth/config.mjs'
import { TokenService } from '../auth/token-service.mjs'
import { FoodAllergyIndexService } from './food-allergy-index-service.mjs'

export function foodAllergyIndexApiPlugin() {
  const service = new FoodAllergyIndexService(authConfig)
  const tokens = new TokenService(authConfig.tokenSecret, authConfig.tokenTtlMs)
  return { name: 'hoooho-food-allergy-index', configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      const url = new URL(request.url ?? '/', 'http://localhost')
      if (url.pathname !== '/api/food-allergy-index') return next()
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.setHeader('Cache-Control', 'no-store')
      try {
        const payload = tokens.verify(/^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? '')?.[1] ?? '')
        if (!payload) throw Object.assign(new Error('使用状态已失效'), { status: 401, code: 'UNAUTHORIZED' })
        if (request.method !== 'GET') throw Object.assign(new Error('请求方法无效'), { status: 405 })
        response.end(JSON.stringify(await service.get(payload.sub, url.searchParams.get('memberId') ?? '')))
      } catch (error) {
        response.statusCode = error.status ?? 500
        response.end(JSON.stringify({ error: { code: error.code ?? 'INDEX_UNAVAILABLE', message: error.status ? error.message : '统计暂时无法更新' } }))
      }
    })
  } }
}
