import path from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { JsonStore } from '../auth/storage/json-store.mjs'
import { accountTransaction } from '../auth/storage/transaction.mjs'
import { HealthEventService } from '../events/health-event-service.mjs'
import { HealthEventRecordRepository } from '../events/repositories/health-event-record-repository.mjs'
import { ProfileSectionStore, activeAllergyRecords } from '../health-profile/profile-section-store.mjs'
import { ChildProfileListService } from '../health-profile/child-profile-list-service.mjs'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { caseFollowupView } from '../events/case-followup-view.mjs'
import { localDateKey } from '../time/local-calendar.mjs'

const text = value => typeof value === 'string' ? value.trim() : ''
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const confirmed = row => ['confirmed', '已明确', '已确诊', '医生明确', '医生确认'].includes(row.currentStatus ?? row.certainty)
const unique = rows => [...new Map(rows.filter(row => row.title).map(row => [JSON.stringify(row), row])).values()]
const ordered = rows => [...rows].sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)) || String(b.createdAt).localeCompare(String(a.createdAt)) || String(b.id).localeCompare(String(a.id)))
const zoneLabel = zone => zone === 'Asia/Shanghai' ? '北京时间' : zone
const routeLabels = { oral: '口服', topical: '外用', nebulized: '雾化', inhaled: '吸入', nasal: '鼻用', ophthalmic: '眼用', other: '其他方式' }
const endDay = plan => plan.endDate || (plan.durationDays ? new Date(Date.parse(`${plan.startDate}T12:00:00Z`) + (plan.durationDays - 1) * 86400000).toISOString().slice(0, 10) : plan.mode === 'once' ? plan.startDate : '')
export class CareHandoffError extends Error {
  constructor(message, status = 400, code = 'CARE_HANDOFF_INVALID') { super(message); this.status = status; this.code = code }
}

// Read-only care projection. Actual journal entries never become routines,
// unconfirmed allergies never become confirmed restrictions, and no AI call is made.
export class CareHandoffService {
  constructor(options = {}) {
    this.directory = options.dataDirectory
    this.now = options.now ?? (() => new Date())
    this.members = options.members ?? new FamilyMemberRepository(this.directory)
    this.events = options.events ?? new HealthEventService(options)
    this.records = options.records ?? new HealthEventRecordRepository(this.directory)
    this.profiles = options.profiles ?? new ProfileSectionStore(this.directory)
    this.profileLists = options.profileLists ?? new ChildProfileListService(options)
    this.routines = new JsonStore(path.join(this.directory, 'routine-templates.json'), { templates: [], dailyRules: [] })
    this.medications = new JsonStore(path.join(this.directory, 'medication-reminders.json'), { reminders: [] })
    this.shares = new JsonStore(path.join(this.directory, 'care-handoff-shares.json'), { shares: [] })
  }
  async owned(accountId, memberId) {
    const member = await this.members.findById(memberId)
    if (!member || member.accountId !== accountId) throw new CareHandoffError('未找到当前孩子的资料', 404)
    return member
  }
  async preview(accountId, memberId) {
    const member = await this.owned(accountId, memberId), now = this.now(), today = localDateKey(now, 'Asia/Shanghai')
    // A failed source read fails the whole preview: never share an incomplete
    // handoff while showing a false "no medication" or "no restrictions" state.
    const [allEvents, allRecords, profileData, routineData, medicationData, vaccines] = await Promise.all([
      this.events.repository.findByAccountId(accountId), this.records.findByAccountId(accountId),
      this.profiles.read(), this.routines.read(), this.medications.read(), this.profileLists.list(accountId, memberId, 'vaccination')
    ])
    const events = allEvents.filter(e => e.memberId === memberId && e.accountId === accountId)
    const eventIds = new Set(events.map(e => e.id))
    const records = ordered(allRecords.filter(r => r.accountId === accountId && eventIds.has(r.eventId)))
    const activeEvents = events.filter(e => !e.caseArchivedAt && !['recovered', 'closed'].includes(e.status))
    const activeIds = new Set(activeEvents.map(e => e.id))
    const sections = profileData.sections.filter(s => s.accountId === accountId && s.memberId === memberId)
    const sectionRows = kind => (sections.find(s => s.sectionId === kind)?.records ?? []).filter(r => r && !r.profileListDeletedAt && (!r.memberId || r.memberId === memberId) && (!r.accountId || r.accountId === accountId))
    const allergies = activeAllergyRecords(sectionRows('allergy'), memberId).filter(r => !r.accountId || r.accountId === accountId)
    const dietary = sectionRows('dietary-card').flatMap(r => r.items ?? []).filter(r => r.visible !== false && ['avoid', 'temporary'].includes(r.group))
    const restrictions = unique([
      ...allergies.filter(confirmed).map(r => ({ title: text(r.name ?? r.subject), detail: text(r.note ?? r.notes), source: '已确认的过敏史' })),
      ...dietary.filter(r => !allergies.some(a => confirmed(a) && text(a.name ?? a.subject) === text(r.name))).map(r => ({ title: text(r.name), detail: r.group === 'temporary' ? '暂时回避；尚未确认为过敏。' : '按家长已设置的忌口清单回避。', source: '家长设置的忌口清单' }))
    ])
    const attention = unique(['care', 'care-notes', 'attention'].flatMap(kind => sectionRows(kind)).map(r => ({ title: text(r.name ?? r.title ?? r.content), detail: text(r.note), source: '家长设置' })))
    const observations = unique([
      ...activeEvents.filter(e => e.caseTracking === true).map(e => {
        const followup = caseFollowupView(e, records.filter(r => r.eventId === e.id))
        const tasks = (e.observationTasks ?? []).filter(t => t.status === 'active' && t.startsOn <= localDateKey(now, t.timezone || 'Asia/Shanghai') && t.endsOn >= localDateKey(now, t.timezone || 'Asia/Shanghai'))
        const latest = followup.latestOccurredAt ? `最近记录：${new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric' }).format(new Date(followup.latestOccurredAt))}（北京时间）` : '发生时间未提供'
        return { title: followup.title, detail: [latest, followup.supplement, ...tasks.map(t => `${t.item}（${t.startsOn}至${t.endsOn}，每天${t.timesPerDay}次）`)].filter(Boolean).join('\n'), source: '正在跟进' }
      }),
      ...allergies.filter(r => !confirmed(r) && !['excluded', 'tolerated', '已排除', '曾经有，目前已耐受'].includes(r.currentStatus ?? r.certainty)).map(r => ({ title: text(r.name ?? r.subject), detail: '尚未确认，仍在观察。', source: '过敏史 · 待确认' }))
    ])
    const medicationRows = medicationData.reminders.filter(r => r.accountId === accountId && r.memberId === memberId && r.status === 'active' && (!endDay(r.plan) || endDay(r.plan) >= localDateKey(now, r.plan.timezone || 'Asia/Shanghai'))).map(r => {
      const p = r.plan
      return { title: p.medicationName, detail: [`每次 ${p.amount}${p.unit}`, routeLabels[p.route] ?? p.route, p.mode === 'interval' ? `每${p.intervalHours}小时，从${p.times[0]}开始` : p.times.join('、'), `${p.startDate}起${endDay(p) ? `，至${endDay(p)}` : ''}`, zoneLabel(p.timezone)].filter(Boolean).join(' · '), source: '家长已设置的用药安排' }
    })
    const instructions = unique(records.filter(r => activeIds.has(r.eventId) && text(r.journal?.visit?.doctorStatement)).map(r => ({ title: text(r.journal.visit.doctorStatement), detail: '', source: '已录入医嘱原文' })))
    const latestRules = new Map(), configuredRules = new Map()
    for (const rule of routineData.dailyRules ?? []) {
      if (rule.accountId !== accountId || rule.memberId !== memberId) continue
      if (!configuredRules.has(rule.kind) || configuredRules.get(rule.kind).revision < rule.revision) configuredRules.set(rule.kind, rule)
    }
    for (const rule of routineData.dailyRules ?? []) {
      if (rule.accountId !== accountId || rule.memberId !== memberId || (rule.effectiveAt ? Date.parse(rule.effectiveAt) > now.getTime() : rule.effectiveFrom > localDateKey(now, rule.timeZone || 'Asia/Shanghai'))) continue
      if (!latestRules.has(rule.kind) || latestRules.get(rule.kind).revision < rule.revision) latestRules.set(rule.kind, rule)
    }
    const daily = []
    for (const rule of latestRules.values()) {
      if (!rule.enabled) continue
      for (const slot of rule.slots.filter(s => s.enabled && configuredRules.get(rule.kind)?.enabled && configuredRules.get(rule.kind)?.slots.some(latest => latest.id === s.id && latest.enabled))) {
        const f = slot.fields ?? {}, schedule = `${slot.time}${f.endTime ? `—${f.endTime}` : ''}`
        if (rule.kind === 'medication') {
          if (f.endDate && f.endDate < localDateKey(now, rule.timeZone || 'Asia/Shanghai')) continue
          medicationRows.push({ title: text(f.medicationName), detail: [`每次 ${f.amountValue}${f.amountUnit}`, routeLabels[f.administrationRoute] ?? f.administrationRoute, schedule, f.endDate ? `至${f.endDate}` : '持续至关闭', zoneLabel(rule.timeZone)].filter(Boolean).join(' · '), source: '家长已设置的每天用药' })
        } else if (rule.kind === 'topical') {
          attention.push({ title: `${slot.time} ${slot.name}`, detail: [f.productName, f.bodyLocations, f.amount].filter(Boolean).join(' · '), source: '家长已设置的每天照护' })
        } else if (['sleep', 'feeding', 'complementary', 'meal', 'snack', 'supplement'].includes(rule.kind)) {
          daily.push({ title: slot.name, detail: [schedule, f.foods, f.names, f.amount ? `${f.amount}${f.unit || ''}` : '', {breast:'母乳',formula:'配方奶',mixed:'混合喂养',expressed:'瓶喂母乳'}[f.feedingMethod], f.bottleMl ? `${f.bottleMl}毫升` : '', zoneLabel(rule.timeZone)].filter(Boolean).join(' · '), source: '家长已设置的日常安排' })
        }
      }
    }
    const template = (routineData.templates ?? []).filter(t => t.accountId === accountId && t.memberId === memberId && t.effectiveFrom <= today).sort((a,b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.updatedAt.localeCompare(a.updatedAt))[0]
    if (template?.enabled) for (const item of template.items) {
      if (latestRules.has(item.category === 'sleep' ? 'sleep' : 'meal')) continue
      daily.push({ title: item.title, detail: `${item.time}${item.endTime ? `—${item.endTime}` : ''}`, source: '家长已设置的日常作息' })
    }
    const background = kind => unique(sectionRows(kind).map(r => ({ title: text(r.name ?? r.subject), detail: [text(r.currentStatus ?? r.certainty), text(r.frequency), text(r.note)].filter(Boolean).join(' · '), source: '已录入健康档案' })))
    const knownVaccines = vaccines.rows.filter(v => /^\d{4}-\d{2}-\d{2}$/.test(v.date) && v.date <= today).sort((a,b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    const lastVaccine = knownVaccines[0] ?? vaccines.rows.find(v => !v.date)
    const nextVaccine = sectionRows('vaccination').filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.nextDate ?? '') && r.nextDate >= today).sort((a,b) => a.nextDate.localeCompare(b.nextDate))[0]
    const data = {
      asOf: today,
      member: { name: member.name, birthday: member.birthday, gender: member.gender, heightCm: member.heightCm ?? null, weightKg: member.weightKg ?? null, bloodType: member.bloodType ?? null },
      sections: [
        { id: 'medication', title: '用药与医嘱', rows: unique([...medicationRows, ...instructions]), empty: '暂无已录入的用药安排或医嘱。' },
        { id: 'restrictions', title: '忌口与过敏注意', rows: restrictions, empty: '暂无已确认的忌口或过敏注意。' },
        { id: 'attention', title: '照护注意', rows: unique(attention), empty: '暂无已设置的照护注意。' },
        { id: 'observations', title: '正在观察', rows: observations, empty: '暂无正在跟进的情况。' },
        { id: 'routine', title: '日常安排', rows: unique(daily), empty: '暂无已设置的吃饭、午睡等日常安排。' },
        { id: 'chronic', title: '慢性病史', rows: background('chronic'), empty: '暂无已录入的慢性病史。' },
        ...(background('surgery').length ? [{ id: 'surgery', title: '手术史', rows: background('surgery'), empty: '' }] : []),
        { id: 'vaccination', title: '疫苗安排', rows: [
          { title: '最近一针', detail: lastVaccine ? [lastVaccine.date || '接种日期未录入', lastVaccine.displayName || lastVaccine.name].join(' · ') : '尚未录入接种记录。', source: '' },
          { title: '下一针', detail: nextVaccine ? [nextVaccine.nextDate, text(nextVaccine.nextName ?? nextVaccine.name)].filter(Boolean).join(' · ') : '尚未录入下一针安排。', source: '' }
        ], empty: '' }
      ]
    }
    return { ...data, fingerprint: digest(data) }
  }
  async share(accountId, memberId, input) {
    if (!/^[a-f0-9]{64}$/.test(input?.fingerprint ?? '')) throw new CareHandoffError('请先读取并确认照看资料')
    if (input.token !== undefined && !/^[A-Za-z0-9_-]{32}$/.test(input.token)) throw new CareHandoffError('分享链接格式错误')
    return accountTransaction(this.directory, async () => {
      await this.owned(accountId, memberId)
      const token = input.token ?? randomBytes(24).toString('base64url'), tokenHash = digest(token)
      const existing = (await this.shares.read()).shares.find(s => s.tokenHash === tokenHash)
      if (existing) {
        if (existing.accountId !== accountId || existing.memberId !== memberId || existing.data.fingerprint !== input.fingerprint) throw new CareHandoffError('请重新生成分享链接', 409)
        return { path: `/care-handoff/shared/${token}` }
      }
      const data = await this.preview(accountId, memberId)
      if (data.fingerprint !== input.fingerprint) throw new CareHandoffError('照看资料已有更新，请重新查看后分享', 409, 'CARE_HANDOFF_CHANGED')
      await this.shares.update(store => ({ ...store, shares: [...store.shares, { accountId, memberId, tokenHash, data, createdAt: this.now().toISOString() }] }))
      return { path: `/care-handoff/shared/${token}` }
    })
  }
  async shared(token) {
    if (!/^[A-Za-z0-9_-]{32}$/.test(token)) throw new CareHandoffError('这份照看资料不存在', 404)
    const item = (await this.shares.read()).shares.find(s => s.tokenHash === digest(token))
    if (!item) throw new CareHandoffError('这份照看资料不存在', 404)
    await this.owned(item.accountId, item.memberId)
    return item.data
  }
}
