import path from 'node:path'
import { unlink } from 'node:fs/promises'
import { JsonStore } from '../auth/storage/json-store.mjs'
import { accountTransaction } from '../auth/storage/transaction.mjs'

export const accountCollections = [
  ['health-profile-sections.json', 'sections'],
  ['family-members.json', 'members'],
  ['health-events.json', 'events'],
  ['health-event-records.json', 'records'],
  ['event-attachments.json', 'attachments'],
  ['health-record-organizations.json', 'organizations'],
  ['health-record-previews.json', 'previews'],
  ['health-organization-state.json', 'events'],
  ['health-profile-facts.json', 'facts'],
  ['health-information-candidates.json', 'candidates'],
  ['online-consultations.json', 'consultations'],
  ['quick-record-requests.json', 'requests'],
  ['quick-record-photo-drafts.json', 'photos']
]

export class AccountDataService {
  constructor({ dataDirectory }) {
    this.dataDirectory = dataDirectory
    this.journal = new JsonStore(path.join(dataDirectory, 'account-data-operations.json'), { merges: [] })
  }

  store(file, collection) {
    return new JsonStore(path.join(this.dataDirectory, file), { [collection]: [] })
  }

  async mergeGuest(guestAccountId, accountId, now = new Date()) {
    return accountTransaction(this.dataDirectory, () => this.mergeGuestTransaction(guestAccountId, accountId, now))
  }

  async mergeGuestTransaction(guestAccountId, accountId, now) {
    if (!guestAccountId.startsWith('guest:') || guestAccountId === accountId) return { merged: false, idempotent: true }
    const operationId = `${guestAccountId}->${accountId}`
    const journal = await this.journal.read()
    if (journal.merges.some((item) => item.guestAccountId === guestAccountId && item.accountId !== accountId)) {
      throw Object.assign(new Error('体验记录已经合并到其他账户'), { status: 409, code: 'GUEST_ALREADY_MERGED' })
    }
    if (journal.merges.some((item) => item.id === operationId && item.status === 'completed')) {
      return { merged: false, idempotent: true }
    }
    await this.journal.update((data) => ({
      ...data,
      merges: data.merges.some((item) => item.id === operationId)
        ? data.merges
        : [...data.merges, { id: operationId, guestAccountId, accountId, status: 'in_progress', startedAt: now.toISOString() }]
    }))
    for (const [file, collection] of accountCollections) {
      await this.store(file, collection).update((data) => ({
        ...data,
        [collection]: (data[collection] ?? []).map((item) => item.accountId === guestAccountId ? { ...item, accountId } : item)
      }))
    }
    await this.store('feedback/records.json', 'feedback').update((data) => Object.fromEntries(Object.entries(data).map(([key, value]) => [key,
      Array.isArray(value) ? value.map((item) => item.accountId === guestAccountId ? { ...item, accountId } : item) : value
    ])))
    await this.journal.update((data) => ({
      ...data,
      merges: data.merges.map((item) => item.id === operationId ? { ...item, status: 'completed', completedAt: now.toISOString() } : item)
    }))
    return { merged: true, idempotent: false }
  }

  async deleteAccount(accountId) {
    const storageKeys = new Set()
    for (const [file, collection] of [['event-attachments.json', 'attachments'], ['quick-record-photo-drafts.json', 'photos']]) {
      const data = await this.store(file, collection).read()
      for (const item of data[collection] ?? []) {
        if (item.accountId === accountId && item.storageKey) storageKeys.add(path.basename(item.storageKey))
      }
    }
    for (const [file, collection] of accountCollections) {
      await this.store(file, collection).update((data) => ({
        ...data,
        [collection]: (data[collection] ?? []).filter((item) => item.accountId !== accountId)
      }))
    }
    await Promise.all([...storageKeys].map((storageKey) =>
      unlink(path.join(this.dataDirectory, 'quick-record-photo-files', storageKey)).catch(() => undefined)
    ))
  }
}
