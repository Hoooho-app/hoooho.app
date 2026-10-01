import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { JsonStore } from '../auth/storage/json-store.mjs'
import { calculateFoodAllergyIndex, FoodAllergyIndexService } from './food-allergy-index-service.mjs'

const item = (id, reactions = []) => ({ id, name: id, category: 'food', memberId: 'child', reactions })
const full = { id: 'r', severity: 'moderate', symptoms: '出现红疹', handling: '未用药', exposureAmount: '5克' }
const calc = archive => calculateFoodAllergyIndex({ archive, memberId: 'child', accountId: 'account' })
test('empty, missing, 50%, 75%, 100%, rounding and duplicate source', () => {
  assert.equal(calc([]).percentage, 0)
  assert.equal(calc([item('egg')]).percentage, 0)
  assert.equal(calc([item('egg', [{ symptoms: '红疹', handling: '未治疗' }])]).percentage, 50)
  assert.equal(calc([item('egg', [full]), item('milk', [{ symptoms: '红疹', handling: '未治疗' }])]).percentage, 75)
  assert.equal(calc([item('egg', [full, full]), item('egg', [full])]).percentage, 100)
  assert.equal(calc([item('a', [full]),item('b'),item('c')]).percentage, 33)
  assert.equal(calc([item('egg', [full])]).recordedCount, 4)
})
test('unknown foods, ambiguous strings, raw reports, foreign embedded members do not earn points', () => {
  const result = calc([{ id: 'unknown', category: 'unknown', name: '尚未明确' }, item('egg', [{ symptoms: '不确定红疹', handling: '不知道用药', exposureAmount: '几口', severity: 'unknown' }]), { recordType: 'allergy-report', recognitionStatus: 'manual_review_required', dataUrl: 'original-image' }, { ...item('foreign', [full]), memberId: 'other' }])
  assert.equal(result.percentage, 0)
  assert.equal(result.foodCount, 1)
  assert.equal(result.unknownFoodCount, 1)
  assert.equal(result.pendingMaterialCount, 1)
  assert.equal(calc([item('egg', [{ ...full, memberId: 'other' }])]).recordedCount, 0)
  assert.equal(calc([item('egg', [{ ...full, active: false }])]).recordedCount, 0)
})
test('structured test results and explicit no prior reaction count H; empty objects do not', () => {
  assert.equal(calc([{ ...item('egg'), tests: [{ id: 't', testType: '特异性IgE', result: 'negative' }] }]).recordedCount, 1)
  assert.equal(calc([item('egg', [{ symptoms: '无既往反应' }])]).recordedCount, 1)
  assert.equal(calc([{ ...item('egg'), tests: [{}], sourceReferences: [{}] }]).recordedCount, 0)
})
test('task link uses stable id, absent reactions never turn eaten amount into C, withdrawn and draft excluded', () => {
  const archive = [{ ...item('milk'), sourceReferences: [{ type: 'desensitization', sourceId: 'task', active: true }] }]
  const tasks = [{ id: 'task', displayName: 'milk' }]
  const observations = [{ id: 'obs', taskId: 'task', status: 'effective', symptomAnswer: 'absent', exposureAnswer: 'eaten', amount: '10ml' }]
  const run = obs => calculateFoodAllergyIndex({ archive, tasks, observations: obs, memberId: 'child' })
  assert.equal(run(observations).foodCount, 1)
  assert.equal(run(observations).recordedCount, 0)
  const present = { ...observations[0], symptomAnswer: 'present', symptoms: ['红疹'] }
  assert.equal(run([present, present]).recordedCount, 2)
  assert.equal(run([{ ...present, withdrawnAt: 'deleted' }, { ...present, status: 'draft' }]).recordedCount, 0)
  assert.equal(calculateFoodAllergyIndex({ archive: [item('milk')], tasks, memberId: 'child' }).foodCount, 2, 'same name without reliable link stays separate')
})
test('journal severity and reaction-specific medication, deletion and dangling links', () => {
  const archive = [{ ...item('egg'), evidenceLinks: [{ confirmedByUser: true, healthRecordId: 'symptom', healthEventId: 'event' }] }]
  const records = [{ id: 'symptom', eventId: 'event', journal: { symptom: { impactLevel: 'clear', descriptors: ['红疹'], linkedRecordIds: { medication: ['med'] } } } }, { id: 'med', eventId: 'event', journal: { medication: { medicationName: '药品', amountValue: 1, amountUnit: 'ml' } } }, { id: 'diet', eventId: 'event', journal: { diet: { bottleMl: 30 } } }]
  const run = value => calculateFoodAllergyIndex({ archive, records: value, memberId: 'child' })
  assert.equal(run(records).recordedCount, 3)
  assert.equal(run(records.slice(0, 1)).recordedCount, 2)
  assert.equal(run([]).recordedCount, 0)
  assert.equal(run([{ ...records[0], journal: { symptom: { impactLevel: 'clear' } } }, records[1]]).recordedCount, 1, 'unlinked regular medication does not earn B')
  assert.equal(calc([item('egg', [{ ...full, linkedHealthRecordId: 'deleted', linkedHealthEventId: 'event' }])]).recordedCount, 0)
})
test('service scopes account and child; historical archive works immediately, edits/deletes recompute without Agent', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'food-index-'))
  try {
    const write = async (name, data) => new JsonStore(path.join(dataDirectory, name), data).update(() => data)
    await write('family-members.json', { members: [{ id: 'child', accountId: 'account' }, { id: 'other', accountId: 'account' }, { id: 'foreign', accountId: 'another' }] })
    const sections = [{ accountId: 'account', memberId: 'child', sectionId: 'allergy', records: [item('egg', [full])] }, { accountId: 'another', memberId: 'child', sectionId: 'allergy', records: [item('milk', [full])] }]
    await write('health-profile-sections.json', { sections })
    const service = new FoodAllergyIndexService({ dataDirectory })
    assert.equal((await service.get('account', 'child')).percentage, 100)
    assert.equal((await service.get('account', 'other')).percentage, 0)
    await assert.rejects(service.get('account', 'foreign'), error => error.status === 404)
    await write('health-profile-sections.json', { sections: [{ ...sections[0], records: [item('egg')] }] })
    assert.equal((await service.get('account', 'child')).percentage, 0)
    await write('health-profile-sections.json', { sections: [] })
    assert.equal((await service.get('account', 'child')).foodCount, 0)
  } finally { await rm(dataDirectory, { recursive: true, force: true }) }
})
