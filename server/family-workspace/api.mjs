import { AuthError } from '../auth/auth-service.mjs'
import { FAMILY_WORKSPACE_PATH } from '../../shared/family-workspace.mjs'

export const FAMILY_COOKIE = 'hoooho_family_session'
const apiPrefix = `${FAMILY_WORKSPACE_PATH}/api`
const secureRequest = request => Boolean(request.socket?.encrypted) || String(request.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() === 'https'

function readCookie(request) {
  const values = String(request.headers.cookie ?? '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${FAMILY_COOKIE}=`))
  return values.length === 1 ? values[0].slice(FAMILY_COOKIE.length + 1) : ''
}

export function familyCookie(request, raw, maxAge) {
  return `${FAMILY_COOKIE}=${raw}; Path=${FAMILY_WORKSPACE_PATH}; HttpOnly; SameSite=Strict${secureRequest(request) ? '; Secure' : ''}${maxAge === undefined ? '' : `; Max-Age=${maxAge}`}`
}

function assertMutation(request) {
  const expected = `${secureRequest(request) ? 'https' : 'http'}://${request.headers.host}`
  if (request.headers.origin !== expected || request.headers['x-hoooho-family'] !== '1' || !/^application\/json(?:\s*;|$)/i.test(String(request.headers['content-type'] ?? ''))) {
    throw new AuthError('请求来源无效，请刷新页面后重试。', 403, 'FAMILY_ORIGIN_INVALID')
  }
}

export function createFamilyWorkspaceApi(service, { readJson, sendJson }) {
  return async function handleFamilyWorkspace(request, response, pathname) {
    if (pathname !== apiPrefix && !pathname.startsWith(`${apiPrefix}/`)) return false
    response.setHeader('Cache-Control', 'private, no-store')
    response.setHeader('Referrer-Policy', 'no-referrer')
    response.setHeader('X-Robots-Tag', 'noindex, nofollow')
    const route = pathname.slice(apiPrefix.length)
    const raw = readCookie(request)
    const policyRoute = /^\/policies\/([a-z]+)$/.exec(route)
    if (policyRoute && request.method === 'GET') {
      sendJson(response, 200, await service.policies.read(raw, policyRoute[1]))
      return true
    }
    const assetFiles = /^\/finance\/assets\/([a-f0-9-]{36})\/attachments(?:\/([a-f0-9-]{36})\/(preview|original|download|text|parse|remove))?$/.exec(route)
    if (assetFiles && request.method === 'GET' && ['preview', 'original', 'download', 'text'].includes(assetFiles[3])) {
      const file = await service.finance.attachments.read(raw, assetFiles[1], assetFiles[2], assetFiles[3])
      response.setHeader('Content-Type', file.mimeType)
      response.setHeader('Content-Length', file.buffer.length)
      response.setHeader('X-Content-Type-Options', 'nosniff')
      response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
      response.setHeader('Content-Disposition', `${['download', 'text'].includes(assetFiles[3]) ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(file.name)}`)
      response.writeHead(200)
      response.end(file.buffer)
      return true
    }
    if (route === '/session' && request.method === 'GET') {
      const session = await service.current(raw)
      if (!session && raw) response.setHeader('Set-Cookie', familyCookie(request, '', 0))
      sendJson(response, 200, session ? service.publicSession(session) : { authenticated: false })
      return true
    }
    if (route === '/finance' && request.method === 'GET') {
      sendJson(response, 200, await service.finance.read(raw))
      return true
    }
    if (route === '/codes' && request.method === 'GET') {
      sendJson(response, 200, await service.listCodes(raw))
      return true
    }
    if (request.method !== 'POST') throw new AuthError('请求方法不支持。', 405, 'METHOD_NOT_ALLOWED')
    assertMutation(request)
    if (assetFiles) {
      const [, assetId, attachmentId, action] = assetFiles
      await service.finance.authorize(raw, action !== 'parse')
      if (!attachmentId) {
        const input = await readJson(request, 14_100_000)
        sendJson(response, 201, await service.finance.attachments.upload(raw, assetId, input))
      } else if (action === 'parse' || action === 'remove') {
        await readJson(request, 4096)
        sendJson(response, 200, await service.finance.attachments[action](raw, assetId, attachmentId))
      } else throw new AuthError('请求方法不支持。', 405, 'METHOD_NOT_ALLOWED')
      return true
    }
    const input = await readJson(request, route === '/finance' ? 1_048_576 : policyRoute ? 262144 : 4096)
    const client = String(request.headers['x-forwarded-for'] ?? request.socket?.remoteAddress ?? '').split(',')[0].trim().slice(0, 100)
    if (policyRoute) sendJson(response, 200, await service.policies.save(raw, policyRoute[1], input))
    else if (route === '/finance') sendJson(response, 200, await service.finance.save(raw, input))
    else if (route === '/admin/send-code') sendJson(response, 200, await service.sendAdminCode(input.email, client))
    else if (route === '/admin/login' || route === '/member/login') {
      const result = route === '/admin/login'
        ? await service.adminLogin(input.email, input.code, input.remember === true, client)
        : await service.memberLogin(input.code, input.remember === true, client)
      const maxAge = result.remember ? Math.max(0, Math.floor((result.session.expiresAt - service.now()) / 1000)) : undefined
      response.setHeader('Set-Cookie', familyCookie(request, result.raw, maxAge))
      if (route === '/admin/login') console.info('[Hoooho family] administrator authenticated')
      sendJson(response, 200, result.session)
    } else if (route === '/logout') {
      await service.logout(raw)
      response.setHeader('Set-Cookie', familyCookie(request, '', 0))
      sendJson(response, 200, { success: true })
    } else if (route === '/codes') sendJson(response, 201, await service.createCode(raw, input.label))
    else {
      const revoke = /^\/codes\/([a-f0-9-]{36})\/revoke$/.exec(route)
      if (!revoke) throw new AuthError('家庭接口不存在。', 404, 'FAMILY_ROUTE_NOT_FOUND')
      sendJson(response, 200, await service.revokeCode(raw, revoke[1]))
    }
    return true
  }
}
