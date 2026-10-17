import path from 'node:path'
import { JsonStore } from '../auth/storage/json-store.mjs'
import { accountTransaction } from '../auth/storage/transaction.mjs'

// Family consent is not transferable by guest/account merge. Registered-only
// creation means a guest should have no family data, but scrub phantom legacy
// invitations rather than inheriting cross-account authority.
export async function familyOwnerLifecycle(dataDirectory, accountId, { mergeInto } = {}) {
  if (mergeInto === accountId) return { changed: false }
  return accountTransaction(dataDirectory, async () => {
    const store = new JsonStore(path.join(dataDirectory, 'family-sharing.json'), { spaces: [], invitations: [], batches: [], entries: [], audits: [] })
    let summary
    await store.update(data => {
      const removedSpaces = new Set(data.spaces.filter(s => s.ownerAccountId === accountId).map(s => s.id))
      const removedChildren = new Set(data.spaces.flatMap(s => s.children.filter(c => c.ownerAccountId === accountId).map(c => c.id)))
      const removedEntries = new Set(data.entries.filter(e => removedSpaces.has(e.spaceId) || removedChildren.has(e.childId) || e.sourceAccountId === accountId || e.snapshot?.sourceAccountId === accountId).map(e => e.id))
      const next = {
        ...data,
        spaces: data.spaces.filter(s => !removedSpaces.has(s.id)).map(s => ({ ...s,
          participants: s.participants.filter(p => p.accountId !== accountId),
          children: s.children.filter(c => !removedChildren.has(c.id)).map(c => ({ ...c, links: c.links.filter(l => l.accountId !== accountId) }))
        })),
        invitations: data.invitations.filter(i => !removedSpaces.has(i.spaceId) && i.senderAccountId !== accountId && i.recipientAccountId !== accountId),
        entries: data.entries.filter(e => !removedEntries.has(e.id)),
        batches: data.batches.filter(b => !removedSpaces.has(b.spaceId) && !removedChildren.has(b.childId) && b.accountId !== accountId && !(b.changes ?? []).some(c => removedEntries.has(c.entryId))),
        audits: data.audits.filter(a => !removedSpaces.has(a.spaceId) && a.actorAccountId !== accountId && a.details?.targetAccountId !== accountId)
      }
      summary = { changed: JSON.stringify(next) !== JSON.stringify(data), removedSpaces: data.spaces.length - next.spaces.length, removedEntries: data.entries.length - next.entries.length }
      return next
    })
    return summary
  })
}

export async function familyChildLifecycle(dataDirectory, accountId, memberId) {
  return accountTransaction(dataDirectory, async () => {
    const store = new JsonStore(path.join(dataDirectory, 'family-sharing.json'), { spaces: [], invitations: [], batches: [], entries: [], audits: [] })
    let summary
    await store.update(data => {
      const removedChildren = new Set(data.spaces.flatMap(s => s.children.filter(c => c.ownerAccountId === accountId && c.ownerMemberId === memberId).map(c => c.id)))
      const changedSpaces = new Set(data.spaces.filter(s => s.children.some(c => removedChildren.has(c.id))).map(s => s.id))
      const removedSpaces = new Set(data.spaces.filter(s => s.children.length > 0 && s.children.every(c => removedChildren.has(c.id))).map(s => s.id))
      const removedEntries = new Set(data.entries.filter(e => removedSpaces.has(e.spaceId) || removedChildren.has(e.childId) || (e.sourceAccountId === accountId && e.snapshot?.sourceMemberId === memberId)).map(e => e.id))
      const next = { ...data,
        spaces: data.spaces.filter(s => !removedSpaces.has(s.id)).map(s => ({ ...s, children: s.children.filter(c => !removedChildren.has(c.id)).map(c => ({ ...c, links: c.links.filter(l => !(l.accountId === accountId && l.memberId === memberId)) })) })),
        // An invitation cannot outlive a change to its stated child scope.
        invitations: data.invitations.filter(i => !changedSpaces.has(i.spaceId)),
        entries: data.entries.filter(e => !removedEntries.has(e.id)),
        batches: data.batches.filter(b => !removedSpaces.has(b.spaceId) && !removedChildren.has(b.childId) && !(b.candidates ?? []).some(c => c.snapshot?.sourceAccountId === accountId && c.snapshot?.sourceMemberId === memberId) && !(b.changes ?? []).some(c => removedEntries.has(c.entryId))),
        audits: data.audits.filter(a => !removedSpaces.has(a.spaceId) && !removedChildren.has(a.details?.childId))
      }
      summary = { changed: JSON.stringify(next) !== JSON.stringify(data), removedSpaces: data.spaces.length - next.spaces.length, removedEntries: data.entries.length - next.entries.length }
      return next
    })
    return summary
  })
}
