import { createReadStream } from 'node:fs'
import { access, readFile, stat } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getCanonicalDomainRedirect } from './domain-routing.mjs'
import { AuthError, AuthService } from './auth/auth-service.mjs'
import { BrowserSessionService } from './auth/browser-session-service.mjs'
import { registerTransactionRoot } from './auth/storage/transaction.mjs'
import { withAccountLock } from './auth/account-lock.mjs'
import { assertAuthRuntimeConfig, authConfig } from './auth/config.mjs'
import { TokenService } from './auth/token-service.mjs'
import { HealthEventRecordService } from './events/health-event-record-service.mjs'
import { HealthEventService } from './events/health-event-service.mjs'
import { QuickRecordService } from './events/quick-record-service.mjs'
import { QuickRecordPhotoService } from './events/quick-record-photo-service.mjs'
import { EventAttachmentService } from './events/event-attachment-service.mjs'
import { FamilyMemberService } from './members/family-member-service.mjs'
import { cleanupTestDataOnce } from './data/cleanup-test-data.mjs'
import { HealthRecordOrganizationService } from './ai/health-record-organization-service.mjs'
import { AudioTranscriptionService } from './ai/audio-transcription-service.mjs'
import { OPS_SNAPSHOT_REQUEST_MAX_LENGTH, OpsService, assertOpsAccess, startOpsScheduler } from './ops/ops-service.mjs'
import { FeedbackService } from './help/feedback-service.mjs'
import { getStaticContentType } from './static-mime-types.mjs'
import { validTimeZone } from './time/local-calendar.mjs'
import { OnlineConsultationService } from './consultations/online-consultation-service.mjs'
import { AccountEntryStateService } from './onboarding/account-entry-state-service.mjs'
import { HealthProfileFactService } from './health-profile/health-profile-fact-service.mjs'
import { HealthInformationCandidateService } from './health-information/health-information-candidate-service.mjs'
import { AVATAR_PHOTO_MAX_REQUEST_LENGTH } from '../shared/avatar-photo-policy.mjs'
import { AccountService } from './account/account-service.mjs'

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
assertAuthRuntimeConfig()
const staticDirectory = path.resolve(process.env.STATIC_DIRECTORY || path.join(rootDirectory, 'dist'))
const port = Number.parseInt(process.env.PORT || '3000', 10)
const host = process.env.HOST || '0.0.0.0'

registerTransactionRoot(authConfig.dataDirectory)
const cleanupResult = await cleanupTestDataOnce(authConfig.dataDirectory)
if (cleanupResult.applied) console.info('[Hoooho] test data cleanup completed', cleanupResult)

const sharedOptions = {
  dataDirectory: authConfig.dataDirectory,
  tokenSecret: authConfig.tokenSecret
}

const auth = new AuthService(sharedOptions)
const browserSessions = new BrowserSessionService(auth)
const account = new AccountService({ ...sharedOptions, auth, users: auth.users, data: auth.accountData })
const members = new FamilyMemberService(sharedOptions)
const organizations = new HealthRecordOrganizationService(sharedOptions)
const audioTranscription = new AudioTranscriptionService(sharedOptions)
const events = new HealthEventService({ ...sharedOptions, summaryRefresher: organizations })
const records = new HealthEventRecordService({ ...sharedOptions, organizations })
const attachments = new EventAttachmentService(sharedOptions)
const quickRecordPhotos = new QuickRecordPhotoService({ ...sharedOptions, attachments: attachments.repository })
const quickRecords = new QuickRecordService({ ...sharedOptions, events, records, photos: quickRecordPhotos })
const tokens = new TokenService(authConfig.tokenSecret, authConfig.tokenTtlMs)
const ops = new OpsService(sharedOptions)
const stopOpsScheduler = startOpsScheduler(ops)
const feedback = new FeedbackService(sharedOptions)
const onlineConsultations = new OnlineConsultationService(sharedOptions)
const accountEntryState = new AccountEntryStateService(sharedOptions)
const healthProfileFacts = new HealthProfileFactService(sharedOptions)
const healthInformationCandidates = new HealthInformationCandidateService({ ...sharedOptions, profileFacts: healthProfileFacts })

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

async function readAccountId(request) {
  const authorization = request.headers.authorization ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(authorization)
  const payload = match ? tokens.verify(match[1]) : null
  if (payload?.guest) {
    const user = await auth.users.findById(payload.sub)
    if (user) browserSessions.assertSameOrigin(request)
    if (!user?.mergedInto && (!user || (await browserSessions.current(request))?.user.id === payload.sub)) return payload.sub
  }
  if (payload && !payload.guest && await auth.users.findById(payload.sub)) return payload.sub

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
  const payload = readAuthPayload(request)
  assertOpsAccess(payload, { ownerEmail: authConfig.opsOwnerEmail })
  if (pathname === '/api/ops/session' && request.method === 'GET') sendJson(response, 200, { authenticated: true, authorized: true, email: payload.email })
  else if (pathname === '/api/ops/sources' && request.method === 'GET') sendJson(response, 200, await ops.list())
  else if (pathname === '/api/ops/sources' && request.method === 'POST') sendJson(response, 201, await ops.create(await readJson(request)))
  else if (pathname === '/api/ops/refresh' && request.method === 'POST') sendJson(response, 200, await ops.refreshAll())
  else {
    const image = /^\/api\/ops\/sources\/([^/]+)\/snapshots\/([^/]+)\/image$/.exec(pathname)
    const snapshot = /^\/api\/ops\/sources\/([^/]+)\/snapshots\/([^/]+)$/.exec(pathname)
    const history = /^\/api\/ops\/sources\/([^/]+)\/snapshots$/.exec(pathname)
    const refresh = /^\/api\/ops\/sources\/([^/]+)\/refresh$/.exec(pathname)
    const source = /^\/api\/ops\/sources\/([^/]+)$/.exec(pathname)
    if (image && request.method === 'GET') {
      const file = await ops.readSnapshot(decodeRouteValue(image[1]), decodeRouteValue(image[2]))
      setCommonHeaders(response)
      response.statusCode = 200
      response.setHeader('Content-Type', file.type)
      response.setHeader('Content-Length', String(file.buffer.length))
      response.setHeader('Content-Disposition', 'inline')
      response.setHeader('Cache-Control', 'private, no-store')
      response.end(file.buffer)
    } else if (snapshot && request.method === 'PATCH') sendJson(response, 200, await ops.updateSnapshot(decodeRouteValue(snapshot[1]), decodeRouteValue(snapshot[2]), await readJson(request)))
    else if (history && request.method === 'GET') sendJson(response, 200, await ops.history(decodeRouteValue(history[1])))
    else if (history && request.method === 'POST') sendJson(response, 201, await ops.addManualSnapshot(decodeRouteValue(history[1]), await readJson(request, OPS_SNAPSHOT_REQUEST_MAX_LENGTH)))
    else if (refresh && request.method === 'POST') sendJson(response, 200, await ops.refresh(decodeRouteValue(refresh[1])))
    else if (source && request.method === 'PATCH') sendJson(response, 200, await ops.update(decodeRouteValue(source[1]), await readJson(request)))
    else sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
  }
  return true
}

async function handleOpsFeedback(request, response, pathname, searchParams) {
  if (!pathname.startsWith('/api/ops/feedback')) return false
  const payload = readAuthPayload(request)
  assertOpsAccess(payload, { ownerEmail: authConfig.opsOwnerEmail })
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
  const accountId = await readAccountId(request)
  if (pathname === '/api/feedback' && request.method === 'POST') sendJson(response, 201, await feedback.create(accountId, await readJson(request, 29_000_000)))
  else if (pathname === '/api/feedback' && request.method === 'GET') sendJson(response, 200, await feedback.listForAccount(accountId))
  else {
    const match = /^\/api\/feedback\/([^/]+)$/.exec(pathname)
    const messagesMatch = /^\/api\/feedback\/([^/]+)\/messages$/.exec(pathname)
    const readMatch = /^\/api\/feedback\/([^/]+)\/read$/.exec(pathname)
    if (messagesMatch && request.method === 'POST') sendJson(response, 201, await feedback.addUserMessage(accountId, decodeRouteValue(messagesMatch[1]), await readJson(request, 29_000_000)))
    else if (readMatch && request.method === 'POST') sendJson(response, 200, await feedback.markTeamMessagesRead(accountId, decodeRouteValue(readMatch[1])))
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
    startedAt: Date.now(),
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
    durationMs: Math.max(0, Date.now() - context.startedAt),
    status,
    errorCategory,
    rateLimited: status === 429 || errorCategory === 'CODE_RATE_LIMITED'
  })}`)
}

async function handleAuth(request, response, pathname) {
  if (!pathname.startsWith('/api/auth/') && !pathname.startsWith('/api/ops/auth/')) return false
  if (pathname === '/api/auth/current-member' && request.method === 'POST') {
    sendJson(response, 200, await browserSessions.selectMember(request, await readJson(request)))
    return true
  }
  if (pathname === '/api/auth/profile-sections' && ['GET', 'POST'].includes(request.method)) {
    const input = request.method === 'GET' ? undefined : await readJson(request, 20_000_000)
    sendJson(response, 200, await browserSessions.profileSections(request, input))
    return true
  }
  if (pathname === '/api/auth/session' && request.method === 'GET') {
    const legacyToken = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? '')?.[1] ?? ''
    sendJson(response, 200, await browserSessions.restore(request, response, legacyToken))
    return true
  }
  const context = pathname.startsWith('/api/auth/email/') || pathname.startsWith('/api/ops/auth/email/')
    ? createEmailAuthRequestContext(request, response, pathname)
    : null

  try {
    if (request.method !== 'POST') {
      if (context) logEmailAuthRequest(context, 405, 'METHOD_NOT_ALLOWED')
      sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '仅支持 POST 请求' } })
      return true
    }

    const body = await readJson(request)
    if (pathname === '/api/auth/guest') {
      sendJson(response, 200, await browserSessions.create(request, response, String(body.guestToken ?? '')))
      return true
    }
    if (pathname === '/api/auth/logout') {
      sendJson(response, 200, await browserSessions.logout(request, response))
      return true
    }
    if (pathname === '/api/auth/send-code') {
      sendJson(response, 200, await auth.sendCode(String(body.phone ?? '')))
      return true
    }
    if (pathname === '/api/auth/login') {
      const session = await auth.login(String(body.phone ?? ''), String(body.code ?? ''))
      sendJson(response, 200, await browserSessions.completeLogin(request, response, session, String(body.guestToken ?? '')))
      return true
    }
    if (pathname === '/api/auth/email/send-code') {
      const result = await auth.sendEmailCode(String(body.email ?? ''))
      logEmailAuthRequest(context, 200)
      sendJson(response, 200, result)
      return true
    }
    if (pathname === '/api/auth/email/login') {
      const session = await auth.loginWithEmail(String(body.email ?? ''), String(body.code ?? ''))
      const result = await browserSessions.completeLogin(request, response, session, String(body.guestToken ?? ''))
      logEmailAuthRequest(context, 200)
      sendJson(response, 200, result)
      return true
    }
    if (pathname === '/api/ops/auth/email/send') {
      const result = await auth.sendOpsEmailCode(String(body.email ?? ''))
      logEmailAuthRequest(context, 200)
      sendJson(response, 200, result)
      return true
    }
    if (pathname === '/api/ops/auth/email/verify') {
      const result = await auth.loginOpsWithEmail(String(body.email ?? ''), String(body.code ?? ''))
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
async function handleAccount(request, response, pathname) {
  if (!pathname.startsWith('/api/account/') || pathname === '/api/account/entry-state') return false
  const accountId = await readAccountId(request)
  if (accountId.startsWith('guest:')) {
    const error = new Error('请先登录或注册')
    error.status = 401
    error.code = 'GUEST_ACCOUNT_REQUIRED'
    throw error
  }
  if (pathname === '/api/account/profile' && request.method === 'GET') sendJson(response, 200, await account.get(accountId))
  else if (pathname === '/api/account/profile' && request.method === 'PATCH') sendJson(response, 200, await account.updateProfile(accountId, await readJson(request, AVATAR_PHOTO_MAX_REQUEST_LENGTH)))
  else if (pathname === '/api/account/bind/send-code' && request.method === 'POST') {
    const body = await readJson(request)
    sendJson(response, 200, await account.sendBindingCode(accountId, String(body.kind ?? ''), String(body.value ?? '')))
  } else if (pathname === '/api/account/bind/confirm' && request.method === 'POST') {
    const body = await readJson(request)
    sendJson(response, 200, await account.bind(accountId, String(body.kind ?? ''), String(body.value ?? ''), String(body.code ?? ''), String(body.challengeToken ?? '')))
  } else if (pathname === '/api/account/bind/verify-current' && request.method === 'POST') {
    const body = await readJson(request)
    sendJson(response, 200, await account.verifyCurrent(accountId, String(body.kind ?? ''), String(body.code ?? '')))
  } else if (pathname === '/api/account/provider' && request.method === 'POST') {
    const body = await readJson(request)
    sendJson(response, 200, await account.providerAction(accountId, String(body.provider ?? ''), String(body.action ?? '')))
  } else if (pathname === '/api/account/delete/send-code' && request.method === 'POST') {
    const current = await account.get(accountId)
    const body = await readJson(request)
    const kind = String(body.kind ?? '')
    const value = kind === 'phone' ? current.phone : current.email
    if (!value) {
      const error = new Error('当前账户没有可用的验证方式')
      error.status = 409
      error.code = 'NO_VERIFICATION_METHOD'
      throw error
    }
    sendJson(response, 200, await account.sendBindingCode(accountId, kind, value))
  } else if (pathname === '/api/account/delete/verify' && request.method === 'POST') {
    const body = await readJson(request)
    sendJson(response, 200, await account.verifyDeletion(accountId, String(body.kind ?? ''), String(body.code ?? '')))
  } else if (pathname === '/api/account/delete' && request.method === 'POST') sendJson(response, 200, await account.delete(accountId, await readJson(request)))
  else sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
  return true
}
async function handleMembers(request, response, pathname) {
  const match = /^\/api\/members(?:\/([^/]+))?$/.exec(pathname)
  if (!match) return false

  const accountId = await readAccountId(request)
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

async function handleQuickRecords(request, response, pathname) {
  const photoContentMatch = /^\/api\/quick-records\/([^/]+)\/photos\/([^/]+)\/content$/.exec(pathname)
  const photoMatch = /^\/api\/quick-records\/([^/]+)\/photos(?:\/([^/]+))?$/.exec(pathname)
  if (pathname !== '/api/quick-records' && !photoMatch && !photoContentMatch) return false
  const accountId = await readAccountId(request)
  const photoMemberId = String(request.headers['x-hoooho-member-id'] ?? '').trim()
  if (photoContentMatch) {
    if (request.method === 'GET') {
      const file = await quickRecordPhotos.read(accountId, photoMemberId, decodeRouteValue(photoContentMatch[1]), decodeRouteValue(photoContentMatch[2]))
      setCommonHeaders(response)
      response.statusCode = 200
      response.setHeader('Content-Type', file.mimeType)
      response.setHeader('Content-Length', String(file.buffer.length))
      response.setHeader('Content-Disposition', 'inline')
      response.setHeader('Cache-Control', 'private, no-store')
      response.end(file.buffer)
    } else sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
  } else if (photoMatch) {
    const draftId = decodeRouteValue(photoMatch[1])
    const photoId = photoMatch[2] ? decodeRouteValue(photoMatch[2]) : null
    if (!photoId && request.method === 'GET') sendJson(response, 200, await quickRecordPhotos.list(accountId, photoMemberId, draftId))
    else if (!photoId && request.method === 'POST') sendJson(response, 201, await quickRecordPhotos.upload(accountId, draftId, await readJson(request, 7_100_000)))
    else if (!photoId && request.method === 'DELETE') sendJson(response, 200, await quickRecordPhotos.cancel(accountId, photoMemberId, draftId))
    else if (photoId && request.method === 'DELETE') sendJson(response, 200, await quickRecordPhotos.delete(accountId, photoMemberId, draftId, photoId))
    else sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
  } else if (request.method === 'POST') sendJson(response, 201, await quickRecords.create(accountId, await readJson(request)))
  else sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
  return true
}

async function handleAccountEntryState(request, response, pathname) {
  if (pathname !== '/api/account/entry-state') return false
  if (request.method === 'GET') sendJson(response, 200, await accountEntryState.get(await readAccountId(request)))
  else sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
  return true
}

async function handleEventRecords(request, response, pathname) {
  const eventRecordsMatch = /^\/api\/events\/([^/]+)\/records$/.exec(pathname)
  const recordMatch = /^\/api\/records\/([^/]+)$/.exec(pathname)
  const annotationMatch = /^\/api\/records\/([^/]+)\/change-annotations\/([^/]+)$/.exec(pathname)
  if (!eventRecordsMatch && !recordMatch && !annotationMatch) return false

  const accountId = await readAccountId(request)
  if (eventRecordsMatch) {
    const eventId = decodeRouteValue(eventRecordsMatch[1])
    if (request.method === 'GET') sendJson(response, 200, await records.list(accountId, eventId))
    else if (request.method === 'POST') sendJson(response, 201, await records.create(accountId, eventId, await readJson(request)))
    else sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
    return true
  }

  if (annotationMatch) {
    const recordId = decodeRouteValue(annotationMatch[1])
    const annotationId = decodeRouteValue(annotationMatch[2])
    if (request.method === 'PATCH') sendJson(response, 200, await records.updateChangeAnnotation(accountId, recordId, annotationId, await readJson(request)))
    else if (request.method === 'DELETE') sendJson(response, 200, await records.deleteChangeAnnotation(accountId, recordId, annotationId))
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

  const accountId = await readAccountId(request)
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

  const accountId = await readAccountId(request)
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
  await readAccountId(request)
  if (request.method === 'POST') sendJson(response, 200, await audioTranscription.transcribe(await readJson(request, 21_000_000)))
  else sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
  return true
}

async function handleHealthInformationCandidates(request, response, pathname) {
  const eventMatch = /^\/api\/events\/([^/]+)\/health-information-candidates(?:\/(discover))?$/.exec(pathname)
  const candidateMatch = /^\/api\/health-information-candidates\/([^/]+)$/.exec(pathname)
  if (!eventMatch && !candidateMatch) return false
  const accountId = await readAccountId(request)
  if (eventMatch) {
    const eventId = decodeRouteValue(eventMatch[1])
    if (!eventMatch[2] && request.method === 'GET') sendJson(response, 200, await healthInformationCandidates.list(accountId, eventId))
    else if (eventMatch[2] === 'discover' && request.method === 'POST') sendJson(response, 200, await healthInformationCandidates.discover(accountId, eventId))
    else sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
    return true
  }
  if (request.method === 'PATCH') sendJson(response, 200, await healthInformationCandidates.update(accountId, decodeRouteValue(candidateMatch[1]), await readJson(request)))
  else sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
  return true
}

async function handleAttachments(request, response, pathname) {
  const contentMatch = /^\/api\/events\/([^/]+)\/attachments\/([^/]+)\/content$/.exec(pathname)
  const match = /^\/api\/events\/([^/]+)\/attachments(?:\/(preview))?$/.exec(pathname)
  if (!match && !contentMatch) return false
  const accountId = await readAccountId(request)
  const eventId = decodeRouteValue((match ?? contentMatch)[1])
  if (contentMatch) {
    if (request.method === 'GET') {
      const file = await attachments.read(accountId, eventId, decodeRouteValue(contentMatch[2]))
      setCommonHeaders(response)
      response.statusCode = 200
      response.setHeader('Content-Type', file.mimeType)
      response.setHeader('Content-Length', String(file.buffer.length))
      response.setHeader('Content-Disposition', 'inline')
      response.setHeader('Cache-Control', 'private, no-store')
      response.end(file.buffer)
    } else sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
  } else if (request.method === 'POST' && match[2] === 'preview') sendJson(response, 200, await attachments.preview(accountId, eventId, await readJson(request, 7_100_000)))
  else if (request.method === 'GET') sendJson(response, 200, await attachments.list(accountId, eventId))
  else if (request.method === 'POST') sendJson(response, 201, await attachments.create(accountId, eventId, await readJson(request, 7_100_000)))
  else sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
  return true
}

async function handleEvents(request, response, pathname) {
  const summaryMatch = /^\/api\/events\/([^/]+)\/summary$/.exec(pathname)
  if (summaryMatch) {
    const accountId = await readAccountId(request)
    const eventId = decodeRouteValue(summaryMatch[1])
    if (request.method === 'PATCH') sendJson(response, 200, await events.correctSummary(accountId, eventId, await readJson(request)))
    else sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
    return true
  }
  const match = /^\/api\/events(?:\/([^/]+))?$/.exec(pathname)
  if (!match) return false

  const accountId = await readAccountId(request)
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
  const accountId = await readAccountId(request)
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
  if (await handleAccount(request, response, pathname)) return true
  if (await handleAccountEntryState(request, response, pathname)) return true
  if (await handleMembers(request, response, pathname)) return true
  if (await handleQuickRecords(request, response, pathname)) return true
  if (await handleAudioTranscription(request, response, pathname)) return true
  if (await handleAttachments(request, response, pathname)) return true
  if (await handleOnlineConsultations(request, response, pathname)) return true
  if (await handleHealthProfileFacts(request, response, pathname, searchParams)) return true
  if (await handleHealthInformationCandidates(request, response, pathname)) return true
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
    const accessToken = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? '')?.[1]
    const lockAccountId = accessToken ? tokens.verify(accessToken)?.sub : pathname.startsWith('/api/auth/') ? (await browserSessions.current(request))?.user.id : null
    if (await withAccountLock(lockAccountId, () => handleApi(request, response, pathname, url.searchParams))) return
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
  stopOpsScheduler()
  server.close((error) => {
    if (error) {
      console.error(error)
      process.exitCode = 1
    }
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
