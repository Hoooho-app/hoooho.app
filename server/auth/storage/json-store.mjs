import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

const fileQueues = new Map()

export class JsonStore {
  #filePath
  #defaultValue

  constructor(filePath, defaultValue) {
    this.#filePath = filePath
    this.#defaultValue = defaultValue
  }

  async read() {
    try {
      return JSON.parse(await readFile(this.#filePath, 'utf8'))
    } catch (error) {
      if (error?.code === 'ENOENT') return structuredClone(this.#defaultValue)
      throw error
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
      return next
    })
    fileQueues.set(this.#filePath, operation.catch(() => undefined))
    return operation
  }
}
