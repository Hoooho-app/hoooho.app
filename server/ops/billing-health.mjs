import { createHash } from 'node:crypto'
export const DEFAULT_REMINDERS = Object.freeze({ noticeDays: 30, warningDays: 7, criticalDays: 3, quotaWarningPercent: 20, quotaCriticalPercent: 5 })
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null
const date = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*Z)?$/.test(value) || !Number.isFinite(Date.parse(value))) return null
  return new Date(Date.parse(value.slice(0, 10))).toISOString().slice(0, 10) === value.slice(0, 10) ? value : null
}
export function cleanBillingFacts(raw = {}) {
  const result = { dueAt: date(raw.dueAt), dueKind: ['renewal', 'payment', 'quota-reset', 'domain-expiry'].includes(raw.dueKind) ? raw.dueKind : null,
    balance: number(raw.balance), lowBalanceThreshold: number(raw.lowBalanceThreshold), currency: /^[A-Z]{3}$/.test(raw.currency) ? raw.currency : null,
    quotaRemaining: number(raw.quotaRemaining), quotaLimit: number(raw.quotaLimit), quotaUnit: typeof raw.quotaUnit === 'string' ? raw.quotaUnit.slice(0, 30) : null,
    plan: typeof raw.plan === 'string' ? raw.plan.slice(0, 100) : null, autoRenew: typeof raw.autoRenew === 'boolean' ? raw.autoRenew : null }
  if (!result.currency) { result.balance = null; result.lowBalanceThreshold = null }
  if (result.quotaRemaining < 0) result.quotaRemaining = null
  if (!(result.quotaLimit > 0)) result.quotaLimit = null
  if (result.quotaLimit !== null && result.quotaRemaining > result.quotaLimit) result.quotaRemaining = null
  if (result.lowBalanceThreshold !== null && result.lowBalanceThreshold < 0) result.lowBalanceThreshold = null
  return result
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
    if (facts.balance <= 0) add('balance-empty', 'critical', `余额${facts.balance < 0 ? '已欠费' : '已用尽'}`)
    else if (facts.lowBalanceThreshold !== null && facts.balance <= facts.lowBalanceThreshold) add('balance-low', 'warning', '余额低于提醒值')
  }
  const remainingPercent = facts.quotaRemaining !== null && facts.quotaLimit ? facts.quotaRemaining / facts.quotaLimit * 100 : null
  if (remainingPercent !== null && remainingPercent <= rules.quotaWarningPercent) add(remainingPercent <= rules.quotaCriticalPercent ? 'quota-critical' : 'quota-warning', remainingPercent <= rules.quotaCriticalPercent ? 'critical' : 'warning', `额度剩余 ${Math.max(0, remainingPercent).toFixed(1)}%`)
  if (!facts.dueAt || !facts.dueKind) missing.push('到期/结算日期')
  if (facts.balance === null) missing.push('余额')
  if (remainingPercent === null) missing.push('额度')
  const hasVerifiedCondition = Boolean(facts.dueAt && facts.dueKind || remainingPercent !== null || facts.balance !== null && facts.lowBalanceThreshold !== null)
  const collectionProblem = ['failed', 'relogin', 'unconfigured', 'manual'].includes(item.status)
  let level = !item.enabled ? 'paused' : reasons.some(r => r.level === 'critical') ? 'critical' : reasons.some(r => r.level === 'warning') ? 'warning' : reasons.length ? 'notice' : !fresh || collectionProblem || !hasVerifiedCondition ? 'unknown' : 'normal'
  const label = { paused: '已停用', critical: '需立即关注', warning: '即将到期或不足', notice: '提前提醒', unknown: '待核验', normal: '已读取项目正常' }[level]
  const fingerprint = createHash('sha256').update(JSON.stringify({ facts, reasons: reasons.map(r => r.code) })).digest('hex').slice(0, 20)
  return { level, label, reasons, missing, facts, observedAt: observed ?? null, fresh, daysLeft, remainingPercent, fingerprint, verification: collectionProblem ? '采集连接待恢复；旧信息仅供参考' : !fresh ? '数据尚未核验或已过期' : '仅对已读取字段负责，缺失项不视为正常' }
}
