import { BILLING_FIELDS } from '../../shared/ops-billing-catalog.mjs'
import { createHash } from 'node:crypto'
export const FIELD_LABELS = Object.freeze({
  balance: ['available balance', 'prepaid balance', 'credit balance', 'remaining credits', 'account balance', '可用余额', '账户余额', '余额'],
  currentCost: ['current usage', 'current spend', 'month to date', 'total usage', 'current bill', 'current charges', '本期费用', '本月费用', '本月消费', '当前费用', '累计消费'],
  estimatedCost: ['estimated total', 'estimated cost', 'estimated bill', 'projected usage', '预计费用', '预估费用', '预计本期费用'],
  subscriptionAmount: ['subscription price', 'subscription amount', 'plan price', 'monthly price', 'monthly fee', '订阅金额', '套餐费用', '订阅费用', '月费'],
  overdueAmount: ['past due', 'overdue amount', '欠费金额', '已欠金额'],
  dueAt: ['expiration date', 'expires on', 'expires', 'expiry date', 'membership expires', 'payment due', 'due date', '到期时间', '到期日期', '付款截止日期', '会员到期'],
  nextChargeAt: ['next billing date', 'next payment', 'next charge', 'renews on', 'renewal date', 'next renewal', '下次扣款日期', '下次扣款', '下次付款', '下次续费', '续费日期'],
  billingPeriodStart: ['period start', 'billing period start', '本期开始', '计费开始'],
  billingPeriodEnd: ['period end', 'billing period end', 'billing cycle ends', 'current period ends', '本期结算日期', '结算日期', '周期结束', '计费截止'],
  storageUsed: ['storage used', 'used storage', 'disk usage', 'used capacity', '已用存储', '存储用量', '已用容量', '已使用空间'],
  storageLimit: ['storage capacity', 'total storage', 'volume capacity', 'disk capacity', '存储容量', '总容量', '磁盘容量'],
  unitPrice: ['unit price', 'storage rate', 'price per gb', '计费单价', '存储单价', '单价'],
  quotaRemaining: ['remaining quota', 'remaining allowance', 'remaining messages', 'remaining emails', '剩余额度', '剩余用量', '剩余次数'],
  quotaLimit: ['included quota', 'included allowance', 'monthly quota', 'total quota', '用量总额度', '总额度', '套餐额度'],
  seatCount: ['billable seats', 'paid seats', 'seat count', 'seats', '计费席位', '付费席位', '席位数'],
  plan: ['current plan', 'subscription plan', 'membership', 'plan', '当前套餐', '订阅套餐', '套餐'],
  autoRenew: ['auto renew', 'auto-renew', 'auto renewal', 'automatic renewal', '自动续费', '自动续订']
})
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export const fieldPattern = key => `^\\s*(?:${(FIELD_LABELS[key] || []).slice().sort((a,b)=>b.length-a.length).map(escape).join('|')})(?=\\s|[:：]|$)\\s*[:：]?\\s*`
export function parseBillingValue(key, text, currency) {
  if (!BILLING_FIELDS[key] || typeof text !== 'string') return null
  const raw = text.replace(/\s+/g, ' ').trim().replace(new RegExp(fieldPattern(key), 'i'), '').trim()
  if (!raw || raw.length > 160 || /@|sk-[A-Za-z0-9]|(?:\d[ -]?){14,}/.test(raw)) return null
  const kind = BILLING_FIELDS[key].kind
  if (kind === 'money') {
    const matches = raw.match(/(?:USD|CNY|EUR|GBP|JPY|AUD|CAD|HKD|SGD|RMB|US\$|CN¥|[$¥￥€£])\s*-?\d[\d,]*(?:\.\d+)?|-?\d[\d,]*(?:\.\d+)?\s*(?:USD|CNY|EUR|GBP|JPY|AUD|CAD|HKD|SGD|元)/gi) || []
    if (matches.length !== 1) return null
    const rest = raw.replace(matches[0], '').trim()
    if (rest && !/^(?:\/|per\s+)(?:GB|GiB|TB|MiB|month|mo|year|月|年|天|小时)(?:[\s/]*(?:month|mo|year|月|年|天|小时))?$/i.test(rest)) return null
    const value = Number(matches[0].replace(/[^\d.,-]/g, '').replace(/,/g, ''))
    const code = /\b(USD|CNY|EUR|GBP|JPY|AUD|CAD|HKD|SGD)\b/i.exec(matches[0])?.[1].toUpperCase() || (/RMB|[¥￥]|元|CN¥/i.test(matches[0]) ? 'CNY' : /€/.test(matches[0]) ? 'EUR' : /£/.test(matches[0]) ? 'GBP' : /US\$/.test(matches[0]) ? 'USD' : currency)
    if (!Number.isFinite(value) || !/^[A-Z]{3}$/.test(code || '')) return null
    const suffix = /(?:\/|per\s+)(?:GB|GiB|TB|MiB|month|mo|year|月|年|天)(?:[\s/]*(?:month|mo|year|月|年|天))?/i.exec(raw)?.[0] ?? null
    return { value, currency: code, ...(suffix ? { unit: suffix } : {}) }
  }
  if (kind === 'quantity') {
    const match = /^([\d,]+(?:\.\d+)?)\s*(GiB|MiB|KiB|TiB|GB|MB|KB|TB|bytes|emails?|messages?|minutes?|seats?|requests?|封|次|个|席位|分钟)?$/i.exec(raw)
    if (!match) return null
    const value = Number(match[1].replace(/,/g, ''))
    return Number.isFinite(value) ? { value, unit: match[2] || null } : null
  }
  if (kind === 'date') {
    let value = /^\d{4}-\d{2}-\d{2}(?:T[^ ]+Z)?$/.test(raw) ? raw : null
    const cn = /^(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日$/.exec(raw)
    if (cn) value = `${cn[1]}-${cn[2].padStart(2,'0')}-${cn[3].padStart(2,'0')}`
    if (/^(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}$/i.test(raw)) { const parsed = Date.parse(raw + ' UTC'); if (Number.isFinite(parsed)) value = new Date(parsed).toISOString().slice(0,10) }
    if (!value || !Number.isFinite(Date.parse(value)) || new Date(Date.parse(value.slice(0,10))).toISOString().slice(0,10) !== value.slice(0,10)) return null
    return { value }
  }
  if (kind === 'boolean') {
    if (/^(on|enabled|active|yes|开启|已开启|已启用|自动续费已开启)$/i.test(raw)) return { value: true }
    if (/^(off|disabled|inactive|no|关闭|未开启|已关闭|未启用)$/i.test(raw)) return { value: false }
    return null
  }
  return /^[\p{L}\p{N}\s/+().-]{1,80}$/u.test(raw) ? { value: raw } : null
}
export function metricsToFacts(metrics, sourceId) {
  const value = key => metrics[key]?.value ?? null
  return { metrics, balance: value('balance'), currency: metrics.balance?.currency ?? null, dueAt: value('dueAt'), dueKind: sourceId === 'godaddy-domain' ? 'domain-expiry' : 'renewal',
    plan: value('plan'), autoRenew: value('autoRenew'), quotaRemaining: value('quotaRemaining'), quotaLimit: value('quotaLimit'), quotaUnit: metrics.quotaRemaining?.unit ?? null }
}
export async function inspectBillingPage(page, { currency = 'USD', selector = null } = {}) {
  const found = await page.evaluate(({ labels, chosen }) => {
    const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' }
    const path = (el, stop) => { const pieces=[]; for(let node=el;node && node!==stop && node!==document.documentElement;node=node.parentElement) { const tag=node.tagName.toLowerCase(); const siblings=node.parentElement ? [...node.parentElement.children].filter(n=>n.tagName===node.tagName):[node]; pieces.unshift(`${tag}:nth-of-type(${siblings.indexOf(node)+1})`) } return (stop ? ':scope > ' : '') + pieces.join(' > ') }
    let root
    if (chosen) { const matches=document.querySelectorAll(chosen); if(matches.length===1)root=matches[0] }
    else root=[...document.querySelectorAll('main,[role=main],article')].filter(visible).sort((a,b)=>b.getBoundingClientRect().width*b.getBoundingClientRect().height-a.getBoundingClientRect().width*a.getBoundingClientRect().height)[0]
    if (!root || /^(BODY|HTML)$/.test(root.tagName)) return null
    const regionSelector=path(root,null), rows=[], masks=['input','textarea','[autocomplete="cc-number"]']
    const nodes=[...root.querySelectorAll('*')].slice(0,6000).filter(el=>!['INPUT','TEXTAREA','SCRIPT','STYLE','SVG','PATH'].includes(el.tagName)&&visible(el))
    for(const el of nodes) {
      const text=(el.textContent||'').replace(/\s+/g,' ').trim()
      if(el.children.length===0 && /[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:visa|mastercard|card ending|尾号|卡号)|sk-[\w-]+|(?:\d[ -]?){14,}/i.test(text))masks.push(regionSelector+' '+path(el,root).replace(/^:scope\s*>\s*/,''))
      if(!text || text.length>130 || el.children.length>1)continue
      for(const [key,pattern] of Object.entries(labels)) {
        const match=new RegExp(pattern,'i').exec(text)
        if(!match)continue
        const values=[{el,depth:0}]
        let parent=el.parentElement
        for(let depth=0;parent && parent!==root && depth<2;depth++,parent=parent.parentElement) for(const sibling of parent.children) if(sibling!==el && !sibling.contains(el) && visible(sibling) && (sibling.textContent||'').trim().length<160)values.push({el:sibling,depth:depth+1})
        for(const item of values) rows.push({key,depth:item.depth,raw:(item.el.textContent||'').trim(),selector:path(item.el,root),labelSelector:path(el,root),labelText:match[0].trim()})
      }
    }
    const r=root.getBoundingClientRect()
    return { selector:regionSelector, readySelector:regionSelector, masks:[...new Set(masks)], rows, rect:{x:r.x,y:r.y,width:r.width,height:r.height} }
  }, { labels: Object.fromEntries(Object.keys(FIELD_LABELS).map(key=>[key,fieldPattern(key)])), chosen: selector })
  if (!found) return { selector:null, candidates:[], maskSelectors:[], version:null, rect:null }
  const candidates=[]
  for(const key of Object.keys(BILLING_FIELDS)) {
    const values=found.rows.filter(r=>r.key===key).map(row=>({...row, parsed:parseBillingValue(key,row.raw,currency)})).filter(r=>r.parsed)
    const labels=new Map()
    for(const row of values){const current=labels.get(row.labelSelector)||[];if(!current.length||row.depth<current[0].depth)labels.set(row.labelSelector,[row]);else if(row.depth===current[0].depth)current.push(row)}
    const nearest=[...labels.values()].flat()
    const unique=[...new Set(nearest.map(r=>JSON.stringify(r.parsed)))]
    if(unique.length===1) { const candidate=nearest.find(v=>v.selector!==v.labelSelector)||nearest[0]; candidates.push({...candidate,label:BILLING_FIELDS[key].label}) }
  }
  const version=createHash('sha256').update(JSON.stringify(candidates.map(c=>[c.key,c.raw,c.selector,c.labelSelector]))).digest('hex')
  return { selector:found.selector, readySelector:found.readySelector, maskSelectors:found.masks, rect:found.rect, candidates, version }
}
export async function readBoundBillingFields(page, profile) {
  const region=page.locator(profile.selector), metrics={}
  if(await region.count()!==1)throw Object.assign(new Error('Billing region unavailable'),{code:'AUTH_REQUIRED'})
  for(const [key,binding] of Object.entries(profile.fields||{})) {
    if(!BILLING_FIELDS[key] || typeof binding!=='object')continue
    try {
      const label=region.locator(binding.labelSelector), value=region.locator(binding.selector)
      if(await label.count()!==1 || await value.count()!==1)continue
      const labelText=await label.textContent({timeout:2000})
      if(!new RegExp(fieldPattern(key),'i').test(labelText||''))continue
      const parsed=parseBillingValue(key,await value.textContent({timeout:2000}),profile.currency)
      if(parsed)metrics[key]=parsed
    } catch { /* one changed field must not fabricate or erase another observed field */ }
  }
  return metrics
}
