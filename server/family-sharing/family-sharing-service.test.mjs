import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'node:http'
import { FamilySharingService } from './family-sharing-service.mjs'
import { familySharingApiPlugin, familySharingRoute, familySharingResult } from './api.mjs'
import { familyOwnerLifecycle, familyChildLifecycle } from './lifecycle.mjs'
import { TokenService } from '../auth/token-service.mjs'

const now = new Date('2026-10-18T00:00:00.000Z')
async function fixture(t, enabled = true) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-family-'))
  t.after(() => rm(dataDirectory, { recursive: true, force: true }))
  let active = enabled
  const readerCalls = []
  const service = new FamilySharingService({ dataDirectory, entitlement: async () => ({ active, mode: active ? 'internal_test' : 'unavailable' }), attachmentReader: { read: async (...args) => { readerCalls.push(args); return { mimeType: 'image/png', buffer: Buffer.from('fixture-image') } } } })
  const a = await service.users.findOrCreateByEmail('a@example.test', now), b = await service.users.findOrCreateByEmail('b@example.test', now), c = await service.users.findOrCreateByEmail('c@example.test', now)
  const child = await service.members.create({ accountId: a.id, name: '小禾', relationship: 'child', birthday: '2024-01-01', gender: 'female' }, now)
  const otherChild = await service.members.create({ accountId: a.id, name: '其他孩子', relationship: 'child', birthday: '2024-02-01', gender: 'male' }, now)
  async function record(accountId = a.id, memberId = child.id, content = '早奶150mL', occurredAt = '2026-10-17T00:00:00.000Z') {
    const event = await service.events.create({ accountId, memberId, title: '喂养', category: 'other', status: 'observing', startTime: occurredAt }, now)
    return service.records.create({ accountId, eventId: event.id, type: 'diet', content, occurredAt, sourceText: '不应共享的原始整段对话', journal: { aiNurse: { turns: [{ text: '隐藏对话' }] } } }, now)
  }
  const original = await record(), hidden = await record(a.id, otherChild.id, '其他孩子的私人记录')
  return { service, a, b, c, child, otherChild, original, hidden, record, readerCalls, setActive: value => { active = value } }
}
async function family(f) {
  const created = await f.service.createSpace(f.a.id, { memberIds: [f.child.id], confirmShare: true }, now)
  const space = await f.service.getSpace(f.a.id, created.id, now)
  return { spaceId: space.id, childId: space.children[0].id }
}
async function accept(f, spaceId) {
  const invite = await f.service.invite(f.a.id, spaceId, { recipientHooohoId: f.b.hooohoId, confirmShare: true }, now)
  await f.service.acceptInvitation(f.b.id, invite.id, { confirmShare: true }, now)
  return invite
}
async function publish(f, spaceId, childId, accountId = f.a.id, ids) {
  const batch = await f.service.previewImport(accountId, spaceId, childId, now)
  await f.service.confirmImport(accountId, spaceId, batch.id, { confirmShare: true, selectedRecordIds: ids ?? batch.candidates.map(r => r.sourceRecordId) }, now)
  return batch
}

test('formal capability is closed by default; no fake purchase or free feature changes', async t => {
  const f = await fixture(t, false)
  assert.equal((await f.service.overview(f.a.id, now)).capability.active, false)
  await assert.rejects(f.service.createSpace(f.a.id, { memberIds: [f.child.id], confirmShare: true }, now), { code: 'FAMILY_NOT_AVAILABLE' })
  assert.equal((await f.service.records.findById(f.original.id)).accountId, f.a.id)
})
test('requires a registered account and explicit ownership/consent', async t => {
  const f = await fixture(t)
  const guest = await f.service.users.createGuest(undefined, now)
  await assert.rejects(f.service.overview(guest.id, now), { code: 'REGISTERED_ACCOUNT_REQUIRED' })
  await assert.rejects(f.service.createSpace(f.a.id, { memberIds: [f.child.id] }, now), { status: 400 })
  await assert.rejects(f.service.createSpace(f.b.id, { memberIds: [f.child.id], confirmShare: true }, now), { code: 'CHILD_NOT_FOUND' })
})
test('concurrent creation has one workspace; private children are never silently included', async t => {
  const f = await fixture(t)
  const results = await Promise.allSettled([1, 2].map(() => f.service.createSpace(f.a.id, { memberIds: [f.child.id], confirmShare: true }, now)))
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
  const list = await f.service.overview(f.a.id, now)
  assert.deepEqual(list.spaces[0].childNames, ['小禾'])
})
test('invitations are bound to one account, valid 24h, and replay cannot add a third seat', async t => {
  const f = await fixture(t), { spaceId } = await family(f)
  const invitation = await f.service.invite(f.a.id, spaceId, { recipientHooohoId: f.b.hooohoId, confirmShare: true }, now)
  assert.equal(Date.parse(invitation.expiresAt) - now.getTime(), 24 * 60 * 60_000)
  await assert.rejects(f.service.acceptInvitation(f.c.id, invitation.id, { confirmShare: true }, now), { code: 'INVITATION_NOT_FOUND' })
  await f.service.acceptInvitation(f.b.id, invitation.id, { confirmShare: true }, now)
  await f.service.acceptInvitation(f.b.id, invitation.id, { confirmShare: true }, now)
  assert.equal((await f.service.getSpace(f.a.id, spaceId, now)).participants.length, 2)
  await assert.rejects(f.service.invite(f.a.id, spaceId, { recipientHooohoId: f.c.hooohoId, confirmShare: true }, now), { code: 'FAMILY_SEATS_FULL' })
})
test('expired invitation and missing recipient acceptance fail closed', async t => {
  const f = await fixture(t), { spaceId } = await family(f)
  const invitation = await f.service.invite(f.a.id, spaceId, { recipientHooohoId: f.b.hooohoId, confirmShare: true }, now)
  await assert.rejects(f.service.acceptInvitation(f.b.id, invitation.id, {}, now), { status: 400 })
  await assert.rejects(f.service.getSpace(f.b.id, spaceId, now), { code: 'FAMILY_SPACE_NOT_FOUND' })
  await assert.rejects(f.service.acceptInvitation(f.b.id, invitation.id, { confirmShare: true }, new Date(invitation.expiresAt)), { code: 'INVITATION_EXPIRED' })
})
test('replacing invitation invalidates the earlier recipient; no third-party enumeration in inbox', async t => {
  const f = await fixture(t), { spaceId } = await family(f)
  const old = await f.service.invite(f.a.id, spaceId, { recipientHooohoId: f.b.hooohoId, confirmShare: true }, now)
  await f.service.invite(f.a.id, spaceId, { recipientHooohoId: f.c.hooohoId, confirmShare: true }, now)
  await assert.rejects(f.service.acceptInvitation(f.b.id, old.id, { confirmShare: true }, now), { code: 'INVITATION_EXPIRED' })
  assert.equal((await f.service.overview(f.b.id, now)).invitations.length, 0)
})
test('preview selects only owned linked child and excludes raw AI/private metadata', async t => {
  const f = await fixture(t), { spaceId, childId } = await family(f)
  await accept(f, spaceId)
  const preview = await f.service.previewImport(f.a.id, spaceId, childId, now)
  assert.equal(preview.candidates.length, 1)
  assert.equal(preview.candidates[0].sourceRecordId, f.original.id)
  assert.equal(JSON.stringify(preview).includes('隐藏对话'), false)
  assert.equal(JSON.stringify(preview).includes('其他孩子'), false)
  assert.equal((await f.service.getSpace(f.b.id, spaceId, now)).entries.length, 0)
  await assert.rejects(f.service.confirmImport(f.a.id, spaceId, preview.id, { confirmShare: true, selectedRecordIds: [f.hidden.id] }, now), { code: 'INVALID_IMPORT_SELECTION' })
})
test('source changing after preview is blocked rather than silently overwriting', async t => {
  const f = await fixture(t), { spaceId, childId } = await family(f)
  const preview = await f.service.previewImport(f.a.id, spaceId, childId, now)
  await f.service.records.update(f.original.id, { content: '更正早奶120mL' }, new Date(now.getTime() + 1))
  await assert.rejects(f.service.confirmImport(f.a.id, spaceId, preview.id, { confirmShare: true, selectedRecordIds: [f.original.id] }, now), { code: 'SOURCE_RECORD_CHANGED' })
  assert.equal((await f.service.getSpace(f.a.id, spaceId, now)).entries.length, 0)
})
test('batch confirmation is idempotent and never rewrites original ownership or medication', async t => {
  const f = await fixture(t), { spaceId, childId } = await family(f)
  await accept(f, spaceId)
  const batch = await f.service.previewImport(f.a.id, spaceId, childId, now)
  const input = { confirmShare: true, selectedRecordIds: [f.original.id] }
  const results = await Promise.all([1, 2].map(() => f.service.confirmImport(f.a.id, spaceId, batch.id, input, now)))
  assert.equal(results[0].count, 1); assert.equal(results[1].count, 1)
  const shared = await f.service.getSpace(f.b.id, spaceId, now)
  assert.equal(shared.entries.length, 1); assert.equal(shared.entries[0].sourceAccountId, f.a.id)
  assert.equal((await f.service.records.findById(f.original.id)).accountId, f.a.id)
  assert.equal((await f.service.events.findById(f.original.eventId)).memberId, f.child.id)
})
test('recipient must explicitly link own child; personal copy keeps their new records after exit', async t => {
  const f = await fixture(t), { spaceId, childId } = await family(f)
  await accept(f, spaceId)
  await assert.rejects(f.service.previewImport(f.b.id, spaceId, childId, now), { code: 'CHILD_LINK_REQUIRED' })
  await assert.rejects(f.service.linkChild(f.b.id, spaceId, childId, { sourceMemberId: f.child.id, confirmSameChild: true }, now), { code: 'CHILD_NOT_FOUND' })
  const linked = await f.service.linkChild(f.b.id, spaceId, childId, { createPersonalCopy: true, confirmSameChild: true }, now)
  const mine = await f.record(f.b.id, linked.memberId, '爸爸记录的早奶')
  await publish(f, spaceId, childId, f.b.id)
  await f.service.revoke(f.b.id, spaceId, { accountId: f.b.id, confirm: true }, now)
  await assert.rejects(f.service.getSpace(f.b.id, spaceId, now), { code: 'FAMILY_SPACE_NOT_FOUND' })
  assert.equal((await f.service.records.findById(mine.id)).accountId, f.b.id)
  assert.equal((await f.service.members.findById(linked.memberId)).accountId, f.b.id)
  assert.equal((await f.service.getSpace(f.a.id, spaceId, now)).entries.length, 0)
})
test('same time/content from two parents only suggests duplicates; does not combine or delete', async t => {
  const f = await fixture(t), { spaceId, childId } = await family(f)
  await accept(f, spaceId); await publish(f, spaceId, childId)
  const own = await f.service.members.create({ accountId: f.b.id, name: '小禾', relationship: 'child' }, now)
  await f.service.linkChild(f.b.id, spaceId, childId, { sourceMemberId: own.id, confirmSameChild: true }, now)
  await f.record(f.b.id, own.id)
  const preview = await f.service.previewImport(f.b.id, spaceId, childId, now)
  assert.equal(preview.candidates[0].possibleDuplicate, true)
  await f.service.confirmImport(f.b.id, spaceId, preview.id, { confirmShare: true, selectedRecordIds: [preview.candidates[0].sourceRecordId] }, now)
  assert.equal((await f.service.getSpace(f.a.id, spaceId, now)).entries.length, 2)
})
test('expiry pauses new publishing/invitations; old snapshots and exports remain readable', async t => {
  const f = await fixture(t), { spaceId, childId } = await family(f)
  await accept(f, spaceId); await publish(f, spaceId, childId)
  f.setActive(false)
  const snapshot = await f.service.getSpace(f.b.id, spaceId, now)
  assert.equal(snapshot.permission.active, false); assert.equal(snapshot.entries.length, 1)
  await assert.rejects(f.service.previewImport(f.a.id, spaceId, childId, now), { code: 'FAMILY_COLLABORATION_INACTIVE' })
  await f.record(f.a.id, f.child.id, '到期后私人新记录')
  assert.equal((await f.service.getSpace(f.b.id, spaceId, now)).entries.length, 1)
  await f.service.revoke(f.a.id, spaceId, { accountId: f.b.id, confirm: true }, now)
  await assert.rejects(f.service.getSpace(f.b.id, spaceId, now), { code: 'FAMILY_SPACE_NOT_FOUND' })
})
test('attachment access is scoped to selected record and rechecked after revoke/withdraw', async t => {
  const f = await fixture(t), { spaceId, childId } = await family(f)
  await accept(f, spaceId)
  const photo = await f.service.attachments.create({ accountId: f.a.id, eventId: f.original.eventId, recordId: f.original.id, name: '早奶.png', mimeType: 'image/png', storageKey: 'private-secret.png' }, now)
  const unselected = await f.service.attachments.create({ accountId: f.a.id, eventId: f.hidden.eventId, recordId: f.hidden.id, name: '私人.png', mimeType: 'image/png', storageKey: 'other-secret.png' }, now)
  const batch = await publish(f, spaceId, childId)
  const shared = await f.service.getSpace(f.b.id, spaceId, now), entry = shared.entries[0]
  assert.equal(JSON.stringify(shared).includes('private-secret'), false)
  await assert.rejects(f.service.readAttachment(f.b.id, spaceId, entry.id, unselected.id), { code: 'SHARED_ATTACHMENT_NOT_FOUND' })
  assert.equal((await f.service.readAttachment(f.b.id, spaceId, entry.id, photo.id)).buffer.toString(), 'fixture-image')
  assert.deepEqual(f.readerCalls[0], [f.a.id, f.original.eventId, photo.id])
  await f.service.undoImport(f.a.id, spaceId, batch.id, { confirm: true }, now)
  await assert.rejects(f.service.readAttachment(f.b.id, spaceId, entry.id, photo.id), { code: 'SHARED_ATTACHMENT_NOT_FOUND' })
  await publish(f, spaceId, childId)
  const updatedEntry = (await f.service.getSpace(f.b.id, spaceId, now)).entries[0]
  await f.service.revoke(f.a.id, spaceId, { accountId: f.b.id, confirm: true }, now)
  await assert.rejects(f.service.readAttachment(f.b.id, spaceId, updatedEntry.id, photo.id), { code: 'FAMILY_SPACE_NOT_FOUND' })
})
test('original record/child deletion cannot leave an accessible shared attachment', async t => {
  const f = await fixture(t), { spaceId, childId } = await family(f)
  await accept(f, spaceId); await publish(f, spaceId, childId)
  await f.service.records.delete(f.original.id)
  assert.equal((await f.service.getSpace(f.b.id, spaceId, now)).entries.length, 0)
})
test('revised snapshots retain revisions; undo requires reverse order and preserves originals', async t => {
  const f = await fixture(t), { spaceId, childId } = await family(f)
  const first = await publish(f, spaceId, childId)
  await f.service.records.update(f.original.id, { content: '更正120mL' }, new Date(now.getTime() + 1))
  const second = await publish(f, spaceId, childId)
  const revised = (await f.service.getSpace(f.a.id, spaceId, now)).entries[0]
  assert.equal(revised.revisionCount, 1); assert.equal(revised.content, '更正120mL')
  await assert.rejects(f.service.undoImport(f.a.id, spaceId, first.id, { confirm: true }, now), { code: 'IMPORT_UNDO_CONFLICT' })
  await f.service.undoImport(f.a.id, spaceId, second.id, { confirm: true }, now)
  assert.equal((await f.service.getSpace(f.a.id, spaceId, now)).entries[0].content, '早奶150mL')
  assert.equal((await f.service.records.findById(f.original.id)).content, '更正120mL')
  await f.service.undoImport(f.a.id, spaceId, first.id, { confirm: true }, now)
  assert.equal((await f.service.getSpace(f.a.id, spaceId, now)).entries.length, 0)
})
test('routing rejects unsupported methods and preserves authentication boundary', async t => {
  const f = await fixture(t)
  const route = familySharingRoute('/api/family-sharing')
  assert.equal(route.kind, 'overview')
  await assert.rejects(familySharingResult(f.service, f.a.id, route, 'DELETE'), { status: 405 })
  assert.equal(familySharingRoute('/api/unrelated'), null)
  assert.equal(familySharingRoute('/api/family-sharing/spaces/a/unknown'), null)
})

test('deleting the owner removes the entire authorized workspace but keeps the other parent originals', async t => {
  const f = await fixture(t), { spaceId, childId } = await family(f)
  await accept(f, spaceId); await publish(f, spaceId, childId)
  const linked = await f.service.linkChild(f.b.id, spaceId, childId, { createPersonalCopy: true, confirmSameChild: true }, now)
  const ownRecord = await f.record(f.b.id, linked.memberId, '爸爸的个人记录')
  await publish(f, spaceId, childId, f.b.id)
  const result = await familyOwnerLifecycle(f.service.directory, f.a.id)
  assert.equal(result.removedSpaces, 1)
  await assert.rejects(f.service.getSpace(f.b.id, spaceId, now), { code: 'FAMILY_SPACE_NOT_FOUND' })
  assert.equal((await f.service.records.findById(ownRecord.id)).accountId, f.b.id)
  assert.equal((await f.service.members.findById(linked.memberId)).accountId, f.b.id)
  assert.equal(JSON.stringify(await f.service.store.read()).includes(f.a.id), false)
})

test('deleting the caregiver scrubs identity, snapshots, invitations and undo paths without deleting owner originals', async t => {
  const f = await fixture(t), { spaceId, childId } = await family(f)
  await accept(f, spaceId); await publish(f, spaceId, childId)
  const linked = await f.service.linkChild(f.b.id, spaceId, childId, { createPersonalCopy: true, confirmSameChild: true }, now)
  const privateRecord = await f.record(f.b.id, linked.memberId, '爸爸自己的记录')
  await publish(f, spaceId, childId, f.b.id)
  await f.service.records.update(privateRecord.id, { content: '爸爸的更正' }, new Date(now.getTime() + 1))
  await publish(f, spaceId, childId, f.b.id)
  await familyOwnerLifecycle(f.service.directory, f.b.id)
  const remaining = await f.service.store.read(), shared = await f.service.getSpace(f.a.id, spaceId, now)
  assert.equal(JSON.stringify(remaining).includes(f.b.id), false)
  assert.equal(shared.participants.length, 1)
  assert.equal(shared.entries.length, 1)
  assert.equal((await f.service.records.findById(f.original.id)).accountId, f.a.id)
  await assert.rejects(f.service.getSpace(f.b.id, spaceId, now), { code: 'FAMILY_SPACE_NOT_FOUND' })
})

test('guest merge does not transfer phantom invitations or shared authority to a registered target', async t => {
  const f = await fixture(t), { spaceId } = await family(f)
  const guest = await f.service.users.createGuest('guest:legacy-family-fixture', now)
  await f.service.store.update(data => ({ ...data, invitations: [...data.invitations, { id: 'phantom', spaceId, senderAccountId: f.a.id, recipientAccountId: guest.id, status: 'pending', expiresAt: new Date(now.getTime() + 1000).toISOString() }] }))
  await familyOwnerLifecycle(f.service.directory, guest.id, { mergeInto: f.b.id })
  assert.equal((await f.service.overview(f.b.id, now)).invitations.length, 0)
  assert.equal(JSON.stringify(await f.service.store.read()).includes(guest.id), false)
})

test('HTTP boundary rejects missing/stale browser-session tokens, purpose tokens and cross-origin mutations', async t => {
  const f = await fixture(t), secret = 'family-http-isolated-test', tokens = new TokenService(secret, 60_000)
  let handle
  familySharingApiPlugin({ dataDirectory: f.service.directory, service: f.service, tokenSecret: secret }).configureServer({ middlewares: { use(callback) { handle = callback } } })
  const server = createServer((request, response) => handle(request, response, () => { response.statusCode = 404; response.end() }))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const base = `http://127.0.0.1:${server.address().port}`, route = `${base}/api/family-sharing`
  assert.equal((await fetch(route)).status, 401)
  assert.equal((await fetch(route, { headers: { Authorization: `Bearer ${tokens.create({ ...f.a, browserSession: true })}` } })).status, 401)
  assert.equal((await fetch(route, { headers: { Authorization: `Bearer ${tokens.create({ ...f.a, purpose: 'change:email' })}` } })).status, 401)
  const headers = { Authorization: `Bearer ${tokens.create(f.a)}`, 'Content-Type': 'application/json' }
  const good = await fetch(route, { headers })
  assert.equal(good.status, 200); assert.equal(good.headers.get('Cache-Control'), 'private, no-store')
  assert.equal((await fetch(`${route}/spaces`, { method: 'POST', headers: { ...headers, Origin: 'https://unrelated.invalid' }, body: JSON.stringify({ memberIds: [f.child.id], confirmShare: true }) })).status, 403)
  assert.equal((await fetch(`${route}/spaces`, { method: 'POST', headers, body: '[]' })).status, 400)
  assert.equal((await fetch(`${route}/spaces`, { method: 'POST', headers, body: ' '.repeat(30_001) })).status, 413)
})

test('deleting the final shared child removes its scope and pending invites, leaving other parent originals intact', async t => {
  const f = await fixture(t), { spaceId, childId } = await family(f)
  await accept(f, spaceId)
  const linked = await f.service.linkChild(f.b.id, spaceId, childId, { createPersonalCopy: true, confirmSameChild: true }, now)
  const mine = await f.record(f.b.id, linked.memberId, '爸爸原件')
  await publish(f, spaceId, childId)
  await familyChildLifecycle(f.service.directory, f.a.id, f.child.id)
  await assert.rejects(f.service.getSpace(f.b.id, spaceId, now), { code: 'FAMILY_SPACE_NOT_FOUND' })
  const state = await f.service.store.read()
  assert.equal(state.spaces.length, 0); assert.equal(state.entries.length, 0); assert.equal(state.invitations.length, 0)
  assert.equal((await f.service.records.findById(mine.id)).accountId, f.b.id)
})

test('deleting only the caregiver linked child withdraws its snapshots while owner records remain shared', async t => {
  const f = await fixture(t), { spaceId, childId } = await family(f)
  await accept(f, spaceId); await publish(f, spaceId, childId)
  const linked = await f.service.linkChild(f.b.id, spaceId, childId, { createPersonalCopy: true, confirmSameChild: true }, now)
  await f.record(f.b.id, linked.memberId, '爸爸快照')
  await publish(f, spaceId, childId, f.b.id)
  await familyChildLifecycle(f.service.directory, f.b.id, linked.memberId)
  const shared = await f.service.getSpace(f.a.id, spaceId, now)
  assert.equal(shared.entries.length, 1); assert.equal(shared.entries[0].sourceAccountId, f.a.id)
  assert.equal((await f.service.getSpace(f.b.id, spaceId, now)).children[0].myMemberId, null)
  assert.equal(JSON.stringify(await f.service.store.read()).includes(linked.memberId), false)
})
