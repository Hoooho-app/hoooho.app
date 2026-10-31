import { cleanBillingFacts } from './billing-health.mjs'
const hosts = Object.freeze({ aliyun: ['usercenter2.aliyun.com'], 'apple-developer': ['developer.apple.com'], railway: ['railway.com'], 'railway-volume': ['railway.com'], openai: ['platform.openai.com'], resend: ['resend.com'], cloudflare: ['dash.cloudflare.com'], 'godaddy-domain': ['account.godaddy.com', 'dc.console.aliyun.com'], github: ['github.com'], figma: ['www.figma.com'], 'chatgpt-codex': ['chatgpt.com'] })
const fail = code => Object.assign(new Error('Billing collection unavailable'), { code })
export function parseBillingFields(values, config = {}) {
  const numeric = value => typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value.replace(/,/g, '').trim()) ? Number(value.replace(/,/g, '').trim()) : null
  const money = value => { if (typeof value !== 'string') return null; const symbol = { USD: '$', CNY: '¥', EUR: '€', GBP: '£', JPY: '¥' }[config.currency]; let text = value.trim(); if (text.startsWith(config.currency + ' ')) text = text.slice(4); if (symbol && text.startsWith(symbol)) text = text.slice(symbol.length); return numeric(text) }
  let dueAt = values.dueAt?.trim()
  if (config.dateFormat === 'MM/DD/YYYY' || config.dateFormat === 'DD/MM/YYYY') { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dueAt || ''); dueAt = m ? `${m[3]}-${config.dateFormat === 'MM/DD/YYYY' ? m[1] : m[2]}-${config.dateFormat === 'MM/DD/YYYY' ? m[2] : m[1]}` : null }
  return cleanBillingFacts({ dueAt, dueKind: config.dueKind, balance: money(values.balance), lowBalanceThreshold: config.lowBalanceThreshold,
    currency: config.currency, quotaRemaining: numeric(values.quotaRemaining), quotaLimit: numeric(values.quotaLimit), quotaUnit: config.quotaUnit, plan: values.plan,
    autoRenew: values.autoRenew === config.autoRenewTrueText && Boolean(config.autoRenewTrueText) ? true : values.autoRenew === config.autoRenewFalseText && Boolean(config.autoRenewFalseText) ? false : null })
}
export function createBillingCollectors({ env = process.env, fetchImpl = fetch, connect } = {}) {
  let profiles = {}
  try { profiles = JSON.parse(env.OPS_CAPTURE_PROFILES || '{}') } catch { /* invalid config stays unavailable */ }
  let browserPromise
  const browser = async () => {
    if (!env.OPS_BROWSER_CDP_URL) throw fail('COLLECTOR_UNCONFIGURED')
    if (!browserPromise) browserPromise = (async () => {
      const value = connect ? await connect(env.OPS_BROWSER_CDP_URL) : await (await import('playwright-core')).chromium.connectOverCDP(env.OPS_BROWSER_CDP_URL, { timeout: 15000 })
      value.on?.('disconnected', () => { browserPromise = null })
      return value
    })().catch(error => { browserPromise = null; throw error })
    return browserPromise
  }
  const status = item => {
    if (item.id === 'godaddy-domain') return { state: 'ready', label: 'hoooho.com 官方到期数据', detail: '自动读取 hoooho.com 注册到期事件；扣款日、自动续费和账户余额需另行授权。' }
    const profile = profiles[item.id]
    if (!hosts[item.id]) return { state: 'unconfigured', label: '待接入采集器', detail: '自定义来源需登记受控的只读采集器。' }
    if (!env.OPS_BROWSER_CDP_URL) return { state: 'authorization', label: '待持续登录授权', detail: '尚未连接专用账单浏览器，日常无需上传截图。' }
    if (!profile?.url || !profile?.selector || !profile?.readySelector || !Array.isArray(profile.maskSelectors) || profile.privacyReviewed !== true) return { state: 'unconfigured', label: '待配置账单区域', detail: '需确认账单区域、已登录标志和隐私遮罩后才能自动拍照。' }
    try { const u = new URL(profile.url); if (u.protocol !== 'https:' || u.username || u.password || !hosts[item.id].includes(u.hostname)) throw Error() } catch { return { state: 'unconfigured', label: '采集地址待修正', detail: '仅可访问该供应商已登记的 HTTPS 账单页面。' } }
    return { state: 'ready', label: '自动采集已配置', detail: '后台定时读取账单区域；会话失效时提示重新登录。' }
  }
  const capture = async (item, { signal } = {}) => {
    if (status(item).state !== 'ready') throw fail('COLLECTOR_UNCONFIGURED')
    const profile = profiles[item.id], connected = await browser()
    const context = connected.contexts()[0]
    if (!context) throw fail('AUTH_REQUIRED')
    const page = await context.newPage()
    const abort = () => { void page.close().catch(() => {}) }
    signal?.addEventListener('abort', abort, { once: true })
    try {
      if (signal?.aborted) throw fail('COLLECTOR_TIMEOUT')
      page.setDefaultTimeout(12000)
      const response = await page.goto(profile.url, { waitUntil: 'domcontentloaded', timeout: 20000 })
      if (response?.status() === 401 || response?.status() === 403 || /\/(login|signin|sign-in|auth)(\/|\?|$)/i.test(new URL(page.url()).pathname)) throw fail('AUTH_REQUIRED')
      if (response && response.status() >= 400) throw fail('COLLECTOR_FAILED')
      try { await page.locator(profile.readySelector).waitFor({ state: 'visible', timeout: 8000 }) } catch { throw fail('AUTH_REQUIRED') }
      if (!hosts[item.id].includes(new URL(page.url()).hostname)) throw fail('AUTH_REQUIRED')
      const region = page.locator(profile.selector)
      if (await region.count() !== 1 || ['body', 'html', ':root', '*'].includes(profile.selector.trim().toLowerCase())) throw fail('COLLECTOR_FAILED')
      await region.waitFor({ state: 'visible' })
      const values = {}
      for (const key of ['dueAt', 'balance', 'quotaRemaining', 'quotaLimit', 'plan', 'autoRenew']) {
        const selector = profile.fields?.[key]
        if (typeof selector === 'string') { const field = region.locator(selector); if (await field.count() === 1) values[key] = await field.textContent({ timeout: 3000 }) }
      }
      const image = await region.screenshot({ type: 'png', timeout: 15000, animations: 'disabled', mask: profile.maskSelectors.map(s => page.locator(s)) })
      return { name: `${item.id}.png`, type: 'image/png', dataUrl: `data:image/png;base64,${image.toString('base64')}`, facts: parseBillingFields(values, profile), origin: 'page' }
    } finally { signal?.removeEventListener('abort', abort); await page.close().catch(() => {}) }
  }
  const domain = async () => {
    const response = await fetchImpl('https://rdap.verisign.com/com/v1/domain/hoooho.com', { signal: AbortSignal.timeout(15000), redirect: 'error', headers: { Accept: 'application/rdap+json' } })
    if (!response.ok) throw fail('COLLECTOR_FAILED')
    const body = await response.json()
    const dueAt = body.events?.find(e => e.eventAction === 'expiration')?.eventDate
    if (!dueAt || !Number.isFinite(Date.parse(dueAt))) throw fail('COLLECTOR_FAILED')
    return { facts: cleanBillingFacts({ dueAt, dueKind: 'domain-expiry' }), origin: 'api', evidenceUrl: 'https://rdap.verisign.com/com/v1/domain/hoooho.com' }
  }
  return { collectors: { 'automatic-screenshot': capture, api: capture, 'godaddy-domain': domain }, status }
}
