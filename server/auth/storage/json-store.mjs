import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

const fileQueues = new Map()
const readSnapshots = new Map()
const inFlightReads = new Map()
const fileVersions = new Map()
const readSnapshotTtlMs = 1_000

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
    this.#filePath = filePath
    this.#defaultValue = defaultValue
  }

  async read() {
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
        if (error?.code !== 'ENOENT') throw error
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
    const previous = fileQueues.get(this.#filePath) ?? Promise.resolve()
    const operation = previous.then(async () => {
      const current = await this.read()
      const next = await updater(current)
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
