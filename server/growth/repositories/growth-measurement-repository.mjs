import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { JsonStore } from '../../auth/storage/json-store.mjs'

export class GrowthMeasurementRepository {
  #store
  constructor(dataDirectory) { this.#store = new JsonStore(path.join(dataDirectory, 'growth-measurements.json'), { measurements: [] }) }
  async list(accountId, memberId) {
    const data = await this.#store.read()
    return data.measurements.filter((item) => item.accountId === accountId && item.memberId === memberId)
      .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
  }
  async findById(id) { return (await this.#store.read()).measurements.find((item) => item.id === id) ?? null }
  async upsert(input, now = new Date()) {
    let saved
    await this.#store.update((data) => {
      const existing = data.measurements.find((item) => item.accountId === input.accountId && item.memberId === input.memberId && item.measuredAt === input.measuredAt)
      if (existing) {
        saved = { ...existing, ...input, id: existing.id, createdAt: existing.createdAt, updatedAt: now.toISOString() }
        return { ...data, measurements: data.measurements.map((item) => item.id === existing.id ? saved : item) }
      }
      saved = { id: randomUUID(), ...input, createdAt: now.toISOString(), updatedAt: now.toISOString() }
      return { ...data, measurements: [...data.measurements, saved] }
    })
    return saved
  }
  async update(id, changes, now = new Date()) {
    let saved = null
    await this.#store.update((data) => ({ ...data, measurements: data.measurements.map((item) => {
      if (item.id !== id) return item
      saved = { ...item, ...changes, id: item.id, accountId: item.accountId, memberId: item.memberId, createdAt: item.createdAt, updatedAt: now.toISOString() }
      return saved
    }) }))
    return saved
  }
  async delete(id) {
    let deleted = null
    await this.#store.update((data) => ({ ...data, measurements: data.measurements.filter((item) => {
      if (item.id !== id) return true
      deleted = item
      return false
    }) }))
    return deleted
  }
}
