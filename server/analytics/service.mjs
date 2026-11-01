import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createHmac } from 'node:crypto'
import { ANALYTICS_KINDS, ANALYTICS_OPERATIONS, ANALYTICS_RETENTION_DAYS, ANALYTICS_CHOICES, analyticsPages } from '../../shared/product-analytics.mjs'

const DAY = 86400000
const day = time => new Date(time + 8 * 3600000).toISOString().slice(0, 10)
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(value)
const error = message => Object.assign(new Error(message), { status: 400, code: 'INVALID_ANALYTICS_EVENT' })
const ratio = (a, b) => b ? Math.round(a / b * 1000) / 10 : null
export async function readAnalyticsControls(directory) {
  try { return JSON.parse(await readFile(path.join(directory, 'analytics-controls.json'), 'utf8')) }
  catch (cause) { if (cause.code === 'ENOENT') return []; throw cause }
}

export class ProductAnalyticsService {
  constructor({ dataDirectory, secret, controls = [], production = false, ownerEmail = '', now = () => Date.now() }) {
    const directory = path.join(dataDirectory, 'analytics')
    mkdirSync(directory, { recursive: true })
    this.db = new DatabaseSync(path.join(directory, 'behavior.sqlite'))
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS identities(session TEXT PRIMARY KEY, visitor TEXT NOT NULL, actor TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, at INTEGER NOT NULL, received INTEGER NOT NULL, visitor TEXT NOT NULL,
        session TEXT NOT NULL, view TEXT NOT NULL, page TEXT NOT NULL, kind TEXT NOT NULL, feature TEXT NOT NULL,
        operation TEXT NOT NULL, duration INTEGER NOT NULL, platform TEXT NOT NULL, version TEXT NOT NULL, environment TEXT NOT NULL, surface TEXT NOT NULL DEFAULT '');
      CREATE INDEX IF NOT EXISTS events_at ON events(at);
      CREATE INDEX IF NOT EXISTS events_session ON events(session,at);
      CREATE INDEX IF NOT EXISTS events_visitor ON events(visitor,at);`)
    if (!this.db.prepare('PRAGMA table_info(events)').all().some(column => column.name === 'surface')) this.db.exec("ALTER TABLE events ADD COLUMN surface TEXT NOT NULL DEFAULT ''")
    this.db.prepare('INSERT OR IGNORE INTO metadata VALUES (?,?)').run('startedAt', new Date(now()).toISOString())
    this.now = now; this.secret = secret; this.production = production; this.ownerEmail = ownerEmail.trim().toLowerCase()
    this.controls = new Map(controls.map(item => [item.id, item]))
    this.pages = new Map(analyticsPages().map(item => [item.id, item]))
    this.operations = new Map(ANALYTICS_OPERATIONS.map(item => [item.id, item]))
    this.lastPrune = 0
  }
  close() { this.db.close() }
  ingest(input, user = null) {
    if (!Array.isArray(input?.events) || input.events.length > 80) throw error('统计批次格式不正确')
    const now = this.now()
    const valid = input.events.map(item => {
      if (!item || !validId(item.id) || !validId(item.visitor) || !validId(item.session) || !validId(item.view) || !this.pages.has(item.page) || !ANALYTICS_KINDS.includes(item.kind)) throw error('统计事件格式不正确')
      if (!Number.isFinite(item.at) || item.at > now + 300000 || item.at < now - 7 * DAY) throw error('统计事件时间无效')
      const [controlId, destination] = String(item.feature || '').split('@'), [base, choice] = controlId.split('~')
      const control = /^c_[a-f0-9]{18}$/.test(base) && (!destination || this.pages.has(destination)) && (!choice || Object.hasOwn(ANALYTICS_CHOICES, choice))
      const feature = control || this.operations.has(item.feature) || item.feature === 'dialog' ? item.feature : ''
      if (['click', 'exposure'].includes(item.kind) && !feature) throw error('未知的统计控件')
      if (item.kind.startsWith('operation_') && (!this.operations.has(feature) || !validId(item.operation))) throw error('统计操作无效')
      return { ...item, feature, duration: Number.isFinite(item.duration) ? Math.min(60000, Math.max(0, Math.round(item.duration))) : 0,
        version: typeof item.version === 'string' && /^(?:[a-f0-9]{7,40}|local|\d+[.\d-]*)$/.test(item.version) ? item.version : 'unknown',
        platform: ['web', 'ios', 'android'].includes(item.platform) ? item.platform : 'web',
        environment: !this.production || item.environment === 'internal' || user?.email?.toLowerCase() === this.ownerEmail ? 'internal' : 'production' }
    })
    const insert = this.db.prepare('INSERT OR IGNORE INTO events VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    const identify = this.db.prepare('INSERT OR IGNORE INTO identities VALUES (?,?,?)')
    const actor = user && !user.guest ? createHmac('sha256', this.secret).update(user.id).digest('hex') : null
    this.db.exec('BEGIN IMMEDIATE')
    try {
      for (const item of valid) {
        if (actor && item.accountScope === user.id) {
          identify.run(item.session, item.visitor, actor)
          if (user.email?.trim().toLowerCase() === this.ownerEmail) this.db.prepare('UPDATE events SET environment=? WHERE session=? AND visitor=?').run('internal', item.session, item.visitor)
        }
        insert.run(item.id, item.at, now, item.visitor, item.session, item.view, item.page, item.kind, item.feature,
          validId(item.operation) ? item.operation : '', item.duration, item.platform, item.version, item.environment, this.controls.has(item.surface) ? item.surface : '')
      }
      if (now - this.lastPrune > DAY) {
        this.db.prepare('DELETE FROM events WHERE at < ?').run(now - ANALYTICS_RETENTION_DAYS * DAY)
        this.db.exec('DELETE FROM identities WHERE session NOT IN (SELECT DISTINCT session FROM events)')
        this.lastPrune = now
      }
      this.db.exec('COMMIT')
    } catch (cause) { this.db.exec('ROLLBACK'); throw cause }
    return { accepted: valid.map(item => item.id) }
  }
  report(params = new URLSearchParams()) {
    const now = this.now(), today = day(now)
    const end = params.get('end') || today, start = params.get('start') || day(now - 6 * DAY)
    const validDay = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00+08:00`)) && day(Date.parse(`${value}T00:00:00+08:00`)) === value
    if (!validDay(start) || !validDay(end) || start > end || end > today || Date.parse(end) - Date.parse(start) >= ANALYTICS_RETENTION_DAYS * DAY) throw error('请选择有效的日期范围，最多90天')
    const since = Date.parse(`${start}T00:00:00+08:00`), until = Date.parse(`${end}T00:00:00+08:00`) + DAY
    const environment = ['all', 'internal'].includes(params.get('environment')) ? params.get('environment') : 'production'
    const platform = ['ios', 'android', 'web'].includes(params.get('platform')) ? params.get('platform') : 'all'
    const cohort = ['new', 'returning'].includes(params.get('cohort')) ? params.get('cohort') : 'all'
    const version = params.get('version') || 'all'
    const project = params.get('project') || 'hoooho'
    const raw = this.db.prepare(`SELECT e.*, COALESCE(i.actor,'v:'||e.visitor) AS actor FROM events e
      LEFT JOIN identities i ON e.session=i.session AND e.visitor=i.visitor WHERE e.at >= ? AND e.at < ? ORDER BY e.at,e.rowid`).all(since, until)
    const firsts = this.db.prepare(`SELECT COALESCE(i.actor,'v:'||e.visitor) actor,MIN(at) firstAt FROM events e
      LEFT JOIN identities i ON e.session=i.session AND e.visitor=i.visitor WHERE (?='all' OR environment=?) GROUP BY actor`).all(environment, environment)
    const first = new Map(firsts.map(item => [item.actor, day(item.firstAt)]))
    const rows = project !== 'hoooho' && project !== 'all' ? [] : raw.filter(item =>
      (environment === 'all' || item.environment === environment) && (platform === 'all' || item.platform === platform) && (version === 'all' || item.version === version) &&
      (cohort === 'all' || (first.get(item.actor) >= start ? 'new' : 'returning') === cohort))
    const users = items => new Set(items.map(item => item.actor)).size
    const pageViews = rows.filter(item => item.kind === 'page_view')
    const sessions = new Map(), pageGroups = new Map(), featureGroups = new Map(), daily = new Map()
    for (let at = since; at < until; at += DAY) daily.set(day(at), [])
    for (const item of rows) {
      if (!sessions.has(item.session)) sessions.set(item.session, [])
      sessions.get(item.session).push(item)
      if (!pageGroups.has(item.page)) pageGroups.set(item.page, [])
      pageGroups.get(item.page).push(item)
      daily.get(day(item.at))?.push(item)
      if (item.feature && ['exposure', 'click', 'surface_view', 'operation_start', 'operation_success', 'operation_failure', 'operation_cancel'].includes(item.kind)) {
        const key = `${item.page}|${item.feature}|${item.surface}`
        if (!featureGroups.has(key)) featureGroups.set(key, [])
        featureGroups.get(key).push(item)
      }
    }
    const exits = new Map(), edges = new Map()
    for (const items of sessions.values()) {
      const views = items.filter(item => item.kind === 'page_view')
      for (let i = 1; i < views.length; i++) {
        const key = `${views[i - 1].page}|${views[i].page}`
        if (!edges.has(key)) edges.set(key, { from: views[i - 1].page, to: views[i].page, count: 0, actors: new Set() })
        const edge = edges.get(key); edge.count++; edge.actors.add(views[i].actor)
      }
      const last = views.at(-1)
      if (last && (now - items.at(-1).at > 30 * 60000 || items.at(-1).kind === 'page_exit')) exits.set(last.page, (exits.get(last.page) || 0) + 1)
    }
    const pageRows = analyticsPages().map(page => {
      const items = pageGroups.get(page.id) || [], views = items.filter(item => item.kind === 'page_view')
      const time = items.filter(item => item.kind === 'page_time').reduce((sum, item) => sum + item.duration, 0)
      return { ...page, visitors: users(views), views: views.length, seconds: Math.round(time / 1000), averageSeconds: views.length ? Math.round(time / views.length / 1000) : 0,
        clicks: items.filter(item => item.kind === 'click').length, exits: exits.get(page.id) || 0,
        status: !page.available ? 'hidden' : !items.length ? 'unobserved' : 'observed' }
    }).sort((a, b) => b.views - a.views)
    const featureRows = [...featureGroups.values()].map(items => {
      const { feature: id, page, surface } = items[0]
      const [controlId, destination] = id.split('@'), [base, choice] = controlId.split('~')
      const count = kind => items.filter(item => item.kind === kind).length
      const clickUsers = users(items.filter(item => item.kind === 'click'))
      const completed = items.filter(item => item.kind === 'operation_success')
      const name = destination ? `前往${this.pages.get(destination)?.name || '历史页面'}` : ANALYTICS_CHOICES[choice] || this.controls.get(base)?.name || this.operations.get(id)?.name || (id === 'dialog' ? '弹窗' : '旧版操作入口')
      return { id, page, surface, name: surface && surface !== id ? `${name} · ${this.controls.get(surface)?.name || '旧版表单'}` : name,
        exposures: count('exposure') + count('surface_view'), exposedUsers: users(items.filter(item => ['exposure','surface_view'].includes(item.kind))),
        clicks: count('click'), clickUsers, average: clickUsers ? Math.round(count('click') / clickUsers * 10) / 10 : 0,
        started: count('operation_start'), completed: completed.length, failed: count('operation_failure'), cancelled: count('operation_cancel'), users: users(completed), type: this.operations.get(id)?.method === 'RECEIPT' ? 'receipt' : this.operations.has(id) ? 'operation' : 'control' }
    })
    for (const op of ANALYTICS_OPERATIONS) if (!featureRows.some(item => item.id === op.id)) featureRows.push({ id: op.id, page: '', name: op.name, exposures: 0, exposedUsers: 0, clicks: 0, clickUsers: 0, average: 0, started: 0, completed: 0, failed: 0, cancelled: 0, users: 0, type: 'operation' })
    featureRows.sort((a, b) => b.clicks + b.completed - a.clicks - a.completed)
    // Ordered within the same session. Retries have distinct operation IDs; completions cannot come from another attempt.
    const funnel = (name, steps) => {
      const counts = steps.map(() => new Set())
      for (const items of sessions.values()) {
        const candidates = steps.map(() => [])
        for (const item of items) {
          for (let step = steps.length - 1; step >= 0; step--) {
            if (step === 0 ? steps[step].test(item, null) : candidates[step - 1].some(previous => steps[step].test(item, previous))) {
              counts[step].add(item.actor); candidates[step].push(item)
            }
          }
        }
      }
      return { name, steps: steps.map((step, index) => ({ name: step.name, users: counts[index].size, rate: index ? ratio(counts[index].size, counts[index - 1].size) : counts[index].size ? 100 : null })) }
    }
    const funnels = [funnel('登录', [
      { name: '尝试登录', test: item => item.kind === 'operation_start' && item.feature === 'login' },
      { name: '登录成功', test: (item, previous) => item.kind === 'operation_success' && item.feature === 'login' && item.operation === previous.operation }
    ]), funnel('手动记录', [
      { name: '进入记录页', test: item => item.kind === 'page_view' && ['/nurse-station','/health-events','/health-events/new'].includes(item.page) },
      { name: '提交保存', test: item => item.kind === 'operation_start' && item.feature === 'record_save' },
      { name: '保存成功', test: (item, previous) => item.kind === 'operation_success' && item.feature === 'record_save' && item.operation === previous.operation }
    ]), funnel('智能记录', [
      { name: '开始处理输入', test: item => item.kind === 'operation_start' && item.feature === 'smart_process' },
      { name: '整理完成', test: (item, previous) => item.kind === 'operation_success' && item.feature === 'smart_process' && item.operation === previous.operation },
      { name: '收到保存回执', test: (item, previous) => item.kind === 'operation_success' && item.feature === 'auto_save' && item.operation === previous.operation }
    ]), funnel('语音转写', [
      { name: '发起转写', test: item => item.kind === 'operation_start' && item.feature === 'transcribe' },
      { name: '转写完成', test: (item, previous) => item.kind === 'operation_success' && item.feature === 'transcribe' && item.operation === previous.operation }
    ])]
    const activeDays = new Map()
    for (const item of rows) { if (!activeDays.has(item.actor)) activeDays.set(item.actor, new Set()); activeDays.get(item.actor).add(day(item.at)) }
    const retention = [1, 7].map(offset => {
      let eligible = 0, returned = 0
      for (const [actor, days] of activeDays) {
        const firstDay = first.get(actor)
        if (!firstDay || firstDay < start || firstDay > end) continue
        const target = day(Date.parse(`${firstDay}T00:00:00+08:00`) + offset * DAY)
        // Today is incomplete; a cohort matures after the target natural day has ended.
        if (target >= today || target > end) continue
        eligible++; if (days.has(target)) returned++
      }
      return { days: offset, eligible, returned, rate: ratio(returned, eligible) }
    })
    const latest = this.db.prepare('SELECT MAX(received) lastAt FROM events WHERE (? = ? OR environment = ?)').get(environment,'all',environment).lastAt
    return { generatedAt: new Date(now).toISOString(), startedAt: this.db.prepare('SELECT value FROM metadata WHERE key=?').get('startedAt').value,
      retentionDays: ANALYTICS_RETENTION_DAYS, connected: project === 'hoooho' || project === 'all', start, end,
      collection: { lastAt: latest ? new Date(latest).toISOString() : null, controls: this.controls.size, status: !latest ? 'awaiting' : now - latest > DAY ? 'quiet' : 'receiving' },
      versions: [...new Set(raw.map(item => item.version))].sort(),
      overview: { visitors: users(pageViews), newVisitors: new Set(pageViews.filter(item => first.get(item.actor) >= start).map(item => item.actor)).size, sessions: sessions.size, views: pageViews.length,
        completed: rows.filter(item => item.kind === 'operation_success').length, zeroPages: pageRows.filter(item => item.available && !item.views).length },
      pages: pageRows, features: featureRows, funnels, retention,
      trend: [...daily].map(([date, items]) => ({ day: date, visitors: users(items.filter(item => item.kind === 'page_view')), views: items.filter(item => item.kind === 'page_view').length })),
      paths: [...edges.values()].sort((a, b) => b.count - a.count).slice(0, 100).map(item => ({ ...item, actors: item.actors.size })),
      sessions: [...sessions.values()].filter(items => items.some(item => item.kind === 'page_view')).slice(-30).reverse().map(items => ({ id: createHmac('sha256',this.secret).update(items[0].session).digest('hex').slice(0,10), at: new Date(items[0].at).toISOString(),
        pages: items.filter(item => item.kind === 'page_view').slice(0, 80).map(item => ({ page: item.page, at: new Date(item.at).toISOString() })) })) }
  }
}
