import { analyticsOperation, analyticsPage, ANALYTICS_OPERATIONS, ANALYTICS_CHOICES } from '../../shared/product-analytics.mjs'

type AnalyticsEvent = { id: string; at: number; visitor: string; session: string; view: string; page: string; kind: string; feature?: string; operation?: string; duration?: number; surface?: string; version: string; platform: string; environment: string; accountScope: string }
type Context = Pick<AnalyticsEvent, 'visitor' | 'session' | 'view' | 'page' | 'accountScope' | 'surface'>
type Operation = { feature: string; operation: string; context: Context } | null
const QUEUE_KEY = 'hoooho-behavior-queue-v1', VISITOR_KEY = 'hoooho-behavior-visitor-v1', SESSION_KEY = 'hoooho-behavior-session-v1'
const EVENT_PREFIX = 'hoooho-behavior-event-v1:'
let queue: AnalyticsEvent[] = [], context: Context | null = null, initialized = false, sending = false
let getIdentity = () => ({ token: '', account: '', authenticated: false })
let visitor = '', session = '', previousAccount = '', viewKey = '', lastActive = 0, visibleSince = 0
let lastEventAt = 0
let sessionOpened = false
let lastPagePath = ''
const shown = new Set<string>(), pending = new Set<Element>()
const asyncAttempts = new Map<string, NonNullable<Operation>>()
const uuid = () => crypto.randomUUID()
const storageRead = (storage: Storage, key: string) => { try { return storage.getItem(key) } catch { return null } }
// One storage key per event: another tab's acknowledgement cannot erase newer pending events.
const persist = (event?: AnalyticsEvent, removed: string[] = []) => { try {
  if (event) localStorage.setItem(EVENT_PREFIX + event.id, JSON.stringify(event))
  for (const id of removed) localStorage.removeItem(EVENT_PREFIX + id)
} catch { /* Statistics cannot prevent use. */ } }
const validStoredId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(value)
function rotateSession() {
  session = uuid(); sessionOpened = false; shown.clear()
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: session, at: Date.now(), opened: false, account: getIdentity().account })) } catch { /* Memory fallback. */ }
}
function currentContext(navigation = false): Context | null {
  if (!context) return null
  const identity = getIdentity(), account = identity.authenticated ? identity.account : ''
  if ((previousAccount && account !== previousAccount) || Date.now() - lastActive > 30 * 60000) {
    rotateSession(); context = { ...context, view: uuid(), session, accountScope: account }; viewKey = ''
    if (!navigation) { record('app_open', {}, context); record('page_view', {}, context); sessionOpened = true }
  }
  previousAccount = account; lastActive = Date.now()
  const surfaces = [...document.querySelectorAll('[role="dialog"][data-ha-surface]')].filter(element => element.getBoundingClientRect().width > 0)
  return { ...context, session, accountScope: account, surface: surfaces.at(-1)?.getAttribute('data-ha-surface') || '' }
}
function record(kind: string, extra: Partial<AnalyticsEvent> = {}, owner: Context | null = currentContext()) {
  if (!initialized || !owner || /^\/ops(?:\/|$)/.test(location.pathname)) return
  const platform = /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'ios' : /Android/.test(navigator.userAgent) ? 'android' : 'web'
  lastEventAt = Math.max(Date.now(), lastEventAt + .01)
  const event: AnalyticsEvent = { ...owner, id: uuid(), at: lastEventAt, kind,
    version: import.meta.env?.VITE_BUILD_COMMIT || 'local', platform, environment: import.meta.env?.DEV ? 'internal' : 'production', ...extra }
  queue.push(event)
  const dropped = queue.length > 2000 ? queue.splice(0, queue.length - 2000) : []
  persist(event, dropped.map(item => item.id))
}
function checkpoint() {
  const now = performance.now()
  if (visibleSince && context) record('page_time', { duration: Math.max(0, Math.min(60000, now - visibleSince)) }, context)
  visibleSince = document.visibilityState === 'visible' ? now : 0
}
export async function flushProductAnalytics(keepalive = false) {
  if (sending || !queue.length || !initialized || !navigator.onLine) return
  sending = true
  const batch = queue.slice(0, 60), token = getIdentity().token
  try {
    const response = await fetch('/api/analytics/events', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      credentials: 'same-origin', keepalive, body: JSON.stringify({ events: batch }), signal: keepalive ? undefined : AbortSignal.timeout(10000) })
    if (response.ok) {
      const receipt = await response.json() as { accepted: string[] }
      if (Array.isArray(receipt.accepted)) { const accepted = new Set(receipt.accepted); queue = queue.filter(item => !accepted.has(item.id)); persist(undefined, receipt.accepted) }
    } else if (response.status === 400) {
      // Drop only an incompatible batch; do not retry invalid old schemas forever.
      const rejected = new Set(batch.map(item => item.id)); queue = queue.filter(item => !rejected.has(item.id)); persist(undefined, [...rejected])
    }
  } catch { /* Retain events for reconnect; never surface telemetry failure as a business error. */ }
  finally { sending = false }
}
export function visitProductPage(pathname: string, navigationKey: string) {
  if (!initialized || viewKey === navigationKey || (context && lastPagePath === pathname)) return
  const page = analyticsPage(pathname)
  if (!page || !page.available) { checkpoint(); context = null; visibleSince = 0; return }
  checkpoint()
  if (context) record('page_exit', {}, context)
  currentContext(true)
  const identity = getIdentity(), account = identity.authenticated ? identity.account : ''
  context = { visitor, session, view: uuid(), page: page.id, accountScope: account }; previousAccount = account
  viewKey = navigationKey; lastActive = Date.now(); shown.clear(); pending.clear()
  lastPagePath = pathname
  let opened = sessionOpened
  try { const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}'); opened = opened || (saved.id === session && saved.opened); sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: session, at: lastActive, opened: true, account })) } catch { /* Memory fallback. */ }
  if (!opened) record('app_open')
  sessionOpened = true
  record('page_view'); visibleSince = document.visibilityState === 'visible' ? performance.now() : 0
  scan(); void flushProductAnalytics()
}
let intersection: IntersectionObserver | null = null
function controlFeature(element: Element) {
  const id = element.getAttribute('data-ha-id') || ''
  const href = element.getAttribute('data-ha-destination') || (element instanceof HTMLAnchorElement && element.origin === location.origin ? element.pathname : '')
  const destination = href ? analyticsPage(href) : null
  const choice = element.getAttribute('data-ha-choice') || element.getAttribute('data-record-entry') || ''
  return id + (ANALYTICS_CHOICES[choice] ? '~' + choice : '') + (destination && destination.id !== '*' && destination.available ? '@' + destination.id : '')
}
function expose(element: Element) {
  const feature = controlFeature(element)
  if (!feature || !context || shown.has(feature) || document.visibilityState !== 'visible') return
  if (element.getBoundingClientRect().width <= 0 || element.getBoundingClientRect().height <= 0 || getComputedStyle(element).visibility === 'hidden') return
  shown.add(feature); record('exposure', { feature })
}
function scan() {
  if (!context || /^\/ops(?:\/|$)/.test(location.pathname)) return
  for (const element of document.querySelectorAll('[data-ha-id]')) {
    if (!pending.has(element)) { pending.add(element); intersection?.observe(element) }
  }
  for (const element of document.querySelectorAll('[role="dialog"],dialog[open]')) {
    if (!pending.has(element) && element.getBoundingClientRect().width > 0) { pending.add(element); record('surface_view', { feature: element.getAttribute('data-ha-surface') || 'dialog' }) }
  }
}
export function startProductAnalytics(identity: typeof getIdentity) {
  if (initialized || typeof window === 'undefined') return
  getIdentity = identity; initialized = true; lastActive = Date.now()
  try {
    const savedVisitor = storageRead(localStorage, VISITOR_KEY)
    visitor = validStoredId(savedVisitor) ? savedVisitor : uuid(); localStorage.setItem(VISITOR_KEY, visitor)
    const saved = JSON.parse(storageRead(sessionStorage, SESSION_KEY) || '{}')
    if (validStoredId(saved.id) && Date.now() - saved.at < 30 * 60000 && (!saved.account || saved.account === identity().account)) { session = saved.id; sessionOpened = Boolean(saved.opened) }
    else rotateSession()
    const savedQueue: AnalyticsEvent[] = []
    for (const key of Object.keys(localStorage)) if (key.startsWith(EVENT_PREFIX)) {
      try { const item = JSON.parse(localStorage.getItem(key) || 'null'); if (item && validStoredId(item.id) && item.at >= Date.now() - 7 * 86400000 && item.at <= Date.now() + 300000) savedQueue.push(item); else localStorage.removeItem(key) } catch { localStorage.removeItem(key) }
    }
    const legacy = JSON.parse(storageRead(localStorage, QUEUE_KEY) || '[]')
    if (Array.isArray(legacy)) for (const item of legacy) if (item && validStoredId(item.id) && item.at >= Date.now() - 7 * 86400000) { savedQueue.push(item); persist(item) }
    localStorage.removeItem(QUEUE_KEY)
    queue = [...new Map(savedQueue.map(item => [item.id, item])).values()].sort((a, b) => a.at - b.at).slice(-2000)
    const attempts = JSON.parse(storageRead(localStorage, 'hoooho-behavior-async-v1') || '[]')
    if (Array.isArray(attempts)) for (const [id, attempt] of attempts.slice(-100)) if (validStoredId(id) && attempt?.context && Date.now() - attempt.createdAt < 7 * 86400000) asyncAttempts.set(id, attempt)
  } catch { visitor ||= uuid(); session ||= uuid() }
  intersection = new IntersectionObserver(entries => { for (const entry of entries) if (entry.isIntersecting && entry.intersectionRatio >= .5) expose(entry.target) }, { threshold: .5 })
  new MutationObserver(() => scan()).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'aria-hidden', 'hidden'] })
  const click = (event: Event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-ha-id]') : null
    if (!target || !context || target.matches(':disabled,[aria-disabled="true"]')) return
    if (event.type === 'click' && (target.matches('input,select') || target.getAttribute('data-ha-press') === 'true')) return
    expose(target); record('click', { feature: controlFeature(target) })
  }
  document.addEventListener('click', click, true)
  document.addEventListener('pointerdown', event => { if (event.target instanceof Element && event.target.closest('[data-ha-press="true"]')) click(event) }, true)
  document.addEventListener('change', event => { if (event.target instanceof Element && event.target.matches('input[type="file"],input[type="checkbox"],input[type="radio"],select')) click(event) }, true)
  document.addEventListener('visibilitychange', () => { checkpoint(); if (document.visibilityState === 'visible') scan(); void flushProductAnalytics(true) })
  window.addEventListener('pagehide', () => { checkpoint(); if (context) record('page_exit', {}, context); void flushProductAnalytics(true) })
  window.addEventListener('online', () => void flushProductAnalytics())
  window.setInterval(() => { checkpoint(); void flushProductAnalytics(); if (context) { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: session, at: lastActive, opened: sessionOpened, account: getIdentity().authenticated ? getIdentity().account : '' })) } catch { /* Memory fallback. */ } } }, 15000)
}
export function startAnalyticsOperation(path: string, method = 'GET', body?: unknown): Operation {
  const action = body && typeof body === 'object' && 'action' in body && typeof body.action === 'string' ? body.action : ''
  const operation = analyticsOperation(path, method, action), owner = currentContext()
  if (!operation || !owner) return null
  const attempt = { feature: operation.id, operation: uuid(), context: owner }
  record('operation_start', { feature: attempt.feature, operation: attempt.operation }, owner)
  return attempt
}
export function startNamedAnalyticsOperation(id: string): Operation {
  if (!ANALYTICS_OPERATIONS.some(item => item.id === id)) return null
  const owner = currentContext()
  if (!owner) return null
  const attempt = { feature: id, operation: uuid(), context: owner }
  record('operation_start', { feature: id, operation: attempt.operation }, owner)
  return attempt
}
export function completeAnalyticsRequest(attempt: Operation, result: unknown) {
  type Job = { id?: string; state?: string; operationReceipt?: { state?: string; recordIds?: string[] }; review?: { state?: string } }
  const value = result && typeof result === 'object' ? result as Job & { recognitionJob?: Job } : null
  const job = value?.recognitionJob || value
  const deferred = Boolean(attempt && ['smart_process', 'smart_save', 'smart_edit'].includes(attempt.feature) && validStoredId(job?.id) && job?.state && ['queued', 'running', 'publishing', 'paused', 'ready', 'needs_review', 'failed', 'discarded'].includes(job.state))
  if (deferred && attempt && validStoredId(job?.id)) {
    asyncAttempts.set(job.id, { ...attempt, createdAt: Date.now() } as NonNullable<Operation>)
  } else finishAnalyticsOperation(attempt, 'success')
  if (validStoredId(job?.id) && job?.state) {
    const active = asyncAttempts.get(job.id)
    if (active && ['ready', 'needs_review', 'failed', 'discarded'].includes(job.state)) {
      const saved = job.operationReceipt?.state === 'saved' && Boolean(job.operationReceipt.recordIds?.length) || job.review?.state === 'saved'
      finishAnalyticsOperation(active, job.state === 'discarded' ? 'cancel' : job.state === 'failed' || (active.feature !== 'smart_process' && !saved) ? 'failure' : 'success')
      if (active.feature === 'smart_process' && saved) record('operation_success', { feature: 'auto_save', operation: active.operation }, active.context)
      asyncAttempts.delete(job.id)
    }
  }
  try { localStorage.setItem('hoooho-behavior-async-v1', JSON.stringify([...asyncAttempts].slice(-100))) } catch { /* Memory fallback. */ }
}
export function finishAnalyticsOperation(attempt: Operation, outcome: 'success' | 'failure' | 'cancel', accountScope?: string) {
  if (attempt) { const { context: owner, ...fields } = attempt; record(`operation_${outcome}`, fields, { ...owner, ...(accountScope ? { accountScope } : {}) }); void flushProductAnalytics() }
}
