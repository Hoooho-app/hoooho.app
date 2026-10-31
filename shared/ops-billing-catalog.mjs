export const BILLING_CATEGORIES = Object.freeze([
  { id: 'infrastructure', name: '服务器与存储' }, { id: 'operations', name: '运营管理' },
  { id: 'ai-agents', name: 'AI 与 Agent' }, { id: 'publishing', name: '域名与发布' }, { id: 'other', name: '其他' }
])
export const BILLING_MODES = Object.freeze([
  { id: 'metered', name: '按量计费' }, { id: 'storage', name: '存储计费' }, { id: 'subscription', name: '订阅' },
  { id: 'renewal', name: '到期续费' }, { id: 'prepaid', name: '预付费余额' }
])
export const BILLING_FIELDS = Object.freeze({
  balance: { label: '可用余额', kind: 'money' }, currentCost: { label: '本期费用', kind: 'money' }, estimatedCost: { label: '平台预计本期费用', kind: 'money' }, subscriptionAmount: { label: '订阅金额', kind: 'money' }, overdueAmount: { label: '已欠金额', kind: 'money' },
  dueAt: { label: '到期或付款日期', kind: 'date' }, nextChargeAt: { label: '下次扣款日期', kind: 'date' }, billingPeriodStart: { label: '本期开始', kind: 'date' }, billingPeriodEnd: { label: '本期结算日期', kind: 'date' },
  storageUsed: { label: '已用存储', kind: 'quantity' }, storageLimit: { label: '存储容量', kind: 'quantity' }, unitPrice: { label: '计费单价', kind: 'money' },
  quotaRemaining: { label: '剩余用量额度', kind: 'quantity' }, quotaLimit: { label: '用量总额度', kind: 'quantity' }, seatCount: { label: '计费席位', kind: 'quantity' },
  plan: { label: '当前套餐', kind: 'text' }, autoRenew: { label: '自动续费', kind: 'boolean' }
})
const defaults = {
  aliyun: ['infrastructure', ['metered', 'storage', 'subscription'], ['balance', 'currentCost', 'billingPeriodEnd']],
  railway: ['infrastructure', ['subscription', 'metered'], ['plan', 'currentCost', 'estimatedCost', 'nextChargeAt']],
  'railway-volume': ['infrastructure', ['storage', 'metered'], ['storageUsed', 'unitPrice', 'currentCost', 'billingPeriodEnd']],
  openai: ['ai-agents', ['metered'], ['balance', 'currentCost', 'billingPeriodEnd']],
  resend: ['operations', ['subscription', 'metered'], ['plan', 'subscriptionAmount', 'quotaRemaining', 'quotaLimit', 'nextChargeAt']],
  cloudflare: ['infrastructure', ['subscription', 'metered'], ['plan', 'currentCost', 'nextChargeAt']],
  github: ['operations', ['subscription', 'metered'], ['plan', 'currentCost', 'nextChargeAt']],
  figma: ['operations', ['subscription'], ['plan', 'subscriptionAmount', 'seatCount', 'nextChargeAt']],
  'chatgpt-codex': ['ai-agents', ['subscription'], ['plan', 'subscriptionAmount', 'nextChargeAt']],
  'apple-developer': ['publishing', ['renewal'], ['dueAt', 'autoRenew']],
  'godaddy-domain': ['publishing', ['renewal'], ['dueAt']]
}
export const isBillingCategory = id => BILLING_CATEGORIES.some(v => v.id === id)
export const isBillingMode = id => BILLING_MODES.some(v => v.id === id)
export function billingDefinition(source, connectedFields) {
  const entry = defaults[source.id] ?? ['other', [], ['currentCost', 'billingPeriodEnd']]
  const category = isBillingCategory(source.category) ? source.category : entry[0]
  const modes = Array.isArray(source.billingModes) ? source.billingModes.filter(isBillingMode) : entry[1]
  const fields = Array.isArray(connectedFields) && connectedFields.length ? connectedFields.filter(k => BILLING_FIELDS[k]) : entry[2]
  return { connectable: Boolean(defaults[source.id]) && source.id !== 'godaddy-domain', category, categoryName: BILLING_CATEGORIES.find(c => c.id === category).name, modes, modeNames: modes.map(id => BILLING_MODES.find(m => m.id === id).name), fields, accountScope: source.id !== 'godaddy-domain' && source.id !== 'railway-volume' }
}
