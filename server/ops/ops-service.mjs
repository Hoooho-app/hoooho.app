import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { JsonStore } from '../auth/storage/json-store.mjs'

export const OPS_SNAPSHOT_MAX_BYTES = 12 * 1024 * 1024
export const OPS_SNAPSHOT_REQUEST_MAX_LENGTH = 17_000_000

const METHODS = new Set(['api', 'automatic-screenshot', 'manual-screenshot'])
const FREQUENCIES = new Set(['daily', 'weekly', 'manual'])
const IMAGE_TYPES = new Map([['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp']])
const inactiveSources = ['SMS', 'OCR', 'Vector DB', 'Maps', 'Apple Developer', 'Google Play', '其他尚未启用的平台']
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
  source('railway', 'Railway', 'RW', 'https://railway.com/account/billing', 'automatic-screenshot', 'daily', '待配置已授权的只读登录会话与账单区域。'),
  source('railway-volume', 'Railway Volume', 'RV', 'https://railway.com/account/billing', 'automatic-screenshot', 'daily', '与 Railway 账单页同源，单独保留存储用量快照。'),
  source('openai', 'OpenAI API', 'OA', 'https://platform.openai.com/usage', 'api', 'daily', '优先接入官方允许的用量接口；未配置时不读取环境中的密钥内容。'),
  source('resend', 'Resend', 'RE', 'https://resend.com/settings/billing', 'automatic-screenshot', 'daily', '待确认页面访问条款和登录会话稳定性。'),
  source('cloudflare', 'Cloudflare', 'CF', 'https://dash.cloudflare.com/', 'automatic-screenshot', 'daily', '待配置只读账单页和截图区域。'),
  source('godaddy-domain', 'GoDaddy / hoooho.com', 'GD', 'https://account.godaddy.com/billing', 'manual-screenshot', 'manual', '域名账户可能要求 MFA，默认使用手动截图。', 'manual'),
  source('github', 'GitHub', 'GH', 'https://github.com/settings/billing', 'automatic-screenshot', 'weekly', '待配置已授权会话；出现二次验证时回退手动更新。'),
  source('figma', 'Figma', 'FG', 'https://www.figma.com/settings', 'manual-screenshot', 'manual', '默认手动上传，避免对登录与团队账单页进行不稳定自动化。', 'manual'),
  source('chatgpt-codex', 'ChatGPT / Codex', 'AI', 'https://chatgpt.com/', 'manual-screenshot', 'manual', '默认手动上传，不自动处理 MFA、CAPTCHA 或账户安全验证。', 'manual')
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
    sources: Array.isArray(data?.sources) ? data.sources : [],
    snapshots: Array.isArray(data?.snapshots) ? data.snapshots : [],
    inactiveSources: Array.isArray(data?.inactiveSources) ? data.inactiveSources : inactiveSources
  }
}

function decodeSnapshot(input) {
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
  return { name, type, extension, buffer }
}

function publicSnapshot(snapshot) {
  if (!snapshot) return null
  const { storageKey: _storageKey, ...view } = snapshot
  return view
}

function publicSource(item, snapshots) {
  const latest = snapshots.find((entry) => entry.id === item.latestSnapshotId && entry.result === 'success')
  return { ...item, latestSnapshot: publicSnapshot(latest) }
}

function summary(sources, now = new Date()) {
  const day = now.toLocaleDateString('en-CA')
  return {
    total: sources.filter((item) => item.enabled).length,
    updatedToday: sources.filter((item) => item.lastSuccessAt && new Date(item.lastSuccessAt).toLocaleDateString('en-CA') === day).length,
    relogin: sources.filter((item) => item.status === 'relogin').length,
    failed: sources.filter((item) => item.status === 'failed').length
  }
}

function cleanSourceInput(input, current = {}) {
  const method = METHODS.has(input.method) ? input.method : current.method ?? 'manual-screenshot'
  const frequency = FREQUENCIES.has(input.frequency) ? input.frequency : current.frequency ?? 'manual'
  return {
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
  constructor(options = {}) {
    const directory = options.dataDirectory ?? process.cwd()
    this.#store = options.store ?? new JsonStore(path.join(directory, 'ops', 'billing-sources.json'), emptyData)
    this.#storage = options.storage ?? new OpsSnapshotStorage(path.join(directory, 'ops', 'snapshots'))
    this.#collectors = options.collectors ?? {}
  }

  async #readAndRepair() {
    const current = normalizeData(await this.#store.read())
    const ids = new Set(current.sources.map((item) => item?.id).filter(Boolean))
    if (initialBillingSources.every((item) => ids.has(item.id))) return current
    return normalizeData(await this.#store.update((raw) => {
      const data = normalizeData(raw), currentIds = new Set(data.sources.map((item) => item?.id).filter(Boolean))
      return { ...data, sources: [...data.sources, ...initialBillingSources.filter((item) => !currentIds.has(item.id))] }
    }))
  }

  async #prune(now = new Date()) {
    const data = await this.#readAndRepair()
    const cutoff = new Date(now.getTime() - 30 * 86_400_000).toISOString()
    const expired = data.snapshots.filter((item) => !item.important && item.createdAt < cutoff)
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
    const data = await this.#prune(now)
    const sources = data.sources.map((item) => publicSource(item, data.snapshots))
    return { sources, inactiveSources: data.inactiveSources, summary: summary(sources, now) }
  }

  async create(input, now = new Date()) {
    const values = cleanSourceInput(input)
    if (!values.name) throw new OpsError('请输入平台名称', 400, 'OPS_SOURCE_NAME_REQUIRED')
    if (!values.platformUrl || !/^https:\/\//i.test(values.platformUrl)) throw new OpsError('请输入 HTTPS 费用页面地址', 400, 'OPS_SOURCE_URL_REQUIRED')
    const createdAt = iso(now)
    const item = { id: randomUUID(), ...values, icon: values.icon || values.name.slice(0, 2).toUpperCase(), status: values.method === 'manual-screenshot' ? 'manual' : 'unconfigured', lastAttemptAt: null, lastSuccessAt: null, lastFailureReason: null, latestSnapshotId: null, createdAt, updatedAt: createdAt }
    await this.#store.update((raw) => { const data = normalizeData(raw); return { ...data, sources: [...data.sources, item] } })
    return publicSource(item, [])
  }

  async update(id, input, now = new Date()) {
    let selected
    await this.#store.update((raw) => {
      const data = normalizeData(raw), index = data.sources.findIndex((item) => item.id === id)
      if (index < 0) throw new OpsError('费用来源不存在', 404, 'OPS_SOURCE_NOT_FOUND')
      const current = data.sources[index], values = cleanSourceInput(input, current)
      if (!values.name) throw new OpsError('请输入平台名称', 400, 'OPS_SOURCE_NAME_REQUIRED')
      if (!values.platformUrl || !/^https:\/\//i.test(values.platformUrl)) throw new OpsError('请输入 HTTPS 费用页面地址', 400, 'OPS_SOURCE_URL_REQUIRED')
      selected = { ...current, ...values, status: values.method === 'manual-screenshot' && current.status === 'unconfigured' ? 'manual' : current.status, updatedAt: iso(now) }
      const sources = [...data.sources]; sources[index] = selected
      return { ...data, sources }
    })
    return this.get(id)
  }

  async addManualSnapshot(id, input, now = new Date()) {
    const prepared = decodeSnapshot(input), createdAt = iso(now), snapshotId = randomUUID()
    const storageKey = `${id}-${snapshotId}.${prepared.extension}`
    const snapshotMethod = METHODS.has(input.method) ? input.method : 'manual-screenshot'
    const snapshot = { id: snapshotId, sourceId: id, result: 'success', method: snapshotMethod, createdAt, capturedAt: createdAt, fileName: prepared.name, mimeType: prepared.type, size: prepared.buffer.length, storageKey, important: false, failureReason: null }
    const data = await this.#readAndRepair()
    if (!data.sources.some((item) => item.id === id)) throw new OpsError('费用来源不存在', 404, 'OPS_SOURCE_NOT_FOUND')
    await this.#storage.save(storageKey, prepared.buffer)
    try {
      await this.#store.update((raw) => {
        const current = normalizeData(raw)
        return { ...current, snapshots: [snapshot, ...current.snapshots], sources: current.sources.map((item) => item.id === id ? { ...item, status: 'success', lastAttemptAt: createdAt, lastSuccessAt: createdAt, lastFailureReason: null, latestSnapshotId: snapshotId, updatedAt: createdAt } : item) }
      })
    } catch (error) { await this.#storage.remove(storageKey); throw error }
    return this.get(id)
  }

  async #recordAttempt(id, status, reason, method, now = new Date()) {
    const attemptedAt = iso(now), record = { id: randomUUID(), sourceId: id, result: 'failed', method, createdAt: attemptedAt, capturedAt: null, fileName: null, mimeType: null, size: 0, storageKey: null, important: false, failureReason: reason }
    await this.#store.update((raw) => {
      const data = normalizeData(raw), exists = data.sources.some((item) => item.id === id)
      if (!exists) throw new OpsError('费用来源不存在', 404, 'OPS_SOURCE_NOT_FOUND')
      return { ...data, snapshots: [record, ...data.snapshots], sources: data.sources.map((item) => item.id === id ? { ...item, status, lastAttemptAt: attemptedAt, lastFailureReason: reason, updatedAt: attemptedAt } : item) }
    })
  }

  async refresh(id, now = new Date()) {
    const data = await this.#readAndRepair(), item = data.sources.find((entry) => entry.id === id)
    if (!item) throw new OpsError('费用来源不存在', 404, 'OPS_SOURCE_NOT_FOUND')
    if (!item.enabled) return publicSource(item, data.snapshots)
    if (item.method === 'manual-screenshot') {
      await this.#recordAttempt(id, 'manual', '该来源使用手动截图，请上传最新页面截图。', item.method, now)
      return this.get(id)
    }
    const collector = this.#collectors[item.id] ?? this.#collectors[item.method]
    if (!collector) {
      await this.#recordAttempt(id, 'unconfigured', item.method === 'api' ? '官方 API 连接器尚未配置。' : '已授权登录会话或截图连接器尚未配置。', item.method, now)
      return this.get(id)
    }
    await this.#store.update((raw) => { const current = normalizeData(raw); return { ...current, sources: current.sources.map((entry) => entry.id === id ? { ...entry, status: 'updating', lastAttemptAt: iso(now) } : entry) } })
    try {
      const result = await collector(item)
      if (!result?.dataUrl) throw Object.assign(new Error('collector did not return an image'), { code: 'COLLECTOR_EMPTY' })
      return this.addManualSnapshot(id, { name: result.name ?? `${item.name}.png`, type: result.type ?? 'image/png', dataUrl: result.dataUrl, method: item.method }, now)
    } catch (error) {
      const status = error?.code === 'AUTH_REQUIRED' ? 'relogin' : error?.code === 'MANUAL_REQUIRED' ? 'manual' : 'failed'
      const reason = status === 'relogin' ? '登录会话已失效，需要重新授权。' : status === 'manual' ? '平台要求人工验证，请手动上传截图。' : '采集任务失败，已保留上一张成功截图。'
      await this.#recordAttempt(id, status, reason, item.method, now)
      return this.get(id)
    }
  }

  async refreshAll(now = new Date()) {
    const data = await this.#readAndRepair()
    for (const item of data.sources) if (item.enabled && item.frequency !== 'manual') await this.refresh(item.id, now)
    return this.list(now)
  }

  async refreshScheduled(now = new Date()) {
    const data = await this.#readAndRepair()
    const today = now.toLocaleDateString('en-CA')
    for (const item of data.sources) {
      if (!item.enabled || item.frequency === 'manual' || item.status === 'relogin') continue
      const attemptedToday = item.lastAttemptAt && new Date(item.lastAttemptAt).toLocaleDateString('en-CA') === today
      const attemptedRecently = item.lastAttemptAt && now.getTime() - new Date(item.lastAttemptAt).getTime() < 7 * 86_400_000
      if (attemptedToday || (item.frequency === 'weekly' && attemptedRecently)) continue
      await this.refresh(item.id, now)
    }
    return this.list(now)
  }

  async get(id) {
    const data = await this.#readAndRepair(), item = data.sources.find((entry) => entry.id === id)
    if (!item) throw new OpsError('费用来源不存在', 404, 'OPS_SOURCE_NOT_FOUND')
    return publicSource(item, data.snapshots)
  }

  async history(id) {
    const data = await this.#prune()
    if (!data.sources.some((item) => item.id === id)) throw new OpsError('费用来源不存在', 404, 'OPS_SOURCE_NOT_FOUND')
    return { snapshots: data.snapshots.filter((item) => item.sourceId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(publicSnapshot) }
  }

  async updateSnapshot(id, snapshotId, input) {
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
  let timer
  const schedule = () => {
    const current = new Date(), next = new Date(current)
    next.setHours(hour, minute, 0, 0)
    if (next <= current) next.setDate(next.getDate() + 1)
    timer = setTimeout(async () => {
      try { await service.refreshScheduled(new Date()) } catch { /* keep the next daily run scheduled */ }
      schedule()
    }, next.getTime() - current.getTime())
    timer.unref?.()
  }
  schedule()
  return () => clearTimeout(timer)
}
