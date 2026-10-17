import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { JsonStore } from '../auth/storage/json-store.mjs'
import { accountTransaction, withStorageLock } from '../auth/storage/transaction.mjs'
import { UserRepository } from '../auth/repositories/user-repository.mjs'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { HealthEventRepository } from '../events/repositories/health-event-repository.mjs'
import { HealthEventRecordRepository } from '../events/repositories/health-event-record-repository.mjs'
import { EventAttachmentRepository } from '../events/repositories/event-attachment-repository.mjs'

export class FamilySharingError extends Error {
  constructor(message, status = 400, code = 'FAMILY_SHARING_ERROR') { super(message); this.status = status; this.code = code }
}
const fail = (message, status = 400, code) => { throw new FamilySharingError(message, status, code) }
const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const clone = value => structuredClone(value)
const nonempty = value => typeof value === 'string' && value.length > 0 && value.length <= 100
const profile = member => ({ name: member.name, birthday: member.birthday ?? null, gender: member.gender ?? null })
const activeParticipant = (space, accountId) => space.participants.find(p => p.accountId === accountId && !p.leftAt)
const descending = (a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.createdAt.localeCompare(a.createdAt) || b.sourceRecordId.localeCompare(a.sourceRecordId)

// An isolated, explicit-publish workspace. Existing medical records never change
// accountId or memberId, and no old business API grants cross-account access.
export class FamilySharingService {
  constructor(options = {}) {
    this.directory = options.dataDirectory
    this.store = new JsonStore(path.join(this.directory, 'family-sharing.json'), { spaces: [], invitations: [], batches: [], entries: [], audits: [] })
    this.users = options.users ?? new UserRepository(this.directory)
    this.members = options.members ?? new FamilyMemberRepository(this.directory)
    this.events = options.events ?? new HealthEventRepository(this.directory)
    this.records = options.records ?? new HealthEventRecordRepository(this.directory)
    this.attachments = options.attachments ?? new EventAttachmentRepository(this.directory)
    this.attachmentReader = options.attachmentReader ?? null
    const internal = new Set(String(options.internalAccountIds ?? process.env.FAMILY_SHARING_INTERNAL_ACCOUNTS ?? '').split(',').map(x => x.trim()).filter(Boolean))
    this.entitlement = options.entitlement ?? (async accountId => ({ active: internal.has(accountId), mode: internal.has(accountId) ? 'internal_test' : 'unavailable' }))
  }

  async account(accountId) {
    const user = await this.users.findById(accountId)
    if (!user || user.guest || user.mergedInto) fail('请使用自己的正式账号登录后继续', 403, 'REGISTERED_ACCOUNT_REQUIRED')
    return user
  }
  async permission(ownerId, now = new Date()) {
    const grant = await this.entitlement(ownerId, now)
    return { active: grant?.active === true && (!grant.expiresAt || Date.parse(grant.expiresAt) > now.getTime()), mode: grant?.mode ?? 'unavailable', expiresAt: grant?.expiresAt ?? null }
  }
  async requireActive(space, now) {
    if (!(await this.permission(space.ownerAccountId, now)).active) fail('家庭协作尚未开放或已暂停；已共享历史仍可查看和导出', 403, 'FAMILY_COLLABORATION_INACTIVE')
  }
  async ownedChild(accountId, memberId) {
    const member = await this.members.findById(memberId)
    if (!member || member.accountId !== accountId || member.relationship !== 'child') fail('未找到你有权选择的孩子档案', 404, 'CHILD_NOT_FOUND')
    return member
  }
  async accessible(data, accountId, spaceId) {
    await this.account(accountId)
    const space = data.spaces.find(s => s.id === spaceId)
    if (!space || !activeParticipant(space, accountId)) fail('家庭空间不存在或共享授权已撤销', 404, 'FAMILY_SPACE_NOT_FOUND')
    await this.account(space.ownerAccountId)
    return space
  }
  audit(data, space, actorAccountId, action, details, now) {
    return [...data.audits, { id: randomUUID(), spaceId: space.id, actorAccountId, action, details, createdAt: now.toISOString() }]
  }

  async overview(accountId, now = new Date()) {
    await this.account(accountId)
    return withStorageLock(async () => {
      const data = await this.store.read()
      const spaces = []
      for (const space of data.spaces.filter(s => activeParticipant(s, accountId))) {
        if (!(await this.users.findById(space.ownerAccountId))) continue
        spaces.push({ id: space.id, role: activeParticipant(space, accountId).role, childNames: space.children.map(c => c.profile.name), participantCount: space.participants.filter(p => !p.leftAt).length, ...(await this.permission(space.ownerAccountId, now)) })
      }
      const invitations = data.invitations.filter(i => i.recipientAccountId === accountId && i.status === 'pending' && Date.parse(i.expiresAt) > now.getTime())
        .filter(i => data.spaces.some(s => s.id === i.spaceId && activeParticipant(s, i.senderAccountId)))
        .map(i => ({ id: i.id, spaceId: i.spaceId, childNames: i.childNames, expiresAt: i.expiresAt }))
      return { capability: await this.permission(accountId, now), spaces, invitations, scope: '记录快照工作区：主动预览并共享，不改原档案，不自动同步全部业务' }
    })
  }

  async createSpace(accountId, input, now = new Date()) {
    await this.account(accountId)
    if (input?.confirmShare !== true || !Array.isArray(input?.memberIds) || !input.memberIds.length || input.memberIds.length > 20 || input.memberIds.some(x => !nonempty(x))) fail('请选择孩子并确认共享范围')
    return accountTransaction(this.directory, async () => {
      const grant = await this.permission(accountId, now)
      if (!grant.active) fail('正式家庭协作尚未开放，当前不能创建家庭', 403, 'FAMILY_NOT_AVAILABLE')
      const data = await this.store.read()
      if (data.spaces.some(s => s.ownerAccountId === accountId && activeParticipant(s, accountId))) fail('你已有一个家庭空间，请进入已有家庭', 409, 'FAMILY_ALREADY_EXISTS')
      const children = []
      for (const memberId of new Set(input.memberIds)) {
        const member = await this.ownedChild(accountId, memberId)
        children.push({ id: randomUUID(), ownerAccountId: accountId, ownerMemberId: member.id, profile: profile(member), links: [{ accountId, memberId: member.id, linkedAt: now.toISOString() }] })
      }
      const space = { id: randomUUID(), ownerAccountId: accountId, participants: [{ accountId, role: 'admin', joinedAt: now.toISOString() }], children, createdAt: now.toISOString() }
      await this.store.update(current => ({ ...current, spaces: [...current.spaces, space], audits: this.audit(current, space, accountId, 'space_created', { childCount: children.length }, now) }))
      return { id: space.id }
    })
  }

  async invite(accountId, spaceId, input, now = new Date()) {
    return accountTransaction(this.directory, async () => {
      const data = await this.store.read(), space = await this.accessible(data, accountId, spaceId)
      if (space.ownerAccountId !== accountId) fail('只有家庭管理员可以邀请', 403)
      await this.requireActive(space, now)
      if (input?.confirmShare !== true || !/^H[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{7}$/.test(String(input?.recipientHooohoId ?? '').toUpperCase())) fail('请填写对方的 Hoooho ID，并确认共享范围')
      const recipient = await this.users.findByHooohoId(input.recipientHooohoId.toUpperCase())
      if (!recipient || recipient.guest || recipient.mergedInto || recipient.id === accountId) fail('无法向这个账号发出邀请，请核对 Hoooho ID', 400, 'INVALID_INVITATION_RECIPIENT')
      if (space.participants.filter(p => !p.leftAt).length >= 2) fail('家庭已有两位成人账号，请先处理现有授权', 409, 'FAMILY_SEATS_FULL')
      const old = data.invitations.find(i => i.spaceId === spaceId && i.recipientAccountId === recipient.id && i.status === 'pending' && Date.parse(i.expiresAt) > now.getTime())
      if (old) return { id: old.id, expiresAt: old.expiresAt }
      const invitation = { id: randomUUID(), spaceId, senderAccountId: accountId, recipientAccountId: recipient.id, childNames: space.children.map(c => c.profile.name), status: 'pending', createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 24 * 60 * 60_000).toISOString() }
      await this.store.update(current => ({ ...current, invitations: [...current.invitations.map(i => i.spaceId === spaceId && i.status === 'pending' ? { ...i, status: 'replaced' } : i), invitation], audits: this.audit(current, space, accountId, 'invitation_created', { invitationId: invitation.id }, now) }))
      return { id: invitation.id, expiresAt: invitation.expiresAt }
    })
  }

  async acceptInvitation(accountId, invitationId, input, now = new Date()) {
    await this.account(accountId)
    if (input?.confirmShare !== true) fail('请确认孩子范围、记录来源与共享方式')
    return accountTransaction(this.directory, async () => {
      const data = await this.store.read(), invitation = data.invitations.find(i => i.id === invitationId && i.recipientAccountId === accountId)
      if (!invitation) fail('邀请不存在或不属于当前账号', 404, 'INVITATION_NOT_FOUND')
      const space = data.spaces.find(s => s.id === invitation.spaceId)
      if (invitation.status === 'accepted' && activeParticipant(space ?? { participants: [] }, accountId)) return { id: space.id }
      if (invitation.status !== 'pending' || Date.parse(invitation.expiresAt) <= now.getTime()) fail('邀请已失效，请由管理员重新邀请', 409, 'INVITATION_EXPIRED')
      if (!space || !activeParticipant(space, invitation.senderAccountId)) fail('邀请已撤销', 409, 'INVITATION_REVOKED')
      await this.account(space.ownerAccountId)
      await this.requireActive(space, now)
      if (space.participants.filter(p => !p.leftAt).length >= 2) fail('家庭已有两位成人账号', 409, 'FAMILY_SEATS_FULL')
      await this.store.update(current => ({ ...current,
        spaces: current.spaces.map(s => s.id === space.id ? { ...s, participants: [...s.participants.filter(p => p.accountId !== accountId), { accountId, role: 'caregiver', joinedAt: now.toISOString() }] } : s),
        invitations: current.invitations.map(i => i.id === invitationId ? { ...i, status: 'accepted', acceptedAt: now.toISOString() } : i),
        audits: this.audit(current, space, accountId, 'invitation_accepted', { invitationId }, now)
      }))
      return { id: space.id }
    })
  }

  async linkChild(accountId, spaceId, childId, input, now = new Date()) {
    if (input?.confirmSameChild !== true) fail('请核对并确认是同一个孩子')
    return accountTransaction(this.directory, async () => {
      const data = await this.store.read(), space = await this.accessible(data, accountId, spaceId)
      await this.requireActive(space, now)
      const child = space.children.find(c => c.id === childId)
      if (!child) fail('共享孩子不存在', 404)
      await this.ownedChild(child.ownerAccountId, child.ownerMemberId)
      if (child.links.some(l => l.accountId === accountId)) fail('你已关联这名孩子；更换来源请先核对已有导入', 409, 'CHILD_ALREADY_LINKED')
      let member
      if (input.createPersonalCopy === true) member = await this.members.create({ accountId, ...child.profile, relationship: 'child', isSelf: false }, now)
      else member = await this.ownedChild(accountId, input.sourceMemberId)
      if (space.children.some(c => c.id !== childId && c.links.some(l => l.accountId === accountId && l.memberId === member.id))) fail('这个个人档案已关联其他共享孩子', 409)
      await this.store.update(current => ({ ...current,
        spaces: current.spaces.map(s => s.id === spaceId ? { ...s, children: s.children.map(c => c.id === childId ? { ...c, links: [...c.links, { accountId, memberId: member.id, linkedAt: now.toISOString() }] } : c) } : s),
        audits: this.audit(current, space, accountId, 'child_linked', { childId, createdPersonalCopy: input.createPersonalCopy === true }, now)
      }))
      return { memberId: member.id }
    })
  }

  async sourceRecords(accountId, memberId) {
    await this.ownedChild(accountId, memberId)
    const events = (await this.events.findByAccountId(accountId)).filter(e => e.memberId === memberId)
    const eventMap = new Map(events.map(e => [e.id, e]))
    const snapshots = []
    for (const record of await this.records.findByAccountId(accountId)) {
      const event = eventMap.get(record.eventId)
      if (!event) continue
      // Do not publish raw AI conversations, linked-record IDs, draft metadata,
      // account contact details, or attachments belonging to unselected records.
      const attachments = (await this.attachments.findByEventId(event.id)).filter(a => a.accountId === accountId && a.recordId === record.id)
        .map(a => ({ id: a.id, name: String(a.name ?? '附件').slice(0, 200), mimeType: a.mimeType, createdAt: a.createdAt }))
      snapshots.push({ sourceAccountId: accountId, sourceMemberId: memberId, sourceRecordId: record.id, sourceEventId: event.id, eventTitle: event.title, type: record.type, content: record.content, note: record.note ?? null, occurredAt: record.occurredAt, createdAt: record.createdAt, updatedAt: record.updatedAt, attachments })
    }
    return snapshots.sort(descending)
  }

  async previewImport(accountId, spaceId, childId, now = new Date()) {
    return accountTransaction(this.directory, async () => {
      const data = await this.store.read(), space = await this.accessible(data, accountId, spaceId)
      await this.requireActive(space, now)
      const child = space.children.find(c => c.id === childId), link = child?.links.find(l => l.accountId === accountId)
      if (!link) fail('请先关联你自己的孩子档案', 409, 'CHILD_LINK_REQUIRED')
      await this.ownedChild(child.ownerAccountId, child.ownerMemberId)
      const candidates = []
      for (const snapshot of await this.sourceRecords(accountId, link.memberId)) {
        const existing = data.entries.find(e => e.spaceId === spaceId && e.childId === childId && e.sourceAccountId === accountId && e.sourceRecordId === snapshot.sourceRecordId && !e.withdrawnAt)
        const hash = fingerprint(snapshot)
        if (existing?.fingerprint === hash) continue
        const possibleDuplicates = data.entries.filter(e => e.spaceId === spaceId && e.childId === childId && !e.withdrawnAt && e.sourceAccountId !== accountId && e.snapshot.type === snapshot.type && e.snapshot.occurredAt === snapshot.occurredAt && e.snapshot.content === snapshot.content).map(e => e.id)
        candidates.push({ snapshot, fingerprint: hash, expectedEntryId: existing?.id ?? null, expectedFingerprint: existing?.fingerprint ?? null, possibleDuplicates })
      }
      const batch = { id: randomUUID(), spaceId, childId, accountId, status: 'preview', candidates: candidates.slice(0, 200), remainingCount: Math.max(0, candidates.length - 200), createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 30 * 60_000).toISOString() }
      await this.store.update(current => ({ ...current, batches: [...current.batches.filter(b => !(b.status === 'preview' && Date.parse(b.expiresAt) <= now.getTime())), batch] }))
      return { id: batch.id, childId, candidates: batch.candidates.map(c => ({ ...c.snapshot, possibleDuplicate: Boolean(c.possibleDuplicates.length), action: c.expectedEntryId ? 'update' : 'add' })), remainingCount: batch.remainingCount, expiresAt: batch.expiresAt }
    })
  }

  async confirmImport(accountId, spaceId, batchId, input, now = new Date()) {
    if (input?.confirmShare !== true || !Array.isArray(input?.selectedRecordIds) || !input.selectedRecordIds.length || input.selectedRecordIds.length > 200 || input.selectedRecordIds.some(id => !nonempty(id))) fail('请选择并确认本批要共享的记录')
    return accountTransaction(this.directory, async () => {
      const data = await this.store.read(), space = await this.accessible(data, accountId, spaceId)
      await this.requireActive(space, now)
      const batch = data.batches.find(b => b.id === batchId && b.spaceId === spaceId && b.accountId === accountId)
      if (!batch) fail('导入批次不存在', 404)
      if (batch.status === 'committed') return { id: batch.id, count: batch.committedCount }
      if (batch.status !== 'preview' || Date.parse(batch.expiresAt) <= now.getTime()) fail('预览已过期，请重新核对', 409, 'IMPORT_PREVIEW_EXPIRED')
      const child = space.children.find(c => c.id === batch.childId), link = child?.links.find(l => l.accountId === accountId)
      if (!link) fail('孩子关联已失效', 409)
      const fresh = new Map((await this.sourceRecords(accountId, link.memberId)).map(s => [s.sourceRecordId, s]))
      const chosen = [...new Set(input.selectedRecordIds)].map(id => batch.candidates.find(c => c.snapshot.sourceRecordId === id))
      if (chosen.some(c => !c)) fail('只能共享本次预览中的记录', 400, 'INVALID_IMPORT_SELECTION')
      const entries = clone(data.entries), changes = []
      for (const candidate of chosen) {
        const snapshot = fresh.get(candidate.snapshot.sourceRecordId)
        if (!snapshot || fingerprint(snapshot) !== candidate.fingerprint) fail('原记录已变化，请重新预览核对', 409, 'SOURCE_RECORD_CHANGED')
        const existing = entries.find(e => e.spaceId === spaceId && e.childId === batch.childId && e.sourceAccountId === accountId && e.sourceRecordId === snapshot.sourceRecordId && !e.withdrawnAt)
        if (existing && existing.fingerprint === candidate.fingerprint) continue
        if ((existing?.id ?? null) !== candidate.expectedEntryId || (existing?.fingerprint ?? null) !== candidate.expectedFingerprint) fail('共享版本已变化，请重新预览', 409, 'SHARED_RECORD_CONFLICT')
        if (existing) {
          changes.push({ entryId: existing.id, previous: clone(existing) })
          existing.revisions = [...(existing.revisions ?? []), { snapshot: clone(existing.snapshot), fingerprint: existing.fingerprint, batchId: existing.lastBatchId }]
          Object.assign(existing, { snapshot, fingerprint: candidate.fingerprint, lastBatchId: batchId, sharedAt: now.toISOString() })
        } else {
          const entry = { id: randomUUID(), spaceId, childId: batch.childId, sourceAccountId: accountId, sourceRecordId: snapshot.sourceRecordId, snapshot, fingerprint: candidate.fingerprint, lastBatchId: batchId, sharedAt: now.toISOString(), revisions: [] }
          entries.push(entry); changes.push({ entryId: entry.id, previous: null })
        }
      }
      await this.store.update(current => ({ ...current, entries, batches: current.batches.map(b => b.id === batchId ? { ...b, status: 'committed', committedAt: now.toISOString(), committedCount: changes.length, changes } : b), audits: this.audit(current, space, accountId, 'records_shared', { batchId, count: changes.length }, now) }))
      return { id: batchId, count: changes.length }
    })
  }

  async undoImport(accountId, spaceId, batchId, input, now = new Date()) {
    if (input?.confirm !== true) fail('请确认撤回这批共享；个人原记录不受影响')
    return accountTransaction(this.directory, async () => {
      const data = await this.store.read(), space = await this.accessible(data, accountId, spaceId)
      const batch = data.batches.find(b => b.id === batchId && b.spaceId === spaceId)
      if (!batch || (batch.accountId !== accountId && space.ownerAccountId !== accountId)) fail('无权撤回这批共享', 404)
      if (batch.status === 'withdrawn') return { success: true }
      if (batch.status !== 'committed') fail('此批次尚未共享', 409)
      if (batch.changes.some(change => data.entries.find(e => e.id === change.entryId)?.lastBatchId !== batchId)) fail('记录有后续共享版本，请先核对后续批次', 409, 'IMPORT_UNDO_CONFLICT')
      const changes = new Map(batch.changes.map(c => [c.entryId, c]))
      const entries = data.entries.map(entry => !changes.has(entry.id) ? entry : changes.get(entry.id).previous ?? { ...entry, withdrawnAt: now.toISOString() })
      await this.store.update(current => ({ ...current, entries, batches: current.batches.map(b => b.id === batchId ? { ...b, status: 'withdrawn', withdrawnAt: now.toISOString() } : b), audits: this.audit(current, space, accountId, 'batch_withdrawn', { batchId }, now) }))
      return { success: true }
    })
  }

  async revoke(accountId, spaceId, input, now = new Date()) {
    if (input?.confirm !== true) fail('请确认停止对应账号的共享授权')
    return accountTransaction(this.directory, async () => {
      const data = await this.store.read(), space = await this.accessible(data, accountId, spaceId)
      const target = input.accountId ?? accountId
      if (target === space.ownerAccountId) fail('管理员请撤销照顾者授权；管理员转让尚未开放', 409, 'ADMIN_TRANSFER_NOT_AVAILABLE')
      if (target !== accountId && space.ownerAccountId !== accountId) fail('无权更改其他账号授权', 403)
      if (!activeParticipant(space, target)) return { success: true }
      await this.store.update(current => ({ ...current,
        spaces: current.spaces.map(s => s.id === spaceId ? { ...s, participants: s.participants.map(p => p.accountId === target ? { ...p, leftAt: now.toISOString() } : p) } : s),
        invitations: current.invitations.map(i => i.spaceId === spaceId && i.status === 'pending' ? { ...i, status: 'revoked' } : i),
        audits: this.audit(current, space, accountId, 'access_revoked', { targetAccountId: target }, now)
      }))
      return { success: true }
    })
  }

  async visibleEntry(space, entry) {
    if (entry.withdrawnAt || !activeParticipant(space, entry.sourceAccountId)) return false
    const child = space.children.find(c => c.id === entry.childId)
    if (!child || !(await this.users.findById(entry.sourceAccountId))) return false
    const ownerChild = await this.members.findById(child.ownerMemberId), sourceChild = await this.members.findById(entry.snapshot.sourceMemberId)
    if (!ownerChild || ownerChild.accountId !== child.ownerAccountId || !sourceChild || sourceChild.accountId !== entry.sourceAccountId) return false
    const sourceRecord = await this.records.findById(entry.sourceRecordId), event = sourceRecord && await this.events.findById(sourceRecord.eventId)
    return Boolean(sourceRecord?.accountId === entry.sourceAccountId && event?.accountId === entry.sourceAccountId && event?.memberId === entry.snapshot.sourceMemberId)
  }

  async getSpace(accountId, spaceId, now = new Date()) {
    return withStorageLock(async () => {
      const data = await this.store.read(), space = await this.accessible(data, accountId, spaceId)
      const participants = []
      for (const participant of space.participants.filter(p => !p.leftAt)) {
        const user = await this.users.findById(participant.accountId)
        if (user) participants.push({ accountId: user.id, name: user.nickname ?? user.hooohoId ?? '照顾者', role: participant.role })
      }
      const entries = []
      for (const entry of data.entries.filter(e => e.spaceId === spaceId)) if (await this.visibleEntry(space, entry)) entries.push({ id: entry.id, childId: entry.childId, batchId: entry.lastBatchId, ...entry.snapshot, authorName: participants.find(p => p.accountId === entry.sourceAccountId)?.name ?? '原记录者', sharedAt: entry.sharedAt, revisionCount: entry.revisions?.length ?? 0 })
      return { id: spaceId, role: activeParticipant(space, accountId).role, permission: await this.permission(space.ownerAccountId, now), participants,
        children: space.children.map(c => ({ id: c.id, ...c.profile, myMemberId: c.links.find(l => l.accountId === accountId)?.memberId ?? null })),
        entries: entries.sort(descending),
        batches: data.batches.filter(b => b.spaceId === spaceId && b.status !== 'preview').map(b => ({ id: b.id, accountId: b.accountId, status: b.status, count: b.committedCount, createdAt: b.committedAt ?? b.createdAt })),
        audits: data.audits.filter(a => a.spaceId === spaceId).slice(-100).reverse().map(a => ({ id: a.id, actorName: participants.find(p => p.accountId === a.actorAccountId)?.name ?? '原照顾者', action: a.action, createdAt: a.createdAt }))
      }
    })
  }

  async readAttachment(accountId, spaceId, entryId, attachmentId) {
    return withStorageLock(async () => {
      const data = await this.store.read(), space = await this.accessible(data, accountId, spaceId)
      const entry = data.entries.find(e => e.id === entryId && e.spaceId === spaceId)
      if (!entry || !(await this.visibleEntry(space, entry)) || !entry.snapshot.attachments.some(a => a.id === attachmentId)) fail('附件不存在或共享授权已撤销', 404, 'SHARED_ATTACHMENT_NOT_FOUND')
      const attachment = await this.attachments.findById(attachmentId)
      if (!attachment || attachment.accountId !== entry.sourceAccountId || attachment.eventId !== entry.snapshot.sourceEventId || attachment.recordId !== entry.sourceRecordId) fail('原附件已变化或不可用', 404)
      if (!this.attachmentReader) fail('附件读取暂未接通，请查看原记录', 503, 'SHARED_ATTACHMENT_UNAVAILABLE')
      const file = await this.attachmentReader.read(entry.sourceAccountId, entry.snapshot.sourceEventId, attachmentId)
      return { ...file, name: attachment.name ?? '附件' }
    })
  }
}
