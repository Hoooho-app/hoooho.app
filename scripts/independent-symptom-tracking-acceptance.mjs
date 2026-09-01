import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import {
  futureOccurrenceCase,
  independentSymptomTrackingCases,
  validateExpectationDataset
} from './independent-symptom-tracking-expectations.mjs'

const ROOT = process.cwd()
const BASE_URL = process.env.HOOOHO_ACCEPTANCE_BASE_URL || 'https://hooohoapp-staging.up.railway.app'
const PRODUCTION_URL = 'https://hoooho.com'
const EVIDENCE_ROOT = path.resolve(ROOT, '.codex-tmp', 'independent-symptom-tracking-acceptance')
const SECRETS_PATH = path.resolve(ROOT, '.codex-tmp', 'independent-symptom-tracking-acceptance-secrets.json')
const RESULTS_PATH = path.join(EVIDENCE_ROOT, 'results.json')
const CHECKPOINT_PATH = path.join(EVIDENCE_ROOT, 'checkpoint.json')
const PLAYWRIGHT_ROOT = process.env.HOOOHO_ACCEPTANCE_PLAYWRIGHT_ROOT
  || path.resolve(ROOT, '.codex-tmp', 'acceptance-runtime', 'node_modules', 'playwright-core')
const CHROME_PATH = process.env.HOOOHO_ACCEPTANCE_CHROME_PATH
  || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const RAILWAY_CLI = process.env.HOOOHO_ACCEPTANCE_RAILWAY_CLI
  || 'C:\\Users\\1\\AppData\\Roaming\\npm\\node_modules\\@railway\\cli\\bin\\railway.exe'
const RAILWAY_PROJECT = 'd8855fe3-c785-4b8c-825b-bdb10a941850'
const RAILWAY_ENVIRONMENT = '45ec5209-37a6-40f8-9697-a3ecd1347a80'
const RAILWAY_SERVICE = 'aa308ba0-d7da-4771-9c94-ccdcd110f636'
const TIME_ZONE = 'Asia/Shanghai'
const VIEWPORT = { width: 375, height: 667 }
const args = new Set(process.argv.slice(2))
const requestedCase = process.argv.slice(2).find((item) => item.startsWith('--case='))?.slice('--case='.length)
const resume = args.has('--resume')
const rerun = args.has('--rerun')
const includeFuture = !args.has('--skip-future')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const execFileAsync = promisify(execFile)
const jsonClone = (value) => JSON.parse(JSON.stringify(value))
const sha12 = (value) => createHash('sha256').update(String(value)).digest('hex').slice(0, 12)
const nowIso = () => new Date().toISOString()

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function readJsonIfExists(filePath, fallback = null) {
  if (!existsSync(filePath)) return fallback
  return JSON.parse(await readFile(filePath, 'utf8'))
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options)
  const text = await response.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  if (!response.ok) {
    const error = new Error(body?.error?.message || body?.message || `${response.status} ${response.statusText}`)
    error.status = response.status
    error.body = body
    throw error
  }
  return { response, body }
}

function maskEmail(email) {
  const [local = '', domain = ''] = String(email).split('@')
  return `${local.slice(0, 3)}***@${domain}`
}

function maskPhone(phone) {
  const value = String(phone || '')
  return value.length === 11 ? `${value.slice(0, 3)}****${value.slice(-4)}` : '[masked-phone]'
}

function mailboxMembers(body) {
  return body?.['hydra:member'] || body?.member || body?.items || []
}

async function createTemporaryMailbox() {
  const { body: domainsBody } = await fetchJson('https://api.mail.tm/domains')
  const domain = mailboxMembers(domainsBody).find((item) => item.isActive !== false)?.domain
  if (!domain) throw new Error('临时邮箱没有可用域名')
  const address = `qa${Date.now().toString(36)}${randomUUID().replaceAll('-', '').slice(0, 6)}@${domain}`.toLowerCase()
  const password = `Qa${randomUUID().replaceAll('-', '').slice(0, 12)}90`
  await fetchJson('https://api.mail.tm/accounts', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address, password })
  })
  let tokenBody = null
  for (let attempt = 0; attempt < 3 && !tokenBody?.token; attempt += 1) {
    if (attempt) await sleep(1_000)
    try {
      tokenBody = (await fetchJson('https://api.mail.tm/token', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address, password })
      })).body
    } catch (error) {
      if (error.status !== 401 || attempt === 2) throw error
    }
  }
  if (!tokenBody?.token) throw new Error('临时邮箱 token 创建失败')
  return { address, password, token: tokenBody.token }
}

async function waitForVerificationCode(mailbox, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const { body } = await fetchJson('https://api.mail.tm/messages', {
      headers: { authorization: `Bearer ${mailbox.token}` }
    })
    for (const message of mailboxMembers(body)) {
      const { body: detail } = await fetchJson(`https://api.mail.tm/messages/${encodeURIComponent(message.id)}`, {
        headers: { authorization: `Bearer ${mailbox.token}` }
      })
      const combined = [detail?.subject, detail?.intro, detail?.text, ...(detail?.html || [])].filter(Boolean).join('\n')
      const match = combined.match(/(?:验证码(?:是|为)?[：:\s]*)?(\d{6})/u)
      if (match) return match[1]
    }
    await sleep(2_000)
  }
  throw new Error('等待 Staging 邮箱验证码超时')
}

async function createStagingSession() {
  const phone = `199${String(Date.now()).slice(-8)}`
  await fetchJson(`${BASE_URL}/api/auth/send-code`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'Hoooho independent acceptance bootstrap' },
    body: JSON.stringify({ phone })
  })
  let code = ''
  for (let attempt = 0; attempt < 12 && !code; attempt += 1) {
    if (attempt) await sleep(2_000)
    const { stdout } = await execFileAsync(RAILWAY_CLI, [
      'logs', '--project', RAILWAY_PROJECT, '--environment', RAILWAY_ENVIRONMENT,
      '--service', RAILWAY_SERVICE, '--since', '5m', '--lines', '200', '--json',
      '--filter', `phone=${phone}`
    ], { windowsHide: true, maxBuffer: 2_000_000 })
    code = stdout.match(new RegExp(`phone=${phone} code=(\\d{6})`, 'u'))?.[1] || ''
  }
  if (!code) throw new Error('未能从 Railway Staging 日志取得虚构账号验证码')
  const { body: session } = await fetchJson(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'Hoooho independent acceptance bootstrap' },
    body: JSON.stringify({ phone, code })
  })
  if (!session?.token || !session?.user?.id) throw new Error('Staging 登录响应不完整')
  return {
    createdAt: nowIso(),
    authChannel: 'phone-log-bootstrap',
    identifier: phone,
    token: session.token,
    user: session.user,
    members: {},
    events: {}
  }
}

function createAliasRegistry(secrets) {
  const aliases = new Map()
  if (secrets?.user?.id) aliases.set(secrets.user.id, 'account-acceptance')
  for (const [kind, member] of Object.entries(secrets?.members || {})) {
    if (member?.id) aliases.set(member.id, `member-${kind}`)
    if (member?.accountId) aliases.set(member.accountId, 'account-acceptance')
  }
  for (const [caseId, event] of Object.entries(secrets?.events || {})) {
    if (event?.id) aliases.set(event.id, `event-${caseId}`)
    if (event?.fixtureRecordId) aliases.set(event.fixtureRecordId, `record-${caseId}-fixture`)
  }
  return aliases
}

function sanitize(value, aliases, identifier, key = '') {
  if (/token|password|verificationCode|oneTimeCode|cookie|authorization/i.test(key)) return '[REDACTED]'
  if (Array.isArray(value)) return value.map((item) => sanitize(item, aliases, identifier))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, sanitize(childValue, aliases, identifier, childKey)]))
  }
  if (typeof value !== 'string') return value
  if (value === identifier) return maskPhone(identifier)
  if (aliases.has(value)) return aliases.get(value)
  if (/^[A-Za-z0-9_-]{20,}$/.test(value) && /id$/i.test(key)) return `${key.replace(/id$/i, '') || 'id'}-${sha12(value)}`
  return value.replaceAll(identifier, maskPhone(identifier))
}

async function responseBody(response) {
  const text = await response.text()
  try { return text ? JSON.parse(text) : null } catch { return text }
}

function canonicalFact(factValue) {
  const fact = jsonClone(factValue || {})
  delete fact.id
  delete fact.sourceRecordId
  delete fact.organizationRevision
  return fact
}

function canonicalFacts(facts) {
  return (facts || []).map(canonicalFact)
}

function sameFacts(left, right) {
  return JSON.stringify(canonicalFacts(left)) === JSON.stringify(canonicalFacts(right))
}

const namePatterns = {
  '咳嗽': /咳/u,
  '疼痛': /疼|痛/u,
  '头痛': /头痛|头疼/u,
  '腹痛': /腹痛|肚子疼|腹部疼/u,
  '皮疹': /皮疹|红疹|疹子/u,
  '喘息': /喘/u,
  '体温': /体温|温度/u,
  '鼻塞': /鼻塞|鼻子堵/u,
  '咽喉痛': /咽|喉|嗓/u,
  '发热': /发热|发烧|烧/u,
  '麻木': /麻/u,
  '呕吐': /呕吐|吐/u,
  '头晕': /头晕/u,
  '恶心': /恶心/u,
  '流鼻涕': /流鼻涕|鼻涕/u,
  '腹泻': /腹泻|拉肚子/u,
  '肺炎': /肺炎/u,
  '焦虑': /焦虑|急死/u,
  '辱骂': /辱骂|妈的/u
}

function factSearchText(fact) {
  return [fact?.name, fact?.concept, fact?.target, fact?.bodyPart, fact?.bodyRegion].filter(Boolean).join(' ')
}

function hasName(fact, expectedName) {
  const pattern = namePatterns[expectedName] || new RegExp(expectedName, 'u')
  return pattern.test(factSearchText(fact))
}

function includesNormalized(actual, expected) {
  if (actual === undefined || actual === null) return false
  const a = String(actual).toLowerCase().replaceAll(/\s+/g, '')
  const e = String(expected).toLowerCase().replaceAll(/\s+/g, '')
  if (a.includes(e) || e.includes(a)) return true
  const aliases = {
    '腹部': /腹|肚/u,
    '小腿': /小腿|腿/u,
    '肩': /肩/u,
    '咽喉': /咽|喉|嗓/u,
    '胳膊': /胳膊|手臂|上肢/u,
    '右下腹': /右下腹/u,
    '肚脐周围': /肚脐|脐周/u,
    '2小时': /2小时|两个小时|PT2H/i,
    '3天': /3天|三天|P3D/i,
    'occasional': /occasional|偶尔/u,
    'frequent': /frequent|频繁/u,
    '晚上': /晚上|夜间|每天晚上/u,
    '每天晚上': /每天晚上|夜间/u,
    '白天': /白天/u,
    '跑步': /跑步|运动/u,
    '不跑': /不跑|静息/u,
    '几分钟': /几分钟/u
  }
  return aliases[expected]?.test(String(actual)) || false
}

function factTime(fact) {
  const raw = fact?.time?.raw || ''
  const resolved = fact?.time?.resolvedStart || null
  const date = resolved ? new Date(resolved) : null
  return { raw, resolved, date: date && !Number.isNaN(date.getTime()) ? date : null }
}

function matchExpectedFact(actual, expected, context) {
  const missing = []
  const temperatureLabelMatches = expected.type === 'temperature'
    && expected.name === '体温'
    && actual?.type === 'temperature'
  const statusChangeLabelMatches = expected.type === 'status_change'
    && actual?.type === 'status_change'
    && (!expected.change || actual?.change === expected.change)
    && (!expected.target || includesNormalized(actual?.target, expected.target))
  if (expected.name && !temperatureLabelMatches && !statusChangeLabelMatches && !hasName(actual, expected.name)) missing.push(`实体:${expected.name}`)
  if (expected.type && actual?.type !== expected.type) missing.push(`类型:${expected.type}`)
  if (expected.polarity && actual?.polarity !== expected.polarity) missing.push(`极性:${expected.polarity}`)
  if (expected.status && actual?.status !== expected.status && actual?.change !== expected.status) missing.push(`状态:${expected.status}`)
  if (expected.change && actual?.change !== expected.change) missing.push(`变化:${expected.change}`)
  if (expected.target && !includesNormalized(actual?.target, expected.target)) missing.push(`目标:${expected.target}`)
  if (expected.bodyPart && !includesNormalized(actual?.bodyPart || actual?.bodyRegion, expected.bodyPart)) missing.push(`部位:${expected.bodyPart}`)
  if (expected.laterality && !includesNormalized(actual?.laterality, expected.laterality)) missing.push(`侧别:${expected.laterality}`)
  if (expected.severity && actual?.severity !== expected.severity) missing.push(`程度:${expected.severity}`)
  if (expected.severityScale && !includesNormalized(actual?.severityScale, expected.severityScale)) missing.push(`评分:${expected.severityScale}`)
  if (expected.frequency && !includesNormalized(actual?.frequency, expected.frequency)) missing.push(`频率:${expected.frequency}`)
  if (expected.occurrenceCount !== undefined && Number(actual?.occurrenceCount ?? actual?.count) !== expected.occurrenceCount) missing.push(`次数:${expected.occurrenceCount}`)
  if (expected.duration && !includesNormalized(actual?.duration, expected.duration)) missing.push(`持续:${expected.duration}`)
  if (expected.temperatureMin !== undefined) {
    const min = Number(actual?.temperature?.min ?? actual?.value)
    if (Math.abs(min - expected.temperatureMin) > 0.001) missing.push(`温度下界:${expected.temperatureMin}`)
  }
  if (expected.temperatureMax !== undefined) {
    const max = Number(actual?.temperature?.max ?? actual?.value)
    if (Math.abs(max - expected.temperatureMax) > 0.001) missing.push(`温度上界:${expected.temperatureMax}`)
  }
  const { raw, date } = factTime(actual)
  if (expected.timeRaw && !includesNormalized(raw, expected.timeRaw)) missing.push(`原始时间:${expected.timeRaw}`)
  if (expected.timePrecision && actual?.time?.precision !== expected.timePrecision) missing.push(`时间精度:${expected.timePrecision}`)
  if (expected.resolvedDate) {
    const local = date ? new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date) : ''
    if (local !== expected.resolvedDate) missing.push(`解析日期:${expected.resolvedDate}`)
  }
  if (expected.resolvedHour !== undefined) {
    const hour = date ? Number(new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: '2-digit', hourCycle: 'h23' }).format(date)) : NaN
    if (hour !== expected.resolvedHour) missing.push(`解析小时:${expected.resolvedHour}`)
  }
  if (expected.resolvedMinute !== undefined) {
    const minute = date ? Number(new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, minute: '2-digit' }).format(date)) : NaN
    if (minute !== expected.resolvedMinute) missing.push(`解析分钟:${expected.resolvedMinute}`)
  }
  if (expected.resolvedNearNowMinutes !== undefined) {
    const distance = date ? Math.abs(context.referenceNow - date.getTime()) / 60_000 : Infinity
    if (distance > expected.resolvedNearNowMinutes) missing.push(`时间距提交:${expected.resolvedNearNowMinutes}分钟内`)
  }
  if (expected.relation && !(actual?.supersedesFactId || actual?.revisionOfFactId || actual?.targetFactId)) missing.push('纠正关系')
  if (expected.current === true && ['corrected', 'superseded'].includes(actual?.status)) missing.push('当前有效事实')
  if (expected.subjectText && !includesNormalized(actual?.subjectText, expected.subjectText)) missing.push(`主体文本:${expected.subjectText}`)
  if (context.memberId && actual?.subjectMemberId !== context.memberId) missing.push(`人物:${context.memberAlias}`)
  return { matches: missing.length === 0, missing }
}

function bestFactMatch(actualFacts, expected, used, context) {
  let best = null
  for (let index = 0; index < actualFacts.length; index += 1) {
    if (used.has(index)) continue
    const result = matchExpectedFact(actualFacts[index], expected, context)
    if (!best || result.missing.length < best.result.missing.length) best = { index, fact: actualFacts[index], result }
    if (result.matches) break
  }
  if (best?.result.matches) used.add(best.index)
  return best
}

function forbiddenPresent(actualFacts, forbidden, context) {
  return (forbidden || []).flatMap((spec) => actualFacts
    .map((fact, index) => ({ fact, index, result: matchExpectedFact(fact, spec, { ...context, memberId: null }) }))
    .filter((item) => item.result.matches))
}

function evaluateFacts(actualFacts, expectation, context) {
  const facts = actualFacts || []
  const used = new Set()
  const expectedMatches = (expectation.facts || []).map((expected) => ({ expected, best: bestFactMatch(facts, expected, used, context) }))
  const missing = expectedMatches.filter((item) => !item.best?.result.matches).map((item) => ({ expected: item.expected, closestMissing: item.best?.result.missing || ['无实际事实'] }))
  const forbidden = forbiddenPresent(facts, expectation.forbidden, context)
  const countOk = facts.length >= expectation.minFacts && facts.length <= expectation.maxFacts
  const subjectOk = facts.every((fact) => !fact.subjectMemberId || fact.subjectMemberId === context.memberId)
  return { countOk, subjectOk, missing, forbidden, pass: countOk && subjectOk && !missing.length && !forbidden.length }
}

function expectedUiTokens(expectation) {
  const tokens = []
  for (const fact of expectation.facts || []) {
    if (fact.name && !['疼痛', '体温纠正', '症状未加重', '持续咳嗽'].includes(fact.name)) tokens.push(fact.name.replace(/改善|消失|持续|复发|加重|未变|未加重|纠正/u, ''))
    if (fact.bodyPart) tokens.push(fact.bodyPart)
    if (fact.laterality === 'left') tokens.push('左')
    if (fact.laterality === 'right') tokens.push('右')
    if (fact.occurrenceCount) tokens.push(String(fact.occurrenceCount))
    if (fact.temperatureMin !== undefined) tokens.push(String(fact.temperatureMin))
    if (fact.severityScale) tokens.push(String(fact.severityScale))
  }
  return [...new Set(tokens.filter(Boolean))]
}

function uiContainsTokens(text, expectation) {
  const missing = expectedUiTokens(expectation).filter((token) => !String(text || '').includes(token))
  const forbidden = (expectation.uiForbid || []).filter((token) => String(text || '').includes(token))
  return { pass: missing.length === 0 && forbidden.length === 0, missing, forbidden }
}

async function api(context, token, method, route, body) {
  const response = await context.request.fetch(`${BASE_URL}${route}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-hoooho-timezone': TIME_ZONE
    },
    data: body
  })
  const payload = await responseBody(response)
  if (!response.ok()) {
    const error = new Error(payload?.error?.message || `${response.status()} ${response.statusText()}`)
    error.status = response.status()
    error.body = payload
    throw error
  }
  return { response, body: payload }
}

async function ensureMembers(context, secrets) {
  if (secrets.members?.child?.id && secrets.members?.self?.id && secrets.members?.senior?.id) return secrets.members
  const { body: self } = await api(context, secrets.token, 'POST', '/api/members/self', {
    name: '测试成人B', birthday: '1990-01-01', gender: 'female', avatar: 'avatar-female-2'
  })
  const { body: child } = await api(context, secrets.token, 'POST', '/api/members', {
    name: '测试宝宝A', relationship: 'child', birthday: '2023-01-01', gender: 'female', avatar: 'avatar-female-1'
  })
  const { body: senior } = await api(context, secrets.token, 'POST', '/api/members', {
    name: '测试老人C', relationship: 'parent', birthday: '1950-01-01', gender: 'female', avatar: 'avatar-female-3'
  })
  secrets.members = { child, self, senior }
  await writeJson(SECRETS_PATH, secrets)
  return secrets.members
}

async function ensureEvent(context, secrets, testCase) {
  if (secrets.events?.[testCase.id]?.id) return secrets.events[testCase.id]
  const member = secrets.members[testCase.member]
  const occurredAt = new Date(Date.now() - 60_000).toISOString()
  const { body: event } = await api(context, secrets.token, 'POST', '/api/events', {
    memberId: member.id,
    title: `独立验收 ${testCase.id}`,
    category: 'other',
    startTime: occurredAt
  })
  const { body: fixture } = await api(context, secrets.token, 'POST', `/api/events/${encodeURIComponent(event.id)}/records`, {
    type: 'other',
    content: '[fixture-only]',
    occurredAt,
    sourceType: 'other',
    sourceText: '[fixture-only]',
    note: 'independent-acceptance-fixture'
  })
  secrets.events[testCase.id] = { ...event, fixtureRecordId: fixture.id }
  await writeJson(SECRETS_PATH, secrets)
  return secrets.events[testCase.id]
}

async function waitForEventPage(page) {
  await page.waitForLoadState('domcontentloaded')
  await page.getByRole('button', { name: '快捷记录', exact: true }).waitFor({ state: 'visible', timeout: 30_000 })
  await sleep(250)
}

async function openTextEntry(page) {
  await page.getByRole('button', { name: '快捷记录', exact: true }).click()
  const textarea = page.getByRole('textbox', { name: '快捷记录文字' })
  if (!await textarea.isVisible().catch(() => false)) {
    const switcher = page.getByRole('button', { name: '改用文字记录' })
    await switcher.waitFor({ state: 'visible', timeout: 10_000 })
    await switcher.click()
  }
  await textarea.waitFor({ state: 'visible', timeout: 10_000 })
  return textarea
}

async function screenshot(page, filePath) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await page.screenshot({ path: filePath, fullPage: true, animations: 'disabled' })
}

function stepEvidencePath(testCase, stepIndex, suffix) {
  return path.join(EVIDENCE_ROOT, testCase.id, `${testCase.id}-step-${String(stepIndex + 1).padStart(2, '0')}-${suffix}.png`)
}

async function listEventState(context, secrets, event) {
  const [{ body: records }, { body: organizations }] = await Promise.all([
    api(context, secrets.token, 'GET', `/api/events/${encodeURIComponent(event.id)}/records`),
    api(context, secrets.token, 'GET', `/api/events/${encodeURIComponent(event.id)}/organizations`)
  ])
  return { records, organizations }
}

function nonFixtureRecords(state, event) {
  return (state.records || []).filter((record) => record.id !== event.fixtureRecordId)
}

function nonFixtureOrganizations(state, event) {
  return (state.organizations || []).filter((organization) => organization.recordId !== event.fixtureRecordId)
}

function latestOrganization(state, event) {
  return nonFixtureOrganizations(state, event).at(-1) || null
}

async function performNormalConfirm({ page, context, secrets, testCase, stepIndex, preview, interaction }) {
  const button = page.getByRole('button', { name: '确认记录' })
  const requestPromise = page.waitForRequest((request) => request.url().endsWith('/organizations/confirm') && request.method() === 'POST', { timeout: 30_000 })
  const responsePromise = page.waitForResponse((response) => response.url().endsWith('/organizations/confirm') && response.request().method() === 'POST', { timeout: 30_000 })
  if (interaction === 'idempotency') await button.dblclick({ delay: 20 })
  else await button.click()
  const [request, response] = await Promise.all([requestPromise, responsePromise])
  const confirmRequest = request.postDataJSON()
  const confirmBody = await responseBody(response)
  await page.getByText(/已记录|已整理为/u).first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
  await screenshot(page, stepEvidencePath(testCase, stepIndex, 'confirm'))
  let idempotencyRetry = null
  if (interaction === 'idempotency' && confirmRequest?.previewId) {
    const before = await listEventState(context, secrets, secrets.events[testCase.id])
    const retry = await api(context, secrets.token, 'POST', `/api/events/${encodeURIComponent(secrets.events[testCase.id].id)}/organizations/confirm`, confirmRequest)
    const after = await listEventState(context, secrets, secrets.events[testCase.id])
    idempotencyRetry = {
      response: retry.body,
      recordCountBefore: nonFixtureRecords(before, secrets.events[testCase.id]).length,
      recordCountAfter: nonFixtureRecords(after, secrets.events[testCase.id]).length,
      organizationCountBefore: nonFixtureOrganizations(before, secrets.events[testCase.id]).length,
      organizationCountAfter: nonFixtureOrganizations(after, secrets.events[testCase.id]).length
    }
  }
  return { status: response.status(), request: confirmRequest, body: confirmBody, idempotencyRetry }
}

async function performOfflineConfirm({ page, context, secrets, testCase, stepIndex, event }) {
  const before = await listEventState(context, secrets, event)
  await context.setOffline(true)
  await page.getByRole('button', { name: '确认记录' }).click()
  const alert = page.getByRole('alert')
  await alert.waitFor({ state: 'visible', timeout: 15_000 })
  const errorText = await alert.innerText()
  await screenshot(page, stepEvidencePath(testCase, stepIndex, 'offline-error'))
  await context.setOffline(false)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForEventPage(page)
  const afterOffline = await listEventState(context, secrets, event)
  await screenshot(page, stepEvidencePath(testCase, stepIndex, 'offline-refresh'))
  const textarea = await openTextEntry(page)
  await textarea.fill(testCase.executionSteps[stepIndex])
  const previewResponsePromise = page.waitForResponse((response) => response.url().endsWith('/organizations/preview') && response.request().method() === 'POST', { timeout: 30_000 })
  await page.getByRole('button', { name: '自动整理' }).click()
  const previewResponse = await previewResponsePromise
  const previewBody = await responseBody(previewResponse)
  await page.getByRole('button', { name: '确认记录' }).waitFor({ state: 'visible', timeout: 15_000 })
  const confirm = await performNormalConfirm({ page, context, secrets, testCase, stepIndex, preview: previewBody })
  return {
    errorText,
    beforeRecordCount: nonFixtureRecords(before, event).length,
    afterOfflineRecordCount: nonFixtureRecords(afterOffline, event).length,
    beforeOrganizationCount: nonFixtureOrganizations(before, event).length,
    afterOfflineOrganizationCount: nonFixtureOrganizations(afterOffline, event).length,
    retryPreview: previewBody,
    retryConfirm: confirm
  }
}

async function runStep({ page, context, secrets, testCase, event, stepIndex, aliases }) {
  const executionText = testCase.executionSteps[stepIndex]
  const expected = testCase.expectedSteps[stepIndex]
  const referenceNow = Date.now()
  await page.goto(`${BASE_URL}/health-events/${encodeURIComponent(event.id)}`, { waitUntil: 'domcontentloaded' })
  await waitForEventPage(page)
  const fixedClientTime = new Date(Date.now() - 5_000)
  await page.clock.setFixedTime(fixedClientTime)
  const beforeState = await listEventState(context, secrets, event)
  await screenshot(page, stepEvidencePath(testCase, stepIndex, 'before-input'))
  const textarea = await openTextEntry(page)
  await textarea.fill(executionText)
  await screenshot(page, stepEvidencePath(testCase, stepIndex, 'input'))
  const previewRequestPromise = page.waitForRequest((request) => request.url().endsWith('/organizations/preview') && request.method() === 'POST', { timeout: 30_000 })
  const previewResponsePromise = page.waitForResponse((response) => response.url().endsWith('/organizations/preview') && response.request().method() === 'POST', { timeout: 30_000 })
  await page.getByRole('button', { name: '自动整理' }).click()
  const [previewRequest, previewResponse] = await Promise.all([previewRequestPromise, previewResponsePromise])
  const previewRequestBody = previewRequest.postDataJSON()
  const previewBody = await responseBody(previewResponse)
  await sleep(120)
  const previewUiText = await page.locator('body').innerText()
  await screenshot(page, stepEvidencePath(testCase, stepIndex, 'preview'))
  const previewFacts = previewBody?.healthAIOutput?.facts || []
  const member = secrets.members[testCase.member]
  const contextInfo = { memberId: member.id, memberAlias: `member-${testCase.member}`, referenceNow }
  const previewEvaluation = evaluateFacts(previewFacts, expected, contextInfo)
  const previewUiEvaluation = expected.reject ? { pass: true, missing: [] } : uiContainsTokens(previewUiText, expected)
  const safetyGate = testCase.safetyGate || (testCase.safetyGateSteps || []).includes(stepIndex)
  const hasPreviewId = Boolean(previewBody?.previewId)
  let confirm = null
  let offline = null
  let skippedConfirmReason = null
  if (testCase.interaction === 'offline' && hasPreviewId && previewFacts.length) {
    offline = await performOfflineConfirm({ page, context, secrets, testCase, stepIndex, event })
    confirm = offline.retryConfirm
  } else if (hasPreviewId && previewFacts.length && !safetyGate) {
    confirm = await performNormalConfirm({ page, context, secrets, testCase, stepIndex, preview: previewBody, interaction: testCase.interaction })
  } else {
    skippedConfirmReason = safetyGate ? '安全门禁用例不确认错误阳性预览' : '无可确认 previewId 或事实'
  }
  if (confirm) await sleep(650)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForEventPage(page)
  const afterState = await listEventState(context, secrets, event)
  const refreshUiText = await page.locator('body').innerText()
  await screenshot(page, stepEvidencePath(testCase, stepIndex, 'refresh'))
  const afterRecords = nonFixtureRecords(afterState, event)
  const afterOrganizations = nonFixtureOrganizations(afterState, event)
  const beforeRecordCount = nonFixtureRecords(beforeState, event).length
  const beforeOrganizationCount = nonFixtureOrganizations(beforeState, event).length
  const savedOrganization = confirm?.body?.organization || null
  const refreshedOrganization = savedOrganization
    ? afterOrganizations.find((organization) => organization.previewId === previewBody?.previewId || organization.id === savedOrganization.id)
    : latestOrganization(afterState, event)
  const confirmFacts = savedOrganization?.healthAIOutput?.facts || []
  const refreshFacts = refreshedOrganization?.healthAIOutput?.facts || []
  const confirmEvaluation = confirm ? evaluateFacts(confirmFacts, expected, contextInfo) : null
  const refreshEvaluation = confirm ? evaluateFacts(refreshFacts, expected, contextInfo) : null
  const refreshUiEvaluation = expected.reject ? { pass: true, missing: [] } : uiContainsTokens(refreshUiText, expected)
  const createdRecords = afterRecords.length - beforeRecordCount
  const createdOrganizations = afterOrganizations.length - beforeOrganizationCount
  const rejectPass = expected.reject
    && previewFacts.length === 0
    && !hasPreviewId
    && createdRecords === 0
    && createdOrganizations === 0
  const consistency = confirm ? {
    previewConfirm: sameFacts(previewFacts, confirmFacts),
    confirmRefresh: sameFacts(confirmFacts, refreshFacts),
    previewRefresh: sameFacts(previewFacts, refreshFacts)
  } : null
  const idempotencyPass = testCase.interaction !== 'idempotency' || (
    confirm?.idempotencyRetry?.response?.idempotent === true
    && confirm.idempotencyRetry.recordCountBefore === confirm.idempotencyRetry.recordCountAfter
    && confirm.idempotencyRetry.organizationCountBefore === confirm.idempotencyRetry.organizationCountAfter
  )
  const offlinePass = testCase.interaction !== 'offline' || (
    offline
    && /网络连接失败/u.test(offline.errorText)
    && !/Failed to fetch/i.test(offline.errorText)
    && offline.beforeRecordCount === offline.afterOfflineRecordCount
    && offline.beforeOrganizationCount === offline.afterOfflineOrganizationCount
  )
  const positivePass = !expected.reject
    && previewResponse.ok()
    && hasPreviewId
    && previewEvaluation.pass
    && previewUiEvaluation.pass
    && Boolean(confirm)
    && confirm?.status === 201
    && confirmEvaluation?.pass
    && refreshEvaluation?.pass
    && refreshUiEvaluation.pass
    && createdRecords === 1
    && createdOrganizations === 1
    && Object.values(consistency || {}).every(Boolean)
    && idempotencyPass
    && offlinePass
  const result = {
    caseId: testCase.id,
    step: stepIndex + 1,
    originalInput: testCase.originalSteps[Math.min(stepIndex, testCase.originalSteps.length - 1)],
    executionInput: executionText,
    expectation: expected,
    member: { id: member.id, name: member.name, kind: testCase.member },
    referenceNow: new Date(referenceNow).toISOString(),
    clock: {
      policy: '浏览器 Date 固定为执行机 UTC 当前时间前 5 秒；服务端时钟保持真实时间',
      fixedClientTime: fixedClientTime.toISOString(),
      selectedOccurredAt: previewRequestBody?.selectedOccurredAt || null,
      serverDate: previewResponse.headers()?.date || null
    },
    preview: { status: previewResponse.status(), request: previewRequestBody, body: previewBody, uiText: previewUiText, evaluation: previewEvaluation, uiEvaluation: previewUiEvaluation },
    confirm,
    offline,
    refresh: {
      records: afterRecords,
      organizations: afterOrganizations,
      uiText: refreshUiText,
      evaluation: refreshEvaluation,
      uiEvaluation: refreshUiEvaluation
    },
    counts: { beforeRecords: beforeRecordCount, afterRecords: afterRecords.length, createdRecords, beforeOrganizations: beforeOrganizationCount, afterOrganizations: afterOrganizations.length, createdOrganizations },
    consistency,
    skippedConfirmReason,
    pass: expected.reject ? rejectPass : positivePass,
    evidence: {
      beforeInput: path.relative(ROOT, stepEvidencePath(testCase, stepIndex, 'before-input')).replaceAll('\\', '/'),
      input: path.relative(ROOT, stepEvidencePath(testCase, stepIndex, 'input')).replaceAll('\\', '/'),
      preview: path.relative(ROOT, stepEvidencePath(testCase, stepIndex, 'preview')).replaceAll('\\', '/'),
      refresh: path.relative(ROOT, stepEvidencePath(testCase, stepIndex, 'refresh')).replaceAll('\\', '/')
    }
  }
  return sanitize(result, aliases, secrets.identifier)
}

async function runCase(runtime, testCase) {
  const { context, page, secrets } = runtime
  const event = await ensureEvent(context, secrets, testCase)
  const aliases = createAliasRegistry(secrets)
  const caseResult = {
    id: testCase.id,
    member: { kind: testCase.member, name: secrets.members[testCase.member].name },
    expectation: testCase.expectation,
    originalSteps: testCase.originalSteps,
    executionSteps: testCase.executionSteps,
    startedAt: nowIso(),
    steps: []
  }
  for (let stepIndex = 0; stepIndex < testCase.executionSteps.length; stepIndex += 1) {
    caseResult.steps.push(await runStep({ page, context, secrets, testCase, event, stepIndex, aliases }))
    await writeJson(path.join(EVIDENCE_ROOT, testCase.id, `${testCase.id}-result.json`), caseResult)
  }
  caseResult.endedAt = nowIso()
  caseResult.pass = caseResult.steps.every((item) => item.pass)
  await writeJson(path.join(EVIDENCE_ROOT, testCase.id, `${testCase.id}-result.json`), caseResult)
  return caseResult
}

async function collectBaseline() {
  const [healthResponse, rootResponse] = await Promise.all([fetch(`${BASE_URL}/api/health`), fetch(`${BASE_URL}/`)])
  const healthBody = await healthResponse.text()
  const rootBody = await rootResponse.text()
  return {
    collectedAt: nowIso(),
    baseUrl: BASE_URL,
    health: { status: healthResponse.status, body: healthBody },
    root: {
      status: rootResponse.status,
      assets: [...rootBody.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((match) => match[1])
    }
  }
}

async function reevaluateSavedResults() {
  const summary = await readJsonIfExists(RESULTS_PATH)
  if (!summary?.results?.length) throw new Error(`没有可重算的结果：${RESULTS_PATH}`)
  for (const caseResult of summary.results) {
    const currentCase = [...independentSymptomTrackingCases, futureOccurrenceCase].find((item) => item.id === caseResult.id)
    if (!currentCase) throw new Error(`结果中存在未知用例：${caseResult.id}`)
    caseResult.expectation = currentCase.expectation
    for (let stepIndex = 0; stepIndex < caseResult.steps.length; stepIndex += 1) {
      const step = caseResult.steps[stepIndex]
      const expected = currentCase.expectedSteps[stepIndex]
      step.expectation = expected
      const contextInfo = {
        memberId: step.member.id,
        memberAlias: `member-${step.member.kind}`,
        referenceNow: new Date(step.referenceNow).getTime()
      }
      const previewFacts = step.preview?.body?.healthAIOutput?.facts || []
      const confirmFacts = step.confirm?.body?.organization?.healthAIOutput?.facts || []
      const previewId = step.preview?.body?.previewId || null
      const refreshedOrganization = (step.refresh?.organizations || []).find((organization) => (
        organization.previewId === previewId || organization.id === step.confirm?.body?.organization?.id
      )) || null
      const refreshFacts = refreshedOrganization?.healthAIOutput?.facts || []
      step.preview.evaluation = evaluateFacts(previewFacts, expected, contextInfo)
      step.preview.uiEvaluation = expected.reject ? { pass: true, missing: [] } : uiContainsTokens(step.preview.uiText, expected)
      step.refresh.evaluation = step.confirm ? evaluateFacts(refreshFacts, expected, contextInfo) : null
      step.refresh.uiEvaluation = expected.reject ? { pass: true, missing: [] } : uiContainsTokens(step.refresh.uiText, expected)
      const rejectPass = expected.reject
        && previewFacts.length === 0
        && !previewId
        && step.counts.createdRecords === 0
        && step.counts.createdOrganizations === 0
      const idempotencyPass = caseResult.id !== 'UI-01' || (
        step.confirm?.idempotencyRetry?.response?.idempotent === true
        && step.confirm.idempotencyRetry.recordCountBefore === step.confirm.idempotencyRetry.recordCountAfter
        && step.confirm.idempotencyRetry.organizationCountBefore === step.confirm.idempotencyRetry.organizationCountAfter
      )
      const offlinePass = caseResult.id !== 'UI-06' || (
        step.offline
        && /网络连接失败/u.test(step.offline.errorText)
        && !/Failed to fetch/i.test(step.offline.errorText)
        && step.offline.beforeRecordCount === step.offline.afterOfflineRecordCount
        && step.offline.beforeOrganizationCount === step.offline.afterOfflineOrganizationCount
      )
      const positivePass = !expected.reject
        && step.preview.status >= 200
        && step.preview.status < 300
        && Boolean(previewId)
        && step.preview.evaluation.pass
        && step.preview.uiEvaluation.pass
        && Boolean(step.confirm)
        && step.confirm.status === 201
        && evaluateFacts(confirmFacts, expected, contextInfo).pass
        && step.refresh.evaluation?.pass
        && step.refresh.uiEvaluation.pass
        && step.counts.createdRecords === 1
        && step.counts.createdOrganizations === 1
        && Object.values(step.consistency || {}).every(Boolean)
        && idempotencyPass
        && offlinePass
      step.pass = expected.reject ? rejectPass : positivePass
    }
    caseResult.pass = caseResult.steps.every((step) => step.pass)
    await writeJson(path.join(EVIDENCE_ROOT, caseResult.id, `${caseResult.id}-result.json`), caseResult)
  }
  const officialResults = summary.results.filter((item) => independentSymptomTrackingCases.some((testCase) => testCase.id === item.id))
  summary.totals = {
    officialCases: officialResults.length,
    passed: officialResults.filter((item) => item.pass).length,
    failed: officialResults.filter((item) => !item.pass).length,
    strictPassRate: officialResults.length ? officialResults.filter((item) => item.pass).length / officialResults.length : 0
  }
  summary.reevaluatedAt = nowIso()
  summary.reevaluationReason = '温度事实使用数值概念名，预期“体温”按 temperature 类型匹配；所有数值、极性、时间与其他字段仍严格检查。'
  await writeJson(RESULTS_PATH, summary)
  console.log(JSON.stringify({ ok: true, totals: summary.totals }))
}

async function runProductionReadonly() {
  if (!existsSync(path.join(PLAYWRIGHT_ROOT, 'index.mjs'))) throw new Error(`Playwright Core 不存在：${PLAYWRIGHT_ROOT}`)
  if (!existsSync(CHROME_PATH)) throw new Error(`Chrome 不存在：${CHROME_PATH}`)
  await mkdir(path.join(EVIDENCE_ROOT, 'production-readonly'), { recursive: true })
  const playwright = await import(pathToFileURL(path.join(PLAYWRIGHT_ROOT, 'index.mjs')).href)
  const browser = await playwright.chromium.launch({ executablePath: CHROME_PATH, headless: true })
  const context = await browser.newContext({
    viewport: VIEWPORT,
    screen: VIEWPORT,
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    locale: 'zh-CN',
    timezoneId: TIME_ZONE,
    serviceWorkers: 'block'
  })
  const page = await context.newPage()
  const requests = []
  const blockedNonGetRequests = []
  await context.route('**/*', async (route) => {
    if (route.request().method() !== 'GET') {
      blockedNonGetRequests.push({ method: route.request().method(), url: route.request().url() })
      await route.abort('blockedbyclient')
    } else {
      await route.continue()
    }
  })
  page.on('request', (request) => requests.push({ method: request.method(), url: request.url() }))
  try {
    const health = await context.request.get(`${PRODUCTION_URL}/api/health`)
    const healthBody = await responseBody(health)
    const home = await page.goto(PRODUCTION_URL, { waitUntil: 'networkidle', timeout: 45_000 })
    await screenshot(page, path.join(EVIDENCE_ROOT, 'production-readonly', 'home.png'))
    const homeResult = { status: home?.status() || null, finalUrl: page.url(), title: await page.title(), bodyText: (await page.locator('body').innerText()).slice(0, 1_000) }
    const route = await page.goto(`${PRODUCTION_URL}/health-events/read-only-route-probe`, { waitUntil: 'networkidle', timeout: 45_000 })
    await screenshot(page, path.join(EVIDENCE_ROOT, 'production-readonly', 'health-event-route.png'))
    const routeResult = { status: route?.status() || null, finalUrl: page.url(), title: await page.title(), bodyText: (await page.locator('body').innerText()).slice(0, 1_000) }
    const result = {
      checkedAt: nowIso(),
      productionUrl: PRODUCTION_URL,
      health: { status: health.status(), body: healthBody },
      home: homeResult,
      healthEventRoute: routeResult,
      network: {
        requestCount: requests.length,
        observedNonGetRequests: requests.filter((request) => request.method !== 'GET'),
        blockedNonGetRequests
      },
      browser: { version: browser.version(), viewport: VIEWPORT, timezone: TIME_ZONE, authenticated: false }
    }
    await writeJson(path.join(EVIDENCE_ROOT, 'production-readonly', 'result.json'), result)
    console.log(JSON.stringify(result))
  } finally {
    await browser.close()
  }
}

async function main() {
  const dataset = validateExpectationDataset()
  if (args.has('--self-check')) {
    console.log(JSON.stringify({ ok: true, dataset, evidenceRoot: EVIDENCE_ROOT }))
    return
  }
  if (args.has('--reevaluate')) {
    await reevaluateSavedResults()
    return
  }
  if (args.has('--production-readonly')) {
    await runProductionReadonly()
    return
  }
  if (!existsSync(path.join(PLAYWRIGHT_ROOT, 'index.mjs'))) throw new Error(`Playwright Core 不存在：${PLAYWRIGHT_ROOT}`)
  if (!existsSync(CHROME_PATH)) throw new Error(`Chrome 不存在：${CHROME_PATH}`)
  if (!resume && (existsSync(SECRETS_PATH) || existsSync(CHECKPOINT_PATH))) {
    throw new Error('已有验收会话；使用 --resume 继续，或人工选择新的隔离证据目录。')
  }
  await mkdir(EVIDENCE_ROOT, { recursive: true })
  let secrets = await readJsonIfExists(SECRETS_PATH)
  if (!secrets) {
    secrets = await createStagingSession()
    await writeJson(SECRETS_PATH, secrets)
  }
  const playwright = await import(pathToFileURL(path.join(PLAYWRIGHT_ROOT, 'index.mjs')).href)
  const browser = await playwright.chromium.launch({ executablePath: CHROME_PATH, headless: true })
  const context = await browser.newContext({
    viewport: VIEWPORT,
    screen: VIEWPORT,
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    locale: 'zh-CN',
    timezoneId: TIME_ZONE,
    serviceWorkers: 'block',
    userAgent: `Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/${browser.version()} Mobile/15E148 Safari/604.1`
  })
  await context.route('**/*', async (route) => {
    if (route.request().resourceType() === 'media') await route.abort()
    else await route.continue()
  })
  await ensureMembers(context, secrets)
  await context.addInitScript(({ token, user, selfId }) => {
    localStorage.setItem('hoooho-app', JSON.stringify({
      state: {
        authToken: token,
        authUser: user,
        currentMemberId: selfId,
        members: [],
        profile: null
      },
      version: 3
    }))
  }, { token: secrets.token, user: secrets.user, selfId: secrets.members.self.id })
  const page = await context.newPage()
  const checkpoint = await readJsonIfExists(CHECKPOINT_PATH, { completedCases: [], results: [] })
  const baseline = checkpoint.baseline || await collectBaseline()
  checkpoint.baseline = baseline
  checkpoint.browser = {
    name: 'Google Chrome via Playwright Core',
    version: browser.version(),
    executable: CHROME_PATH,
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    orientation: 'portrait',
    timezone: TIME_ZONE,
    userAgent: await page.evaluate(() => navigator.userAgent)
  }
  checkpoint.account = { alias: 'account-acceptance', identifier: maskPhone(secrets.identifier), authChannel: secrets.authChannel }
  checkpoint.members = Object.fromEntries(Object.entries(secrets.members).map(([kind, member]) => [kind, { alias: `member-${kind}`, name: member.name }]))
  checkpoint.startedAt ||= nowIso()
  const allCases = includeFuture ? [...independentSymptomTrackingCases, futureOccurrenceCase] : independentSymptomTrackingCases
  const selectedCases = requestedCase ? allCases.filter((item) => item.id === requestedCase) : allCases
  if (requestedCase && !selectedCases.length) throw new Error(`未知用例：${requestedCase}`)
  try {
    for (const testCase of selectedCases) {
      if (checkpoint.completedCases.includes(testCase.id) && !rerun) continue
      const result = await runCase({ browser, context, page, secrets }, testCase)
      checkpoint.results = checkpoint.results.filter((item) => item.id !== testCase.id).concat(result)
      checkpoint.completedCases = checkpoint.completedCases.filter((id) => id !== testCase.id).concat(testCase.id)
      checkpoint.lastCompletedAt = nowIso()
      await writeJson(CHECKPOINT_PATH, checkpoint)
      console.log(JSON.stringify({ caseId: testCase.id, pass: result.pass, completed: checkpoint.completedCases.length }))
    }
    checkpoint.endedAt = nowIso()
    const officialResults = checkpoint.results.filter((item) => independentSymptomTrackingCases.some((testCase) => testCase.id === item.id))
    const summary = {
      ...checkpoint,
      totals: {
        officialCases: officialResults.length,
        passed: officialResults.filter((item) => item.pass).length,
        failed: officialResults.filter((item) => !item.pass).length,
        strictPassRate: officialResults.length ? officialResults.filter((item) => item.pass).length / officialResults.length : 0
      }
    }
    await writeJson(RESULTS_PATH, summary)
  } finally {
    await context.setOffline(false).catch(() => {})
    await browser.close()
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message, status: error.status || null, body: error.body || null }))
  process.exitCode = 1
})
