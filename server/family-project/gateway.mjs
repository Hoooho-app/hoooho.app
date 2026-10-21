import http from 'node:http'
import https from 'node:https'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'

export const FAMILY_PATH = '/family-ray-home-life-workspace'
const cookieName = 'hoooho_family_session'
const responseHeaders = ['content-type', 'content-length', 'content-disposition', 'cache-control', 'referrer-policy', 'x-robots-tag', 'x-content-type-options', 'content-security-policy', 'etag', 'last-modified', 'retry-after']

export function createFamilyGateway({ upstream, token, allowHttp = false }) {
  if (!upstream) return null
  const target = new URL(upstream)
  if ((target.protocol !== 'https:' && !(allowHttp && target.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(target.hostname))) || target.username || target.password || target.pathname !== '/' || target.search || target.hash || !token || token.length < 32) throw new Error('Family gateway configuration rejected')
  return async (request, response) => {
    const url = new URL(request.url, 'http://localhost')
    if (url.pathname !== FAMILY_PATH && !url.pathname.startsWith(`${FAMILY_PATH}/`)) return false
    const headers = {
      host: target.host,
      'x-family-original-host': request.headers.host,
      'x-family-gateway-token': token,
      'x-forwarded-proto': request.socket?.encrypted || String(request.headers['x-forwarded-proto'] ?? '').split(',')[0] === 'https' ? 'https' : 'http'
    }
    for (const name of ['accept', 'content-type', 'origin', 'x-hoooho-family', 'if-none-match', 'if-modified-since']) if (request.headers[name]) headers[name] = request.headers[name]
    const cookies = String(request.headers.cookie ?? '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${cookieName}=`))
    if (cookies.length) headers.cookie = cookies.join('; ')
    // Use the platform-observed client chain only; never forward health cookies/tokens.
    headers['x-forwarded-for'] = String(request.headers['x-forwarded-for'] ?? request.socket?.remoteAddress ?? '').split(',')[0].slice(0, 100)
    let bytes = 0
    const limiter = new Transform({ transform(chunk, encoding, done) { bytes += chunk.length; done(bytes > 14_100_000 ? Object.assign(new Error('Family request too large'), { status: 413 }) : null, chunk) } })
    try {
      await new Promise((resolve, reject) => {
        const outgoing = (target.protocol === 'https:' ? https : http).request({ protocol: target.protocol, hostname: target.hostname, port: target.port || undefined, path: `${url.pathname}${url.search}`, method: request.method, headers, timeout: 125_000 }, incoming => {
          for (const name of responseHeaders) if (incoming.headers[name]) response.setHeader(name, incoming.headers[name])
          const setCookies = (incoming.headers['set-cookie'] ?? []).filter(cookie => cookie.startsWith(`${cookieName}=`) && cookie.includes(`Path=${FAMILY_PATH};`) && !/;\s*Domain=/i.test(cookie))
          if (setCookies.length) response.setHeader('Set-Cookie', setCookies)
          response.setHeader('Referrer-Policy', 'no-referrer')
          response.setHeader('X-Robots-Tag', 'noindex, nofollow')
          response.statusCode = incoming.statusCode ?? 502
          pipeline(incoming, response).then(resolve, reject)
        })
        outgoing.once('error', reject)
        outgoing.once('timeout', () => outgoing.destroy(new Error('Family upstream timeout')))
        pipeline(request, limiter, outgoing).catch(reject)
      })
    } catch (error) {
      if (response.headersSent) response.destroy()
      else { response.writeHead(error.status === 413 ? 413 : 502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' }); response.end(JSON.stringify({ error: { code: 'FAMILY_UPSTREAM_UNAVAILABLE', message: '家庭空间暂时无法连接，请稍后重试。' } })) }
    }
    return true
  }
}
