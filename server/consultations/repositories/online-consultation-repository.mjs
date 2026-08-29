import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { JsonStore } from '../../auth/storage/json-store.mjs'

export class OnlineConsultationRepository {
  #store

  constructor(dataDirectory) {
    this.#store = new JsonStore(path.join(dataDirectory, 'online-consultations.json'), { consultations: [] })
  }

  async findByEventId(eventId) {
    const data = await this.#store.read()
    return data.consultations.find((item) => item.eventId === eventId) ?? null
  }

  async getOrCreate(input, now = new Date()) {
    const consultation = {
      id: randomUUID(),
      accountId: input.accountId,
      eventId: input.eventId,
      status: 'preparing',
      questions: [],
      finalDoctorInstructions: null,
      finalRecordId: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    }
    let result = consultation
    await this.#store.update((data) => {
      const existing = data.consultations.find((item) => item.eventId === input.eventId)
      if (existing) { result = existing; return data }
      return { ...data, consultations: [...data.consultations, consultation] }
    })
    return result
  }

  async update(id, changes, now = new Date()) {
    let updated = null
    await this.#store.update((data) => ({
      ...data,
      consultations: data.consultations.map((item) => {
        if (item.id !== id) return item
        updated = {
          ...item,
          ...changes,
          id: item.id,
          accountId: item.accountId,
          eventId: item.eventId,
          createdAt: item.createdAt,
          updatedAt: now.toISOString()
        }
        return updated
      })
    }))
    return updated
  }
}
