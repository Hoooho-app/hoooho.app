import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { JsonStore } from '../auth/storage/json-store.mjs'

const now = () => new Date().toISOString()

export const initialOpsResources = [
  ['railway','Railway（云服务器与应用部署平台）','production','P0','manual','warning','Trial / Limited Trial（试用 / 受限试用）',0,'4.66 美元（最近人工记录）','17 天（最近人工记录）','整个 Hoho 网站和后端可能无法使用','确认当前套餐、额度和试用结束日期'],
  ['railway-volume','Railway Volume（持久化存储）','production','P0','manual','unknown','未录入',0,'Unknown（暂无可靠数据）','Unknown（暂无可靠数据）','重启后需要保留的文件可能丢失或无法写入','录入容量、使用量和预计增长速度'],
  ['database','Database（数据库，保存 Hoho 用户和业务数据）','production','P0','manual','unknown','未录入',0,'Unknown（未确认）','Unknown（暂无可靠数据）','用户数据和核心功能无法正常读取','确认数据库供应商、容量和备份状态'],
  ['file-storage','File Storage（用户文件存储）','production','P1','manual','disabled','Not configured（尚未配置）',0,'未启用','未启用','未来的图片、PDF 和报告将无法保存','启用上传功能前选择对象存储服务'],
  ['cloudflare','Cloudflare（域名解析、HTTPS 与网站加速）','production','P0','manual','normal','Free（免费）',0,'正常（人工记录）','Unknown（暂无可靠数据）','用户可能无法打开 hoooho.com','定期确认 DNS 与 HTTPS 状态'],
  ['domain','GoDaddy / hoooho.com（域名）','production','P0','manual','warning','未录入',0,'到期日期未录入','Unknown（暂无可靠数据）','用户可能无法打开 hoooho.com','录入域名到期日期、续费费用和自动续费状态'],
  ['resend','Resend（登录验证码和系统邮件）','production','P0','mixed','normal','未录入',0,'发件域名已验证','Unknown（暂无可靠数据）','用户可能收不到登录验证码邮件','录入月发送额度并接入用量同步'],
  ['sms','SMS / OTP（手机短信验证码）','production','P1','manual','disabled','Disabled（未启用）',0,'未启用','未启用','当前无影响，未来短信登录会受影响','启用短信登录时再配置供应商'],
  ['openai','OpenAI API（Hoho 产品内 AI 接口）','production','P1','mixed','unknown','Not configured（尚未配置）',0,'配置状态由服务器检查','Unknown（暂无可靠数据）','AI 功能可能停止，其他功能仍可继续','确认 Production 是否配置 OPENAI_API_KEY'],
  ['chatgpt','ChatGPT Plus / Codex（产品讨论与代码开发工具）','development','P2','manual','warning','ChatGPT Plus',20,'续费日期未录入','Unknown（暂无可靠数据）','不影响正式用户，只影响内部工作','录入续费日期和实际月费用'],
  ['github','GitHub（代码仓库与自动化工具）','development','P2','manual','unknown','未录入',0,'Unknown（未确认）','Unknown（暂无可靠数据）','代码协作、自动测试或发布可能受影响','确认套餐和 CI/CD 状态'],
  ['figma','Figma（产品与界面设计工具）','development','P2','manual','unknown','未录入',0,'续费日期未录入','Unknown（暂无可靠数据）','不影响正式用户，只影响设计工作','录入套餐、费用和续费日期'],
  ['uptime','Uptime Monitoring（网站与接口在线状态监控）','reliability','P1','api','normal','Built-in（内置检查）',0,'/api/health 正常','持续监控','故障可能无法被及时发现','保持网站与关键接口检查'],
  ['errors','Error Monitoring（程序错误监控）','reliability','P1','manual','disabled','Future（未来考虑）',0,'未配置','未启用','用户遇到程序错误时可能无法及时发现','用户量增长前选择错误监控服务'],
  ['logs','Logs / Observability（系统日志与运行监控）','reliability','P1','manual','unknown','Railway Logs（人工确认）',0,'Unknown（未确认）','Unknown（暂无可靠数据）','故障原因可能难以定位','确认日志保存时间和使用上限'],
  ['backup','Backup（故障后恢复数据的数据备份）','reliability','P0','manual','critical','Unknown（未确认）',0,'最近成功备份未确认','Unknown（暂无可靠数据）','误删除或数据库损坏后可能无法恢复','立即确认数据库备份并执行一次恢复测试'],
  ['maps','Maps / Places（地图与附近医院服务）','future','P2','manual','disabled','Future（未来考虑）',0,'未启用','未启用','当前无影响','需要附近医院功能时再评估'],
  ['ocr','OCR（图片和报告文字识别）','future','P2','manual','disabled','Future（未来考虑）',0,'未启用','未启用','当前无影响','需要报告识别时再评估'],
  ['analytics','Analytics（用户行为数据分析）','future','P2','manual','disabled','Future（未来考虑）',0,'未启用','未启用','当前无影响','有稳定用户量后再评估'],
  ['vector-db','Vector DB（AI 知识检索数据库）','future','P2','manual','disabled','Future（未来考虑）',0,'未启用','未启用','当前无影响','需要 RAG（AI 先检索资料再回答）时再评估'],
  ['other-ai','Other AI Providers（其他 AI 服务商）','future','P2','manual','disabled','Future（未来考虑）',0,'未启用','未启用','当前无影响','需要供应商冗余时再评估'],
  ['apple','Apple Developer（苹果开发者账号）','future','P2','manual','disabled','Future（未来考虑）',0,'未启用','未启用','当前无影响','准备发布 iPhone App 时再购买'],
  ['google-play','Google Play（安卓应用发布平台）','future','P2','manual','disabled','Future（未来考虑）',0,'未启用','未启用','当前无影响','准备发布 Android App 时再开通']
].map(([id,name,category,criticality,source,status,plan,monthlyCost,usage,runway,impact,nextAction]) => ({
  id,name,category,criticality,source,status,plan,monthlyCost,usage,runway,impact,nextAction,
  billingPeriod: monthlyCost ? 'Monthly（按月）' : 'Unknown（未录入）', balance: '', usageLimit: '', renewalDate: '', expirationDate: '', autoRenew: null,
  monthlyBudget: null, alertThreshold: 70, notes: '', enabled: status !== 'disabled', lastSyncAt: null, lastSuccessfulSyncAt: null, syncStatus: source === 'api' ? 'normal' : 'not-configured', updatedAt: now()
}))

function cleanText(value, max = 500) { return typeof value === 'string' ? value.trim().slice(0, max) : '' }
function cleanNumber(value) { return value === '' || value === null || value === undefined ? null : Number.isFinite(Number(value)) ? Number(value) : null }
function deriveStatus(resource) {
  if (!resource.enabled) return 'disabled'
  const date = resource.expirationDate || resource.renewalDate
  if (date) {
    const days = Math.ceil((new Date(date + 'T00:00:00').getTime() - Date.now()) / 86_400_000)
    if (days <= 3) return 'critical'
    if (days <= 14) return 'warning'
  }
  if (resource.status === 'disabled') return 'unknown'
  return resource.status
}

export class OpsService {
  constructor(options = {}) { this.store = options.store ?? new JsonStore(path.join(options.dataDirectory, 'ops', 'resources.json'), { resources: initialOpsResources }) }
  async list() {
    const data = await this.store.read()
    const resources = Array.isArray(data?.resources) ? data.resources : []
    const existingIds = new Set(resources.map((item) => item?.id).filter(Boolean))
    const missing = initialOpsResources.filter((item) => !existingIds.has(item.id))
    if (missing.length === 0) return { ...data, resources }
    return this.store.update((current) => {
      const currentResources = Array.isArray(current?.resources) ? current.resources : []
      const currentIds = new Set(currentResources.map((item) => item?.id).filter(Boolean))
      return { ...current, resources: [...currentResources, ...initialOpsResources.filter((item) => !currentIds.has(item.id))] }
    })
  }
  async update(id, input) {
    let selected
    await this.store.update((data) => {
      const index = data.resources.findIndex((item) => item.id === id)
      if (index < 0) { const error = new Error('服务不存在'); error.status = 404; error.code = 'OPS_RESOURCE_NOT_FOUND'; throw error }
      const current = data.resources[index]
      selected = { ...current,
        plan: cleanText(input.plan ?? current.plan, 120), billingPeriod: cleanText(input.billingPeriod ?? current.billingPeriod, 80),
        monthlyCost: input.monthlyCost === undefined ? current.monthlyCost : cleanNumber(input.monthlyCost), balance: cleanText(input.balance ?? current.balance, 120), usage: cleanText(input.usage ?? current.usage, 160), usageLimit: cleanText(input.usageLimit ?? current.usageLimit, 120),
        renewalDate: cleanText(input.renewalDate ?? current.renewalDate, 10), expirationDate: cleanText(input.expirationDate ?? current.expirationDate, 10), autoRenew: typeof input.autoRenew === 'boolean' ? input.autoRenew : current.autoRenew,
        monthlyBudget: input.monthlyBudget === undefined ? current.monthlyBudget : cleanNumber(input.monthlyBudget), alertThreshold: cleanNumber(input.alertThreshold) ?? current.alertThreshold,
        notes: cleanText(input.notes ?? current.notes), nextAction: cleanText(input.nextAction ?? current.nextAction, 300), enabled: typeof input.enabled === 'boolean' ? input.enabled : current.enabled,
        source: ['api','manual','mixed'].includes(input.source) ? input.source : current.source, updatedAt: now() }
      selected.status = deriveStatus(selected)
      const resources = [...data.resources]; resources[index] = selected; return { resources }
    })
    return selected
  }
  async create(input) {
    const resource = { ...initialOpsResources[0], id: randomUUID(), name: cleanText(input.name, 120), category: input.category ?? 'other', criticality: input.criticality ?? 'P2', source: 'manual', status: 'unknown', plan: '未录入', monthlyCost: 0, usage: '未录入', runway: 'Unknown（暂无可靠数据）', impact: cleanText(input.impact, 300) || '尚未评估', nextAction: '补充服务信息', updatedAt: now() }
    if (!resource.name) { const error = new Error('请输入服务名称'); error.status = 400; error.code = 'OPS_NAME_REQUIRED'; throw error }
    await this.store.update((data) => ({ resources: [...data.resources, resource] })); return resource
  }
  async sync() {
    const attemptedAt = now()
    await this.store.update((data) => ({ resources: data.resources.map((item) => {
      if (item.id === 'uptime') return { ...item, usage: '/api/health 正常', status: 'normal', syncStatus: 'normal', lastSyncAt: attemptedAt, lastSuccessfulSyncAt: attemptedAt }
      if (item.id === 'openai') { const configured = Boolean(process.env.OPENAI_API_KEY); return { ...item, plan: configured ? item.plan === 'Not configured（尚未配置）' ? 'Configured（已配置）' : item.plan : 'Not configured（尚未配置）', status: configured ? item.status : 'unknown', usage: configured ? 'Configured（已配置，不显示密钥）' : 'Missing（缺少配置）', syncStatus: 'normal', lastSyncAt: attemptedAt, lastSuccessfulSyncAt: attemptedAt } }
      if (item.source === 'manual') return item
      return { ...item, lastSyncAt: attemptedAt, syncStatus: 'failed' }
    }) }))
    return this.list()
  }
}

export function assertOpsAccess(payload, options = {}) {
  if (!payload) { const error = new Error('登录状态无效或已过期'); error.status = 401; error.code = 'UNAUTHORIZED'; throw error }
  const configuredOwner = String(options.ownerEmail ?? process.env.OPS_OWNER_EMAIL ?? '').trim().toLowerCase()
  if (!configuredOwner || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configuredOwner)) { const error = new Error('运营后台唯一管理员尚未配置'); error.status = 503; error.code = 'OPS_OWNER_NOT_CONFIGURED'; throw error }
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
  if (!email || email !== configuredOwner) { const error = new Error('当前账号没有运营后台访问权限'); error.status = 403; error.code = 'OPS_FORBIDDEN'; throw error }
  return { mode: 'owner' }
}
