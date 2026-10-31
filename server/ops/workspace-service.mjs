import path from 'node:path'
import { JsonStore } from '../auth/storage/json-store.mjs'
import { DEFAULT_REMINDERS } from './billing-health.mjs'
import { OPS_PROJECTS } from '../../shared/ops-projects.mjs'
export class OpsWorkspaceService {
  constructor({ dataDirectory, env = process.env, fetchImpl = fetch } = {}) {
    this.env = env; this.fetch = fetchImpl; this.startedAt = new Date().toISOString()
    this.settingsStore = new JsonStore(path.join(dataDirectory, 'ops/workspace-settings.json'), { reminders: DEFAULT_REMINDERS })
    this.releases = new JsonStore(path.join(dataDirectory, 'ops/web-releases.json'), { releases: [] })
    this.probes = new Map()
  }
  async settings() {
    const data = await this.settingsStore.read()
    return { reminders: { ...DEFAULT_REMINDERS, ...data.reminders }, schedule: { time: '08:00', timeZone: 'Asia/Shanghai', catchUpOnRestart: true }, notification: '仅站内 Overview，不发送邮件或短信', capture: { connected: Boolean(this.env.OPS_BROWSER_CDP_URL), profilesConfigured: Boolean(this.env.OPS_CAPTURE_PROFILES), detail: '账单会话、区域和隐私遮罩在服务器端配置；不会从本机导出 Cookie。' } }
  }
  async saveSettings(input) {
    const r = input?.reminders
    const keys = Object.keys(DEFAULT_REMINDERS)
    if (!r || keys.some(k => !Number.isInteger(r[k]) || r[k] < 0 || r[k] > (k.includes('Percent') ? 100 : 365)) || !(r.noticeDays >= r.warningDays && r.warningDays >= r.criticalDays) || !(r.quotaWarningPercent > r.quotaCriticalPercent)) throw Object.assign(new Error('请填写有效的提醒阈值，提前提醒天数应逐级递减。'), { status: 400, code: 'INVALID_OPS_REMINDERS' })
    await this.settingsStore.update(() => ({ reminders: Object.fromEntries(keys.map(k => [k, r[k]])) }))
    return this.settings()
  }
  async services() {
    const native = this.env.RAILWAY_PUBLIC_DOMAIN ? `https://${this.env.RAILWAY_PUBLIC_DOMAIN}` : 'https://hooohoapp-production.up.railway.app'
    const entries = [
      { id: 'health-api', projectId: 'hoooho', name: '护护记录应用', url: native, healthPath: '/api/health' },
      { id: 'family-api', projectId: 'family', name: '家庭统筹服务', url: this.env.FAMILY_UPSTREAM_URL, healthPath: '/api/health' },
      { id: 'qinggan-api', projectId: 'qinggan', name: '翻旧账前端', url: this.env.QINGGAN_UPSTREAM_URL, healthPath: '/', probeKind: 'page' },
      { id: 'play-api', projectId: 'play', name: '护护陪玩服务', url: null, healthPath: '/api/health' }
    ]
    const services = await Promise.all(entries.map(async item => {
      if (!item.url) return { ...item, url: null, state: 'unconfigured', checkedAt: null, latencyMs: null, httpStatus: null }
      const u = new URL(item.url)
      // Upstreams come only from operator-controlled environment; never from request input.
      const publicUrl = item.id === 'family-api' ? new URL('/family-ray-home-life-workspace', native).href : item.id === 'qinggan-api' ? new URL('/api/apps/qinggan-jichoushi-notebook/', native).href : /\.railway\.internal$/.test(u.hostname) ? null : `${u.origin}/`
      let pending = this.probes.get(item.id)
      if (!pending || Date.now() - pending.at > 60000) {
        pending = { at: Date.now(), promise: (async () => {
          const start = Date.now(), checkedAt = new Date().toISOString()
          try {
            const response = await this.fetch(new URL(item.healthPath, u), { redirect: 'error', signal: AbortSignal.timeout(6000), headers: { Accept: 'application/json' } })
            if (item.probeKind === 'page') {
              const valid = response.ok && response.headers.get('content-type')?.includes('text/html') && /<html\b|<!doctype html/i.test(await response.text())
              return { state: valid ? 'online' : 'degraded', checkedAt, latencyMs: Date.now() - start, httpStatus: response.status }
            }
            const body = response.ok ? await response.json().catch(() => null) : null
            return { state: response.ok && (body?.ok === true || body?.status === 'ok' || body?.status === 'healthy') ? 'online' : 'degraded', checkedAt, latencyMs: Date.now() - start, httpStatus: response.status }
          } catch { return { state: 'unreachable', checkedAt, latencyMs: Date.now() - start, httpStatus: null } }
        })() }
        this.probes.set(item.id, pending)
      }
      return { ...item, url: publicUrl, ...await pending.promise }
    }))
    const providers = [{ name: '模型接口', projectId: 'hoooho', configured: Boolean(this.env.OPENAI_API_KEY || this.env.BAILIAN_API_KEY) }, { name: '邮件接口', projectId: 'hoooho', configured: Boolean(this.env.RESEND_API_KEY) }]
    return { services, providers, checkedScope: 'API检查健康端点；前端只检查页面入口，不代表全部业务可用。配置存在不代表第三方服务在线，未发送邮件或模型请求。' }
  }
  async versions() {
    const revision = /^[0-9a-f]{40}$/i.test(this.env.RAILWAY_GIT_COMMIT_SHA || '') ? this.env.RAILWAY_GIT_COMMIT_SHA : null
    const current = { projectId: 'hoooho', channel: this.env.RAILWAY_ENVIRONMENT_NAME ? `Web ${this.env.RAILWAY_ENVIRONMENT_NAME}` : '当前服务进程', revision, deploymentId: this.env.RAILWAY_DEPLOYMENT_ID || null, startedAt: this.startedAt, repository: 'https://github.com/Hoooho-app/hoooho.app', status: 'running' }
    let data = await this.releases.read()
    if (revision && !data.releases?.some(r => r.revision === revision && r.deploymentId === current.deploymentId)) data = await this.releases.update(raw => raw.releases?.some(r => r.revision === revision && r.deploymentId === current.deploymentId) ? raw : ({ releases: [current, ...(raw.releases || [])].slice(0, 50) }))
    return { current, releases: data.releases || [], projects: OPS_PROJECTS, native: { state: 'unconnected', label: 'TestFlight / App Store 尚未接入发布回执，Web 提交不代表原生包版本。' } }
  }
}
