import { createHash, randomUUID } from 'node:crypto'
import { accountTransaction } from '../auth/storage/transaction.mjs'
import { AIBusinessService } from '../ai/business/service.mjs'
import { prepareDocuments } from '../ai/business/documents.mjs'
import { fail } from '../ai/business/contract.mjs'
import { validateOccurredAt } from './health-event-record-service.mjs'
import { validateJournal } from './journal-metadata.mjs'
import { QuickRecordPhotoService } from './quick-record-photo-service.mjs'
import { caseFollowupView } from './case-followup-view.mjs'

const clean = (value, limit = 5000) => {
  if (typeof value !== 'string' || value.trim().length > limit) throw fail('填写内容格式或长度无效')
  return value.trim()
}
const dayAt = (instant, timezone) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant)
const validDay = value => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
const ordered = records => [...records].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
const identities = new Set(['parent', 'medical_consultation', 'examination_report', 'external_ai', 'pending'])

// Additive metadata on the existing event/record entities. No second case store.
export class CaseContinuityService {
  constructor(options = {}) {
    this.business = options.business ?? new AIBusinessService(options)
    this.events = this.business.events
    this.records = this.business.records
    this.attachments = this.business.attachments
    this.directory = options.dataDirectory ?? this.business.directory
    this.photos = options.photos ?? new QuickRecordPhotoService({ dataDirectory: this.directory, attachments: this.attachments.repository })
    this.now = options.now ?? (() => new Date())
  }
  async owned(accountId, memberId, eventId) {
    await this.events.assertMemberOwnership(accountId, memberId)
    const event = await this.events.get(accountId, eventId)
    if (event.memberId !== memberId) throw fail('情况不属于当前人物', 404)
    return event
  }
  async list(accountId, memberId, timezone = 'Asia/Shanghai') {
    await this.events.assertMemberOwnership(accountId, memberId)
    let today
    try { today = dayAt(this.now(), timezone) } catch { throw fail('时区无效') }
    const events = (await this.events.repository.findByAccountId(accountId)).filter(e => e.memberId === memberId)
    const records = await this.records.repository.findByAccountId(accountId)
    const cases = events.flatMap(event => {
      const own = records.filter(r => r.eventId === event.id)
      if (!event.caseTracking && event.category === 'other' && !own.some(r => r.type === 'symptom')) return []
      const latest = ordered(own)[0]
      const observations = (event.observationTasks ?? []).map(task => {
        const taskToday = dayAt(this.now(), task.timezone)
        const state = task.status !== 'active' ? task.status : taskToday > task.endsOn ? 'expired' : taskToday < task.startsOn ? 'scheduled' : 'active'
        const feedback = own.filter(r => r.caseContext?.taskId === task.id && dayAt(new Date(r.occurredAt), task.timezone) === taskToday)
        return { ...task, state, todayRecorded: feedback.length, todayNotObserved: feedback.filter(r => r.caseContext.result === 'not_observed').length, todayTarget: state === 'active' && !event.caseArchivedAt ? task.timesPerDay : 0 }
      })
      return [{ event, followup: caseFollowupView(event, own), latest: latest ? { id: latest.id, content: latest.content, occurredAt: latest.occurredAt, createdAt: latest.createdAt } : null, observations, changedAt: own.reduce((last, r) => r.updatedAt > last ? r.updatedAt : last, event.updatedAt) }]
    }).sort((a, b) => b.changedAt.localeCompare(a.changedAt) || b.event.id.localeCompare(a.event.id))
    return { active: cases.filter(c => !c.event.caseArchivedAt), archived: cases.filter(c => c.event.caseArchivedAt), timezone, today }
  }
  async capture(accountId, memberId, input) {
    await this.events.assertMemberOwnership(accountId, memberId)
    const content = clean(input.text ?? '')
    const allFiles = input.files ?? []
    if (!Array.isArray(allFiles) || allFiles.length > 12) throw fail('最多保存12份原件')
    const voices = allFiles.filter(f => /^audio\//.test(f.mimeType ?? '')).map(file => {
      const match = /^data:(audio\/(?:webm|mp4|ogg|wav)(?:;codecs=[a-z0-9]+)?);base64,([A-Za-z0-9+/=]+)$/.exec(file.dataUrl ?? '')
      if (!match) throw fail('语音原件格式无效')
      const buffer = Buffer.from(match[2], 'base64'), magic = buffer.subarray(0, 12)
      if (buffer.length < 800 || buffer.length > 6 * 1024 * 1024 || !(magic.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])) || magic.subarray(0,4).toString() === 'OggS' || magic.subarray(0,4).toString() === 'RIFF' || magic.subarray(4,8).toString() === 'ftyp')) throw fail('语音原件不可读取或超过6 MB')
      return { name: clean(file.name, 160), mimeType: match[1].split(';')[0], dataUrl: file.dataUrl, contentHash: createHash('sha256').update(buffer).digest('hex') }
    })
    const files = await prepareDocuments(allFiles.filter(f => !/^audio\//.test(f.mimeType ?? '')))
    files.documents.push(...voices)
    if (files.documents.reduce((n, file) => n + Buffer.from(file.dataUrl.split(',')[1], 'base64').length, 0) > 15 * 1024 * 1024) throw fail('原件总大小不能超过15 MB')
    if (!content && !files.documents.length && !input.photoIds?.length) throw fail('先留一句话或一份原件，不保存空情况')
    const key = clean(input.requestId ?? '', 100)
    if (!key) throw fail('保存标识缺失，请重试')
    const identity = identities.has(input.identity) ? input.identity : 'parent'
    const occurredAt = input.timeUnknown ? this.now().toISOString() : validateOccurredAt(input.occurredAt, this.now())
    const journal = validateJournal(input.journal ?? { categories: ['other'], timePrecision: input.timeUnknown ? 'unknown' : 'exact' })
    const linkedDraft = input.aiDraftId ? await this.business.get(accountId, memberId, input.aiDraftId) : null
    if (linkedDraft?.state === 'saved') throw fail('这份草稿已经保存，请查看原记录',409)
    return accountTransaction(this.directory, async () => {
      const previous = (await this.records.repository.findByAccountId(accountId)).find(r => r.caseContext?.requestId === key)
      if (previous) {
        const event = await this.owned(accountId, memberId, previous.eventId)
        if (input.eventId && input.eventId !== event.id) throw fail('保存标识属于另一次情况，请重新打开记录', 409)
        return { eventId: event.id, recordId: previous.id, attachmentIds: previous.caseContext.attachmentIds ?? [], duplicate: true }
      }
      let event = input.eventId ? await this.owned(accountId, memberId, input.eventId) : null
      if (event?.caseArchivedAt) throw fail('这次情况已归档，请恢复跟进或选择新的一次情况', 409)
      const task = input.taskId && event?.observationTasks?.find(t => t.id === input.taskId)
      if (input.taskId && (!task || task.status !== 'active' || dayAt(this.now(), task.timezone) > task.endsOn || dayAt(this.now(), task.timezone) < task.startsOn)) throw fail('本项观察尚未开始、已到期或已停止，请查看安排', 409)
      if (task && !['improved', 'unchanged', 'worse', 'not_observed'].includes(input.result)) throw fail('请选择这次实际观察结果')
      if (input.photoIds !== undefined && !Array.isArray(input.photoIds)) throw fail('照片列表无效')
      const photos = input.photoIds?.length ? await this.photos.prepareForSave(accountId, memberId, input.photoDraftId, input.photoIds) : []
      event ??= await this.events.create(accountId, { memberId, title: clean(input.title ?? '', 120) || content.slice(0, 30) || '待整理的情况', category: 'other', startTime: occurredAt }, this.now())
      const record = await this.records.create(accountId, event.id, { type: 'note', caseIdentity: identity, content: content || '资料原件已保留，内容待整理', occurredAt, sourceType: identity === 'medical_consultation' || identity === 'examination_report' ? 'medical_file' : 'user_record', sourceText: content || null, journal }, this.now())
      const attachedPhotos = await this.photos.attach(accountId, event.id, record.id, memberId, photos, this.now())
      const attachmentIds = attachedPhotos.map(photo => photo.id)
      for (const file of files.documents) {
        const { id, ...original } = file
        const { attachment } = await this.attachments.createUnique({ ...original, accountId, memberId, eventId: event.id, recordId: record.id, binarySize: Buffer.from(file.dataUrl.split(',')[1], 'base64').length, analysis: { status: 'needs_confirmation', confirmed: false, sourceIdentity: identity } }, this.now())
        attachmentIds.push(attachment.id)
      }
      const bodyLocations = Array.isArray(input.bodyLocations) ? input.bodyLocations.slice(0, 20).map(v => clean(v, 100)) : []
      await this.records.repository.update(record.id, { caseContext: { requestId: key, identity, timeUnknown: Boolean(input.timeUnknown), supplement: clean(input.supplement ?? '', 1000), bodyLocations, attachmentIds, ...(linkedDraft ? { aiDraftId: linkedDraft.id } : {}), ...(task ? { taskId: task.id, result: input.result } : {}) } }, this.now())
      await this.events.repository.update(event.id, { caseTracking: true }, this.now())
      await this.photos.consume(accountId, input.photoDraftId, photos, this.now())
      return { eventId: event.id, recordId: record.id, attachmentIds, duplicate: false }
    })
  }
  async archive(accountId, memberId, eventId, archived) {
    return accountTransaction(this.directory, async () => {
      const event = await this.owned(accountId, memberId, eventId)
      const at = this.now().toISOString()
      return this.events.repository.update(eventId, { caseTracking: true, caseArchivedAt: archived ? at : null, caseArchiveReason: archived ? 'general' : null, caseRecoveryMarkedAt: null, caseStateHistory: [...(event.caseStateHistory ?? []), { action: archived ? 'archive' : 'restore', at }], ...(archived ? { observationTasks: (event.observationTasks ?? []).map(t => t.status === 'active' ? { ...t, status: 'paused', pausedByArchive: true } : t) } : {}) }, this.now())
    })
  }
  async recovery(accountId, memberId, eventId, input) {
    if (!['recover', 'restore', 'undo'].includes(input.action) || !input.requestId) throw fail('康复操作参数无效')
    const requestId = clean(input.requestId, 100)
    return accountTransaction(this.directory, async () => {
      const event = await this.owned(accountId, memberId, eventId), history = event.caseStateHistory ?? []
      const previous = history.find(h => h.requestId === requestId)
      if (previous) { if (previous.action !== input.action) throw fail('操作标识不匹配', 409); return event }
      const last = history.at(-1)
      if (input.expectedArchivedAt !== undefined && input.expectedArchivedAt !== (event.caseArchivedAt ?? null)) throw fail('情况状态已改变，请刷新后重试', 409)
      let patch
      if (input.action === 'undo') {
        if (!last || last.requestId !== input.undoRequestId || !last.before) throw fail('状态已有新操作，不能撤销旧操作，请刷新', 409)
        if (JSON.stringify(event.observationTasks??[]) !== JSON.stringify(last.afterTasks??[])) throw fail('观察安排已有修改，请用恢复跟进修正状态，不撤销新安排', 409)
        patch = last.before
      } else {
        if (input.action === 'recover' && event.caseArchivedAt) throw fail('这次情况已归档，请刷新', 409)
        if (input.action === 'restore' && !event.caseArchivedAt) throw fail('这次情况已在跟进中，请刷新', 409)
        const at = this.now().toISOString()
        patch = { status: input.action === 'recover' ? 'recovered' : 'observing', recoveredAt: input.action === 'recover' ? at : null, caseArchivedAt: input.action === 'recover' ? at : null, caseArchiveReason: input.action === 'recover' ? 'user_recovered' : null, caseRecoveryMarkedAt: input.action === 'recover' ? at : null, ...(input.action === 'recover' ? { observationTasks: (event.observationTasks ?? []).map(t => t.status === 'active' ? { ...t, status: 'paused', pausedByArchive: true } : t) } : {}) }
      }
      const before = { status: event.status, recoveredAt: event.recoveredAt??null, caseArchivedAt: event.caseArchivedAt ?? null, caseArchiveReason: event.caseArchiveReason ?? null, caseRecoveryMarkedAt: event.caseRecoveryMarkedAt ?? null, observationTasks: event.observationTasks ?? [] }
      return this.events.repository.update(eventId, { ...patch, caseTracking: true, caseStateHistory: [...history, { action: input.action, requestId, at: this.now().toISOString(), before, afterTasks: patch.observationTasks??event.observationTasks??[] }] }, this.now())
    })
  }
  async observation(accountId, memberId, eventId, input) {
    return accountTransaction(this.directory, async () => {
      const event = await this.owned(accountId, memberId, eventId)
      if (event.caseArchivedAt) throw fail('请先恢复这次跟进，再安排观察', 409)
      const tasks = event.observationTasks ?? []
      const existing = input.id ? tasks.find(t => t.id === input.id) : null
      if (input.id && !existing) throw fail('观察项目不存在', 404)
      if (input.action) {
        if (!['pause', 'end', 'resume'].includes(input.action)) throw fail('观察操作无效')
        if (input.action === 'resume' && existing && dayAt(this.now(), existing.timezone) > existing.endsOn) throw fail('观察已到期，请明确确认新的截止日期', 409)
        if (!existing) throw fail('请选择观察项目')
        return this.events.repository.update(eventId, { observationTasks: tasks.map(t => t.id === existing.id ? { ...t, status: { pause: 'paused', end: 'ended', resume: 'active' }[input.action] } : t) }, this.now())
      }
      const item = clean(input.item ?? '', 300)
      if (!item || !validDay(input.startsOn) || !validDay(input.endsOn) || input.endsOn < input.startsOn) throw fail('请填写观察项目和有效起止日期')
      if (!Number.isInteger(input.timesPerDay) || input.timesPerDay < 1 || input.timesPerDay > 12) throw fail('每日记录频次应为1至12次')
      const timezone = input.timezone ?? 'Asia/Shanghai'
      try { dayAt(this.now(), timezone) } catch { throw fail('时区无效') }
      if (input.reminderEnabled) throw fail('当前观察仅支持站内待记录，系统提醒通道尚未验证；请关闭提醒后安排', 422, 'OBSERVATION_NOTIFICATION_UNAVAILABLE')
      let source = null
      if (input.sourceRecordId) {
        const record = await this.records.getOwnedRecord(accountId, input.sourceRecordId)
        if (record.eventId !== eventId || record.caseContext?.identity !== 'medical_consultation' || !record.caseContext?.confirmed) throw fail('医生观察来源需先核对并接回本次情况')
        source = { recordId: record.id, quote: clean(input.sourceQuote ?? '', 1000), page: input.sourcePage ?? 1 }
        if (!Number.isInteger(source.page) || source.page < 1 || source.page > 200) throw fail('来源页码无效')
        if (!source.quote || !record.content.includes(source.quote)) throw fail('观察要求需保留资料中的已确认原话')
      }
      const requestId = clean(input.requestId ?? existing?.requestId ?? '', 100)
      if (!requestId) throw fail('安排标识缺失')
      const duplicate = !existing && tasks.find(t => t.requestId === requestId)
      if (duplicate) return event
      const task = { id: existing?.id ?? randomUUID(), requestId, item, startsOn: input.startsOn, endsOn: input.endsOn, timesPerDay: input.timesPerDay, timezone, source: source ? 'doctor_confirmed' : 'parent', sourceReference: source, reminderEnabled: false, status: 'active', createdAt: existing?.createdAt ?? this.now().toISOString(), updatedAt: this.now().toISOString() }
      return this.events.repository.update(eventId, { caseTracking: true, observationTasks: existing ? tasks.map(t => t.id === existing.id ? task : t) : [...tasks, task] }, this.now())
    })
  }
  async confirmMaterial(accountId, memberId, eventId, recordId, input) {
    await this.owned(accountId, memberId, eventId)
    return accountTransaction(this.directory, async () => {
      const record = await this.records.getOwnedRecord(accountId, recordId)
      if (record.eventId !== eventId || !record.caseContext) throw fail('资料归属不匹配', 404)
      if (!identities.has(input.identity) || input.identity === 'pending' || input.confirmed !== true) throw fail('请先核对原件和资料来源')
      const content = clean(input.content ?? record.content)
      const updated = await this.records.update(accountId, recordId, { content, sourceType: input.identity === 'medical_consultation' || input.identity === 'examination_report' ? 'medical_file' : 'user_record' }, this.now())
      await this.records.repository.update(recordId, { caseContext: { ...record.caseContext, identity: input.identity, confirmed: true, revisions: [...(record.caseContext.revisions ?? []), { content: record.content, identity: record.caseContext.identity, at: this.now().toISOString() }].slice(-20) } }, this.now())
      await this.records.recomputeAfterMutation(accountId, eventId, this.now())
      return this.records.repository.findById(updated.id)
    })
  }
}
