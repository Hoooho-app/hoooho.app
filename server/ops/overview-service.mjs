import path from 'node:path'
import { JsonStore } from '../auth/storage/json-store.mjs'
import { DEFAULT_OPS_PROJECT_ID, opsProjectId } from '../../shared/ops-projects.mjs'

const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
const feedbackId = item => `feedback:${item.id}:${item.supplementCount ?? 0}`
export class OpsOverviewService {
  constructor({ billing, feedback, resources, dataDirectory, store }) {
    this.billing = billing
    this.feedback = feedback
    this.resources = resources
    this.store = store ?? new JsonStore(path.join(dataDirectory, 'ops', 'overview-receipts.json'), { receipts: [] })
  }
  async list() {
    const [billing, feedback, saved] = await Promise.all([this.billing.list(), this.feedback.listForOps(), this.store.read()])
    const receipts = Array.isArray(saved?.receipts) ? saved.receipts : []
    const events = this.resources ? await this.resources.events() : []
    for (const item of billing.sources) {
      if (item.enabled && item.health?.reasons?.length) {
        const id = `billing:${item.id}:health:${item.health.fingerprint}`
        const params = new URLSearchParams({ project: opsProjectId(item.projectId), source: item.id, event: id })
        events.push({ id, projectId: opsProjectId(item.projectId), kind: 'billing-reminder', title: `${item.name} · ${item.health.label}`, preview: `${item.health.reasons.map(r => r.label).join('；')}。${item.health.verification}`, occurredAt: item.health.observedAt, target: `/ops/billing?${params}#billing-source-${encodeURIComponent(item.id)}` })
      }
      const failed = ['failed', 'relogin'].includes(item.status) && validTime(item.lastAttemptAt)
      const snapshot = item.latestSnapshot && validTime(item.lastSuccessAt)
      if (!failed && !snapshot) continue
      const version = failed ? `attempt:${item.lastAttemptAt}` : `snapshot:${item.latestSnapshot.id}`
      const id = `billing:${item.id}:${version}`
      const projectId = opsProjectId(item.projectId)
      const params = new URLSearchParams({ project: projectId, source: item.id, event: id })
      events.push({ id, projectId, kind: failed ? 'billing-alert' : 'billing-update',
        title: `${item.name} · ${failed ? item.status === 'relogin' ? '需要重新登录' : '费用更新失败' : '费用快照已更新'}`,
        preview: failed ? item.lastFailureReason || '打开费用来源查看连接状态，已有快照仍保留。' : '打开对应费用来源，查看最近成功快照。',
        occurredAt: failed ? item.lastAttemptAt : item.lastSuccessAt,
        target: `/ops/billing?${params}#billing-source-${encodeURIComponent(item.id)}` })
    }
    for (const item of feedback.feedback) {
      const id = feedbackId(item)
      const params = new URLSearchParams({ project: DEFAULT_OPS_PROJECT_ID, feedback: item.id, event: id })
      events.push({ id, projectId: DEFAULT_OPS_PROJECT_ID, kind: item.supplementCount > 0 ? 'feedback-reply' : 'feedback',
        title: item.summary || '新的用户反馈', preview: String(item.description || '用户提交了图片附件。').slice(0, 240),
        occurredAt: item.lastUserSupplementAt || item.createdAt,
        target: `/ops/feedback?${params}#feedback-${encodeURIComponent(item.id)}` })
    }
    const result = events.map(event => ({ ...event, viewedAt: receipts.find(receipt => receipt.id === event.id)?.viewedAt ?? null }))
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id))
    return { events: result, unreadCount: result.filter(event => !event.viewedAt).length }
  }
  async viewed(id, now = new Date()) {
    if (typeof id !== 'string' || id.length > 512 || !(await this.list()).events.some(event => event.id === id)) {
      throw Object.assign(new Error('动态不存在或已有新的内容，请刷新后查看。'), { status: 404, code: 'OPS_EVENT_NOT_FOUND' })
    }
    let receipt
    await this.store.update(raw => {
      const receipts = Array.isArray(raw?.receipts) ? raw.receipts : []
      receipt = receipts.find(item => item.id === id) ?? { id, viewedAt: now.toISOString() }
      return { receipts: receipts.some(item => item.id === id) ? receipts : [...receipts, receipt] }
    })
    return receipt
  }
}
