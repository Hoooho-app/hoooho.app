import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { JsonStore } from '../../auth/storage/json-store.mjs'
import { normalizeHealthAIOutput, normalizeOrganizedHealthData, projectOrganizedHealthData } from '../ai-types.mjs'

export class HealthRecordOrganizationRepository {
  #store

  constructor(dataDirectory) {
    this.#store = new JsonStore(path.join(dataDirectory, 'health-record-organizations.json'), { organizations: [] })
  }

  async upsert(input, now = new Date()) {
    let saved = null
    await this.#store.update((data) => {
      const existing = data.organizations.find((item) => item.recordId === input.recordId)
      saved = {
        id: existing?.id ?? randomUUID(),
        schemaVersion: 5,
        accountId: input.accountId,
        eventId: input.eventId,
        recordId: input.recordId,
        rawInput: input.rawInput,
        healthAIOutput: normalizeHealthAIOutput(input.healthAIOutput),
        organizedHealthData: input.healthAIOutput
          ? projectOrganizedHealthData(input.healthAIOutput)
          : normalizeOrganizedHealthData(input.organizedHealthData),
        confirmedData: existing?.confirmedData ? normalizeOrganizedHealthData(existing.confirmedData) : null,
        status: input.status,
        provider: input.provider,
        createdAt: existing?.createdAt ?? now.toISOString(),
        updatedAt: now.toISOString()
      }
      return {
        ...data,
        organizations: existing
          ? data.organizations.map((item) => item.recordId === input.recordId ? saved : item)
          : [...data.organizations, saved]
      }
    })
    return saved
  }

  async findByEventId(eventId) {
    const data = await this.#store.read()
    return data.organizations
      .filter((item) => item.eventId === eventId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
      .map((item) => ({
        ...item,
        healthAIOutput: normalizeHealthAIOutput(item.healthAIOutput),
        organizedHealthData: normalizeOrganizedHealthData(item.organizedHealthData ?? item.aiOutput),
        confirmedData: item.confirmedData ? normalizeOrganizedHealthData(item.confirmedData) : null
      }))
  }
}
