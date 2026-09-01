import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { JsonStore } from '../../auth/storage/json-store.mjs'

export class HealthProfileFactRepository {
  #store

  constructor(dataDirectory) {
    this.#store = new JsonStore(path.join(dataDirectory, 'health-profile-facts.json'), { facts: [] })
  }

  async create(input, now = new Date()) {
    const fact = {
      id: randomUUID(),
      accountId: input.accountId,
      memberId: input.memberId,
      category: input.category,
      title: input.title,
      description: input.description,
      status: input.status,
      sources: input.sources,
      firstObservedAt: input.firstObservedAt,
      notes: input.notes,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    }
    await this.#store.update((data) => ({ ...data, facts: [...data.facts, fact] }))
    return fact
  }

  async findById(id) {
    const data = await this.#store.read()
    return data.facts.find((fact) => fact.id === id) ?? null
  }

  async findByMemberId(memberId) {
    const data = await this.#store.read()
    return data.facts
      .filter((fact) => fact.memberId === memberId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id))
  }

  async update(id, changes, now = new Date()) {
    let updated = null
    await this.#store.update((data) => ({
      ...data,
      facts: data.facts.map((fact) => {
        if (fact.id !== id) return fact
        updated = {
          ...fact,
          ...changes,
          id: fact.id,
          accountId: fact.accountId,
          memberId: fact.memberId,
          createdAt: fact.createdAt,
          updatedAt: now.toISOString()
        }
        return updated
      })
    }))
    return updated
  }
}
