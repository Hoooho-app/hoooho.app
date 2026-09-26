import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { JsonStore } from '../auth/storage/json-store.mjs'
import { withAccountLock } from '../auth/account-lock.mjs'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { HealthEventRepository } from '../events/repositories/health-event-repository.mjs'
import { HealthEventRecordRepository } from '../events/repositories/health-event-record-repository.mjs'
import { EventAttachmentRepository } from '../events/repositories/event-attachment-repository.mjs'
import { HealthRecordOrganizationRepository } from '../ai/repositories/health-record-organization-repository.mjs'
import { GrowthMeasurementService } from '../growth/growth-measurement-service.mjs'
import { HealthProfileFactService } from '../health-profile/health-profile-fact-service.mjs'
import { MedicationReminderService } from '../medication-reminders/medication-reminder-service.mjs'
import { DesensitizationTestService } from '../desensitization-tests/desensitization-test-service.mjs'
import {profileResources} from './profile-resources.mjs'
import {
  buildVisitSheet,
  chapters,
  reportFingerprint,
} from './report-model.mjs'

const failure = (message, status = 400) =>
  Object.assign(new Error(message), {
    status,
    code: status === 409 ? 'VISIT_VERSION_CONFLICT' : 'VISIT_SHEET_ERROR',
  })
export class VisitSheetService {
  constructor(options) {
    this.members =
      options.members ?? new FamilyMemberRepository(options.dataDirectory)
    this.events =
      options.events ?? new HealthEventRepository(options.dataDirectory)
    this.records =
      options.records ?? new HealthEventRecordRepository(options.dataDirectory)
    this.attachments =
      options.attachments ??
      new EventAttachmentRepository(options.dataDirectory)
    this.organizations =
      options.organizations ??
      new HealthRecordOrganizationRepository(options.dataDirectory)
    this.growth = options.growth ?? new GrowthMeasurementService(options)
    this.facts = options.facts ?? new HealthProfileFactService(options)
    this.medication =
      options.medication ?? new MedicationReminderService(options)
    this.desensitization =
      options.desensitization ?? new DesensitizationTestService(options)
    this.profiles = new JsonStore(
      path.join(options.dataDirectory, 'health-profile-sections.json'),
      { sections: [] },
    )
    this.store = new JsonStore(
      path.join(options.dataDirectory, 'visit-sheets.json'),
      { reports: [] },
    )
  }
  async collect(accountId, memberId, now = new Date()) {
    const member = await this.members.findById(memberId)
    if (!member || member.accountId !== accountId)
      throw failure('未找到当前孩子的资料', 404)
    const events = (await this.events.findByAccountId(accountId)).filter(
      (e) => e.memberId === memberId,
    )
    const eventIds = new Set(events.map((e) => e.id))
    const records = (await this.records.findByAccountId(accountId)).filter(
      (r) => eventIds.has(r.eventId),
    )
    const recordIds = new Set(records.map(r => r.id))
    const warnings = []
    const read = async (label, operation, fallback) => {
      try {
        return await operation()
      } catch (error) {
        if (error.status === 401 || error.status === 403) throw error
        warnings.push(`${label}读取失败，本次未纳入；请重试更新。`)
        return fallback
      }
    }
    const [
      growth,
      facts,
      profiles,
      reminders,
      tasks,
      attachments,
      organizations,
    ] = await Promise.all([
      read('成长测量', () => this.growth.list(accountId, memberId), []),
      read('重要健康事实', () => this.facts.list(accountId, memberId), []),
      read(
        '健康档案',
        async () =>
          (await this.profiles.read()).sections.filter(
            (s) => s.accountId === accountId && s.memberId === memberId,
          ),
        [],
      ),
      read(
        '用药计划',
        () => this.medication.list(accountId, memberId, now),
        [],
      ),
      read(
        '排敏观察',
        async () =>
          (await this.desensitization.list(accountId, memberId, now)).tasks,
        [],
      ),
      read(
        '附件',
        async () =>
          (
            await Promise.all(
              events.map((e) => this.attachments.findByEventId(e.id)),
            )
          )
            .flat()
            .filter(
              (a) =>
                a.accountId === accountId &&
                (!a.recordId || recordIds.has(a.recordId)) &&
                (!a.memberId || a.memberId === memberId),
            )
            .map(({ dataUrl, storageKey, analysis, ...a }) => a),
        [],
      ),
      read(
        '历史结构化资料',
        async () =>
          (
            await Promise.all(
              events.map((e) => this.organizations.findByEventId(e.id)),
            )
          )
            .flat()
            .filter((o) => o.accountId === accountId),
        [],
      ),
    ])
    return {
      member,
      events,
      records,
      growth,
      facts,
      profiles,
      profileResources: profileResources(profiles,memberId),
      reminders,
      tasks,
      attachments,
      organizations,
      warnings,
      timezone: 'Asia/Shanghai',
    }
  }
  async readProfileResource(accountId,memberId,resourceId){
    const member=await this.members.findById(memberId)
    if(!member||member.accountId!==accountId)throw failure('未找到当前孩子的资料',404)
    const profiles=(await this.profiles.read()).sections.filter(s=>s.accountId===accountId&&s.memberId===memberId)
    const resource=profileResources(profiles,memberId,true).find(r=>r.resourceId===resourceId)
    if(!resource)throw failure('档案原件已失效或不可用',404)
    return {mimeType:resource.mimeType,buffer:Buffer.from(resource.data,'base64')}
  }
  async get(accountId, memberId) {
    const input = await this.collect(accountId, memberId)
    const saved = (await this.store.read()).reports.find(
      (r) => r.accountId === accountId && r.memberId === memberId,
    )
    const report = saved?.current ?? null
    if (report) {
      // An unavailable source is not proof that it has been deleted. Fail closed
      // on cold reads; an already-open reader keeps its last successful result.
      if (input.warnings.length)
        throw failure(
          '部分来源暂时无法核验，请重试；已保存的报告没有被覆盖。',
          503,
        )
      // Never serve a removed source through a saved/exportable snapshot.
      const current = buildVisitSheet(input, report)
      const allowed = new Set(current.sources.map((s) => s.id))
      if (report.schemaVersion !== 5 || report.sources.some((s) => !allowed.has(s.id)))
        return {
          report: null,
          expectedVersion: report.version,
          stale: true,
          warnings: [
            ...input.warnings,
            '来源范围已变化，请重新整理以读取当前可用资料。',
          ],
          hasLegacy: input.events.some((e) => e.medicalPreparation),
        }
    }
    return {
      report,
      stale: !!report && report.fingerprint !== reportFingerprint(input),
      warnings: input.warnings,
      hasLegacy: input.events.some((e) => e.medicalPreparation),
      ...(report ? {} : { expectedVersion: saved?.current.version ?? 0 }),
    }
  }
  async save(accountId, memberId, request, now = new Date()) {
    return withAccountLock(accountId, async () => {
      const input = await this.collect(accountId, memberId, now)
      const saved = (await this.store.read()).reports.find(
        (r) => r.accountId === accountId && r.memberId === memberId,
      )
      const previous = saved?.current
      if (
        typeof request.requestId !== 'string' ||
        request.requestId.length > 100 ||
        !request.requestId
      )
        throw failure('缺少本次更新标识')
      if (saved?.requestId === request.requestId)
      {
        if(input.warnings.length)throw failure('当前来源核验失败，请重试',503)
        const current=buildVisitSheet(input,previous,now)
        if(previous.fingerprint!==current.fingerprint)throw failure('来源已变化，请读取当前情况单后重新提交',409)
        return {
          report: previous,
          stale: false,
          warnings: previous.warnings,
          hasLegacy: false,
        }
      }
      if (request.expectedVersion !== (previous?.version ?? 0))
        throw failure(
          '情况单已在其他位置更新，请重新加载后再保存；填写内容仍保留。',
          409,
        )
      const focus = request.focus ?? previous?.focus ?? { mode: 'auto' }
      if (!['auto', 'source', 'custom'].includes(focus.mode))
        throw failure('主诉选择无效')
      if (
        focus.mode === 'custom' &&
        (typeof focus.text !== 'string' ||
          !focus.text.trim() ||
          focus.text.length > 1000)
      )
        throw failure('请填写 1–1000 字的主诉')
      const notes = request.notes ?? previous?.notes ?? {}
      if (
        !notes ||
        typeof notes !== 'object' ||
        Array.isArray(notes) ||
        Object.entries(notes).some(
          ([id, value]) =>
            !chapters.some((c) => c[0] === id) ||
            typeof value !== 'string' ||
            value.length > 5000,
        )
      )
        throw failure('报告补充格式无效')
      const question = request.question ?? previous?.question ?? ''
      if (typeof question !== 'string' || question.length > 5000)
        throw failure('本次想问不能超过 5000 字')
      if (input.warnings.length)
        throw failure(
          '部分资料未能读取，这次更新没有完成，原报告仍保留。请重试。',
          503,
        )
      const photoSelections = { ...(previous?.photoSelections ?? {}) }
      const questionEdited = request.question !== undefined ? true : previous?.questionEdited ?? Boolean(previous?.question)
      let report = {
        ...buildVisitSheet(input, { focus, notes, question, questionEdited, photoSelections }, now),
        id: previous?.id ?? randomUUID(),
        version: (previous?.version ?? 0) + 1,
      }
      if (request.selectedPhotoIds !== undefined) {
        if (!Array.isArray(request.selectedPhotoIds) || request.selectedPhotoIds.length > 500 || request.selectedPhotoIds.some(id => typeof id !== 'string' || !report.photoCandidates.includes(id))) throw failure('所选照片已不可用或不属于本次主诉，请重新核对')
        photoSelections[report.photoKey] = [...new Set(request.selectedPhotoIds)]
        report.selectedPhotoIds = photoSelections[report.photoKey]
        report.photoSelections[report.photoKey] = report.selectedPhotoIds
      }
      // Report edits do not claim that the underlying health information changed.
      if (previous?.fingerprint === report.fingerprint) {
        report.dataAsOf = previous.dataAsOf
        report.generatedAt = previous.generatedAt
      }
      report.editedAt = now.toISOString()
      if (
        focus.mode === 'source' &&
        !report.candidates.some((c) => c.sourceId === focus.sourceId)
      ) {
        if (request.focus) throw failure('所选症状已不可用，请重新选择')
        report.warnings.push(
          '先前手动选择的症状已不可用，主诉模式仍保留；请重新选择。相关统计不再纳入已删除来源。',
        )
      }
      const old = new Map(previous?.sources.map((s) => [s.id, s]) ?? [])
      const available = new Set(report.sources.map((s) => s.id))
      const removedSources = previous?.sources.some(s=>!available.has(s.id)) ?? false
      const dependencies = source => [...new Set([source.id,...(source.relatedSourceIds??[]),...(source.recordId?[`record:${source.recordId}`]:[])])]
      report.changes = [
        ...(previous?.changes ?? []).filter(
          (c) => c.sourceId === '家长报告编辑'
            ? c.sourceIds ? c.sourceIds.every(id=>available.has(id)) : !removedSources && previous?.schemaVersion===5
            : available.has(c.sourceId) && (c.sourceIds ? c.sourceIds.every(id=>available.has(id)) : !removedSources),
        ),
        ...report.sources
          .filter((s) => old.has(s.id) && old.get(s.id).text !== s.text && dependencies(old.get(s.id)).every(id=>available.has(id)))
          .map((s) => ({
            sourceId: s.id,
            sourceIds: [...new Set([...dependencies(old.get(s.id)),...dependencies(s)])],
            before: old.get(s.id).text,
            after: s.text,
            at: now.toISOString(),
          })),
      ]
      if (
        previous &&
        [previous.complaintSourceId,report.complaintSourceId,...(previous.questionSourceIds??[]),...(report.questionSourceIds??[])].filter(Boolean).every(id=>available.has(id)) &&
        (JSON.stringify(previous.focus) !== JSON.stringify(focus) ||
          previous.question !== question ||
          JSON.stringify(previous.notes) !== JSON.stringify(notes))
      )
        report.changes.push({
          sourceId: '家长报告编辑',
          sourceIds: [...new Set([previous.complaintSourceId,report.complaintSourceId,...(previous.questionSourceIds??[]),...(report.questionSourceIds??[])].filter(Boolean))],
          before: `主诉：${previous.complaint}；本次想问：${previous.question||'未填写'}；${chapters.filter(([id])=>previous.notes[id]).map(([id,title])=>`${title}补充：${previous.notes[id]}`).join('；')}`,
          after: `主诉：${report.complaint}；本次想问：${report.question||'未填写'}；${chapters.filter(([id])=>notes[id]).map(([id,title])=>`${title}补充：${notes[id]}`).join('；')}`,
          at: now.toISOString(),
        })
      await this.store.update((data) => ({
        ...data,
        reports: [
          ...data.reports.filter(
            (r) => !(r.accountId === accountId && r.memberId === memberId),
          ),
          {
            accountId,
            memberId,
            current: report,
            requestId: request.requestId,
            history: [
              ...(saved?.history ?? []),
              ...(previous ? [previous] : []),
            ],
          },
        ],
      }))
      return {
        report,
        stale: false,
        warnings: report.warnings,
        hasLegacy: input.events.some((e) => e.medicalPreparation),
      }
    })
  }
}
