import path from 'node:path'
import { JsonStore } from '../auth/storage/json-store.mjs'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'

export const FORMULA_VERSION = 'food-record-completeness-v1'
const array = value => Array.isArray(value) ? value.filter(entry => entry != null) : []
const text = value => typeof value === 'string' ? value.trim() : ''
const uncertain = value => /未知|不知道|不清|不详|不确定|可能|疑似|待确认|待核实|unknown|unclear/i.test(text(value))
const severity = value => !uncertain(value) && /^(mild|moderate|severe|轻度|中度|重度|轻微|严重)$|(?:程度|反应)(?:为|：|:)?\s*(?:轻度|中度|重度)|(?:轻度|中度|重度)(?:反应|症状)/i.test(text(value))
const handling = value => !uncertain(value) && /未用药|未治疗|未处理|无需治疗|没有用药|停食|停止(?:食用|摄入)|回避|观察|清洗|冷敷|急诊|住院|肾上腺素|抗组胺|西替利嗪|氯雷他定|外涂|雾化/.test(text(value))
const amount = value => {
  if (uncertain(value)) return false
  const match = /(?:^|[^\d.\-])([0-9]+(?:\.[0-9]+)?|半|一|两|二|三|四|五|六|七|八|九|十)\s*(?:mg|ml|g|kg|毫克|毫升|克|千克|口|颗|个|片|勺|杯|粒|滴)(?:\b|$|[^a-z])/i.exec(text(value))
  return Boolean(match && (!/^[0-9]/.test(match[1]) || Number(match[1]) > 0))
}
const reactionEvidence = value => !uncertain(value) && /红|疹|痒|风团|肿|腹痛|呕吐|腹泻|便血|咳|喘|呼吸|喉|发热|过敏反应|无既往反应/.test(text(value))
const labels = { A: '反应严重程度', B: '处理情况', C: '相关摄入量', H: '既往反应与证据' }

// All inputs below have already been scoped by the service to the authenticated
// account and member. Embedded legacy accountId tokens are never used as owners.
export function calculateFoodAllergyIndex({ archive = [], tasks = [], observations = [], records = [], memberId, accountId, now = new Date() }) {
  const items = array(archive).filter(item => item && item.recordType !== 'allergy-report' && (!item.memberId || item.memberId === memberId))
  const unknownFoodCount = items.filter(item => item.category === 'unknown' || /^(尚未明确|未明确过敏原|未明确食物)$/.test(text(item.name ?? item.subject))).length
  const foods = new Map()
  const recordById = new Map(records.map(record => [record.id, record]))
  const liveTasks = tasks.filter(task => !task.deletedAt)
  const taskById = new Map(liveTasks.map(task => [task.id, task]))
  const claimedTasks = new Set()
  const source = (id, label, href) => ({ id, label, href })
  const add = (food, dimension, entry) => {
    if (!food.dimensions[dimension].sources.some(saved => saved.id === entry.id)) food.dimensions[dimension].sources.push(entry)
    food.dimensions[dimension].recorded = true
  }
  const create = (id, name) => {
    if (!foods.has(id)) foods.set(id, { id, name, dimensions: Object.fromEntries(Object.entries(labels).map(([key, label]) => [key, { label, recorded: false, sources: [] }])) })
    return foods.get(id)
  }
  const applyTask = (food, taskId) => {
    if (!taskById.has(taskId)) return
    claimedTasks.add(taskId)
    for (const record of observations.filter(record => record.taskId === taskId && record.status === 'effective' && !record.withdrawnAt)) {
      const entry = source(`observation:${record.id}`, '排敏测试记录', '/desensitization-tests')
      if (record.symptomAnswer !== 'present') continue
      if (array(record.symptoms).some(reactionEvidence) || reactionEvidence(record.note)) add(food, 'H', entry)
      if (severity(record.note)) add(food, 'A', entry)
      if (record.exposureAnswer === 'eaten' && amount(record.amount)) add(food, 'C', entry)
    }
  }
  for (const [index, item] of items.entries()) {
    if (!(item.category === 'food' || (!item.category && /食/.test(text(item.type)))) || !text(item.name ?? item.subject) || /未明确|尚未明确/.test(text(item.name ?? item.subject))) continue
    const id = text(item.id) || `legacy-allergy-${index + 1}`
    const food = create(`allergy:${id}`, text(item.name ?? item.subject))
    const href = `/health-profile/allergy/${encodeURIComponent(id)}`
    for (const reaction of array(item.reactions)) {
      if (!reaction || reaction.active === false || (reaction.memberId && reaction.memberId !== memberId) || (reaction.allergyItemId && reaction.allergyItemId !== id)) continue
      const linked = reaction.linkedHealthRecordId ? recordById.get(reaction.linkedHealthRecordId) : null
      if (reaction.linkedHealthRecordId && (!linked || linked.eventId !== reaction.linkedHealthEventId)) continue
      const entry = source(`reaction:${reaction.linkedHealthRecordId || reaction.id || index}`, '过敏史反应', href)
      if (severity(reaction.severity) || severity(reaction.symptoms)) add(food, 'A', entry)
      if (handling(reaction.handling)) add(food, 'B', entry)
      if (!/无反应|没有反应|无症状|未出现反应/.test(text(reaction.symptoms)) && amount(reaction.exposureAmount)) add(food, 'C', entry)
      if (reactionEvidence(reaction.symptoms) || array(reaction.symptomSystems).some(value => ['皮肤','消化道','呼吸道','口腔／面部','全身'].includes(value))) add(food, 'H', entry)
    }
    for (const test of array(item.tests)) {
      if ((!test.memberId || test.memberId === memberId) && (!test.allergyItemId || test.allergyItemId === id) && text(test.testType) && ['positive','negative','borderline'].includes(test.result)) add(food, 'H', source(`test:${test.reportId || test.id}`, '过敏史检测与报告', href))
    }
    const linkedIds = new Set(array(item.evidenceLinks).filter(link => link.confirmedByUser === true && link.healthRecordId && recordById.get(link.healthRecordId)?.eventId === link.healthEventId).map(link => link.healthRecordId))
    for (const reference of array(item.sourceReferences).filter(reference => reference.active !== false)) {
      if (reference.type === 'desensitization') applyTask(food, reference.sourceId)
      if (reference.type === 'journal') for (const recordId of array(reference.recordIds)) linkedIds.add(recordId)
    }
    for (const recordId of linkedIds) {
      const record = recordById.get(recordId)
      if (!record) continue
      const symptom = record.journal?.symptom
      const entry = source(`journal:${record.id}`, '健康随记', `/health-events/${encodeURIComponent(record.eventId)}`)
      if (symptom) {
        if (['little','some','clear'].includes(symptom.impactLevel)) add(food, 'A', entry)
        if (array(symptom.descriptors).some(reactionEvidence) || reactionEvidence(symptom.narrative)) add(food, 'H', entry)
        const medicationIds = new Set(array(symptom.linkedRecordIds?.medication))
        for (const medicationRecord of records) {
          const medication = medicationRecord.journal?.medication
          if (medicationRecord.eventId === record.eventId && medication && (medicationIds.has(medicationRecord.id) || array(medication.linkedSymptomRecordIds).includes(record.id)) && text(medication.medicationName) && !uncertain(medication.medicationName) && Number.isFinite(medication.amountValue) && medication.amountValue > 0 && text(medication.amountUnit)) add(food, 'B', source(`journal:${medicationRecord.id}`, '关联反应的用药记录', entry.href))
        }
        for (const visitId of array(symptom.linkedRecordIds?.visit)) {
          const visitRecord = recordById.get(visitId)
          if (visitRecord?.eventId === record.eventId && array(visitRecord.journal?.visit?.followUpActions).some(action => ['home_observation','medication_as_instructed','hospitalization'].includes(action))) add(food, 'B', source(`journal:${visitId}`, '关联反应的就医处理', entry.href))
        }
      }
    }
  }
  for (const task of liveTasks) if (!claimedTasks.has(task.id) && text(task.displayName) && !/未明确|尚未明确/.test(task.displayName)) applyTask(create(`task:${task.id}`, task.displayName), task.id)
  const result = [...foods.values()]
  const foodCount = result.length
  const recordedCount = result.reduce((total, food) => total + Object.values(food.dimensions).filter(dimension => dimension.recorded).length, 0)
  return { formulaVersion: FORMULA_VERSION, accountId, memberId, percentage: foodCount ? Math.round(recordedCount / (4 * foodCount) * 100) : 0, foodCount, recordedCount, expectedCount: 4 * foodCount, unknownFoodCount, pendingMaterialCount: array(archive).filter(item => item?.recordType === 'allergy-report' && (!item.memberId || item.memberId === memberId) && item.recognitionStatus !== 'user_reviewed').length, updatedAt: now.toISOString(), foods: result }
}

export class FoodAllergyIndexService {
  constructor(options) {
    this.members = new FamilyMemberRepository(options.dataDirectory)
    this.sections = new JsonStore(path.join(options.dataDirectory, 'health-profile-sections.json'), { sections: [] })
    this.tasks = new JsonStore(path.join(options.dataDirectory, 'desensitization-tests.json'), { tasks: [], records: [] })
    this.events = new JsonStore(path.join(options.dataDirectory, 'health-events.json'), { events: [] })
    this.records = new JsonStore(path.join(options.dataDirectory, 'health-event-records.json'), { records: [] })
  }
  async get(accountId, memberId) {
    const member = await this.members.findById(memberId)
    if (!member || member.accountId !== accountId) throw Object.assign(new Error('记录对象不存在'), { status: 404, code: 'MEMBER_NOT_FOUND' })
    const [sections, tasks, events, records] = await Promise.all([this.sections.read(), this.tasks.read(), this.events.read(), this.records.read()])
    const owned = value => value.accountId === accountId && value.memberId === memberId
    const eventIds = new Set(events.events.filter(owned).map(event => event.id))
    return calculateFoodAllergyIndex({ accountId, memberId, archive: sections.sections.find(section => owned(section) && section.sectionId === 'allergy')?.records ?? [], tasks: tasks.tasks.filter(owned), observations: tasks.records.filter(owned), records: records.records.filter(record => record.accountId === accountId && eventIds.has(record.eventId)) })
  }
}
