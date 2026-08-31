import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { JsonStore } from '../../auth/storage/json-store.mjs'

export class EventAttachmentRepository {
  #store

  constructor(dataDirectory) {
    this.#store = new JsonStore(path.join(dataDirectory, 'event-attachments.json'), { attachments: [] })
  }

  async create(input, now = new Date()) {
    const attachment = { id: randomUUID(), ...input, createdAt: now.toISOString() }
    await this.#store.update((data) => ({ ...data, attachments: [...data.attachments, attachment] }))
    return attachment
  }

  async createUnique(input, now = new Date()) {
    let attachment = null
    let duplicate = false
    await this.#store.update((data) => {
      const existing = data.attachments.find((item) => item.accountId === input.accountId && item.eventId === input.eventId && item.contentHash === input.contentHash)
      if (existing) { attachment = existing; duplicate = true; return data }
      attachment = { id: randomUUID(), ...input, createdAt: now.toISOString() }
      return { ...data, attachments: [...data.attachments, attachment] }
    })
    return { attachment, duplicate }
  }

  async findByEventId(eventId) {
    const data = await this.#store.read()
    return data.attachments.filter((item) => item.eventId === eventId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
  }

  async updateAnalysis(id, analysis) {
    let updated = null
    await this.#store.update((data) => ({
      ...data,
      attachments: data.attachments.map((item) => {
        if (item.id !== id) return item
        updated = { ...item, analysis }
        return updated
      })
    }))
    return updated
  }
}
