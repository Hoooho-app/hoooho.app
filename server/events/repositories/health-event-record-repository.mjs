import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { JsonStore } from '../../auth/storage/json-store.mjs'

const compareRecords = (left, right) => (
  left.occurredAt.localeCompare(right.occurredAt)
  || left.createdAt.localeCompare(right.createdAt)
  || left.id.localeCompare(right.id)
)

export class HealthEventRecordRepository {
  #store

  constructor(dataDirectory) {
    this.#store = new JsonStore(path.join(dataDirectory, 'health-event-records.json'), { records: [] })
  }

  async create(input, now = new Date()) {
    const record = {
      id: randomUUID(),
      accountId: input.accountId,
      eventId: input.eventId,
      type: input.type,
      content: input.content,
      occurredAt: input.occurredAt,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    }
    await this.#store.update((data) => ({ ...data, records: [...data.records, record] }))
    return record
  }

  async findById(id) {
    const data = await this.#store.read()
    return data.records.find((record) => record.id === id) ?? null
  }

  async findByEventId(eventId) {
    const data = await this.#store.read()
    return data.records
      .filter((record) => record.eventId === eventId)
      .sort(compareRecords)
  }

  async update(id, changes, now = new Date()) {
    let updated = null
    await this.#store.update((data) => ({
      ...data,
      records: data.records.map((record) => {
        if (record.id !== id) return record
        updated = {
          ...record,
          ...changes,
          id: record.id,
          accountId: record.accountId,
          eventId: record.eventId,
          createdAt: record.createdAt,
          updatedAt: now.toISOString()
        }
        return updated
      })
    }))
    return updated
  }

  async delete(id) {
    let deleted = null
    await this.#store.update((data) => ({
      ...data,
      records: data.records.filter((record) => {
        if (record.id !== id) return true
        deleted = record
        return false
      })
    }))
    return deleted
  }
}
