import http from 'node:http'
import https from 'node:https'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export const QINGGAN_PATH = '/qinggan-jichoushi-notebook'
// Existing health service workers already exclude /api/ navigations. Keep the
// independent document here so even an older installed worker reaches the host.
export const QINGGAN_ENTRY_PATH = '/api/apps/qinggan-jichoushi-notebook'
const responseHeaders = ['content-type', 'content-length', 'content-disposition', 'content-security-policy', 'permissions-policy', 'retry-after']

// This host owns only the path. All application code, data and identity live upstream.
export function createQingganGateway({ upstream, allowHttp = false } = {}) {
  let target
  if (upstream) {
    target = new URL(upstream)
    const local = allowHttp && target.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(target.hostname)
    if ((!local && target.protocol !== 'https:') || target.username || target.password || target.pathname !== '/' || target.search || target.hash) throw new Error('Qinggan gateway configuration rejected')
  }
  return async (request, response) => {
    const url = new URL(request.url || '/', 'http://localhost')
    const matchedPath = [QINGGAN_ENTRY_PATH, QINGGAN_PATH].find(prefix => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))
    if (!matchedPath) return false
    const safeHeaders = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' }
    if (url.pathname === QINGGAN_PATH || url.pathname === `${QINGGAN_PATH}/` || url.pathname === QINGGAN_ENTRY_PATH) {
      response.writeHead(308, { ...safeHeaders, Location: `${QINGGAN_ENTRY_PATH}/${url.search}` }); response.end(); return true
    }
    if (!target) {
      response.writeHead(503, { ...safeHeaders, 'Content-Type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ error: '情感记愁诗正在准备，请稍后再试。' })); return true
    }
    const headers = { host: target.host }
    for (const name of ['accept', 'content-type', 'authorization']) if (request.headers[name]) headers[name] = request.headers[name]
    const clientIp = String(request.headers['x-real-ip'] || String(request.headers['x-forwarded-for'] || '').split(',').pop().trim() || request.socket?.remoteAddress || '')
    if (/^[a-fA-F0-9:.]{3,80}$/.test(clientIp)) headers['x-qinggan-client-ip'] = clientIp
    // Never forward Hoooho cookies, sessions, identity headers or user data.
    let bytes = 0
    const limit = new Transform({ transform(chunk, encoding, done) { bytes += chunk.length; done(bytes > 12 * 1024 * 1024 ? Object.assign(new Error('Request too large'), { status: 413 }) : null, chunk) } })
    try {
      await new Promise((resolve, reject) => {
        const outgoing = (target.protocol === 'https:' ? https : http).request({ protocol: target.protocol, hostname: target.hostname, port: target.port || undefined, path: `${url.pathname.slice(matchedPath.length)}${url.search}`, method: request.method, headers, timeout: 85000 }, incoming => {
          for (const name of responseHeaders) if (incoming.headers[name]) response.setHeader(name, incoming.headers[name])
          for (const [name, value] of Object.entries(safeHeaders)) response.setHeader(name, value)
          response.statusCode = incoming.statusCode || 502
          pipeline(incoming, response).then(resolve, reject)
        })
        outgoing.once('error', reject)
        outgoing.once('timeout', () => outgoing.destroy(new Error('Upstream timeout')))
        pipeline(request, limit, outgoing).catch(reject)
      })
    } catch (error) {
      if (response.headersSent) response.destroy()
      else {
        response.writeHead(error.status === 413 ? 413 : 502, { ...safeHeaders, 'Content-Type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({ error: error.status === 413 ? '附件太大，请缩小后重试。' : '小本本暂时无法连接，请稍后重试。' }))
      }
    }
    return true
  }
}
