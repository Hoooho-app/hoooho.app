import path from 'node:path'
import { JsonStore } from '../storage/json-store.mjs'

export class VerificationCodeRepository {
  #store

  constructor(dataDirectory) {
    this.#store = new JsonStore(path.join(dataDirectory, 'verification-codes.json'), { codes: [] })
  }

  async find(channel, identifier) {
    const data = await this.#store.read()
    return data.codes.find((entry) => {
      const entryChannel = entry.channel ?? (entry.phone ? 'phone' : null)
      const entryIdentifier = entry.identifier ?? entry.phone
      return entryChannel === channel && entryIdentifier === identifier
    }) ?? null
  }

  async findByPhone(phone) {
    return this.find('phone', phone)
  }

  async save(entry) {
    const channel = entry.channel ?? (entry.phone ? 'phone' : null)
    const identifier = entry.identifier ?? entry.phone
    await this.#store.update((data) => ({
      ...data,
      codes: [
        ...data.codes.filter((item) => {
          const itemChannel = item.channel ?? (item.phone ? 'phone' : null)
          const itemIdentifier = item.identifier ?? item.phone
          return itemChannel !== channel || itemIdentifier !== identifier
        }),
        entry
      ]
    }))
  }

  async consume(channel, identifier) {
    if (identifier === undefined) {
      identifier = channel
      channel = 'phone'
    }
    await this.#store.update((data) => ({
      ...data,
      codes: data.codes.filter((entry) => {
        const entryChannel = entry.channel ?? (entry.phone ? 'phone' : null)
        const entryIdentifier = entry.identifier ?? entry.phone
        return entryChannel !== channel || entryIdentifier !== identifier
      })
    }))
  }

  async consumePhone(phone) {
    return this.consume('phone', phone)
  }

  async recordFailedAttempt(channel, identifier, maximumAttempts) {
    let attempts = 0
    let invalidated = false
    await this.#store.update((data) => ({
      ...data,
      codes: data.codes.flatMap((entry) => {
        const entryChannel = entry.channel ?? (entry.phone ? 'phone' : null)
        const entryIdentifier = entry.identifier ?? entry.phone
        if (entryChannel !== channel || entryIdentifier !== identifier) return [entry]
        attempts = (entry.failedAttempts ?? 0) + 1
        invalidated = attempts >= maximumAttempts
        return invalidated ? [] : [{ ...entry, failedAttempts: attempts }]
      })
    }))
    return { attempts, invalidated }
  }
}
