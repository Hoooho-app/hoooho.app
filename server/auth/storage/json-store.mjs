import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { registerSnapshotInvalidator, stagedValue, stageValue, withStorageLock } from './transaction.mjs'

const fileQueues = new Map()
const readSnapshots = new Map()
const inFlightReads = new Map()
const fileVersions = new Map()
const readSnapshotTtlMs = 1_000
registerSnapshotInvalidator(() => { readSnapshots.clear(); inFlightReads.clear() })

function freezeSnapshot(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const nested of Object.values(value)) freezeSnapshot(nested)
  return value
}

export class JsonStore {
  #filePath
  #defaultValue

  constructor(filePath, defaultValue) {
    this.#filePath = path.resolve(filePath)
    this.#defaultValue = defaultValue
  }

  async read() {
    return withStorageLock(() => this.#read())
  }

  async #read() {
    const staged = stagedValue(this.#filePath)
    if (staged !== undefined) return staged
    const cached = readSnapshots.get(this.#filePath)
    if (cached && cached.expiresAt > Date.now()) return cached.value

    const pending = inFlightReads.get(this.#filePath)
    if (pending) return pending

    const operation = (async () => {
      const version = fileVersions.get(this.#filePath) ?? 0
      let value
      try {
        value = JSON.parse(await readFile(this.#filePath, 'utf8'))
      } catch (error) {
        if (error?.code !== 'ENOENT') throw Object.assign(new Error('Account storage is unavailable'), { code: 'STORAGE_UNAVAILABLE' })
        value = structuredClone(this.#defaultValue)
      }
      const snapshot = freezeSnapshot(value)
      if ((fileVersions.get(this.#filePath) ?? 0) === version) {
        readSnapshots.set(this.#filePath, { value: snapshot, expiresAt: Date.now() + readSnapshotTtlMs })
      }
      return snapshot
    })()
    inFlightReads.set(this.#filePath, operation)
    try {
      return await operation
    } finally {
      if (inFlightReads.get(this.#filePath) === operation) inFlightReads.delete(this.#filePath)
    }
  }

  async update(updater) {
    return withStorageLock(() => this.#update(updater))
  }

  async #update(updater) {
    const nextValue = await updater(await this.read())
    if (stageValue(this.#filePath, freezeSnapshot(nextValue))) return nextValue
    const previous = fileQueues.get(this.#filePath) ?? Promise.resolve()
    const operation = previous.then(async () => {
      const next = nextValue
      await mkdir(path.dirname(this.#filePath), { recursive: true })
      const temporaryPath = `${this.#filePath}.tmp`
      await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
      await rename(temporaryPath, this.#filePath)
      const snapshot = freezeSnapshot(next)
      fileVersions.set(this.#filePath, (fileVersions.get(this.#filePath) ?? 0) + 1)
      readSnapshots.set(this.#filePath, { value: snapshot, expiresAt: Date.now() + readSnapshotTtlMs })
      return snapshot
    })
    fileQueues.set(this.#filePath, operation.catch(() => undefined))
    return operation
  }
}
