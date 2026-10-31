import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { JsonStore } from '../auth/storage/json-store.mjs'
import { withStorageLock } from '../auth/storage/transaction.mjs'
import { validateRasterImage } from '../image-validation.mjs'
import { billingHealth, cleanBillingFacts, billingFieldRows, DEFAULT_REMINDERS } from './billing-health.mjs'
import { billingDefinition, isBillingCategory, isBillingMode } from '../../shared/ops-billing-catalog.mjs'
import { isOpsProject, opsProjectId } from '../../shared/ops-projects.mjs'

export const OPS_SNAPSHOT_MAX_BYTES = 12 * 1024 * 1024
export const OPS_SNAPSHOT_REQUEST_MAX_LENGTH = 17_000_000

const METHODS = new Set(['api', 'automatic-screenshot', 'manual-screenshot'])
const FREQUENCIES = new Set(['daily', 'weekly', 'manual'])
const IMAGE_TYPES = new Map([['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp']])
const inactiveSources = ['SMS', 'OCR', 'Vector DB', 'Maps', 'Google Play', '其他尚未启用的平台']
const iso = (value = new Date()) => value.toISOString()
const cleanText = (value, max = 500) => String(value ?? '').trim().slice(0, max)
const nullableText = (value, max = 500) => cleanText(value, max) || null

const source = (id, name, icon, platformUrl, method, frequency, notes, status = 'unconfigured') => ({
  id, name, icon, platformUrl, method, frequency, notes, status, enabled: true,
  loginUrl: null, targetDescription: null, targetSelector: null, waitCondition: null,
  lastAttemptAt: null, lastSuccessAt: null, lastFailureReason: null, latestSnapshotId: null,
  createdAt: iso(), updatedAt: iso()
})

export const initialBillingSources = [
  source('aliyun', '阿里云（含百炼）', 'AL', 'https://usercenter2.aliyun.com/', 'automatic-screenshot', 'daily', '云服务器、模型调用和账户费用；等待账单页持续授权。'),
  source('apple-developer', 'Apple Developer', 'AP', 'https://developer.apple.com/account', 'automatic-screenshot', 'weekly', '开发者年费与会员到期；等待授权，不绕过二次验证。'),
  source('railway', 'Railway', 'RW', 'https://railway.com/account/billing', 'automatic-screenshot', 'daily', '待配置已授权的只读登录会话与账单区域。'),
  source('railway-volume', 'Railway Volume', 'RV', 'https://railway.com/account/billing', 'automatic-screenshot', 'daily', '与 Railway 账单页同源，单独保留存储用量快照。'),
  source('openai', 'OpenAI API', 'OA', 'https://platform.openai.com/usage', 'automatic-screenshot', 'daily', '账单页面自动截图；产品调用密钥不等于组织账单授权。'),
  source('resend', 'Resend', 'RE', 'https://resend.com/settings/billing', 'automatic-screenshot', 'daily', '待确认页面访问条款和登录会话稳定性。'),
  source('cloudflare', 'Cloudflare', 'CF', 'https://dash.cloudflare.com/', 'automatic-screenshot', 'daily', '待配置只读账单页和截图区域。'),
  source('godaddy-domain', '域名 / hoooho.com', 'DN', 'https://dc.console.aliyun.com/next/index#/domain-list/all', 'api', 'daily', '自动读取官方域名注册到期事件；账户扣款信息待授权。'),
  source('github', 'GitHub', 'GH', 'https://github.com/settings/billing', 'automatic-screenshot', 'weekly', '待配置已授权会话；出现二次验证时暂停并提示重新登录。'),
  source('figma', 'Figma', 'FG', 'https://www.figma.com/settings', 'automatic-screenshot', 'daily', '等待专用账单浏览器授权与区域配置。'),
  source('chatgpt-codex', 'ChatGPT / Codex', 'AI', 'https://chatgpt.com/', 'automatic-screenshot', 'daily', '等待专用账单浏览器授权；会话失效后暂停，不绕过账户验证。')
]

const emptyData = { sources: initialBillingSources, snapshots: [], inactiveSources }

export class OpsError extends Error {
  constructor(message, status = 400, code = 'OPS_ERROR') { super(message); this.status = status; this.code = code }
}

export class OpsSnapshotStorage {
  constructor(directory) { this.directory = directory }
  async save(key, buffer) { await mkdir(this.directory, { recursive: true }); await writeFile(path.join(this.directory, key), buffer, { flag: 'wx' }) }
  async read(key) { return readFile(path.join(this.directory, key)) }
  async remove(key) { await rm(path.join(this.directory, key), { force: true }) }
}

function normalizeData(data) {
  return {
    automationPolicyVersion: data?.automationPolicyVersion ?? 0,
    sources: Array.isArray(data?.sources) ? data.sources : [],
    snapshots: Array.isArray(data?.snapshots) ? data.snapshots : [],
    inactiveSources: Array.isArray(data?.inactiveSources) ? data.inactiveSources.filter(item => item !== 'Apple Developer') : inactiveSources
  }
}

async function decodeSnapshot(input) {
  const name = cleanText(input?.name, 180)
  const type = cleanText(input?.type, 80).toLowerCase()
  const extension = IMAGE_TYPES.get(type)
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(input?.dataUrl ?? ''))
  if (!name || !extension || !match || match[1].toLowerCase() !== type) throw new OpsError('仅支持 JPG、PNG 或 WebP 截图', 400, 'INVALID_OPS_SNAPSHOT')
  const buffer = Buffer.from(match[2], 'base64')
  if (!buffer.length || buffer.length > OPS_SNAPSHOT_MAX_BYTES) throw new OpsError('单张截图不能超过 12MB', 413, 'OPS_SNAPSHOT_TOO_LARGE')
  const validMagic = type === 'image/jpeg' ? buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
    : type === 'image/png' ? buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  if (!validMagic) throw new OpsError('截图内容与文件类型不一致', 400, 'OPS_SNAPSHOT_TYPE_MISMATCH')
  try { await validateRasterImage(buffer, type) }
  catch { throw new OpsError('截图损坏或无法解码，请重新选择', 400, 'INVALID_OPS_SNAPSHOT') }
  return { name, type, extension, buffer, contentHash: createHash('sha256').update(buffer).digest('hex') }
}

function publicSnapshot(snapshot) {
  if (!snapshot) return null
  const { storageKey: _storageKey, contentHash: _contentHash, ...view } = snapshot
  return view
}

function publicSource(item, snapshots) {
  const latest = snapshots.find((entry) => entry.id === item.latestSnapshotId && entry.result === 'success')
  return { ...item, projectId: opsProjectId(item.projectId), latestSnapshot: publicSnapshot(latest) }
}

function summary(sources, now = new Date()) {
  const calendar = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' })
  const day = calendar.format(now)
  const enabled = sources.filter((item) => item.enabled)
  return {
    total: enabled.length,
    updatedToday: enabled.filter((item) => item.lastSuccessAt && Number.isFinite(Date.parse(item.lastSuccessAt)) && calendar.format(new Date(item.lastSuccessAt)) === day).length,
    relogin: enabled.filter((item) => item.status === 'relogin').length,
    failed: enabled.filter((item) => item.status === 'failed').length
  }
}

function assertInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new OpsError('请求格式错误', 400, 'INVALID_OPS_INPUT')
}
function validSourceUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && Boolean(url.hostname) && !/\s/.test(value) }
  catch { return false }
}
function cleanSourceInput(input, current = {}) {
  assertInput(input)
  if (input.category !== undefined && !isBillingCategory(input.category)) throw new OpsError('请选择有效的费用分类',400,'INVALID_BILLING_CATEGORY')
  if (input.billingModes !== undefined && (!Array.isArray(input.billingModes) || input.billingModes.some(value => !isBillingMode(value)) || new Set(input.billingModes).size !== input.billingModes.length)) throw new OpsError('请选择有效的计费结构',400,'INVALID_BILLING_MODES')
  if (input.projectId !== undefined && !isOpsProject(input.projectId)) throw new OpsError('请选择有效的项目', 400, 'INVALID_OPS_PROJECT')
  for (const key of ['name', 'icon', 'platformUrl', 'loginUrl', 'targetDescription', 'targetSelector', 'waitCondition', 'notes']) {
    if (input[key] !== undefined && input[key] !== null && typeof input[key] !== 'string') throw new OpsError('费用来源字段格式错误', 400, 'INVALID_OPS_SOURCE_FIELD')
  }
  const method = METHODS.has(input.method) ? input.method : current.method ?? 'manual-screenshot'
  const frequency = FREQUENCIES.has(input.frequency) ? input.frequency : current.frequency ?? 'manual'
  return {
    category: input.category ?? current.category, billingModes: input.billingModes ?? current.billingModes,
    projectId: opsProjectId(input.projectId ?? current.projectId),
    name: cleanText(input.name ?? current.name, 120), icon: cleanText(input.icon ?? current.icon, 8).toUpperCase(),
    platformUrl: cleanText(input.platformUrl ?? current.platformUrl, 500), method, frequency,
    loginUrl: nullableText(input.loginUrl ?? current.loginUrl, 500), targetDescription: nullableText(input.targetDescription ?? current.targetDescription, 500),
    targetSelector: nullableText(input.targetSelector ?? current.targetSelector, 300), waitCondition: nullableText(input.waitCondition ?? current.waitCondition, 300),
    notes: cleanText(input.notes ?? current.notes, 1_000), enabled: typeof input.enabled === 'boolean' ? input.enabled : current.enabled ?? true
  }
}

export class OpsService {
  #store
  #storage
  #collectors
  #beforeCollection
  #getConnectedFields
  #hasCollectorStatus
  #collectorStatus
  #logger
  #reminderRules
  #refreshes = new Map()
  #refreshAllPromises = new Map()
  constructor(options = {}) {
    const directory = options.dataDirectory ?? process.cwd()
    this.#store = options.store ?? new JsonStore(path.join(directory, 'ops', 'billing-sources.json'), emptyData)
    this.#storage = options.storage ?? new OpsSnapshotStorage(path.join(directory, 'ops', 'snapshots'))
    this.#collectors = options.collectors ?? {}
    this.#beforeCollection = options.beforeCollection ?? (async () => {})
    this.#getConnectedFields = options.getConnectedFields ?? (() => [])
    this.#logger = options.logger ?? (() => {})
    this.#hasCollectorStatus = Boolean(options.collectorStatus)
    this.#collectorStatus = options.collectorStatus ?? (() => ({ state: 'unconfigured', label: '待接入采集器', detail: '尚无持续授权采集连接。' }))
    this.#reminderRules = options.getReminderRules ?? (async () => DEFAULT_REMINDERS)
  }

  async #readAndRepair() {
    const current = normalizeData(await this.#store.read())
    const ids = new Set(current.sources.map((item) => item?.id).filter(Boolean))
    if (current.automationPolicyVersion === 1 && initialBillingSources.every((item) => ids.has(item.id))) return current
    return normalizeData(await this.#store.update((raw) => {
      const data = normalizeData(raw), currentIds = new Set(data.sources.map((item) => item?.id).filter(Boolean))
      const sources = data.sources.map(item => initialBillingSources.some(s => s.id === item.id) && !raw.automationPolicyVersion ? { ...item, ...(item.id === 'godaddy-domain' && item.name === 'GoDaddy / hoooho.com' ? { name: '域名 / hoooho.com', platformUrl: 'https://dc.console.aliyun.com/next/index#/domain-list/all' } : {}), method: item.id === 'godaddy-domain' ? 'api' : 'automatic-screenshot', frequency: item.frequency === 'manual' ? 'daily' : item.frequency, status: item.status === 'manual' ? 'unconfigured' : item.status } : item)
      return { ...data, automationPolicyVersion: 1, sources: [...sources, ...initialBillingSources.filter((item) => !currentIds.has(item.id))] }
    }))
  }

  async #prune(now = new Date()) {
    const data = await this.#readAndRepair()
    const cutoff = new Date(now.getTime() - 30 * 86_400_000).toISOString()
    const latestIds = new Set(data.sources.map((item) => item.latestSnapshotId).filter(Boolean))
    const expired = data.snapshots.filter((item) => !item.important && !latestIds.has(item.id) && item.createdAt < cutoff)
    if (!expired.length) return data
    const expiredIds = new Set(expired.map((item) => item.id))
    const next = normalizeData(await this.#store.update((raw) => {
      const current = normalizeData(raw)
      return { ...current, snapshots: current.snapshots.filter((item) => !expiredIds.has(item.id)) }
    }))
    await Promise.all(expired.filter((item) => item.storageKey).map((item) => this.#storage.remove(item.storageKey)))
    return next
  }

  async list(now = new Date()) {
    await this.#beforeCollection()
    const data = await this.#prune(now)
    const rules = await this.#reminderRules()
    const sources = data.sources.map((item) => this.#publicSource(item, data.snapshots, now, rules))
    return { sources, inactiveSources: data.inactiveSources, summary: summary(sources, now) }
  }

  #publicSource(item, snapshots, now = new Date(), rules = DEFAULT_REMINDERS) {
    let nextRunAt = item.enabled && item.frequency !== 'manual' && item.status !== 'relogin' ? getNextOpsRunAt(now) : null
    if (this.#hasCollectorStatus && this.#collectorStatus(item).state !== 'ready') nextRunAt = null
    if (nextRunAt && item.frequency === 'weekly' && Number.isFinite(Date.parse(item.lastAttemptAt))) {
      const lastDay = new Date(item.lastAttemptAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
      const dueDay = new Date(Date.parse(lastDay) + 7 * 86400000).toISOString().slice(0, 10)
      if (nextRunAt.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }) < dueDay) nextRunAt = getNextOpsRunAt(new Date(Date.parse(`${dueDay}T00:00:00+08:00`) - 1))
    }
    const connection = this.#collectorStatus(item), connectedFields = this.#getConnectedFields(item)
    const billing = billingDefinition(item, connectedFields), fieldRows = billingFieldRows(item, connection, connectedFields)
    let health = billingHealth(item, now, rules)
    if (health.level === 'normal' && fieldRows.some(row => row.state !== 'available')) health = { ...health, level: 'unknown', label: '部分字段待核验' }
    return { ...publicSource(item, snapshots), category: billing.category, billingModes: billing.modes, billing, fieldRows, connection, health, nextRunAt: nextRunAt?.toISOString() ?? null }
  }

  async create(input, now = new Date()) {
    const values = cleanSourceInput(input)
    if (!values.name) throw new OpsError('请输入平台名称', 400, 'OPS_SOURCE_NAME_REQUIRED')
    if (!validSourceUrl(values.platformUrl)) throw new OpsError('请输入 HTTPS 费用页面地址', 400, 'OPS_SOURCE_URL_REQUIRED')
    const createdAt = iso(now)
    const item = { id: randomUUID(), ...values, icon: values.icon || values.name.slice(0, 2).toUpperCase(), status: values.method === 'manual-screenshot' ? 'manual' : 'unconfigured', lastAttemptAt: null, lastSuccessAt: null, lastFailureReason: null, latestSnapshotId: null, createdAt, updatedAt: createdAt }
    await this.#store.update((raw) => { const data = normalizeData(raw); return { ...data, sources: [...data.sources, item] } })
    return this.#publicSource(item, [])
  }

  async update(id, input, now = new Date()) {
    let selected
    await this.#store.update((raw) => {
      const data = normalizeData(raw), index = data.sources.findIndex((item) => item.id === id)
      if (index < 0) throw new OpsError('费用来源不存在', 404, 'OPS_SOURCE_NOT_FOUND')
      const current = data.sources[index], values = cleanSourceInput(input, current)
      if (!values.name) throw new OpsError('请输入平台名称', 400, 'OPS_SOURCE_NAME_REQUIRED')
      if (!validSourceUrl(values.platformUrl)) throw new OpsError('请输入 HTTPS 费用页面地址', 400, 'OPS_SOURCE_URL_REQUIRED')
      selected = { ...current, ...values, status: values.method === 'manual-screenshot' && current.status === 'unconfigured' ? 'manual' : current.status, updatedAt: iso(now) }
      const sources = [...data.sources]; sources[index] = selected
      return { ...data, sources }
    })
    return this.get(id)
  }

  async addManualSnapshot(id, input, now = new Date()) {
    assertInput(input)
    if (input.privacyConfirmed !== true) {
      throw new OpsError('保存前必须确认截图已裁除无关隐私信息', 400, 'OPS_SNAPSHOT_PRIVACY_CONFIRMATION_REQUIRED')
    }
    return this.#saveSnapshot(id, input, now, 'manual-screenshot', null)
  }

  async #saveSnapshot(id, input, now, snapshotMethod, observation = undefined) {
    const prepared = await decodeSnapshot(input)
    return withStorageLock(async () => {
      const createdAt = iso(now), snapshotId = randomUUID()
      const storageKey = `${id}-${snapshotId}.${prepared.extension}`
      const snapshot = { id: snapshotId, sourceId: id, result: 'success', method: snapshotMethod, createdAt, capturedAt: createdAt, fileName: prepared.name, mimeType: prepared.type, size: prepared.buffer.length, storageKey, contentHash: prepared.contentHash, important: false, failureReason: null }
      const data = await this.#readAndRepair()
      const selected = data.sources.find((item) => item.id === id)
      if (!selected) throw new OpsError('费用来源不存在', 404, 'OPS_SOURCE_NOT_FOUND')
      const latest = data.snapshots.find((item) => item.id === selected.latestSnapshotId && item.result === 'success')
      if (latest?.contentHash === prepared.contentHash) {
        await this.#store.update((raw) => {
          const current = normalizeData(raw)
          return { ...current, sources: current.sources.map((item) => item.id === id ? { ...item, status: 'success', lastAttemptAt: createdAt, lastVerifiedAt: createdAt, ...(observation !== undefined ? { observation } : {}), lastFailureReason: null, updatedAt: createdAt } : item) }
        })
        return this.get(id)
      }
      await this.#storage.save(storageKey, prepared.buffer)
      try {
        await this.#store.update((raw) => {
          const current = normalizeData(raw)
          return { ...current, snapshots: [snapshot, ...current.snapshots], sources: current.sources.map((item) => item.id === id ? { ...item, status: 'success', lastVerifiedAt: createdAt, ...(observation !== undefined ? { observation } : {}), lastAttemptAt: createdAt, lastSuccessAt: createdAt, lastFailureReason: null, latestSnapshotId: snapshotId, updatedAt: createdAt } : item) }
        })
      } catch (error) { await this.#storage.remove(storageKey); throw error }
      return this.get(id)
    })
  }

  async #recordAttempt(id, status, reason, method, now = new Date()) {
    const attemptedAt = iso(now), record = { id: randomUUID(), sourceId: id, result: 'failed', method, createdAt: attemptedAt, capturedAt: null, fileName: null, mimeType: null, size: 0, storageKey: null, important: false, failureReason: reason }
    await this.#store.update((raw) => {
      const data = normalizeData(raw), exists = data.sources.some((item) => item.id === id)
      if (!exists) throw new OpsError('费用来源不存在', 404, 'OPS_SOURCE_NOT_FOUND')
      return { ...data, snapshots: [record, ...data.snapshots], sources: data.sources.map((item) => item.id === id ? { ...item, status, lastAttemptAt: attemptedAt, lastFailureReason: reason, updatedAt: attemptedAt } : item) }
    })
  }

  async #refresh(id, now = new Date()) {
    await this.#beforeCollection()
    const data = await this.#readAndRepair(), item = data.sources.find((entry) => entry.id === id)
    if (!item) throw new OpsError('费用来源不存在', 404, 'OPS_SOURCE_NOT_FOUND')
    if (this.#collectorStatus(item).state === 'busy') throw new OpsError('授权窗口正在使用，关闭后可继续采集',409,'CAPTURE_BUSY')
    if (!item.enabled) return this.#publicSource(item, data.snapshots)
    if (item.method === 'manual-screenshot') {
      await this.#recordAttempt(id, 'manual', '该历史来源尚未接入自动采集，请在管理中切换采集方式并完成授权。', item.method, now)
      return this.get(id)
    }
    const collector = this.#collectors[item.id] ?? this.#collectors[item.method]
    if (!collector) {
      await this.#recordAttempt(id, 'unconfigured', item.method === 'api' ? '官方 API 连接器尚未配置。' : '已授权登录会话或截图连接器尚未配置。', item.method, now)
      return this.get(id)
    }
    await this.#store.update((raw) => { const current = normalizeData(raw); return { ...current, sources: current.sources.map((entry) => entry.id === id ? { ...entry, status: 'updating', lastAttemptAt: iso(now) } : entry) } })
    try {
      const controller = new AbortController()
      let timer
      let result
      try { result = await Promise.race([collector(item, { signal: controller.signal }), new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Object.assign(new Error('capture timeout'), { code: 'COLLECTOR_TIMEOUT' })) }, 45000); timer.unref?.() })]) } finally { clearTimeout(timer) }
      if (!result?.dataUrl && !result?.facts) throw Object.assign(new Error('collector returned no evidence'), { code: 'COLLECTOR_EMPTY' })
      const observedAt = iso(now), facts = cleanBillingFacts(result.facts)
      const observation = result.facts ? { id: randomUUID(), observedAt, origin: result.origin === 'api' ? 'api' : 'page', facts, evidenceUrl: result.origin === 'api' && item.id === 'godaddy-domain' ? result.evidenceUrl : null } : undefined
      if (result.dataUrl) return this.#saveSnapshot(id, { name: result.name ?? `${item.name}.png`, type: result.type ?? 'image/png', dataUrl: result.dataUrl }, now, item.method, observation)
      await this.#store.update(raw => { const current = normalizeData(raw); return { ...current, sources: current.sources.map(entry => entry.id === id ? { ...entry, observation, status: 'success', lastVerifiedAt: observedAt, lastSuccessAt: observedAt, lastAttemptAt: observedAt, lastFailureReason: null } : entry) } })
      return this.get(id)
    } catch (error) {
      const status = error?.code === 'COLLECTOR_UNCONFIGURED' ? 'unconfigured' : error?.code === 'AUTH_REQUIRED' ? 'relogin' : error?.code === 'MANUAL_REQUIRED' ? 'manual' : 'failed'
      const reason = status === 'unconfigured' ? this.#collectorStatus(item).detail : status === 'relogin' ? '登录会话已失效，需要重新授权。' : status === 'manual' ? '平台要求人工验证，请在原平台完成验证后恢复自动采集。' : '采集任务失败，已保留上一张成功截图。'
      await this.#recordAttempt(id, status, reason, item.method, now)
      return this.get(id)
    }
  }

  async refresh(id, now = new Date()) {
    const pending = this.#refreshes.get(id)
    if (pending) return pending
    const operation = this.#refresh(id, now)
    this.#refreshes.set(id, operation)
    try { const result = await operation; this.#logger({ sourceId: id, status: result.status, origin: result.observation?.origin ?? null }); return result } finally { if (this.#refreshes.get(id) === operation) this.#refreshes.delete(id) }
  }

  async refreshAll(now = new Date(), projectId = null) {
    if (projectId && !isOpsProject(projectId)) throw new OpsError('请选择有效的项目', 400, 'INVALID_OPS_PROJECT')
    const scope = projectId || 'all'
    if (this.#refreshAllPromises.has(scope)) return this.#refreshAllPromises.get(scope)
    const operation = (async () => {
      const data = await this.#readAndRepair()
      for (const item of data.sources) {
        if (!item.enabled || item.frequency === 'manual' || (projectId && opsProjectId(item.projectId) !== projectId)) continue
        try { await this.refresh(item.id, now) } catch { /* isolate a single source/storage failure */ }
      }
      return this.list(now)
    })()
    this.#refreshAllPromises.set(scope, operation)
    try { return await operation } finally { if (this.#refreshAllPromises.get(scope) === operation) this.#refreshAllPromises.delete(scope) }
  }

  async refreshScheduled(now = new Date()) {
    await this.#beforeCollection()
    const data = await this.#readAndRepair()
    const today = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
    for (const item of data.sources) {
      if (!item.enabled || item.frequency === 'manual' || item.status === 'relogin' || !this.#collectors[item.id] && !this.#collectors[item.method]) continue
      if (this.#hasCollectorStatus && this.#collectorStatus(item).state !== 'ready') continue
      const attemptedToday = !['unconfigured', 'updating'].includes(item.status) && item.lastAttemptAt && new Date(item.lastAttemptAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }) === today
      const attemptedRecently = !['unconfigured', 'updating'].includes(item.status) && item.lastAttemptAt && Date.parse(today) - Date.parse(new Date(item.lastAttemptAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })) < 7 * 86_400_000
      if (attemptedToday || (item.frequency === 'weekly' && attemptedRecently)) continue
      try { await this.refresh(item.id, now) } catch { /* keep later sources running */ }
    }
    return this.list(now)
  }

  async get(id) {
    const data = await this.#readAndRepair(), item = data.sources.find((entry) => entry.id === id)
    if (!item) throw new OpsError('费用来源不存在', 404, 'OPS_SOURCE_NOT_FOUND')
    return this.#publicSource(item, data.snapshots, new Date(), await this.#reminderRules())
  }

  async history(id) {
    const data = await this.#prune()
    if (!data.sources.some((item) => item.id === id)) throw new OpsError('费用来源不存在', 404, 'OPS_SOURCE_NOT_FOUND')
    return { snapshots: data.snapshots.filter((item) => item.sourceId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(publicSnapshot) }
  }

  async updateSnapshot(id, snapshotId, input) {
    assertInput(input)
    let selected
    await this.#store.update((raw) => {
      const data = normalizeData(raw), index = data.snapshots.findIndex((item) => item.id === snapshotId && item.sourceId === id)
      if (index < 0) throw new OpsError('快照记录不存在', 404, 'OPS_SNAPSHOT_NOT_FOUND')
      const snapshots = [...data.snapshots]
      selected = { ...snapshots[index], important: typeof input.important === 'boolean' ? input.important : snapshots[index].important }
      snapshots[index] = selected
      return { ...data, snapshots }
    })
    return publicSnapshot(selected)
  }

  async readSnapshot(id, snapshotId) {
    const data = await this.#readAndRepair(), snapshot = data.snapshots.find((item) => item.id === snapshotId && item.sourceId === id && item.result === 'success' && item.storageKey)
    if (!snapshot) throw new OpsError('快照图片不存在', 404, 'OPS_SNAPSHOT_NOT_FOUND')
    return { buffer: await this.#storage.read(snapshot.storageKey), type: snapshot.mimeType, name: snapshot.fileName }
  }
}

export function assertOpsAccess(payload, options = {}) {
  if (!payload || typeof payload !== 'object') throw new OpsError('登录状态无效或已过期', 401, 'UNAUTHORIZED')
  const owner = cleanText(options.ownerEmail ?? process.env.OPS_OWNER_EMAIL, 200).toLowerCase()
  if (!owner || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner)) throw new OpsError('费用总控台唯一管理员尚未配置', 503, 'OPS_OWNER_NOT_CONFIGURED')
  if (String(payload.email ?? '').trim().toLowerCase() !== owner) throw new OpsError('当前账号没有费用总控台权限', 403, 'OPS_FORBIDDEN')
  return { mode: 'owner' }
}

export function startOpsScheduler(service, options = {}) {
  const hour = Number.isInteger(options.hour) ? options.hour : 8
  const minute = Number.isInteger(options.minute) ? options.minute : 0
  const timeZone = cleanText(options.timeZone ?? process.env.OPS_SCHEDULER_TIME_ZONE ?? 'Asia/Shanghai', 100)
  new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date())
  let timer, stopped = false
  const schedule = () => {
    if (stopped) return
    const current = new Date(), next = getNextOpsRunAt(current, { hour, minute, timeZone })
    timer = setTimeout(async () => {
      try { await service.refreshScheduled(new Date()) } catch { /* keep the next daily run scheduled */ }
      schedule()
    }, next.getTime() - current.getTime())
    timer.unref?.()
  }
  schedule()
  const catchup = setTimeout(() => { void service.refreshScheduled(new Date()).catch(() => {}) }, 5000)
  catchup.unref?.()
  const retry = setInterval(() => { void service.refreshScheduled(new Date()).catch(() => {}) }, 15 * 60000)
  retry.unref?.()
  return () => { stopped = true; clearTimeout(timer); clearTimeout(catchup); clearInterval(retry) }
}

export function getNextOpsRunAt(now = new Date(), options = {}) {
  const hour = Number.isInteger(options.hour) ? options.hour : 8
  const minute = Number.isInteger(options.minute) ? options.minute : 0
  const timeZone = cleanText(options.timeZone ?? 'Asia/Shanghai', 100)
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' })
  const candidate = new Date(Math.floor(now.getTime() / 60_000) * 60_000 + 60_000)
  for (let index = 0; index < 2_880; index += 1, candidate.setTime(candidate.getTime() + 60_000)) {
    const parts = Object.fromEntries(formatter.formatToParts(candidate).map((part) => [part.type, part.value]))
    if (Number(parts.hour) === hour && Number(parts.minute) === minute) return new Date(candidate)
  }
  throw new OpsError('无法计算费用快照定时任务的下一次执行时间', 500, 'OPS_SCHEDULER_TIME_INVALID')
}
