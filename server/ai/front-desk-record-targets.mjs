import { createHash } from 'node:crypto'

const validId = value => typeof value === 'string' && /^[A-Za-z0-9:_-]{1,180}$/u.test(value)
const unavailable = value => !value || value.deleted === true || Boolean(value.deletedAt) || value.available === false || value.accessible === false || value.unavailable === true || ['deleted', 'removed', 'discarded', 'unavailable'].includes(value.state) || ['deleted', 'removed', 'discarded', 'unavailable'].includes(value.status)

// Records are persisted as JSON. Keep that representation (including JSON's
// undefined/null rules), while making object insertion order irrelevant.
function stableJson(value) {
  return JSON.stringify(value, (_key, item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item
    return Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
  })
}

/** A content revision, not a chronological version or an authorization token. */
export function frontRecordVersion(record) {
  const serialized = stableJson(record)
  if (serialized === undefined) throw new TypeError('A record snapshot is required')
  // Six digest bytes fit exactly in a JS integer; reserve zero as invalid.
  return Number.parseInt(createHash('sha256').update(serialized).digest('hex').slice(0, 12), 16) || 1
}

function resultIds(result) {
  return Array.isArray(result?.records)
    ? result.records.map(record => record?.recordId ?? record?.id).filter(validId)
    : []
}

function receiptIds(receipt, contextId) {
  if (!receipt || !['save', 'save_original'].includes(receipt.type) || unavailable(receipt)) return []
  if (receipt.contextId != null && receipt.contextId !== contextId) return []
  if (receipt.success === false || receipt.saved === false || receipt.state != null && receipt.state !== 'saved' || ['failed', 'pending', 'cancelled', 'canceled'].includes(receipt.status)) return []
  if (receipt.state !== 'saved' && receipt.saved !== true && receipt.success !== true) return []
  return [receipt.recordId, ...(Array.isArray(receipt.recordIds) ? receipt.recordIds : []), ...resultIds(receipt.result)].filter(validId)
}

/**
 * Resolve only exact IDs from trusted, persisted conversation contexts. This
 * intentionally has no latest/list lookup and does not infer targets from text.
 * Callers must resolve again inside their mutation transaction before writing.
 */
export async function accessibleFrontDeskTargets({ business, accountId, memberId, contexts = [] } = {}) {
  if (typeof accountId !== 'string' || !accountId || typeof memberId !== 'string' || !memberId || !Array.isArray(contexts)) return []
  if (typeof business?.records?.getOwnedRecord !== 'function' || typeof business?.events?.get !== 'function') throw new TypeError('Owned record and event services are required')
  const references = new Map()
  for (const context of contexts) {
    if (!context || !validId(context.id) || context.accountId !== accountId || context.memberId !== memberId || unavailable(context)) continue
    const ids = [
      ...(context.saved === true ? resultIds(context.recordResult) : []),
      ...(Array.isArray(context.operationReceipts) ? context.operationReceipts.flatMap(receipt => receiptIds(receipt, context.id)) : [])
    ]
    for (const id of ids) if (!references.has(id)) references.set(id, context.id)
  }
  const targets = []
  for (const [id, contextId] of references) {
    try {
      const record = await business.records.getOwnedRecord(accountId, id)
      if (unavailable(record) || record.id !== id || record.accountId !== accountId || !validId(record.eventId) || record.memberId != null && record.memberId !== memberId) continue
      const event = await business.events.get(accountId, record.eventId)
      if (unavailable(event) || event.id !== record.eventId || event.accountId !== accountId || event.memberId !== memberId) continue
      const snapshot = structuredClone(record)
      targets.push({
        id, version: frontRecordVersion(snapshot), kind: 'record', contextId, subjectConfirmed: true,
        title: typeof snapshot.title === 'string' ? snapshot.title : typeof snapshot.content === 'string' ? snapshot.content : event.title ?? '',
        category: snapshot.aiProvenance?.category ?? snapshot.journal?.categories?.[0] ?? snapshot.type ?? event.category ?? 'other',
        record: snapshot
      })
      if (targets.length === 12) break
    } catch {
      // Missing, deleted or unavailable exact targets cannot be operated on.
    }
  }
  return targets
}
