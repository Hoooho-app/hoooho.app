import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { JsonStore } from '../../auth/storage/json-store.mjs'

export class HealthEventRepository {
  #store

  constructor(dataDirectory) {
    this.#store = new JsonStore(path.join(dataDirectory, 'health-events.json'), { events: [] })
  }

  async create(input, now = new Date()) {
    const event = {
      id: randomUUID(),
      accountId: input.accountId,
      memberId: input.memberId,
      title: input.title,
      category: input.category,
      status: input.status,
      startTime: input.startTime,
      recoveredAt: input.recoveredAt ?? null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    }
    await this.#store.update((data) => ({ ...data, events: [...data.events, event] }))
    return event
  }

  async findById(id) {
    const data = await this.#store.read()
    return data.events.find((event) => event.id === id) ?? null
  }

  async findByAccountId(accountId) {
    const data = await this.#store.read()
    return data.events
      .filter((event) => event.accountId === accountId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }

  async update(id, changes, now = new Date()) {
    let updated = null
    await this.#store.update((data) => ({
      ...data,
      events: data.events.map((event) => {
        if (event.id !== id) return event
        updated = {
          ...event,
          ...changes,
          id: event.id,
          accountId: event.accountId,
          memberId: event.memberId,
          createdAt: event.createdAt,
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
      events: data.events.filter((event) => {
        if (event.id !== id) return true
        deleted = event
        return false
      })
    }))
    return deleted
  }
}
