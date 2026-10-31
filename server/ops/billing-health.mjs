import { BILLING_FIELDS, billingDefinition } from '../../shared/ops-billing-catalog.mjs'
import { createHash } from 'node:crypto'
export const DEFAULT_REMINDERS = Object.freeze({ noticeDays: 30, warningDays: 7, criticalDays: 3, quotaWarningPercent: 20, quotaCriticalPercent: 5 })
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null
const date = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*Z)?$/.test(value) || !Number.isFinite(Date.parse(value))) return null
  return new Date(Date.parse(value.slice(0, 10))).toISOString().slice(0, 10) === value.slice(0, 10) ? value : null
}
export function cleanBillingFacts(raw = {}) {
  const result = { dueAt: date(raw.dueAt), dueKind: ['renewal', 'payment', 'quota-reset', 'domain-expiry'].includes(raw.dueKind) ? raw.dueKind : null,
    balanceMode: ['prepaid','postpaid','credit'].includes(raw.balanceMode) ? raw.balanceMode : null, quotaKind: ['hard-cap','included'].includes(raw.quotaKind) ? raw.quotaKind : null,
    balance: number(raw.balance), lowBalanceThreshold: number(raw.lowBalanceThreshold), currency: /^[A-Z]{3}$/.test(raw.currency) ? raw.currency : null,
    quotaRemaining: number(raw.quotaRemaining), quotaLimit: number(raw.quotaLimit), quotaUnit: typeof raw.quotaUnit === 'string' ? raw.quotaUnit.slice(0, 30) : null,
    plan: typeof raw.plan === 'string' ? raw.plan.slice(0, 100) : null, autoRenew: typeof raw.autoRenew === 'boolean' ? raw.autoRenew : null }
  if (!result.currency) { result.balance = null; result.lowBalanceThreshold = null }
  if (result.quotaRemaining < 0) result.quotaRemaining = null
  if (!(result.quotaLimit > 0)) result.quotaLimit = null
  if (result.quotaLimit !== null && result.quotaRemaining > result.quotaLimit) result.quotaRemaining = null
  if (result.lowBalanceThreshold !== null && result.lowBalanceThreshold < 0) result.lowBalanceThreshold = null
  const metrics = {}
  if (raw.metrics && typeof raw.metrics === 'object') for (const [key, input] of Object.entries(raw.metrics)) {
    const def = BILLING_FIELDS[key]
    if (!def || !input || typeof input !== 'object') continue
    let value = null
    if (def.kind === 'money' && number(input.value) !== null && /^[A-Z]{3}$/.test(input.currency)) value = { value: input.value, currency: input.currency }
    if (def.kind === 'quantity' && number(input.value) !== null && input.value >= 0) value = { value: input.value }
    if (def.kind === 'date' && date(input.value)) value = { value: input.value }
    if (def.kind === 'boolean' && typeof input.value === 'boolean') value = { value: input.value }
    if (def.kind === 'text' && typeof input.value === 'string' && input.value.length <= 100 && !/@|sk-[A-Za-z0-9]/.test(input.value)) value = { value: input.value }
    if (value) { if (typeof input.unit === 'string' && input.unit.length <= 30) value.unit = input.unit; metrics[key] = value }
  }
  for (const key of ['dueAt','plan','autoRenew','quotaRemaining','quotaLimit']) if (!metrics[key] && result[key] !== null) metrics[key] = { value: result[key], ...(['quotaRemaining','quotaLimit'].includes(key) && result.quotaUnit ? { unit: result.quotaUnit } : {}) }
  if (!metrics.balance && result.balance !== null) metrics.balance = { value: result.balance, currency: result.currency }
  result.metrics = metrics
  return result
}

export function billingFieldRows(item, connection, connectedFields) {
  const definition = billingDefinition(item, connectedFields), facts = cleanBillingFacts(item.observation?.facts)
  const keys = [...new Set([...definition.fields, ...Object.keys(facts.metrics)])]
  return keys.filter(key => BILLING_FIELDS[key]).map(key => ({ key, label: key === 'dueAt' ? facts.dueKind === 'domain-expiry' || item.id === 'godaddy-domain' ? '域名注册到期' : facts.dueKind === 'payment' ? '付款截止日期' : '到期日期' : BILLING_FIELDS[key].label, kind: BILLING_FIELDS[key].kind,
    metric: facts.metrics[key] ?? null, state: facts.metrics[key] ? 'available' : !item.observation ? connection?.state === 'ready' ? 'pending' : 'authorization' : 'missing',
    reason: facts.metrics[key] ? null : !item.observation ? connection?.state === 'ready' ? '等待首次采集' : '登录后自动读取' : '当前账单区域未找到' }))
}

export function billingHealth(item, now = new Date(), rules = DEFAULT_REMINDERS) {
  const observation = item.observation, facts = cleanBillingFacts(observation?.facts)
  const reasons = [], missing = []
  const add = (code, level, label) => reasons.push({ code, level, label })
  const observed = observation?.observedAt
  const fresh = Boolean(observed && Number.isFinite(Date.parse(observed)) && now.getTime() - Date.parse(observed) <= (item.frequency === 'weekly' ? 8 * 86400000 : 36 * 3600000) && Date.parse(observed) <= now.getTime() + 60000)
  const day = value => new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
  const daysLeft = facts.dueAt && facts.dueKind ? Math.round((Date.parse(day(facts.dueAt)) - Date.parse(day(now))) / 86400000) : null
  if (daysLeft !== null && facts.dueKind !== 'quota-reset') {
    if (daysLeft < 0) add('expired', 'critical', `已超过${facts.dueKind === 'domain-expiry' ? '域名到期日' : '到期日'} ${-daysLeft} 天`)
    else if (daysLeft <= rules.criticalDays) add('due-critical', 'critical', daysLeft ? `${daysLeft} 天内到期` : '今天到期')
    else if (daysLeft <= rules.warningDays) add('due-warning', 'warning', `${daysLeft} 天后到期`)
    else if (daysLeft <= rules.noticeDays) add('due-notice', 'notice', `${daysLeft} 天后到期`)
  }
  if (facts.balance !== null) {
    if (facts.balance <= 0 && (facts.balanceMode === 'prepaid' || item.billingModes?.includes('prepaid'))) add('balance-empty', 'critical', `余额${facts.balance < 0 ? '已欠费' : '已用尽'}`)
    else if (facts.lowBalanceThreshold !== null && facts.balance <= facts.lowBalanceThreshold) add('balance-low', 'warning', '余额低于提醒值')
  }
  const overdue = facts.metrics.overdueAmount
  if (overdue?.value > 0) add('overdue', 'critical', `平台显示欠费 ${overdue.currency} ${overdue.value}`)
  const units = { B:1, KB:1000, MB:1000000, GB:1000000000, TB:1000000000000, KIB:1024, MIB:1048576, GIB:1073741824, TIB:1099511627776 }
  const used = facts.metrics.storageUsed, capacity = facts.metrics.storageLimit
  if (used && capacity && units[String(used.unit).toUpperCase()] && units[String(capacity.unit).toUpperCase()] && capacity.value > 0) { const percent = used.value * units[String(used.unit).toUpperCase()] / (capacity.value * units[String(capacity.unit).toUpperCase()]) * 100; if (percent >= 85) add(percent >= 95 ? 'storage-critical' : 'storage-warning', percent >= 95 ? 'critical' : 'warning', `已读取存储容量使用率 ${percent.toFixed(1)}%，请核对扩容`) }
  const nextCharge = facts.metrics.nextChargeAt?.value
  if (nextCharge && date(nextCharge)) { const chargeDays = Math.round((Date.parse(day(nextCharge)) - Date.parse(day(now))) / 86400000); if (chargeDays >= 0 && chargeDays <= rules.warningDays) add('upcoming-charge', 'notice', `${chargeDays === 0 ? '今天' : `${chargeDays} 天后`}将扣款，请留意付款方式`) }
  const remainingPercent = facts.quotaRemaining !== null && facts.quotaLimit ? facts.quotaRemaining / facts.quotaLimit * 100 : null
  if (remainingPercent !== null && remainingPercent <= rules.quotaWarningPercent) add(remainingPercent <= rules.quotaCriticalPercent ? 'quota-critical' : 'quota-warning', remainingPercent <= rules.quotaCriticalPercent && facts.quotaKind === 'hard-cap' ? 'critical' : 'warning', `${remainingPercent <= 0 && facts.quotaKind !== 'hard-cap' ? '套餐额度已用完，是否产生额外费用需核对；' : ''}额度剩余 ${Math.max(0, remainingPercent).toFixed(1)}%`)
  if (!facts.dueAt || !facts.dueKind) missing.push('到期/结算日期')
  if (facts.balance === null) missing.push('余额')
  if (remainingPercent === null) missing.push('额度')
  const hasVerifiedCondition = Object.keys(facts.metrics).some(k => !['plan','autoRenew','balance'].includes(k)) || Boolean(facts.dueAt && facts.dueKind || remainingPercent !== null || facts.balance !== null && facts.lowBalanceThreshold !== null)
  const collectionProblem = ['failed', 'relogin', 'unconfigured', 'manual'].includes(item.status)
  let level = !item.enabled ? 'paused' : reasons.some(r => r.level === 'critical') ? 'critical' : reasons.some(r => r.level === 'warning') ? 'warning' : reasons.length ? 'notice' : !fresh || collectionProblem || !hasVerifiedCondition ? 'unknown' : 'normal'
  const label = { paused: '已停用', critical: '需立即关注', warning: '即将到期或不足', notice: '提前提醒', unknown: '待核验', normal: '已读取项暂无异常' }[level]
  const fingerprint = createHash('sha256').update(JSON.stringify({ facts, reasons: reasons.map(r => r.code) })).digest('hex').slice(0, 20)
  return { level, label, reasons, missing, facts, observedAt: observed ?? null, fresh, daysLeft, remainingPercent, fingerprint, verification: collectionProblem ? '采集连接待恢复；旧信息仅供参考' : !fresh ? '数据尚未核验或已过期' : '仅对已读取字段负责，缺失项不视为正常' }
}
