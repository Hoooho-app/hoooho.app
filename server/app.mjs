import { createReadStream } from 'node:fs'
import { access, readFile, stat } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getCanonicalDomainRedirect } from './domain-routing.mjs'
import { AuthError, AuthService } from './auth/auth-service.mjs'
import { authConfig } from './auth/config.mjs'
import { TokenService } from './auth/token-service.mjs'
import { HealthEventRecordService } from './events/health-event-record-service.mjs'
import { HealthEventService } from './events/health-event-service.mjs'
import { EventAttachmentService } from './events/event-attachment-service.mjs'
import { FamilyMemberService } from './members/family-member-service.mjs'
import { cleanupTestDataOnce } from './data/cleanup-test-data.mjs'
import { HealthRecordOrganizationService } from './ai/health-record-organization-service.mjs'
import { AudioTranscriptionService } from './ai/audio-transcription-service.mjs'
import { OpsService, assertOpsAccess } from './ops/ops-service.mjs'
import { FeedbackService } from './help/feedback-service.mjs'
import { getStaticContentType } from './static-mime-types.mjs'
import { validTimeZone } from './time/local-calendar.mjs'
import { OnlineConsultationService } from './consultations/online-consultation-service.mjs'
import { AccountEntryStateService } from './onboarding/account-entry-state-service.mjs'
import { HealthProfileFactService } from './health-profile/health-profile-fact-service.mjs'
import { AVATAR_PHOTO_MAX_REQUEST_LENGTH } from '../shared/avatar-photo-policy.mjs'

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
const organizations = new HealthRecordOrganizationService(sharedOptions)
const audioTranscription = new AudioTranscriptionService(sharedOptions)
const events = new HealthEventService({ ...sharedOptions, summaryRefresher: organizations })
const records = new HealthEventRecordService({ ...sharedOptions, organizations })
const attachments = new EventAttachmentService(sharedOptions)
const tokens = new TokenService(authConfig.tokenSecret, authConfig.tokenTtlMs)
const ops = new OpsService(sharedOptions)
const feedback = new FeedbackService(sharedOptions)
const onlineConsultations = new OnlineConsultationService(sharedOptions)
const accountEntryState = new AccountEntryStateService(sharedOptions)
const healthProfileFacts = new HealthProfileFactService(sharedOptions)

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

function readAuthPayload(request) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? '')
  const payload = match ? tokens.verify(match[1]) : null
  if (payload) return payload
  const error = new Error('登录状态无效或已过期')
  error.status = 401
  error.code = 'UNAUTHORIZED'
  throw error
}

async function handleOps(request, response, pathname) {
  if (!pathname.startsWith('/api/ops')) return false
  const access = assertOpsAccess(readAuthPayload(request))
  if (pathname === '/api/ops/resources' && request.method === 'GET') sendJson(response, 200, { ...await ops.list(), accessMode: access.mode })
  else if (pathname === '/api/ops/resources' && request.method === 'POST') sendJson(response, 201, await ops.create(await readJson(request)))
  else if (pathname === '/api/ops/sync' && request.method === 'POST') sendJson(response, 200, await ops.sync())
  else {
    const match = /^\/api\/ops\/resources\/([^/]+)$/.exec(pathname)
    if (match && request.method === 'PATCH') sendJson(response, 200, await ops.update(decodeRouteValue(match[1]), await readJson(request)))
    else sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
  }
  return true
}

async function handleOpsFeedback(request, response, pathname, searchParams) {
  if (!pathname.startsWith('/api/ops/feedback')) return false
  const payload = readAuthPayload(request)
  assertOpsAccess(payload, { requireAllowlist: true })
  if (pathname === '/api/ops/feedback' && request.method === 'GET') {
    sendJson(response, 200, await feedback.listForOps(Object.fromEntries(searchParams)))
    return true
  }
  const match = /^\/api\/ops\/feedback\/([^/]+)$/.exec(pathname)
  const messagesMatch = /^\/api\/ops\/feedback\/([^/]+)\/messages$/.exec(pathname)
  if (messagesMatch && request.method === 'POST') sendJson(response, 201, await feedback.addOpsMessage(payload.sub, decodeRouteValue(messagesMatch[1]), await readJson(request)))
  else if (match && request.method === 'GET') sendJson(response, 200, await feedback.getForOps(decodeRouteValue(match[1])))
  else if (match && request.method === 'PATCH') sendJson(response, 200, await feedback.updateFromOps(payload.sub, decodeRouteValue(match[1]), await readJson(request)))
  else sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
  return true
}

async function handleFeedback(request, response, pathname, searchParams) {
  const attachmentMatch = /^\/api\/feedback\/attachments\/([^/]+)$/.exec(pathname)
  if (attachmentMatch && request.method === 'GET') {
    const attachment = await feedback.readAttachmentWithAccess(decodeRouteValue(attachmentMatch[1]), searchParams.get('expires'), searchParams.get('access'))
    setCommonHeaders(response)
    response.statusCode = 200
    response.setHeader('Content-Type', attachment.type)
    response.setHeader('Content-Length', String(attachment.buffer.length))
    response.setHeader('Content-Disposition', `inline; filename="feedback-image.${path.extname(attachment.storageKey).slice(1)}"`)
    response.setHeader('Cache-Control', 'private, no-store')
    response.end(attachment.buffer)
    return true
  }
  if (!pathname.startsWith('/api/feedback')) return false
  const accountId = readAccountId(request)
  if (pathname === '/api/feedback' && request.method === 'POST') sendJson(response, 201, await feedback.create(accountId, await readJson(request, 29_000_000)))
  else if (pathname === '/api/feedback' && request.method === 'GET') sendJson(response, 200, await feedback.listForAccount(accountId))
  else {
    const match = /^\/api\/feedback\/([^/]+)$/.exec(pathname)
    const messagesMatch = /^\/api\/feedback\/([^/]+)\/messages$/.exec(pathname)
    if (messagesMatch && request.method === 'POST') sendJson(response, 201, await feedback.addUserMessage(accountId, decodeRouteValue(messagesMatch[1]), await readJson(request, 29_000_000)))
    else if (match && request.method === 'GET') sendJson(response, 200, await feedback.getForAccount(accountId, decodeRouteValue(match[1])))
    else if (match && request.method === 'DELETE') sendJson(response, 200, await feedback.deleteForAccount(accountId, decodeRouteValue(match[1])))
    else sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
  }
  return true
}
const authRequestIdPattern = /^[A-Za-z0-9_-]{8,64}$/

function createEmailAuthRequestContext(request, response, pathname) {
  const suppliedRequestId = String(request.headers['x-hoooho-request-id'] ?? '')
  const requestId = authRequestIdPattern.test(suppliedRequestId) ? suppliedRequestId : randomUUID()
  const userAgent = String(request.headers['user-agent'] ?? '')
  const origin = String(request.headers.origin ?? '').slice(0, 200)
  response.setHeader('X-Hoooho-Request-ID', requestId)
  return {
    requestId,
    channel: 'email',
    endpoint: pathname,
    userAgentType: /Mobile|Android|iPhone|iPad|MicroMessenger/i.test(userAgent) ? 'mobile' : userAgent ? 'desktop' : 'unknown',
    origin: origin || 'missing',
    host: String(request.headers.host ?? '').slice(0, 200),
    cookiePresent: Boolean(request.headers.cookie),
    viaCloudflare: Boolean(request.headers['cf-ray'])
  }
}

function logEmailAuthRequest(context, status, errorCategory = 'OK') {
  console.info(`[Hoooho auth request] ${JSON.stringify({
    ...context,
    status,
    errorCategory,
    rateLimited: status === 429 || errorCategory === 'CODE_RATE_LIMITED'
  })}`)
}

async function handleAuth(request, response, pathname) {
  if (!pathname.startsWith('/api/auth/')) return false
  const context = pathname.startsWith('/api/auth/email/')
    ? createEmailAuthRequestContext(request, response, pathname)
    : null

  try {
    if (request.method !== 'POST') {
      if (context) logEmailAuthRequest(context, 405, 'METHOD_NOT_ALLOWED')
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
    if (pathname === '/api/auth/email/send-code') {
      const result = await auth.sendEmailCode(String(body.email ?? ''))
      logEmailAuthRequest(context, 200)
      sendJson(response, 200, result)
      return true
    }
    if (pathname === '/api/auth/email/login') {
      const result = await auth.loginWithEmail(String(body.email ?? ''), String(body.code ?? ''))
      logEmailAuthRequest(context, 200)
      sendJson(response, 200, result)
      return true
    }

    if (context) logEmailAuthRequest(context, 404, 'NOT_FOUND')
    sendJson(response, 404, { error: { code: 'NOT_FOUND', message: '接口不存在' } })
    return true
  } catch (error) {
    if (context) {
      const status = Number.isInteger(error?.status) ? error.status : 500
      const category = typeof error?.code === 'string' ? error.code : 'INTERNAL_ERROR'
      logEmailAuthRequest(context, status, category)
    }
    throw error
  }
}
async function handleMembers(request, response, pathname) {
  const match = /^\/api\/members(?:\/([^/]+))?$/.exec(pathname)
  if (!match) return false

  const accountId = readAccountId(request)
  const timeZone = validTimeZone(request.headers['x-hoooho-timezone'])
  const memberId = match[1] ? decodeRouteValue(match[1]) : null
  if (!memberId && request.method === 'GET') sendJson(response, 200, await members.list(accountId))
  else if (!memberId && request.method === 'POST') sendJson(response, 201, await members.create(accountId, await readJson(request, AVATAR_PHOTO_MAX_REQUEST_LENGTH), new Date(), timeZone))
  else if (memberId === 'self' && request.method === 'POST') sendJson(response, 201, await members.createSelf(accountId, await readJson(request, AVATAR_PHOTO_MAX_REQUEST_LENGTH), new Date(), timeZone))
  else if (memberId && request.method === 'GET') sendJson(response, 200, await members.get(accountId, memberId))
  else if (memberId && request.method === 'PATCH') sendJson(response, 200, await members.update(accountId, memberId, await readJson(request, AVATAR_PHOTO_MAX_REQUEST_LENGTH), new Date(), timeZone))
  else if (memberId && request.method === 'DELETE') sendJson(response, 200, await members.delete(accountId, memberId))
  else sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
  return true
}

async function handleAccountEntryState(request, response, pathname) {
  if (pathname !== '/api/account/entry-state') return false
  if (request.method === 'GET') sendJson(response, 200, await accountEntryState.get(readAccountId(request)))
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
  const confirmMatch = /^\/api\/events\/([^/]+)\/organizations\/confirm$/.exec(pathname)
  const match = /^\/api\/events\/([^/]+)\/organizations$/.exec(pathname)
  if (!previewMatch && !confirmMatch && !match) return false

  const accountId = readAccountId(request)
  const eventId = decodeRouteValue((previewMatch ?? confirmMatch ?? match)[1])
  if (previewMatch) {
    if (request.method === 'POST') sendJson(response, 200, await organizations.preview(accountId, eventId, await readJson(request)))
    else sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
  } else if (confirmMatch) {
    if (request.method === 'POST') sendJson(response, 201, await organizations.confirm(accountId, eventId, await readJson(request)))
    else sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
  } else if (request.method === 'GET') sendJson(response, 200, await organizations.list(accountId, eventId))
  else if (request.method === 'POST') sendJson(response, 201, await organizations.organize(accountId, eventId, await readJson(request)))
  else sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
  return true
}

async function handleHealthProfileFacts(request, response, pathname, searchParams) {
  const candidatesMatch = /^\/api\/health-profile-facts\/candidates$/.exec(pathname)
  const sourcesMatch = /^\/api\/health-profile-facts\/([^/]+)\/sources$/.exec(pathname)
  const factMatch = /^\/api\/health-profile-facts\/([^/]+)$/.exec(pathname)
  const collectionMatch = pathname === '/api/health-profile-facts'
  if (!candidatesMatch && !sourcesMatch && !factMatch && !collectionMatch) return false

  const accountId = readAccountId(request)
  if (candidatesMatch && request.method === 'GET') {
    sendJson(response, 200, await healthProfileFacts.listCandidates(accountId, searchParams.get('memberId') ?? ''))
  } else if (collectionMatch && request.method === 'GET') {
    sendJson(response, 200, await healthProfileFacts.list(accountId, searchParams.get('memberId') ?? ''))
  } else if (collectionMatch && request.method === 'POST') {
    sendJson(response, 201, await healthProfileFacts.create(accountId, await readJson(request)))
  } else if (sourcesMatch && request.method === 'POST') {
    sendJson(response, 200, await healthProfileFacts.addSource(accountId, decodeRouteValue(sourcesMatch[1]), await readJson(request)))
  } else if (factMatch && request.method === 'GET') {
    sendJson(response, 200, await healthProfileFacts.get(accountId, decodeRouteValue(factMatch[1])))
  } else if (factMatch && request.method === 'PATCH') {
    sendJson(response, 200, await healthProfileFacts.update(accountId, decodeRouteValue(factMatch[1]), await readJson(request)))
  } else {
    sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
  }
  return true
}

async function handleAudioTranscription(request, response, pathname) {
  if (pathname !== '/api/ai/audio/transcriptions') return false
  readAccountId(request)
  if (request.method === 'POST') sendJson(response, 200, await audioTranscription.transcribe(await readJson(request, 21_000_000)))
  else sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
  return true
}

async function handleAttachments(request, response, pathname) {
  const match = /^\/api\/events\/([^/]+)\/attachments(?:\/(preview))?$/.exec(pathname)
  if (!match) return false
  const accountId = readAccountId(request)
  const eventId = decodeRouteValue(match[1])
  if (request.method === 'POST' && match[2] === 'preview') sendJson(response, 200, await attachments.preview(accountId, eventId, await readJson(request, 7_100_000)))
  else if (request.method === 'GET') sendJson(response, 200, await attachments.list(accountId, eventId))
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
  if (!eventId && request.method === 'GET') sendJson(response, 200, organizations.publicEventPayload(await events.list(accountId)))
  else if (!eventId && request.method === 'POST') sendJson(response, 201, await events.create(accountId, await readJson(request)))
  else if (eventId && request.method === 'GET') sendJson(response, 200, organizations.publicEventPayload(await events.get(accountId, eventId)))
  else if (eventId && request.method === 'PATCH') sendJson(response, 200, await events.update(accountId, eventId, await readJson(request)))
  else if (eventId && request.method === 'DELETE') sendJson(response, 200, await events.delete(accountId, eventId))
  else sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
  return true
}

async function handleOnlineConsultations(request, response, pathname) {
  const match = /^\/api\/events\/([^/]+)\/online-consultation(?:\/(questions|refresh|complete))?$/.exec(pathname)
  if (!match) return false
  const accountId = readAccountId(request)
  const eventId = decodeRouteValue(match[1])
  const action = match[2]
  if (!action && request.method === 'GET') sendJson(response, 200, await onlineConsultations.get(accountId, eventId))
  else if (!action && request.method === 'PATCH') sendJson(response, 200, await onlineConsultations.updateStatus(accountId, eventId, await readJson(request)))
  else if (action === 'questions' && request.method === 'POST') sendJson(response, 201, await onlineConsultations.addQuestion(accountId, eventId, await readJson(request)))
  else if (action === 'refresh' && request.method === 'POST') sendJson(response, 200, await onlineConsultations.touchWaiting(accountId, eventId))
  else if (action === 'complete' && request.method === 'POST') sendJson(response, 200, await onlineConsultations.complete(accountId, eventId, await readJson(request)))
  else sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
  return true
}

async function handleApi(request, response, pathname, searchParams) {
  if (request.method === 'OPTIONS') {
    sendEmpty(response)
    return true
  }
  if (pathname === '/api/health' && request.method === 'GET') {
    sendJson(response, 200, {
      status: 'ok',
      features: { quickRecordStructuredMode: organizations.structuredModeStatus() }
    })
    return true
  }
  if (await handleAuth(request, response, pathname)) return true
  if (await handleOpsFeedback(request, response, pathname, searchParams)) return true
  if (await handleOps(request, response, pathname)) return true
  if (await handleFeedback(request, response, pathname, searchParams)) return true
  if (await handleAccountEntryState(request, response, pathname)) return true
  if (await handleMembers(request, response, pathname)) return true
  if (await handleAudioTranscription(request, response, pathname)) return true
  if (await handleAttachments(request, response, pathname)) return true
  if (await handleOnlineConsultations(request, response, pathname)) return true
  if (await handleHealthProfileFacts(request, response, pathname, searchParams)) return true
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
  response.setHeader('Content-Type', getStaticContentType(filePath))
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
    const url = new URL(request.url ?? '/', 'http://localhost')
    const pathname = url.pathname
    if (await handleApi(request, response, pathname, url.searchParams)) return
    await handleStatic(request, response, pathname)
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500
    const code = typeof error?.code === 'string' ? error.code : 'INTERNAL_ERROR'
    const message = status >= 500 && !(error instanceof AuthError) ? '服务器暂时不可用' : error.message
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
