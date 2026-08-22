import { createReadStream } from 'node:fs'
import { access, readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getCanonicalDomainRedirect } from './domain-routing.mjs'
import { AuthService } from './auth/auth-service.mjs'
import { authConfig } from './auth/config.mjs'
import { TokenService } from './auth/token-service.mjs'
import { HealthEventRecordService } from './events/health-event-record-service.mjs'
import { HealthEventService } from './events/health-event-service.mjs'
import { EventAttachmentService } from './events/event-attachment-service.mjs'
import { FamilyMemberService } from './members/family-member-service.mjs'
import { cleanupTestDataOnce } from './data/cleanup-test-data.mjs'
import { HealthRecordOrganizationService } from './ai/health-record-organization-service.mjs'

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const staticDirectory = path.resolve(process.env.STATIC_DIRECTORY || path.join(rootDirectory, 'dist'))
const port = Number.parseInt(process.env.PORT || '3000', 10)
const host = process.env.HOST || '0.0.0.0'

const cleanupResult = await cleanupTestDataOnce(authConfig.dataDirectory)
if (cleanupResult.applied) console.info('[Hoooho] test data cleanup completed', cleanupResult)

const sharedOptions = {
  dataDirectory: authConfig.dataDirectory,
  tokenSecret: authConfig.tokenSecret
}

const auth = new AuthService(sharedOptions)
const members = new FamilyMemberService(sharedOptions)
const events = new HealthEventService(sharedOptions)
const records = new HealthEventRecordService(sharedOptions)
const organizations = new HealthRecordOrganizationService(sharedOptions)
const attachments = new EventAttachmentService(sharedOptions)
const tokens = new TokenService(authConfig.tokenSecret, authConfig.tokenTtlMs)

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2']
])

function setCommonHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
}

function sendJson(response, statusCode, data) {
  setCommonHeaders(response)
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(data))
}

function sendEmpty(response, statusCode = 204) {
  setCommonHeaders(response)
  response.statusCode = statusCode
  response.end()
}

function readJson(request, maxLength = 16_384) {
  return new Promise((resolve, reject) => {
    let body = ''
    let settled = false
    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      if (settled) return
      body += chunk
      if (body.length > maxLength) {
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
}

function readAccountId(request) {
  const authorization = request.headers.authorization ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(authorization)
  const payload = match ? tokens.verify(match[1]) : null
  if (payload) return payload.sub

  const error = new Error('登录状态无效或已过期')
  error.status = 401
  error.code = 'UNAUTHORIZED'
  throw error
}

function decodeRouteValue(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    const error = new Error('请求路径格式错误')
    error.status = 400
    error.code = 'INVALID_PATH'
    throw error
  }
}

async function handleAuth(request, response, pathname) {
  if (!pathname.startsWith('/api/auth/')) return false
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '仅支持 POST 请求' } })
    return true
  }

  const body = await readJson(request)
  if (pathname === '/api/auth/send-code') {
    sendJson(response, 200, await auth.sendCode(String(body.phone ?? '')))
    return true
  }
  if (pathname === '/api/auth/login') {
    sendJson(response, 200, await auth.login(String(body.phone ?? ''), String(body.code ?? '')))
    return true
  }

  sendJson(response, 404, { error: { code: 'NOT_FOUND', message: '接口不存在' } })
  return true
}

async function handleMembers(request, response, pathname) {
  const match = /^\/api\/members(?:\/([^/]+))?$/.exec(pathname)
  if (!match) return false

  const accountId = readAccountId(request)
  const memberId = match[1] ? decodeRouteValue(match[1]) : null
  if (!memberId && request.method === 'GET') sendJson(response, 200, await members.list(accountId))
  else if (!memberId && request.method === 'POST') sendJson(response, 201, await members.create(accountId, await readJson(request)))
  else if (memberId && request.method === 'GET') sendJson(response, 200, await members.get(accountId, memberId))
  else if (memberId && request.method === 'PATCH') sendJson(response, 200, await members.update(accountId, memberId, await readJson(request)))
  else if (memberId && request.method === 'DELETE') sendJson(response, 200, await members.delete(accountId, memberId))
  else sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
  return true
}

async function handleEventRecords(request, response, pathname) {
  const eventRecordsMatch = /^\/api\/events\/([^/]+)\/records$/.exec(pathname)
  const recordMatch = /^\/api\/records\/([^/]+)$/.exec(pathname)
  if (!eventRecordsMatch && !recordMatch) return false

  const accountId = readAccountId(request)
  if (eventRecordsMatch) {
    const eventId = decodeRouteValue(eventRecordsMatch[1])
    if (request.method === 'GET') sendJson(response, 200, await records.list(accountId, eventId))
    else if (request.method === 'POST') sendJson(response, 201, await records.create(accountId, eventId, await readJson(request)))
    else sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
    return true
  }

  const recordId = decodeRouteValue(recordMatch[1])
  if (request.method === 'PATCH') sendJson(response, 200, await records.update(accountId, recordId, await readJson(request)))
  else if (request.method === 'DELETE') sendJson(response, 200, await records.delete(accountId, recordId))
  else sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
  return true
}

async function handleOrganizations(request, response, pathname) {
  const previewMatch = /^\/api\/events\/([^/]+)\/organizations\/preview$/.exec(pathname)
  const match = /^\/api\/events\/([^/]+)\/organizations$/.exec(pathname)
  if (!previewMatch && !match) return false

  const accountId = readAccountId(request)
  const eventId = decodeRouteValue((previewMatch ?? match)[1])
  if (previewMatch) {
    if (request.method === 'POST') sendJson(response, 200, await organizations.preview(accountId, eventId, await readJson(request)))
    else sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
  } else if (request.method === 'GET') sendJson(response, 200, await organizations.list(accountId, eventId))
  else if (request.method === 'POST') sendJson(response, 201, await organizations.organize(accountId, eventId, await readJson(request)))
  else sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
  return true
}

async function handleAttachments(request, response, pathname) {
  const match = /^\/api\/events\/([^/]+)\/attachments$/.exec(pathname)
  if (!match) return false
  const accountId = readAccountId(request)
  const eventId = decodeRouteValue(match[1])
  if (request.method === 'GET') sendJson(response, 200, await attachments.list(accountId, eventId))
  else if (request.method === 'POST') sendJson(response, 201, await attachments.create(accountId, eventId, await readJson(request, 7_100_000)))
  else sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
  return true
}

async function handleEvents(request, response, pathname) {
  const summaryMatch = /^\/api\/events\/([^/]+)\/summary$/.exec(pathname)
  if (summaryMatch) {
    const accountId = readAccountId(request)
    const eventId = decodeRouteValue(summaryMatch[1])
    if (request.method === 'PATCH') sendJson(response, 200, await events.correctSummary(accountId, eventId, await readJson(request)))
    else sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
    return true
  }
  const match = /^\/api\/events(?:\/([^/]+))?$/.exec(pathname)
  if (!match) return false

  const accountId = readAccountId(request)
  const eventId = match[1] ? decodeRouteValue(match[1]) : null
  if (!eventId && request.method === 'GET') sendJson(response, 200, await events.list(accountId))
  else if (!eventId && request.method === 'POST') sendJson(response, 201, await events.create(accountId, await readJson(request)))
  else if (eventId && request.method === 'GET') sendJson(response, 200, await events.get(accountId, eventId))
  else if (eventId && request.method === 'PATCH') sendJson(response, 200, await events.update(accountId, eventId, await readJson(request)))
  else if (eventId && request.method === 'DELETE') sendJson(response, 200, await events.delete(accountId, eventId))
  else sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
  return true
}

async function handleApi(request, response, pathname) {
  if (request.method === 'OPTIONS') {
    sendEmpty(response)
    return true
  }
  if (pathname === '/api/health' && request.method === 'GET') {
    sendJson(response, 200, { status: 'ok' })
    return true
  }
  if (await handleAuth(request, response, pathname)) return true
  if (await handleMembers(request, response, pathname)) return true
  if (await handleAttachments(request, response, pathname)) return true
  if (await handleOrganizations(request, response, pathname)) return true
  if (await handleEventRecords(request, response, pathname)) return true
  if (await handleEvents(request, response, pathname)) return true

  if (pathname.startsWith('/api/')) {
    sendJson(response, 404, { error: { code: 'NOT_FOUND', message: '接口不存在' } })
    return true
  }
  return false
}

function getStaticPath(pathname) {
  let decodedPath
  try {
    decodedPath = decodeURIComponent(pathname)
  } catch {
    return null
  }
  const relativePath = decodedPath.replace(/^\/+/, '')
  const filePath = path.resolve(staticDirectory, relativePath)
  return filePath === staticDirectory || filePath.startsWith(`${staticDirectory}${path.sep}`) ? filePath : null
}

async function sendFile(request, response, filePath) {
  const fileStat = await stat(filePath)
  if (!fileStat.isFile()) return false

  setCommonHeaders(response)
  response.statusCode = 200
  response.setHeader('Content-Type', mimeTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream')
  const fileName = path.basename(filePath)
  response.setHeader(
    'Cache-Control',
    fileName === 'index.html' || fileName === 'sw.js' || fileName.endsWith('.webmanifest')
      ? 'no-cache'
      : 'public, max-age=31536000, immutable'
  )
  response.setHeader('Content-Length', String(fileStat.size))
  if (request.method === 'HEAD') response.end()
  else createReadStream(filePath).pipe(response)
  return true
}

async function handleStatic(request, response, pathname) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
    return
  }

  const candidate = getStaticPath(pathname)
  if (candidate) {
    try {
      if (await sendFile(request, response, candidate)) return
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }

  const indexPath = path.join(staticDirectory, 'index.html')
  await access(indexPath)
  await sendFile(request, response, indexPath)
}

const server = createServer(async (request, response) => {
  try {
    const canonicalRedirect = getCanonicalDomainRedirect(request)
    if (canonicalRedirect) {
      setCommonHeaders(response)
      response.statusCode = 308
      response.setHeader('Location', canonicalRedirect)
      response.setHeader('Cache-Control', 'no-store')
      response.end()
      return
    }
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
    if (await handleApi(request, response, pathname)) return
    await handleStatic(request, response, pathname)
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500
    const code = typeof error?.code === 'string' ? error.code : 'INTERNAL_ERROR'
    const message = status >= 500 ? '服务器暂时不可用' : error.message
    if (status >= 500) console.error(error)
    sendJson(response, status, { error: { code, message, ...(error?.details ?? {}) } })
  }
})

server.listen(port, host, () => {
  console.info(`[Hoooho] listening on http://${host}:${port}`)
  console.info(`[Hoooho] static=${staticDirectory}`)
  console.info(`[Hoooho] data=${authConfig.dataDirectory}`)
})

function shutdown(signal) {
  console.info(`[Hoooho] received ${signal}, shutting down`)
  server.close((error) => {
    if (error) {
      console.error(error)
      process.exitCode = 1
    }
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
