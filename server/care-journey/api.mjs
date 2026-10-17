import { authConfig } from '../auth/config.mjs';
import { TokenService } from '../auth/token-service.mjs';
import { BrowserSessionService } from '../auth/browser-session-service.mjs';
import { parseJsonObject } from '../json-input.mjs';
import { CareJourneyService, CareJourneyError } from './service.mjs';
export const CARE_BODY_LIMIT = 64_000;
export function careJourneyRoute(pathname) {
  const match = /^\/api\/care-journey(?:\/(overview|check-in|catalogue|entitlements|redeem|theme|tasks\/verify|task\/verify|task-material(?:\/confirm)?|review-snapshots)(?:\/([A-Za-z0-9-]+))?)?$/.exec(pathname);
  return match ? {
    action: match[1] ?? 'overview',
    id: match[2] ?? null
  } : null;
}
export async function careJourneyResult(service, accountId, route, method, input = {}, query = {}) {
  const a = route.action;
  if (method === 'GET' && !route.id) {
    if (a === 'overview') return service.get(accountId, query);
    if (a === 'catalogue') return service.catalogue(accountId);
    if (a === 'entitlements') return service.entitlements(accountId);
    if (a === 'theme') return service.getTheme(accountId);
    if (a === 'task-material') return service.openMaterial(accountId, query);
    if (a === 'review-snapshots') return service.snapshots(accountId);
  }
  if (method === 'GET' && a === 'review-snapshots' && route.id) return service.snapshots(accountId, route.id);
  if (method === 'POST' && !route.id) {
    if (a === 'check-in') return service.checkIn(accountId, {
      ...input,
      timeZone: query.timeZone
    });
    if (a === 'tasks/verify' || a === 'task/verify') return service.verifyTask(accountId, input);
    if (a === 'redeem') return service.redeem(accountId, input);
    if (a === 'theme') return service.setTheme(accountId, input);
    if (a === 'task-material/confirm') return service.confirmMaterial(accountId, input);
    if (a === 'review-snapshots') return service.createSnapshot(accountId, input);
  }
  throw new CareJourneyError('请求方法不支持', 405, 'METHOD_NOT_ALLOWED');
}
export async function readCareAccountId(request, {
  tokens,
  service,
  sessions
}) {
  const payload = tokens.verify(/^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? '')?.[1] ?? '');
  if (!payload || payload.purpose) throw new CareJourneyError('登录状态无效或已过期', 401, 'UNAUTHORIZED');
  const user = await service.users.findById(payload.sub);
  if (!user || user.mergedInto) throw new CareJourneyError('登录状态无效或已过期', 401, 'UNAUTHORIZED');
  sessions.assertSameOrigin(request);
  if (payload.browserSession || payload.guest || user.guest) {
    const current = await sessions.current(request);
    if (current?.user.id !== payload.sub) throw new CareJourneyError('使用状态已失效，请重新恢复', 401, 'UNAUTHORIZED');
  }
  return payload.sub;
}
export function careJourneyApiPlugin(options = {}) {
  const config = {
      ...authConfig,
      ...options
    },
    service = options.service ?? new CareJourneyService(config),
    tokens = options.tokens ?? new TokenService(config.tokenSecret, config.tokenTtlMs),
    sessions = options.sessions ?? new BrowserSessionService({
      config,
      users: service.users,
      tokens
    });
  return {
    name: 'hoooho-care-journey',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        let route, url;
        try {
          url = new URL(request.url ?? '/', 'http://localhost');
          route = careJourneyRoute(url.pathname);
        } catch {
          return next();
        }
        if (!route) return next();
        let status = 200,
          result;
        try {
          const accountId = await readCareAccountId(request, {
            tokens,
            service,
            sessions
          });
          let input = {};
          if (request.method === 'POST') {
            let body = '';
            for await (const chunk of request) {
              body += chunk;
              if (Buffer.byteLength(body) > CARE_BODY_LIMIT) throw new CareJourneyError('请求内容过大', 413, 'BODY_TOO_LARGE');
            }
            try {
              input = parseJsonObject(body);
            } catch {
              throw new CareJourneyError('请求格式错误', 400, 'INVALID_JSON');
            }
          }
          const query = Object.fromEntries(url.searchParams);
          query.timeZone = request.headers['x-hoooho-timezone'] ?? query.timeZone;
          result = await careJourneyResult(service, accountId, route, request.method, input, query);
        } catch (e) {
          status = e.status ?? 500;
          result = {
            error: {
              code: e.code ?? 'CARE_JOURNEY_UNAVAILABLE',
              message: e.status ? e.message : '树芽服务暂时不可用，请重试'
            }
          };
        }
        response.writeHead(status, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        response.end(JSON.stringify(result));
      });
    }
  };
}
