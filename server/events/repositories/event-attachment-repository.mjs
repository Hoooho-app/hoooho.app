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

  async findByEventId(eventId) {
    const data = await this.#store.read()
    return data.attachments.filter((item) => item.eventId === eventId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
  }
}
