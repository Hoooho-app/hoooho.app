import { createHash, randomUUID } from 'node:crypto'
import { accountTransaction } from '../auth/storage/transaction.mjs'
import { AIBusinessService } from '../ai/business/service.mjs'
import { normalizePhoto } from '../food-label/service.mjs'
import { prepareDocuments, prepareVoiceOriginals } from '../ai/business/documents.mjs'
import { fail, fingerprint } from '../ai/business/contract.mjs'
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
      const sourceEventIds = events.filter(e => e.id === event.id || e.caseMergedInto === event.id).map(e => e.id)
      const own = records.filter(r => sourceEventIds.includes(r.eventId))
      if (event.caseTracking === false || event.caseMergedInto) return []
      if (!event.caseTracking && event.category === 'other' && !own.some(r => r.type === 'symptom')) return []
      const latest = ordered(own)[0]
      const observations = (event.observationTasks ?? []).map(task => {
        const taskToday = dayAt(this.now(), task.timezone)
        const state = task.status !== 'active' ? task.status : taskToday > task.endsOn ? 'expired' : taskToday < task.startsOn ? 'scheduled' : 'active'
        const feedback = own.filter(r => r.caseContext?.taskId === task.id && dayAt(new Date(r.occurredAt), task.timezone) === taskToday)
        return { ...task, state, todayRecorded: feedback.length, todayNotObserved: feedback.filter(r => r.caseContext.result === 'not_observed').length, todayTarget: state === 'active' && !event.caseArchivedAt ? task.timesPerDay : 0 }
      })
      return [{ event, sourceEventIds, followup: caseFollowupView(event, own), latest: latest ? { id: latest.id, content: latest.content, occurredAt: latest.occurredAt, createdAt: latest.createdAt } : null, observations, changedAt: own.reduce((last, r) => r.updatedAt > last ? r.updatedAt : last, events.filter(e=>sourceEventIds.includes(e.id)).reduce((last,e)=>e.updatedAt>last?e.updatedAt:last,event.updatedAt)) }]
    }).sort((a, b) => b.changedAt.localeCompare(a.changedAt) || b.event.id.localeCompare(a.event.id))
    return { active: cases.filter(c => !c.event.caseArchivedAt), archived: cases.filter(c => c.event.caseArchivedAt), timezone, today }
  }
  async groupedRecords(accountId, memberId, eventId) {
    await this.owned(accountId, memberId, eventId)
    const events = await this.events.repository.findByAccountId(accountId)
    const ids = new Set(events.filter(e => e.memberId === memberId && (e.id === eventId || e.caseMergedInto === eventId)).map(e => e.id))
    return ordered((await this.records.repository.findByAccountId(accountId)).filter(r => ids.has(r.eventId)))
  }
  async manage(accountId, memberId, eventId, input, deleting = false) {
    if(!input||typeof input!=='object'||Array.isArray(input))throw fail('操作内容无效')
    const title = deleting ? '' : clean(input.title ?? '', 24)
    if (!deleting && !title) throw fail('请填写情况名称')
    return accountTransaction(this.directory, async () => {
      const event = await this.owned(accountId, memberId, eventId)
      if (event.caseMergedInto || input.expectedUpdatedAt !== event.updatedAt) throw fail('情况已有更新，请刷新后再操作', 409)
      if (!deleting) return this.events.repository.update(eventId, { caseTitle: title }, this.now())
      const group = (await this.events.repository.findByAccountId(accountId)).filter(item => item.memberId === memberId && (item.id === eventId || item.caseMergedInto === eventId))
      const ids=new Set(group.map(item=>item.id))
      const changedAt=(await this.records.repository.findByAccountId(accountId)).filter(record=>ids.has(record.eventId)).reduce((last,record)=>record.updatedAt>last?record.updatedAt:last,group.reduce((last,item)=>item.updatedAt>last?item.updatedAt:last,event.updatedAt))
      if(input.expectedChangedAt!==changedAt)throw fail('关联记录已有更新，请刷新后再删除',409)
      const actual = group.map(item=>item.id).sort()
      if (!Array.isArray(input.sourceEventIds) || JSON.stringify([...new Set(input.sourceEventIds)].sort()) !== JSON.stringify(actual)) throw fail('关联情况已有变化，请刷新后再删除', 409)
      // Match the established event deletion policy, atomically for the whole
      // merged group so no surviving case points at a deleted root.
      for (const item of group) await this.events.repository.delete(item.id)
      return { deletedIds: actual }
    })
  }
  async merge(accountId, memberId, eventId, input) {
    if (!['merge', 'separate'].includes(input.action)) throw fail('请选择合并或分开保留')
    if (!input.sourceEventId || input.sourceEventId === eventId) throw fail('请选择两项不同的情况')
    const title = input.action === 'merge' ? clean(input.title ?? '', 24) : ''
    if (input.action === 'merge' && !title) throw fail('请填写合并后的名称')
    return accountTransaction(this.directory, async () => {
      const target = await this.owned(accountId, memberId, eventId)
      const source = await this.owned(accountId, memberId, input.sourceEventId)
      if (source.caseMergedInto === target.id && input.action === 'merge') return target
      if (target.caseArchivedAt || source.caseArchivedAt || target.caseMergedInto || source.caseMergedInto) throw fail('情况状态已变化，请刷新后再操作', 409)
      if (input.expectedTargetAt !== target.updatedAt || input.expectedSourceAt !== source.updatedAt) throw fail('记录已有更新，请刷新后再操作', 409)
      if (input.action === 'separate') {
        return this.events.repository.update(target.id, { caseSeparateIds: [...new Set([...(target.caseSeparateIds ?? []), source.id])] }, this.now())
      }
      const all = await this.events.repository.findByAccountId(accountId)
      const group = all.filter(e => e.memberId === memberId && (e.id === source.id || e.caseMergedInto === source.id))
      for (const event of group) await this.events.repository.update(event.id, { caseMergedInto: target.id }, this.now())
      return this.events.repository.update(target.id, { caseTracking: true, caseTitle: title, observationTasks: [...new Map([...(target.observationTasks??[]),...group.flatMap(e=>e.observationTasks??[])].map(t=>[t.id,t])).values()], caseMergeHistory: [...(target.caseMergeHistory ?? []), {sourceEventIds: group.map(e => e.id), at: this.now().toISOString()}] }, this.now())
    })
  }
  async capture(accountId, memberId, input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail('情况内容格式无效')
    await this.events.assertMemberOwnership(accountId, memberId)
    const content = clean(input.text ?? '')
    const allFiles = input.files ?? []
    if (!Array.isArray(allFiles) || allFiles.length > 12) throw fail('最多保存12份原件')
    if (allFiles.some(file => !file || typeof file !== 'object' || Array.isArray(file))) throw fail('资料原件格式无效')
    const voices = prepareVoiceOriginals(allFiles.filter(file=>/^audio\//.test(file.mimeType??'')))
    const heic=allFiles.filter(file=>/^image\/hei[cf]$/.test(file.mimeType??''))
    const originals=await Promise.all(heic.map(async file=>{
      // Reuse the existing HEIC decoder for validation, but retain the selected
      // original bytes in this no-model fallback instead of a JPEG derivative.
      if(typeof file.dataUrl!=='string'||!file.dataUrl.startsWith(`data:${file.mimeType};base64,`))throw fail('图片原件格式与声明不一致')
      const bytes=Buffer.from(file.dataUrl.split(',')[1],'base64')
      if(bytes.subarray(4,8).toString()!=='ftyp')throw fail('图片原件格式与声明不一致')
      await normalizePhoto(file)
      return {name:String(file.name||'图片原件').replace(/[\\/\x00-\x1f]/g,'').slice(0,120),mimeType:file.mimeType,dataUrl:file.dataUrl,contentHash:createHash('sha256').update(Buffer.from(file.dataUrl.split(',')[1],'base64')).digest('hex')}
    }))
    const files = await prepareDocuments(allFiles.filter(f => !/^audio\//.test(f.mimeType ?? '')&&!/^image\/hei[cf]$/.test(f.mimeType??'')), { originalsOnly: Boolean(input.journal?.visit?.materials) })
    files.documents.push(...voices,...originals)
    if (files.documents.reduce((n, file) => n + Buffer.from(file.dataUrl.split(',')[1], 'base64').length, 0) > 15 * 1024 * 1024) throw fail('原件总大小不能超过15 MB')
    if (!content && !files.documents.length && !input.photoIds?.length) throw fail('先留一句话或一份原件，不保存空情况')
    const key = clean(input.requestId ?? '', 100)
    if (!key) throw fail('保存标识缺失，请重试')
    const journal = validateJournal(input.journal ?? { categories: ['other'], timePrecision: input.timeUnknown ? 'unknown' : 'exact' })
    const materials = journal?.visit?.materials
    const identity = materials ? materials.source === 'external_ai' ? 'external_ai' : 'medical_consultation' : identities.has(input.identity) ? input.identity : 'parent'
    const timeUnknown = materials ? !materials.occurredAt : Boolean(input.timeUnknown)
    const occurredAt = timeUnknown ? this.now().toISOString() : validateOccurredAt(materials?.occurredAt ?? input.occurredAt, this.now())
    if (materials) journal.timePrecision = timeUnknown ? 'unknown' : 'exact'
    const originalsByHash = new Map(allFiles.map(file => [fingerprint(file.dataUrl), file]))
    if (materials) for (const document of materials.documents.filter(document => document.kind === 'file')) {
      const original = originalsByHash.get(document.contentHash)
      if (!original || original.mimeType !== document.mimeType || String(original.name).slice(0,120) !== document.name) throw fail('资料原件与核对内容不一致，请重新选择', 422, 'VISIT_ORIGINAL_MISMATCH')
    }
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
      const existingEvent = Boolean(event)
      if (materials && journal.visit.linkedVisitRecordId) {
        const parent = await this.records.getOwnedRecord(accountId, journal.visit.linkedVisitRecordId)
        if (!event || parent.eventId !== event.id || !parent.journal?.categories?.includes('visit')) throw fail('只能给当前人物的同一次就诊补资料', 422, 'VISIT_PARENT_MISMATCH')
      }
      if(event?.caseMergedInto&&(await this.owned(accountId,memberId,event.caseMergedInto)).caseArchivedAt) throw fail('这次情况已归档，请恢复跟进后再记录',409)
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
      const materialAttachmentIds = new Map()
      for (const file of files.documents) {
        const { id, ...original } = file
        const { attachment } = await this.attachments.createUnique({ ...original, accountId, memberId, eventId: event.id, recordId: record.id, binarySize: Buffer.from(file.dataUrl.split(',')[1], 'base64').length, analysis: { status: 'needs_confirmation', confirmed: false, sourceIdentity: identity } }, this.now())
        attachmentIds.push(attachment.id)
        materialAttachmentIds.set(original.contentHash, attachment.id)
      }
      if (materials) {
        for (const document of materials.documents.filter(document => document.kind === 'file')) {
          const original = originalsByHash.get(document.contentHash)
          const hash = /^image\/hei[cf]$/.test(original.mimeType) ? createHash('sha256').update(Buffer.from(original.dataUrl.split(',')[1], 'base64')).digest('hex') : document.contentHash
          document.attachmentId = materialAttachmentIds.get(hash)
          if (!document.attachmentId) throw fail('原件保存结果尚未确认，请重试', 503, 'VISIT_ORIGINAL_PENDING')
        }
      }
      const bodyLocations = Array.isArray(input.bodyLocations) ? input.bodyLocations.slice(0, 20).map(v => clean(v, 100)) : []
      await this.records.repository.update(record.id, { ...(materials ? { journal } : {}), caseContext: { requestId: key, identity, timeUnknown, ...(materials ? { confirmed: materials.status === 'reviewed' } : {}), supplement: clean(input.supplement ?? '', 1000), bodyLocations, attachmentIds, ...(linkedDraft ? { aiDraftId: linkedDraft.id } : {}), ...(task ? { taskId: task.id, result: input.result } : {}) } }, this.now())
      if (!materials || !existingEvent) await this.events.repository.update(event.id, { caseTracking: materials ? false : input.followUp===false&&!input.eventId?false:true }, this.now())
      if (materials) await this.records.recomputeAfterMutation(accountId, event.id, this.now())
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
    if (!['recover', 'archive', 'restore', 'undo'].includes(input.action) || !input.requestId) throw fail('康复操作参数无效')
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
        if (['recover','archive'].includes(input.action) && event.caseArchivedAt) throw fail('这次情况已归档，请刷新', 409)
        if (input.action === 'restore' && !event.caseArchivedAt) throw fail('这次情况已在跟进中，请刷新', 409)
        const at = this.now().toISOString()
        patch = { status: input.action === 'recover' ? 'recovered' : input.action === 'archive' ? event.status : 'observing', recoveredAt: input.action === 'recover' ? at : input.action === 'archive' ? event.recoveredAt??null : null, caseArchivedAt: ['recover','archive'].includes(input.action) ? at : null, caseArchiveReason: input.action === 'recover' ? 'user_recovered' : input.action === 'archive' ? 'general' : null, caseRecoveryMarkedAt: input.action === 'recover' ? at : null, ...(['recover','archive'].includes(input.action) ? { observationTasks: (event.observationTasks ?? []).map(t => t.status === 'active' ? { ...t, status: 'paused', pausedByArchive: true } : t) } : {}) }
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
      if (record.journal?.visit?.materials?.source === 'external_ai' && input.identity !== 'external_ai') throw fail('AI资料需保留AI来源，不能改为医生医嘱', 422, 'VISIT_AI_SOURCE_IMMUTABLE')
      const content = clean(input.content ?? record.content)
      const updated = await this.records.update(accountId, recordId, { content, sourceType: input.identity === 'medical_consultation' || input.identity === 'examination_report' ? 'medical_file' : 'user_record' }, this.now())
      await this.records.repository.update(recordId, { caseContext: { ...record.caseContext, identity: input.identity, confirmed: true, revisions: [...(record.caseContext.revisions ?? []), { content: record.content, identity: record.caseContext.identity, at: this.now().toISOString() }].slice(-20) } }, this.now())
      await this.records.recomputeAfterMutation(accountId, eventId, this.now())
      return this.records.repository.findById(updated.id)
    })
  }
}
