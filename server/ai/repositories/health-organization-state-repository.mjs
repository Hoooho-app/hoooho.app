import path from 'node:path'
import { JsonStore } from '../../auth/storage/json-store.mjs'

export class HealthOrganizationStateRepository {
  #store

  constructor(dataDirectory) {
    this.#store = new JsonStore(path.join(dataDirectory, 'health-organization-state.json'), { events: [] })
  }

  async get(eventId) {
    const data = await this.#store.read()
    return data.events.find((item) => item.eventId === eventId) ?? null
  }

  async invalidate(eventId, now = new Date()) {
    let saved
    await this.#store.update((data) => {
      const current = data.events.find((item) => item.eventId === eventId)
      saved = {
        eventId,
        revision: (current?.revision ?? 0) + 1,
        status: 'stale',
        errorCode: null,
        updatedAt: now.toISOString(),
        completedAt: current?.completedAt ?? null
      }
      return { ...data, events: current ? data.events.map((item) => item.eventId === eventId ? saved : item) : [...data.events, saved] }
    })
    return saved
  }

  async transition(eventId, revision, changes, now = new Date()) {
    let saved = null
    await this.#store.update((data) => ({
      ...data,
      events: data.events.map((item) => {
        if (item.eventId !== eventId || item.revision !== revision) return item
        saved = { ...item, ...changes, revision, updatedAt: now.toISOString() }
        return saved
      })
    }))
    return saved
  }
}
