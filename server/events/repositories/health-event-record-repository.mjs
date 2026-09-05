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
      ...(input.journal === undefined ? {} : { journal: input.journal }),
      content: input.content,
      occurredAt: input.occurredAt,
      sourceType: input.sourceType ?? 'user_record',
      sourceText: input.sourceText ?? null,
      measurementMethod: input.measurementMethod ?? null,
      measurementDevice: input.measurementDevice ?? null,
      note: input.note ?? null,
      changeAnnotations: [],
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

  async findByAccountId(accountId) {
    const data = await this.#store.read()
    return data.records.filter((record) => record.accountId === accountId)
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

  async replaceEventChangeAnnotations(eventId, annotationsByRecordId) {
    await this.#store.update((data) => ({
      ...data,
      records: data.records.map((record) => record.eventId === eventId
        ? { ...record, changeAnnotations: annotationsByRecordId.get(record.id) ?? [] }
        : record)
    }))
  }

  async setChangeAnnotation(id, annotation) {
    let updated = null
    await this.#store.update((data) => ({
      ...data,
      records: data.records.map((record) => {
        if (record.id !== id) return record
        const annotations = record.changeAnnotations ?? []
        updated = {
          ...record,
          changeAnnotations: annotations.some((item) => item.id === annotation.id)
            ? annotations.map((item) => item.id === annotation.id ? annotation : item)
            : [...annotations, annotation]
        }
        return updated
      })
    }))
    return updated
  }
}
