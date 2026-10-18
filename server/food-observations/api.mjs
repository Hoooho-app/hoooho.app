import { authConfig } from '../auth/config.mjs';
import { TokenService } from '../auth/token-service.mjs';
import { BrowserSessionService } from '../auth/browser-session-service.mjs';
import { parseJsonObject } from '../json-input.mjs';
import { readCareAccountId } from '../care-journey/api.mjs';
import { FoodObservationService } from './service.mjs';
export function foodObservationRoute(pathname) {
  const match = /^\/api\/food-observations(?:\/(automatic|[A-Za-z0-9-]+)(?:\/(duration|review|next-round|archive))?)?$/.exec(pathname);
  return match ? { id: match[1] ?? null, action: match[2] ?? null } : null;
}
export async function foodObservationResult(service, accountId, route, method, input, query = {}) {
  if (!route.id && method === 'GET') return service.list(accountId, query.memberId);
  if (method === 'POST') {
    if (!route.id) return service.create(accountId, input);
    if (route.id === 'automatic' && !route.action) return service.automatic(accountId, input);
    if (route.action) return service.change(accountId, route.id, route.action, input);
  }
  throw Object.assign(new Error('请求方法不支持'), { status: 405, code: 'METHOD_NOT_ALLOWED' });
}
export const observationSourceMutation = (pathname, method) => ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method) && /^\/api\/(?:quick-records$|records(?:\/|$)|events(?:\/|$)|routines(?:\/|$)|health-profile(?:\/|$)|members\/[^/]+\/(?:ai-drafts\/[^/]+\/(?:save|undo)$|front-desk-records?(?:\/|$)))/.test(pathname);
export function watchObservationMutation(request, response, service, accountId) {
  response.once('finish', () => { if (response.statusCode >= 200 && response.statusCode < 300) void service.scheduleAccount(accountId); });
}
export function foodObservationApiPlugin(options = {}) {
  const config = { ...authConfig, ...options }, service = options.service ?? new FoodObservationService({ ...config, enabledProducts: ['food-observation'] });
  const tokens = options.tokens ?? new TokenService(config.tokenSecret, config.tokenTtlMs);
  const sessions = options.sessions ?? new BrowserSessionService({ config, users: service.care.users, tokens });
  return { name: 'hoooho-food-observations', configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      const url = new URL(request.url ?? '/', 'http://localhost'), route = foodObservationRoute(url.pathname);
      const auth = () => readCareAccountId(request, { tokens, service: service.care, sessions });
      if (!route) {
        if (observationSourceMutation(url.pathname, request.method)) {
          try { watchObservationMutation(request, response, service, await auth()); } catch { /* The owning route reports authentication errors. */ }
        }
        return next();
      }
      let status = 200, result;
      try {
        const accountId = await auth();
        let input = {};
        if (request.method === 'POST') {
          let body = '';
          for await (const chunk of request) { body += chunk; if (Buffer.byteLength(body) > 16000) throw Object.assign(new Error('请求内容过大'), { status: 413 }); }
          try { input = parseJsonObject(body); } catch { throw Object.assign(new Error('请求格式错误'), { status: 400 }); }
        }
        result = await foodObservationResult(service, accountId, route, request.method, input, Object.fromEntries(url.searchParams));
      } catch (error) { status = error.status ?? 500; result = { error: { code: error.code ?? 'OBSERVATION_UNAVAILABLE', message: error.status ? error.message : '观察暂时不可用，请重试' } }; }
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(JSON.stringify(result));
    });
  } };
}
