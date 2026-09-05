import { AsyncLocalStorage } from 'node:async_hooks'
import { mkdir, open, readFile, rename } from 'node:fs/promises'
import path from 'node:path'

const context = new AsyncLocalStorage()
let queue = Promise.resolve()
const roots = new Set()
const recovered = new Set()
const invalidators = new Set()
export function registerTransactionRoot(directory) { roots.add(path.resolve(directory)) }
export function registerSnapshotInvalidator(callback) { invalidators.add(callback) }
export function stagedValue(file) { return context.getStore()?.changes?.get(file) }
export function stageValue(file, value) {
  const changes = context.getStore()?.changes
  if (!changes) return false
  changes.set(file, value)
  return true
}
async function atomicWrite(file, value) {
  await mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.transaction-tmp`
  const handle = await open(temporary, 'w', 0o600)
  try { await handle.writeFile(value, 'utf8'); await handle.sync() } finally { await handle.close() }
  await rename(temporary, file)
}
async function recover(directory) {
  const journal = path.join(directory, 'pending-account-transaction.json')
  let data
  try { data = JSON.parse(await readFile(journal, 'utf8')) } catch (error) {
    if (error.code === 'ENOENT') return
    throw Object.assign(new Error('Account transaction recovery storage is unavailable'), { code: 'RECOVERY_UNAVAILABLE' })
  }
  if (!data.pending) return
  for (const entry of data.entries) {
    const file = path.resolve(directory, entry.file)
    const relative = path.relative(directory, file)
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Invalid transaction path')
    await atomicWrite(file, entry.before)
  }
  await atomicWrite(journal, JSON.stringify({ pending: false }))
  for (const invalidate of invalidators) invalidate()
}
export function withStorageLock(operation) {
  if (context.getStore()) return operation()
  const result = queue.then(() => context.run({}, async () => {
    for (const directory of roots) {
      if (!recovered.has(directory)) { await recover(directory); recovered.add(directory) }
    }
    return operation()
  }))
  queue = result.catch(() => undefined)
  return result
}
// The existing deployment has one process owning its persistent volume. All
// JsonStore access shares this barrier, including during crash recovery.
export function accountTransaction(directory, operation) {
  if (context.getStore()?.changes) return operation()
  directory = path.resolve(directory)
  registerTransactionRoot(directory)
  return withStorageLock(() => context.run({ changes: new Map() }, async () => {
    const result = await operation()
    const entries = []
    for (const [file, value] of context.getStore().changes) {
      const relative = path.relative(directory, file)
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Transaction outside account storage')
      let before
      try { before = await readFile(file, 'utf8') } catch (error) {
        if (error.code !== 'ENOENT') throw error
        before = JSON.stringify(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, Array.isArray(item) ? [] : item])))
      }
      entries.push({ file: relative, before, after: JSON.stringify(value) })
    }
    if (!entries.length) return result
    const journal = path.join(directory, 'pending-account-transaction.json')
    await atomicWrite(journal, JSON.stringify({ pending: true, entries }))
    try {
      for (const entry of entries) await atomicWrite(path.join(directory, entry.file), entry.after)
      await atomicWrite(journal, JSON.stringify({ pending: false }))
    } catch (error) {
      recovered.delete(directory)
      await recover(directory)
      recovered.add(directory)
      throw error
    } finally {
      for (const invalidate of invalidators) invalidate()
    }
    return result
  }))
}
