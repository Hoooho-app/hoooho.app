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
        schemaVersion: 7,
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
        inputChannel: input.inputChannel ?? existing?.inputChannel ?? null,
        previewId: input.previewId ?? existing?.previewId ?? null,
        checksum: input.checksum ?? existing?.checksum ?? null,
        sourceRevision: input.sourceRevision ?? existing?.sourceRevision ?? null,
        sourceRecordUpdatedAt: input.sourceRecordUpdatedAt ?? existing?.sourceRecordUpdatedAt ?? null,
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

  async replaceEvent(eventId, inputs, revision, now = new Date()) {
    let saved = []
    await this.#store.update((data) => {
      const existingByRecord = new Map(data.organizations.filter((item) => item.eventId === eventId).map((item) => [item.recordId, item]))
      saved = inputs.map((input) => {
        const existing = existingByRecord.get(input.recordId)
        const healthAIOutput = normalizeHealthAIOutput(input.healthAIOutput)
        return {
          id: existing?.id ?? randomUUID(), schemaVersion: 7, accountId: input.accountId, eventId, recordId: input.recordId,
          rawInput: input.rawInput, healthAIOutput, organizedHealthData: projectOrganizedHealthData(healthAIOutput),
          confirmedData: existing?.confirmedData ? normalizeOrganizedHealthData(existing.confirmedData) : null,
          status: 'completed', provider: input.provider, sourceRevision: revision,
          inputChannel: input.inputChannel ?? existing?.inputChannel ?? null,
          previewId: input.previewId ?? existing?.previewId ?? null,
          checksum: input.checksum ?? existing?.checksum ?? null,
          bodyLocations: Array.isArray(input.bodyLocations) ? input.bodyLocations : (existing?.bodyLocations ?? []),
          sourceRecordUpdatedAt: input.sourceRecordUpdatedAt, createdAt: existing?.createdAt ?? now.toISOString(), updatedAt: now.toISOString()
        }
      })
      return { ...data, organizations: [...data.organizations.filter((item) => item.eventId !== eventId), ...saved] }
    })
    return saved
  }

  async findByEventId(eventId, options = {}) {
    const data = await this.#store.read()
    return data.organizations
      .filter((item) => item.eventId === eventId && (options.revision == null || item.sourceRevision === options.revision))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
      .map((item) => ({
        ...item,
        healthAIOutput: normalizeHealthAIOutput(item.healthAIOutput),
        organizedHealthData: normalizeOrganizedHealthData(item.organizedHealthData ?? item.aiOutput),
        confirmedData: item.confirmedData ? normalizeOrganizedHealthData(item.confirmedData) : null
      }))
  }

  async findByPreviewId(eventId, previewId) {
    const data = await this.#store.read()
    const item = data.organizations.find((organization) => organization.eventId === eventId && organization.previewId === previewId)
    if (!item) return null
    return {
      ...item,
      healthAIOutput: normalizeHealthAIOutput(item.healthAIOutput),
      organizedHealthData: normalizeOrganizedHealthData(item.organizedHealthData ?? item.aiOutput),
      confirmedData: item.confirmedData ? normalizeOrganizedHealthData(item.confirmedData) : null
    }
  }
}
