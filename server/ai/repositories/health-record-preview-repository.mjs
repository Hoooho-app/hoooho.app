import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { JsonStore } from '../../auth/storage/json-store.mjs'
import { normalizeHealthAIOutput } from '../ai-types.mjs'

export class HealthRecordPreviewRepository {
  #store

  constructor(dataDirectory) {
    this.#store = new JsonStore(path.join(dataDirectory, 'health-record-previews.json'), { previews: [] })
  }

  async create(input, now = new Date()) {
    const preview = {
      id: randomUUID(),
      schemaVersion: 1,
      accountId: input.accountId,
      eventId: input.eventId,
      memberId: input.memberId,
      memberName: input.memberName,
      rawInput: input.rawInput,
      inputChannel: input.inputChannel,
      selectedOccurredAt: input.selectedOccurredAt,
      parserVersion: input.parserVersion,
      provider: input.provider,
      checksum: input.checksum,
      rawRecordOnly: Boolean(input.rawRecordOnly),
      structuredMode: input.structuredMode ?? 'disabled',
      healthAIOutput: normalizeHealthAIOutput(input.healthAIOutput),
      status: 'pending',
      idempotencyKey: null,
      recordId: null,
      organizationId: null,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
      confirmedAt: null
    }
    await this.#store.update((data) => ({ ...data, previews: [...data.previews, preview] }))
    return preview
  }

  async findById(id) {
    const data = await this.#store.read()
    const preview = data.previews.find((item) => item.id === id)
    return preview ? { ...preview, healthAIOutput: normalizeHealthAIOutput(preview.healthAIOutput) } : null
  }

  async markConfirmed(id, input, now = new Date()) {
    let updated = null
    await this.#store.update((data) => ({
      ...data,
      previews: data.previews.map((item) => {
        if (item.id !== id) return item
        updated = {
          ...item,
          status: 'confirmed',
          idempotencyKey: input.idempotencyKey,
          recordId: input.recordId,
          organizationId: input.organizationId,
          confirmedAt: now.toISOString()
        }
        return updated
      })
    }))
    return updated
  }
}
