import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { JsonStore } from '../../auth/storage/json-store.mjs'

export class HealthInformationCandidateRepository {
  #store

  constructor(dataDirectory) {
    this.#store = new JsonStore(path.join(dataDirectory, 'health-information-candidates.json'), { candidates: [] })
  }

  async create(input, now = new Date()) {
    const candidate = {
      id: randomUUID(),
      ...input,
      status: 'pending',
      destinationProfileSection: null,
      note: null,
      confirmedAt: null,
      dismissedAt: null,
      profileFactId: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    }
    await this.#store.update((data) => ({ ...data, candidates: [...data.candidates, candidate] }))
    return candidate
  }

  async findById(id) {
    const data = await this.#store.read()
    return data.candidates.find((candidate) => candidate.id === id) ?? null
  }

  async findByFingerprint(fingerprint) {
    const data = await this.#store.read()
    return data.candidates.find((candidate) => candidate.fingerprint === fingerprint) ?? null
  }

  async findByEventId(eventId) {
    const data = await this.#store.read()
    return data.candidates
      .filter((candidate) => candidate.sourceEventId === eventId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id))
  }

  async findByMemberId(memberId) {
    const data = await this.#store.read()
    return data.candidates.filter((candidate) => candidate.memberId === memberId)
  }

  async update(id, changes, now = new Date()) {
    let updated = null
    await this.#store.update((data) => ({
      ...data,
      candidates: data.candidates.map((candidate) => {
        if (candidate.id !== id) return candidate
        updated = {
          ...candidate,
          ...changes,
          id: candidate.id,
          accountId: candidate.accountId,
          memberId: candidate.memberId,
          sourceEventId: candidate.sourceEventId,
          sourceRecordIds: candidate.sourceRecordIds,
          sourceFactIds: candidate.sourceFactIds,
          fingerprint: candidate.fingerprint,
          createdAt: candidate.createdAt,
          updatedAt: now.toISOString()
        }
        return updated
      })
    }))
    return updated
  }
}
