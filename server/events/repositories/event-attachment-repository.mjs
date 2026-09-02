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

  async findById(id) {
    const data = await this.#store.read()
    return data.attachments.find((item) => item.id === id) ?? null
  }

  async createFromPhotoDrafts(accountId, eventId, recordId, memberId, drafts, now = new Date()) {
    const created = []
    await this.#store.update((data) => {
      const existingDraftIds = new Set(data.attachments.map((item) => item.draftPhotoId).filter(Boolean))
      const additions = drafts.filter((draft) => !existingDraftIds.has(draft.id)).map((draft) => {
        const attachment = {
          id: randomUUID(), accountId, eventId, recordId, memberId,
          draftPhotoId: draft.id, name: draft.name, mimeType: draft.mimeType,
          binarySize: draft.binarySize, width: draft.width, height: draft.height,
          sortOrder: draft.sortOrder, uploadStatus: 'uploaded', storageKey: draft.storageKey,
          contentHash: draft.contentHash, createdAt: now.toISOString()
        }
        created.push(attachment)
        return attachment
      })
      return additions.length ? { ...data, attachments: [...data.attachments, ...additions] } : data
    })
    return created
  }

  async deleteByDraftPhotoIds(draftPhotoIds) {
    const ids = new Set(draftPhotoIds)
    await this.#store.update((data) => ({
      ...data,
      attachments: data.attachments.filter((item) => !ids.has(item.draftPhotoId))
    }))
  }

  async hasStorageKey(storageKey) {
    const data = await this.#store.read()
    return data.attachments.some((item) => item.storageKey === storageKey)
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
