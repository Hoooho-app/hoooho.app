import { parseJsonObject } from '../json-input.mjs'
import { authConfig } from '../auth/config.mjs'
import { AuthService } from '../auth/auth-service.mjs'
import { BrowserSessionService } from '../auth/browser-session-service.mjs'
import { EventAttachmentService } from '../events/event-attachment-service.mjs'
import { FamilySharingError, FamilySharingService } from './family-sharing-service.mjs'

export const FAMILY_SHARING_BODY_LIMIT = 30_000
export function familySharingRoute(pathname) {
  if (pathname === '/api/family-sharing') return { kind: 'overview' }
  if (pathname === '/api/family-sharing/spaces') return { kind: 'spaces' }
  const invitation = /^\/api\/family-sharing\/invitations\/([^/]+)\/accept$/.exec(pathname)
  if (invitation) return { kind: 'accept', invitationId: decodeURIComponent(invitation[1]) }
  const space = /^\/api\/family-sharing\/spaces\/([^/]+)(?:\/(.*))?$/.exec(pathname)
  if (!space) return null
  const spaceId = decodeURIComponent(space[1]), suffix = space[2] ?? ''
  if (!suffix) return { kind: 'space', spaceId }
  if (suffix === 'invitations' || suffix === 'revoke') return { kind: suffix, spaceId }
  const child = /^children\/([^/]+)\/(link|preview)$/.exec(suffix)
  if (child) return { kind: child[2], spaceId, childId: decodeURIComponent(child[1]) }
  const batch = /^imports\/([^/]+)\/(confirm|withdraw)$/.exec(suffix)
  if (batch) return { kind: batch[2], spaceId, batchId: decodeURIComponent(batch[1]) }
  const attachment = /^entries\/([^/]+)\/attachments\/([^/]+)$/.exec(suffix)
  if (attachment) return { kind: 'attachment', spaceId, entryId: decodeURIComponent(attachment[1]), attachmentId: decodeURIComponent(attachment[2]) }
  return null
}
export async function familySharingResult(service, accountId, route, method, input) {
  if (method === 'GET') {
    if (route.kind === 'overview') return service.overview(accountId)
    if (route.kind === 'space') return service.getSpace(accountId, route.spaceId)
    if (route.kind === 'attachment') return { file: true, ...await service.readAttachment(accountId, route.spaceId, route.entryId, route.attachmentId) }
  }
  if (method === 'POST') {
    if (route.kind === 'spaces') return service.createSpace(accountId, input)
    if (route.kind === 'invitations') return service.invite(accountId, route.spaceId, input)
    if (route.kind === 'accept') return service.acceptInvitation(accountId, route.invitationId, input)
    if (route.kind === 'link') return service.linkChild(accountId, route.spaceId, route.childId, input)
    if (route.kind === 'preview') return service.previewImport(accountId, route.spaceId, route.childId)
    if (route.kind === 'confirm') return service.confirmImport(accountId, route.spaceId, route.batchId, input)
    if (route.kind === 'withdraw') return service.undoImport(accountId, route.spaceId, route.batchId, input)
    if (route.kind === 'revoke') return service.revoke(accountId, route.spaceId, input)
  }
  throw new FamilySharingError('请求方法不支持', 405, 'METHOD_NOT_ALLOWED')
}
export function familySharingApiPlugin(options = {}) {
  const config = { ...authConfig, ...options }
  const auth = options.auth ?? new AuthService(config), browser = new BrowserSessionService(auth)
  const service = options.service ?? new FamilySharingService({ ...config, attachmentReader: options.attachmentReader ?? new EventAttachmentService(config) })
  return { name: 'hoooho-family-sharing', configureServer(server) { server.middlewares.use(async (request, response, next) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
    if (!pathname.startsWith('/api/family-sharing')) return next()
    let status = 200, result
    try {
      const route = familySharingRoute(pathname)
      if (!route) throw new FamilySharingError('未找到请求入口', 404)
      let accountId
      if (options.readAccountId) accountId = await options.readAccountId(request)
      else {
        browser.assertSameOrigin(request)
        const current = await browser.current(request)
        if (current) accountId = current.user.id
        else {
          const token = auth.tokens.verify(/^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? '')?.[1] ?? '')
          if (token && !token.browserSession && !token.purpose) accountId = token.sub
        }
      }
      if (!accountId) throw new FamilySharingError('请重新登录后继续', 401, 'UNAUTHORIZED')
      let input
      if (request.method === 'POST') {
        let body = ''
        for await (const chunk of request) {
          body += chunk
          if (Buffer.byteLength(body) > FAMILY_SHARING_BODY_LIMIT) throw new FamilySharingError('请求内容过大', 413, 'PAYLOAD_TOO_LARGE')
        }
        try { input = parseJsonObject(body) } catch { throw new FamilySharingError('请求格式错误', 400, 'INVALID_JSON') }
      }
      result = await familySharingResult(service, accountId, route, request.method, input)
      if (result?.file) {
        response.writeHead(200, { 'Content-Type': result.mimeType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(result.name)}`, 'Referrer-Policy': 'no-referrer' })
        response.end(result.buffer); return
      }
    } catch (error) {
      status = error.status ?? 500
      result = { error: { code: error.code ?? 'FAMILY_SHARING_UNAVAILABLE', message: error.status ? error.message : '家庭工作区暂时不可用，请重试' } }
    }
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' })
    response.end(JSON.stringify(result))
  }) } }
}
