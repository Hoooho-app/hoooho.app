import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { createHmac } from 'node:crypto'
import path from 'node:path'

const day = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
export class UsageLedger {
  constructor({ dataDirectory, tokenSecret = 'local-usage-monitor', now = () => new Date() }) {
    this.secret = tokenSecret; this.now = now; this.available = false
    try {
      mkdirSync(dataDirectory, { recursive: true })
      this.db = new DatabaseSync(path.join(dataDirectory, 'resource-usage.sqlite'))
      this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=250;
        CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS daily(owner TEXT,day TEXT,provider TEXT,model TEXT,calls INTEGER DEFAULT 0,failed INTEGER DEFAULT 0,unknown INTEGER DEFAULT 0,input REAL DEFAULT 0,output REAL DEFAULT 0,audio REAL DEFAULT 0,audio_receipts INTEGER DEFAULT 0,PRIMARY KEY(owner,day,provider,model));
        CREATE TABLE IF NOT EXISTS samples(at INTEGER PRIMARY KEY,total REAL,available REAL,used REAL);
        CREATE TABLE IF NOT EXISTS alerts(id INTEGER PRIMARY KEY AUTOINCREMENT,state TEXT,at TEXT);
        CREATE TABLE IF NOT EXISTS merges(source TEXT PRIMARY KEY,target TEXT NOT NULL);`)
      this.db.prepare('INSERT OR IGNORE INTO meta VALUES(?,?)').run('since', now().toISOString())
      this.since = this.db.prepare('SELECT value FROM meta WHERE key=?').get('since').value
      this.incomplete = Boolean(this.db.prepare('SELECT value FROM meta WHERE key=?').get('incomplete'))
      this.available = true
    } catch { this.db?.close(); this.db = null }
  }
  key(owner) { return owner ? createHmac('sha256', this.secret).update(owner).digest('hex') : 'system' }
  safely(operation) {
    if (!this.db) return null
    try { const value = operation(); this.available = true; return value }
    catch { this.available = false; this.incomplete = true; return null }
  }
  begin(owner, provider, model) {
    const call = { owner: this.key(owner), day: day(this.now()), provider: String(provider).slice(0, 40), model: String(model).slice(0, 100) }
    return this.safely(() => {
      const merged = this.db.prepare('SELECT target FROM merges WHERE source=?').get(call.owner)
      if (merged) call.owner = merged.target
      this.db.prepare('INSERT INTO daily(owner,day,provider,model,calls,unknown) VALUES(?,?,?,?,1,1) ON CONFLICT(owner,day,provider,model) DO UPDATE SET calls=calls+1,unknown=unknown+1').run(...this.params(call))
      return call
    })
  }
  params(call) {
    let owner = call.owner
    for (let i = 0; i < 8; i++) {
      const merged = this.db.prepare('SELECT target FROM merges WHERE source=?').get(owner)
      if (!merged) break
      owner = merged.target
    }
    return [owner, call.day, call.provider, call.model]
  }
  failed(call) { if (call) this.safely(() => this.db.prepare('UPDATE daily SET failed=failed+1 WHERE owner=? AND day=? AND provider=? AND model=?').run(...this.params(call))) }
  receipt(call, usage) {
    if (!call) return
    this.safely(() => this.db.prepare('UPDATE daily SET unknown=MAX(0,unknown-?),input=input+?,output=output+?,audio=audio+?,audio_receipts=audio_receipts+? WHERE owner=? AND day=? AND provider=? AND model=?')
      .run(usage.inputTokens !== null && usage.outputTokens !== null ? 1 : 0, usage.inputTokens ?? 0, usage.outputTokens ?? 0, usage.audioSeconds ?? 0, usage.audioSeconds !== null ? 1 : 0, ...this.params(call)))
  }
  summary(owner = null) {
    const from = `${day(this.now()).slice(0, 7)}-01`
    const rows = this.safely(() => this.db.prepare(`SELECT provider,model,SUM(calls) calls,SUM(failed) failed,SUM(unknown) unknown,SUM(input) inputTokens,SUM(output) outputTokens,SUM(audio) audioSeconds,SUM(audio_receipts) audioReceipts FROM daily WHERE day>=? ${owner ? 'AND owner=?' : ''} GROUP BY provider,model`).all(...(owner ? [from, this.key(owner)] : [from])))
    if (!rows) return { state: 'unavailable', since: this.since ?? null, periodStart: from, rows: [] }
    if (this.incomplete) { try { this.db.prepare('INSERT OR IGNORE INTO meta VALUES(?,?)').run('incomplete', '1') } catch { /* Preserve the live gap flag even if the disk remains full. */ } }
    const totals = rows.reduce((sum, row) => { for (const key of Object.keys(sum)) sum[key] += row[key]; return sum }, { calls: 0, failed: 0, unknown: 0, inputTokens: 0, outputTokens: 0, audioSeconds: 0, audioReceipts: 0 })
    return { state: 'available', since: this.since, periodStart: from, incomplete: Boolean(this.incomplete), ...totals, rows }
  }
  sample(disk, state, now = this.now()) {
    return this.safely(() => {
      const at = now.getTime()
      if (disk) this.db.prepare('INSERT OR REPLACE INTO samples VALUES(?,?,?,?)').run(Math.floor(at / 300000) * 300000, disk.totalBytes, disk.availableBytes, disk.usedBytes)
      this.db.prepare('DELETE FROM samples WHERE at<?').run(at - 30 * 86400000)
      const previous = this.db.prepare('SELECT state FROM alerts ORDER BY id DESC LIMIT 1').get()
      if ((!previous && state !== 'normal') || (previous && previous.state !== state)) this.db.prepare('INSERT INTO alerts(state,at) VALUES(?,?)').run(state, now.toISOString())
      this.db.exec('DELETE FROM alerts WHERE id NOT IN (SELECT id FROM alerts ORDER BY id DESC LIMIT 100)')
      return this.db.prepare('SELECT * FROM samples WHERE at>=? ORDER BY at').all(at - 86400000)
    })
  }
  alerts() { return this.safely(() => this.db.prepare('SELECT * FROM alerts ORDER BY id DESC LIMIT 100').all()) }
  merge(source, target) {
    this.safely(() => {
      const a = this.key(source), b = this.key(target)
      if (a === b || this.db.prepare('SELECT source FROM merges WHERE source=?').get(a)) return
      this.db.exec('BEGIN IMMEDIATE')
      try {
        this.db.prepare(`INSERT INTO daily SELECT ?,day,provider,model,calls,failed,unknown,input,output,audio,audio_receipts FROM daily WHERE owner=? ON CONFLICT(owner,day,provider,model) DO UPDATE SET calls=calls+excluded.calls,failed=failed+excluded.failed,unknown=unknown+excluded.unknown,input=input+excluded.input,output=output+excluded.output,audio=audio+excluded.audio,audio_receipts=audio_receipts+excluded.audio_receipts`).run(b, a)
        this.db.prepare('DELETE FROM daily WHERE owner=?').run(a)
        this.db.prepare('INSERT INTO merges VALUES(?,?)').run(a, b)
        this.db.exec('COMMIT')
      } catch (error) { this.db.exec('ROLLBACK'); throw error }
    })
  }
  remove(owner) {
    this.safely(() => { const key = this.key(owner); this.db.prepare('DELETE FROM daily WHERE owner=?').run(key); this.db.prepare('DELETE FROM merges WHERE source=? OR target=?').run(key, key) })
  }
  close() { this.db?.close(); this.db = null }
}
