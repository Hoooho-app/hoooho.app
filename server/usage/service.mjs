import path from 'node:path'
import { readFile, readdir, lstat, statfs } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { accountCollections } from '../account/account-data-service.mjs'
import { UsageLedger } from './ledger.mjs'
import { installUsageMeter } from './ai-meter.mjs'

const MiB = 1024 ** 2
export function diskState(disk) {
  if (!disk || !disk.totalBytes) return 'unknown'
  const used = disk.usedBytes / disk.totalBytes
  if (used >= .95) return 'critical'
  if (used >= .85) return 'warning'
  if (used >= .7 || disk.availableBytes < 100 * MiB) return 'notice'
  return 'normal'
}
const labels = { normal: '容量已恢复', notice: '容量需关注', warning: '容量预警', critical: '容量紧急', unknown: '容量读取失败' }
const collections = new Map()
for (const [file, collection] of accountCollections) {
  if (!collections.has(file)) collections.set(file, new Set())
  collections.get(file).add(collection)
}
function category(relative) {
  if (relative.startsWith('recognition-originals/')) return '识别原件'
  if (relative.startsWith('quick-record-photo-files/')) return '照片与音视频'
  if (relative.startsWith('analytics/')) return '行为统计'
  if (/^(ops|feedback)\//.test(relative)) return '运营与反馈'
  if (/transaction|\.tmp$|\.transaction-tmp$/.test(relative)) return '事务与临时文件'
  if (/\.sqlite(?:-wal|-shm)?$/.test(relative)) return '数据库与日志'
  if (collections.has(relative)) return '记录与草稿'
  return '其他文件'
}

export class UsageService {
  constructor(options) {
    this.root = path.resolve(options.dataDirectory)
    this.now = options.now ?? (() => new Date())
    this.statfs = options.statfs ?? statfs
    this.ledger = options.ledger ?? new UsageLedger(options)
    if (options.installMeter !== false) installUsageMeter(this.ledger)
    this.cache = null; this.pending = null; this.owners = null; this.ownersAt = 0
  }
  async physical() {
    try {
      const disk = await this.statfs(this.root)
      const totalBytes = Number(disk.blocks) * Number(disk.bsize), availableBytes = Number(disk.bavail) * Number(disk.bsize)
      const usedBytes = (Number(disk.blocks) - Number(disk.bfree)) * Number(disk.bsize)
      if (![totalBytes, availableBytes, usedBytes].every(Number.isFinite) || totalBytes <= 0) throw new Error('Invalid disk sample')
      return { totalBytes, availableBytes, usedBytes }
    } catch { return null }
  }
  async files() {
    const groups = new Map(); let unreadable = 0
    const visit = async relative => {
      let entries
      try { entries = await readdir(path.join(this.root, relative), { withFileTypes: true }) }
      catch { unreadable++; return }
      for (const entry of entries) {
        const file = path.join(relative, entry.name)
        if (entry.isSymbolicLink()) continue
        if (entry.isDirectory()) { await visit(file); continue }
        try {
          const info = await lstat(path.join(this.root, file))
          if (!info.isFile()) continue
          const name = category(file), current = groups.get(name) ?? { name, bytes: 0, files: 0 }
          current.bytes += info.size; current.files++; groups.set(name, current)
        } catch { unreadable++ }
      }
    }
    await visit('')
    return { groups: [...groups.values()].sort((a, b) => b.bytes - a.bytes), unreadable }
  }
  async monitor() {
    if (this.cache && this.now().getTime() - Date.parse(this.cache.checkedAt) < 30000) return this.cache
    if (this.pending) return this.pending
    this.pending = (async () => {
      const disk = await this.physical(), state = diskState(disk), now = this.now()
      const samples = this.ledger.sample(disk, state, now)
      if (!this.filesCache || now.getTime() - this.filesAt >= 300000) { this.filesCache = await this.files(); this.filesAt = now.getTime() }
      const earliest = samples?.find(sample => now.getTime() - sample.at >= 3600000)
      const growthBytesPerDay = earliest && disk ? (disk.usedBytes - earliest.used) * 86400000 / (now.getTime() - earliest.at) : null
      this.cache = { projectId: 'hoooho', checkedAt: now.toISOString(), disk, state, thresholds: { notice: 70, warning: 85, critical: 95, reserveBytes: 100 * MiB }, files: this.filesCache, historyAvailable: samples !== null, samples: samples ?? [], growthBytesPerDay, remainingDays: growthBytesPerDay > 0 && disk ? disk.availableBytes / growthBytesPerDay : null }
      return this.cache
    })().finally(() => { this.pending = null })
    return this.pending
  }
  async overview() {
    const resource = await this.monitor()
    return { ...resource, ai: this.ledger.summary(), meteringAvailable: this.ledger.available, alertIds: (await this.events()).map(event => event.id) }
  }
  async events() {
    await this.monitor()
    const alerts = this.ledger.alerts()
    if (!alerts) return [{ id: 'resource:history-unavailable', projectId: 'hoooho', kind: 'resource-alert', title: '资源监控 · 采样历史不可用', preview: '打开资源监控查看当前磁盘实测结果，历史保存失败不代表容量正常。', occurredAt: this.now().toISOString(), target: '/ops/resources?project=hoooho&event=resource%3Ahistory-unavailable#resource-disk' }]
    return alerts.map(alert => {
      const id = `resource:${this.ledger.since}:${alert.id}`
      return { id, projectId: 'hoooho', kind: 'resource-alert', title: `资源监控 · ${labels[alert.state]}`, preview: '查看磁盘可用空间、阈值和最新采样。此提醒不代表任何用户欠费。', occurredAt: alert.at, target: `/ops/resources?project=hoooho&event=${encodeURIComponent(id)}#resource-disk` }
    })
  }
  async scanOwners() {
    const owners = new Map(); let errors = 0
    const owner = id => { if (!owners.has(id)) owners.set(id, { recordBytes: 0, fileBytes: 0, items: 0, keys: new Set() }); return owners.get(id) }
    // One file at a time; no extra durable copy of private contents. These are
    // UTF-8 logical sizes, not billable/physical disk allocations.
    for (const [file, keys] of collections) {
      let data
      try { data = JSON.parse(await readFile(path.join(this.root, file), 'utf8')) }
      catch (error) { if (error.code !== 'ENOENT') errors++; continue }
      if (!data || typeof data !== 'object' || Array.isArray(data)) { errors++; continue }
      for (const key of keys) for (const item of Array.isArray(data[key]) ? data[key] : []) {
        if (!item || typeof item !== 'object') { errors++; continue }
        if (typeof item.accountId !== 'string') continue
        const total = owner(item.accountId)
        total.recordBytes += Buffer.byteLength(JSON.stringify(item)); total.items++
        for (const key of ['storageKey', 'previewKey', 'posterKey']) if (typeof item[key] === 'string') total.keys.add(`quick-record-photo-files/${path.basename(item[key])}`)
      }
    }
    const sqlite = path.join(this.root, 'recognition-jobs.sqlite')
    if (existsSync(sqlite)) {
      let db
      try {
        db = new DatabaseSync(sqlite, { readOnly: true })
        db.exec('PRAGMA busy_timeout=250')
        for (const row of db.prepare('SELECT account_id,SUM(length(CAST(document AS BLOB))) bytes,COUNT(*) items FROM jobs GROUP BY account_id').all()) { const total = owner(row.account_id); total.recordBytes += row.bytes; total.items += row.items }
        for (const row of db.prepare('SELECT account_id,id FROM assets').all()) owner(row.account_id).keys.add(`recognition-originals/${path.basename(row.id)}`)
      } catch { errors++ } finally { db?.close() }
    }
    for (const total of owners.values()) {
      for (const file of total.keys) {
        try { const info = await lstat(path.join(this.root, file)); if (info.isFile()) total.fileBytes += info.size; else errors++ }
        catch { errors++ }
      }
      delete total.keys
    }
    return { owners, errors, checkedAt: this.now().toISOString() }
  }
  async account(accountId) {
    if (!this.owners || this.now().getTime() - this.ownersAt >= 300000) {
      this.ownersPending ??= this.scanOwners().then(value => { this.owners = value; this.ownersAt = this.now().getTime(); return value }).finally(() => { this.ownersPending = null })
      await this.ownersPending
    }
    const value = this.owners.owners.get(accountId) ?? { recordBytes: 0, fileBytes: 0, items: 0 }
    return { storage: { ...value, bytes: value.recordBytes + value.fileBytes, state: this.owners.errors ? 'partial' : 'estimated', checkedAt: this.owners.checkedAt }, ai: this.ledger.summary(accountId), subscription: { state: 'not_enabled', storageLimitBytes: null }, scope: '资料占用估算，含记录、草稿与原件；不含服务端副本、系统日志及部分功能数据库，不作为收费依据。每 5 分钟更新。' }
  }
  start() {
    const tick = () => { void this.monitor().catch(() => { /* Monitoring never prevents records. */ }) }
    tick(); this.timer = setInterval(tick, 60000); this.timer.unref?.()
    return () => clearInterval(this.timer)
  }
}

const instances = new Map()
export function usageService(options) {
  const key = path.resolve(options.dataDirectory)
  if (!instances.has(key)) instances.set(key, new UsageService(options))
  return instances.get(key)
}
