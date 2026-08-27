import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { JsonStore } from '../auth/storage/json-store.mjs'

const CATEGORIES = new Set(['不好用', '出现错误', '内容有误', '希望新增', '隐私与数据', '其他'])
const STATUSES = new Set(['received', 'viewed', 'evaluating', 'improving', 'resolved', 'merged', 'declined'])
const PRIORITIES = new Set(['low', 'normal', 'high', 'urgent'])
const IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp'],
  ['image/heic', 'heic'], ['image/heif', 'heif']
])
const MAX_ATTACHMENTS = 10
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024
const MAX_TOTAL_BYTES = 20 * 1024 * 1024
const emptyData = { feedback: [], attachments: [], messages: [], statusHistory: [] }
const iso = (value = new Date()) => value.toISOString()
const cleanText = (value, max = 2_000) => String(value ?? '').trim().slice(0, max)
const cleanNullable = (value, max) => cleanText(value, max) || null
const normalizeData = (data) => ({
  ...emptyData, ...data,
  feedback: Array.isArray(data?.feedback) ? data.feedback : [],
  attachments: Array.isArray(data?.attachments) ? data.attachments : [],
  messages: Array.isArray(data?.messages) ? data.messages : [],
  statusHistory: Array.isArray(data?.statusHistory) ? data.statusHistory : []
})

export class FeedbackError extends Error {
  constructor(message, status = 400, code = 'FEEDBACK_ERROR') { super(message); this.status = status; this.code = code }
}

export class FeedbackAttachmentStorage {
  constructor(directory) { this.directory = directory }
  async save(key, buffer) { await mkdir(this.directory, { recursive: true }); await writeFile(path.join(this.directory, key), buffer, { flag: 'wx' }) }
  async read(key) { return readFile(path.join(this.directory, key)) }
  async remove(key) { await rm(path.join(this.directory, key), { force: true }) }
}

function decodeAttachment(input) {
  const name = cleanText(input?.name, 180)
  const type = cleanText(input?.type, 80).toLowerCase()
  const extension = IMAGE_TYPES.get(type)
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(input?.dataUrl ?? ''))
  if (!name || !extension || !match || match[1].toLowerCase() !== type) throw new FeedbackError('仅支持 JPG、PNG、WebP、HEIC 图片', 400, 'INVALID_FEEDBACK_ATTACHMENT')
  const buffer = Buffer.from(match[2], 'base64')
  if (!buffer.length || buffer.length > MAX_ATTACHMENT_BYTES) throw new FeedbackError('单张图片不能超过 15MB', 413, 'FEEDBACK_ATTACHMENT_TOO_LARGE')
  const validMagic = type === 'image/jpeg' ? buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
    : type === 'image/png' ? buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : type === 'image/webp' ? buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
        : buffer.subarray(4, 8).toString('ascii') === 'ftyp' && /heic|heix|hevc|hevx|mif1|msf1/.test(buffer.subarray(8, 24).toString('ascii'))
  if (!validMagic) throw new FeedbackError('图片内容与文件类型不一致', 400, 'FEEDBACK_ATTACHMENT_TYPE_MISMATCH')
  return { name, type, extension, buffer }
}

function summarize(description, category) {
  const first = cleanText(description, 120).split(/[。！？\n]/)[0]
  return first || `${category} · 图片反馈`
}

export class FeedbackService {
  #store
  #storage
  #tokenSecret
  constructor(options = {}) {
    const directory = options.dataDirectory ?? process.cwd()
    this.#store = options.store ?? new JsonStore(path.join(directory, 'feedback', 'records.json'), emptyData)
    this.#storage = options.storage ?? new FeedbackAttachmentStorage(path.join(directory, 'feedback', 'attachments'))
    this.#tokenSecret = options.tokenSecret ?? 'hoooho-local-development-secret'
  }

  async create(accountId, input, now = new Date()) {
    const category = cleanText(input.category, 30)
    const description = cleanText(input.description, 5_000)
    const idempotencyKey = cleanText(input.idempotencyKey, 80)
    const prepared = this.#prepareAttachments(input.attachments)
    if (!CATEGORIES.has(category)) throw new FeedbackError('请选择反馈分类', 400, 'INVALID_FEEDBACK_CATEGORY')
    if (!description && prepared.length === 0) throw new FeedbackError('请填写反馈或添加图片', 400, 'EMPTY_FEEDBACK')
    if (!idempotencyKey) throw new FeedbackError('缺少提交标识，请重新提交', 400, 'MISSING_IDEMPOTENCY_KEY')
    const current = normalizeData(await this.#store.read())
    const duplicate = current.feedback.find((item) => item.accountId === accountId && item.idempotencyKey === idempotencyKey)
    if (duplicate) return { id: duplicate.id, status: duplicate.status, createdAt: duplicate.createdAt, duplicate: true }

    const createdAt = iso(now), feedbackId = randomUUID()
    const feedback = {
      id: feedbackId, accountId, idempotencyKey, category, description,
      summary: summarize(description, category),
      sourcePath: cleanNullable(input.sourcePath, 300), sourceName: cleanNullable(input.sourceName, 100),
      appVersion: cleanNullable(input.appVersion, 60), device: this.#cleanDevice(input.device),
      status: 'received', priority: 'normal', mergedIntoId: null, handledVersion: null,
      noActionReason: null, createdAt, updatedAt: createdAt, closedAt: null
    }
    const savedAttachments = await this.#saveAttachments(accountId, feedbackId, null, prepared, now)
    try {
      await this.#store.update((raw) => {
        const data = normalizeData(raw)
        if (data.feedback.some((item) => item.accountId === accountId && item.idempotencyKey === idempotencyKey)) return data
        return {
          ...data, feedback: [...data.feedback, feedback], attachments: [...data.attachments, ...savedAttachments],
          statusHistory: [...data.statusHistory, { id: randomUUID(), feedbackId, status: 'received', actorAccountId: accountId, createdAt }]
        }
      })
    } catch (error) {
      await Promise.all(savedAttachments.map((item) => this.#storage.remove(item.storageKey)))
      throw error
    }
    return { id: feedbackId, status: 'received', createdAt }
  }

  async listForAccount(accountId) {
    const data = normalizeData(await this.#store.read())
    return data.feedback.filter((item) => item.accountId === accountId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((item) => this.#toUserView(item, data, false))
  }

  async getForAccount(accountId, feedbackId) {
    const data = normalizeData(await this.#store.read())
    const item = data.feedback.find((entry) => entry.id === feedbackId && entry.accountId === accountId)
    if (!item) throw new FeedbackError('反馈不存在', 404, 'FEEDBACK_NOT_FOUND')
    return this.#toUserView(item, data, true)
  }

  async addUserMessage(accountId, feedbackId, input, now = new Date()) {
    const data = normalizeData(await this.#store.read())
    const feedback = data.feedback.find((item) => item.id === feedbackId && item.accountId === accountId)
    if (!feedback) throw new FeedbackError('反馈不存在', 404, 'FEEDBACK_NOT_FOUND')
    const text = cleanText(input.text, 5_000)
    const existingCount = data.attachments.filter((item) => item.feedbackId === feedbackId).length
    const prepared = this.#prepareAttachments(input.attachments, MAX_ATTACHMENTS - existingCount)
    if (!text && prepared.length === 0) throw new FeedbackError('请填写补充内容或添加图片', 400, 'EMPTY_FEEDBACK_MESSAGE')
    const createdAt = iso(now), messageId = randomUUID()
    const message = { id: messageId, feedbackId, authorAccountId: accountId, kind: 'user-supplement', text, createdAt }
    const savedAttachments = await this.#saveAttachments(accountId, feedbackId, messageId, prepared, now)
    try {
      await this.#store.update((raw) => {
        const current = normalizeData(raw)
        return { ...current, messages: [...current.messages, message], attachments: [...current.attachments, ...savedAttachments], feedback: current.feedback.map((item) => item.id === feedbackId ? { ...item, updatedAt: createdAt } : item) }
      })
    } catch (error) {
      await Promise.all(savedAttachments.map((item) => this.#storage.remove(item.storageKey)))
      throw error
    }
    return this.getForAccount(accountId, feedbackId)
  }

  async deleteForAccount(accountId, feedbackId) {
    const data = normalizeData(await this.#store.read())
    if (!data.feedback.some((item) => item.id === feedbackId && item.accountId === accountId)) throw new FeedbackError('反馈不存在', 404, 'FEEDBACK_NOT_FOUND')
    const ownedAttachments = data.attachments.filter((item) => item.feedbackId === feedbackId)
    await this.#store.update((raw) => {
      const current = normalizeData(raw)
      return { ...current, feedback: current.feedback.filter((item) => item.id !== feedbackId), attachments: current.attachments.filter((item) => item.feedbackId !== feedbackId), messages: current.messages.filter((item) => item.feedbackId !== feedbackId), statusHistory: current.statusHistory.filter((item) => item.feedbackId !== feedbackId) }
    })
    await Promise.all(ownedAttachments.map((item) => this.#storage.remove(item.storageKey)))
    return { success: true }
  }

  async listForOps(filters = {}) {
    const data = normalizeData(await this.#store.read())
    let records = data.feedback
    for (const [field, value] of [['status', filters.status], ['category', filters.category], ['appVersion', filters.appVersion]]) if (value) records = records.filter((item) => item[field] === value)
    if (filters.sourcePath) records = records.filter((item) => item.sourcePath === filters.sourcePath)
    if (filters.deviceType) records = records.filter((item) => item.device?.type === filters.deviceType)
    if (filters.hasAttachments === 'true') records = records.filter((item) => data.attachments.some((attachment) => attachment.feedbackId === item.id))
    if (filters.hasSupplements === 'true') records = records.filter((item) => data.messages.some((message) => message.feedbackId === item.id && message.kind === 'user-supplement'))
    if (filters.duplicate === 'true') records = records.filter((item) => item.status === 'merged' || item.mergedIntoId)
    if (filters.from) records = records.filter((item) => item.createdAt >= filters.from)
    if (filters.to) records = records.filter((item) => item.createdAt <= `${filters.to}T23:59:59.999Z`)
    return { overview: this.#overview(data), feedback: records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((item) => this.#toOpsView(item, data, false)) }
  }

  async getForOps(feedbackId) {
    const data = normalizeData(await this.#store.read())
    const item = data.feedback.find((entry) => entry.id === feedbackId)
    if (!item) throw new FeedbackError('反馈不存在', 404, 'FEEDBACK_NOT_FOUND')
    return this.#toOpsView(item, data, true)
  }

  async updateFromOps(actorAccountId, feedbackId, input, now = new Date()) {
    const createdAt = iso(now)
    await this.#store.update((raw) => {
      const data = normalizeData(raw), index = data.feedback.findIndex((item) => item.id === feedbackId)
      if (index < 0) throw new FeedbackError('反馈不存在', 404, 'FEEDBACK_NOT_FOUND')
      const current = data.feedback[index]
      const status = STATUSES.has(input.status) ? input.status : current.status
      const priority = PRIORITIES.has(input.priority) ? input.priority : current.priority
      const noActionReason = input.noActionReason === undefined ? current.noActionReason : cleanNullable(input.noActionReason, 800)
      const handledVersion = input.handledVersion === undefined ? current.handledVersion : cleanNullable(input.handledVersion, 80)
      const mergedIntoId = input.mergedIntoId === undefined ? current.mergedIntoId : cleanNullable(input.mergedIntoId, 80)
      if (status === 'declined' && !noActionReason) throw new FeedbackError('暂不处理时必须填写用户可理解的原因', 400, 'DECLINE_REASON_REQUIRED')
      if (status === 'merged' && !mergedIntoId) throw new FeedbackError('标记已合并时必须关联反馈', 400, 'MERGED_FEEDBACK_REQUIRED')
      if (status === 'merged' && (mergedIntoId === feedbackId || !data.feedback.some((item) => item.id === mergedIntoId))) throw new FeedbackError('关联的反馈不存在或不能关联自身', 400, 'INVALID_MERGED_FEEDBACK')
      const next = { ...current, status, priority, noActionReason, handledVersion, mergedIntoId, updatedAt: createdAt, closedAt: ['resolved', 'merged', 'declined'].includes(status) ? createdAt : null }
      const feedback = [...data.feedback]; feedback[index] = next
      const history = status !== current.status ? [...data.statusHistory, { id: randomUUID(), feedbackId, status, actorAccountId, createdAt }] : data.statusHistory
      return { ...data, feedback, statusHistory: history }
    })
    return this.getForOps(feedbackId)
  }

  async addOpsMessage(actorAccountId, feedbackId, input, now = new Date()) {
    const kind = input.kind === 'internal-note' ? 'internal-note' : input.kind === 'user-reply' ? 'user-reply' : null
    const text = cleanText(input.text, 5_000)
    if (!kind || !text) throw new FeedbackError('请选择消息类型并填写内容', 400, 'INVALID_OPS_MESSAGE')
    const createdAt = iso(now)
    await this.#store.update((raw) => {
      const data = normalizeData(raw)
      if (!data.feedback.some((item) => item.id === feedbackId)) throw new FeedbackError('反馈不存在', 404, 'FEEDBACK_NOT_FOUND')
      return { ...data, messages: [...data.messages, { id: randomUUID(), feedbackId, authorAccountId: actorAccountId, kind, text, createdAt }], feedback: data.feedback.map((item) => item.id === feedbackId ? { ...item, updatedAt: createdAt } : item) }
    })
    return this.getForOps(feedbackId)
  }

  async readAttachmentWithAccess(attachmentId, expires, signature, now = Date.now()) {
    const exp = Number(expires)
    if (!Number.isSafeInteger(exp) || exp < now || exp > now + 10 * 60_000 || !this.#validSignature(attachmentId, exp, signature)) throw new FeedbackError('图片链接已失效', 403, 'ATTACHMENT_LINK_EXPIRED')
    const data = normalizeData(await this.#store.read())
    const attachment = data.attachments.find((item) => item.id === attachmentId)
    if (!attachment) throw new FeedbackError('图片不存在', 404, 'ATTACHMENT_NOT_FOUND')
    return { ...attachment, buffer: await this.#storage.read(attachment.storageKey) }
  }

  #prepareAttachments(input, limit = MAX_ATTACHMENTS) {
    const values = Array.isArray(input) ? input : []
    if (values.length > limit) throw new FeedbackError(`每条反馈最多 ${MAX_ATTACHMENTS} 张图片`, 400, 'TOO_MANY_FEEDBACK_ATTACHMENTS')
    const prepared = values.map(decodeAttachment)
    if (prepared.reduce((sum, item) => sum + item.buffer.length, 0) > MAX_TOTAL_BYTES) throw new FeedbackError('图片总大小不能超过 20MB', 413, 'FEEDBACK_ATTACHMENTS_TOO_LARGE')
    return prepared
  }

  async #saveAttachments(accountId, feedbackId, messageId, prepared, now) {
    const saved = []
    try {
      for (const item of prepared) {
        const id = randomUUID(), storageKey = `${id}.${item.extension}`
        await this.#storage.save(storageKey, item.buffer)
        saved.push({ id, feedbackId, messageId, accountId, storageKey, name: item.name, type: item.type, size: item.buffer.length, createdAt: iso(now) })
      }
      return saved
    } catch (error) {
      await Promise.all(saved.map((item) => this.#storage.remove(item.storageKey)))
      throw error
    }
  }

  #cleanDevice(input) {
    const value = input && typeof input === 'object' ? input : {}
    return { type: ['mobile', 'desktop', 'tablet'].includes(value.type) ? value.type : 'unknown', os: cleanNullable(value.os, 80), browser: cleanNullable(value.browser, 80), screen: cleanNullable(value.screen, 40) }
  }

  #attachmentView(item) {
    const expires = Date.now() + 5 * 60_000
    return { id: item.id, messageId: item.messageId, name: item.name, type: item.type, size: item.size, createdAt: item.createdAt, url: `/api/feedback/attachments/${encodeURIComponent(item.id)}?expires=${expires}&access=${this.#signature(item.id, expires)}` }
  }

  #toUserView(item, data, detailed) {
    const attachments = data.attachments.filter((entry) => entry.feedbackId === item.id).map((entry) => this.#attachmentView(entry))
    const visibleMessages = data.messages.filter((entry) => entry.feedbackId === item.id && entry.kind !== 'internal-note')
    const latestReply = [...visibleMessages].reverse().find((entry) => entry.kind === 'user-reply')?.text ?? null
    const base = { id: item.id, category: item.category, description: item.description, summary: item.summary, sourcePath: item.sourcePath, sourceName: item.sourceName, appVersion: item.appVersion, status: item.status, handledVersion: item.handledVersion, noActionReason: item.noActionReason, mergedIntoId: item.mergedIntoId, createdAt: item.createdAt, updatedAt: item.updatedAt, latestReply, attachmentCount: attachments.length }
    return detailed ? { ...base, attachments, messages: visibleMessages, statusHistory: data.statusHistory.filter((entry) => entry.feedbackId === item.id).map(({ actorAccountId: _actor, ...entry }) => entry) } : base
  }

  #toOpsView(item, data, detailed) {
    const attachments = data.attachments.filter((entry) => entry.feedbackId === item.id).map((entry) => this.#attachmentView(entry))
    const messages = data.messages.filter((entry) => entry.feedbackId === item.id)
    const base = { ...item, attachmentCount: attachments.length, supplementCount: messages.filter((entry) => entry.kind === 'user-supplement').length, mergedCount: data.feedback.filter((entry) => entry.mergedIntoId === item.id).length }
    return detailed ? { ...base, attachments, messages, statusHistory: data.statusHistory.filter((entry) => entry.feedbackId === item.id) } : base
  }

  #overview(data) {
    const count = (status) => data.feedback.filter((item) => item.status === status).length
    const viewed = data.statusHistory.filter((entry) => entry.status === 'viewed').map((entry) => {
      const item = data.feedback.find((feedback) => feedback.id === entry.feedbackId)
      return item ? new Date(entry.createdAt).getTime() - new Date(item.createdAt).getTime() : null
    }).filter(Number.isFinite)
    return { new: count('received'), pendingView: count('received'), viewed: count('viewed'), evaluating: count('evaluating'), improving: count('improving'), resolved: count('resolved'), duplicates: count('merged'), withSupplements: new Set(data.messages.filter((item) => item.kind === 'user-supplement').map((item) => item.feedbackId)).size, averageFirstViewMs: viewed.length ? Math.round(viewed.reduce((sum, value) => sum + value, 0) / viewed.length) : null }
  }

  #signature(attachmentId, expires) { return createHmac('sha256', this.#tokenSecret).update(`${attachmentId}.${expires}`).digest('base64url') }
  #validSignature(attachmentId, expires, signature) {
    const actual = Buffer.from(String(signature ?? '')), expected = Buffer.from(this.#signature(attachmentId, expires))
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  }
}

export const feedbackConstants = { MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES, MAX_TOTAL_BYTES }
