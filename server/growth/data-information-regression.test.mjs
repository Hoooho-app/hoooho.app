import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { FamilyMemberService } from '../members/family-member-service.mjs'
import { GrowthMeasurementService } from './growth-measurement-service.mjs'
import { HealthEventService } from '../events/health-event-service.mjs'
import { HealthEventRecordService } from '../events/health-event-record-service.mjs'
import { validateJournal } from '../events/journal-metadata.mjs'
import { buildVisitSheet } from '../visit-sheets/report-model.mjs'
import { visitFixture } from '../visit-sheets/fixtures.mjs'

const now = new Date('2026-11-03T04:00:00Z')
const owner = 'fictional-data-audit'
const value = (memberId, extra = {}) => ({ memberId, measuredAt: '2026-11-01', measurementType: 'height', heightCm: 84, weightKg: 11, dataStatus: 'confirmed', ...extra })
async function fixture(t, basic = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-data-fixes-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const members = new FamilyMemberRepository(directory)
  const child = await members.create({ accountId: owner, name: '虚构孩子', birthday: '2024-01-01', relationship: 'child', ...basic }, now)
  const growth = new GrowthMeasurementService({ dataDirectory: directory, members })
  return { directory, members, child, growth }
}

test('adding the other metric and concurrent same-day retries retain both values and one identity', async t => {
  const { growth, child } = await fixture(t)
  const first = await growth.upsert(owner, value(child.id, { weightKg: null }), now)
  const second = await growth.upsert(owner, value(child.id, { heightCm: null }), now)
  assert.equal(second.id, first.id); assert.equal(second.heightCm, 84); assert.equal(second.weightKg, 11)
  await growth.delete(owner, first.id)
  const [a, b] = await Promise.all([
    growth.upsert(owner, value(child.id, { weightKg: null }), now),
    growth.upsert(owner, value(child.id, { heightCm: null }), now),
  ])
  assert.equal(a.id, b.id)
  const [stored] = await growth.list(owner, child.id)
  assert.equal(stored.heightCm, 84); assert.equal(stored.weightKg, 11)
  assert.equal((await growth.list(owner, child.id)).length, 1)
  await growth.update(owner, stored.id, { heightCm: null }, now)
  assert.equal((await growth.list(owner, child.id))[0].heightCm, null)
})

test('pending measurement does not become current data; only explicit edit confirmation promotes it', async t => {
  const { growth, members, child } = await fixture(t)
  const pending = await growth.upsert(owner, value(child.id, { heightCm: 120, dataStatus: 'pending_confirmation' }), now)
  let member = await members.findById(child.id)
  assert.equal(member.heightCm, null); assert.equal(member.weightKg, null)
  const supplemental = await growth.upsert(owner, value(child.id, { heightCm: null, weightKg: 12 }), now)
  assert.equal(supplemental.dataStatus, 'pending_confirmation')
  await growth.update(owner, pending.id, { heightCm: 84, dataStatus: 'confirmed' }, now)
  member = await members.findById(child.id)
  assert.equal(member.heightCm, 84); assert.equal(member.weightKg, 12)
  await growth.update(owner, pending.id, { dataStatus: 'pending_confirmation' }, now)
  assert.equal((await members.findById(child.id)).heightCm, null)
})

test('deleting the last source clears derived basic data after reopening storage', async t => {
  const { growth, members, child, directory } = await fixture(t)
  const saved = await growth.upsert(owner, value(child.id), now)
  assert.equal((await members.findById(child.id)).heightCm, 84)
  await growth.delete(owner, saved.id)
  const reopened = await new FamilyMemberRepository(directory).findById(child.id)
  assert.equal(reopened.heightCm, null); assert.equal(reopened.weightKg, null)
  assert.equal((await new GrowthMeasurementService({ dataDirectory: directory }).list(owner, child.id)).length, 0)
})

test('independently entered basics survive measurement deletion; latest source removal selects the previous confirmed value', async t => {
  const { growth, members, child, directory } = await fixture(t, { heightCm: 80, weightKg: 10 })
  const old = await growth.upsert(owner, value(child.id, { measuredAt: '2026-10-01' }), now)
  const latest = await growth.upsert(owner, value(child.id, { heightCm: 85, weightKg: 11.5 }), now)
  await growth.delete(owner, latest.id)
  assert.equal((await members.findById(child.id)).heightCm, 84)
  await growth.delete(owner, old.id)
  let member = await members.findById(child.id)
  assert.equal(member.heightCm, 80); assert.equal(member.weightKg, 10)
  const newer = await growth.upsert(owner, value(child.id), now)
  await new FamilyMemberService({ dataDirectory: directory }).update(owner, child.id, { weightKg: 10.5 }, now)
  await growth.delete(owner, newer.id)
  member = await members.findById(child.id)
  assert.equal(member.heightCm, 80); assert.equal(member.weightKg, 10.5)
})

test('record and derived basics roll back together if member synchronization fails', async t => {
  const { growth, members, child } = await fixture(t)
  const saved = await growth.upsert(owner, value(child.id), now)
  const update = members.update.bind(members)
  members.update = async () => { throw new Error('synthetic storage failure') }
  await assert.rejects(() => growth.delete(owner, saved.id), /synthetic storage failure/)
  assert.equal((await growth.list(owner, child.id)).length, 1)
  assert.equal((await members.findById(child.id)).heightCm, 84)
  members.update = update
})

test('birth boundaries apply to creation, date edits and changes to the birthday; invalid changes never mutate records', async t => {
  const { growth, child, directory } = await fixture(t)
  await assert.rejects(() => growth.upsert(owner, value(child.id, { measuredAt: '2023-12-31' }), now), { code: 'MEASUREMENT_BEFORE_BIRTH' })
  const birth = await growth.upsert(owner, value(child.id, { measuredAt: '2024-01-01' }), now)
  await assert.rejects(() => growth.update(owner, birth.id, { measuredAt: '2023-12-31' }, now), { code: 'MEASUREMENT_BEFORE_BIRTH' })
  await assert.rejects(() => new FamilyMemberService({ dataDirectory: directory }).update(owner, child.id, { birthday: '2024-01-02' }, now), { code: 'BIRTHDAY_CONFLICTS_WITH_GROWTH' })
  assert.equal((await growth.list(owner, child.id))[0].measuredAt, '2024-01-01')
  await assert.rejects(() => growth.delete('another-account', birth.id), { code: 'GROWTH_MEASUREMENT_NOT_FOUND' })
})

test('contradictory temperatures, negative counts and visit states fail before actual persistence, valid unknowns and plans remain', async t => {
  const { directory, child } = await fixture(t)
  const events = new HealthEventService({ dataDirectory: directory })
  const records = new HealthEventRecordService({ dataDirectory: directory, organizations: { invalidateAndRecompute: async () => undefined }, changeAnnotations: { recompute: async () => undefined } })
  const event = await events.create(owner, { memberId: child.id, title: '虚构观察', category: 'other', startTime: '2026-11-01T04:00:00Z' }, now)
  const symptom = data => ({ categories: ['symptom'], symptom: { symptomCategory: 'fever', narrative: '虚构原话，不更改', symptomSpecificData: data } })
  const bad = [symptom({ currentTemperature: 39, maxTemperature: 37 }), ...[-3, 1.5, '3', true].map(approximateCount => symptom({ approximateCount })),
    { categories: ['visit'], visit: { visitType: 'emergency', emergencyArrivalAt: '2026-11-01T10:00:00Z', emergencyDepartureAt: '2026-11-01T09:00:00Z' } },
    { categories: ['visit'], visit: { visitType: 'inpatient', isCurrentlyHospitalized: true, dischargedAt: '2026-11-01T09:00:00Z' } }]
  for (const journal of bad) await assert.rejects(() => records.create(owner, event.id, { type: 'note', content: '原话保留', occurredAt: '2026-11-01T04:00:00Z', journal }, now))
  assert.equal((await records.list(owner, event.id)).length, 0)
  const good = await records.create(owner, event.id, { type: 'note', content: '原话保留', occurredAt: '2026-11-01T04:00:00Z', journal: symptom({ currentTemperature: 39, maxTemperature: 39, approximateCount: 0 }) }, now)
  await assert.rejects(() => records.update(owner, good.id, { journal: symptom({ currentTemperature: 40, maxTemperature: 39 }) }, now))
  assert.equal((await records.list(owner, event.id))[0].journal.symptom.symptomSpecificData.currentTemperature, 39)
  assert.equal((await records.list(owner, event.id))[0].content, '原话保留')
  assert.equal(validateJournal(symptom({})).symptom.symptomSpecificData.currentTemperature, undefined)
  assert.ok(validateJournal({ categories: ['visit'], visit: { visitType: 'outpatient', followUpAt: '2027-01-01T04:00:00Z' } }, { now }).visit.followUpAt)
})

test('visit report retains pending raw sources separately without using them in growth differences', () => {
  const input = visitFixture()
  input.growth = [
    { id: 'confirmed', measuredAt: '2026-10-01', heightCm: 84, weightKg: null, dataStatus: 'confirmed' },
    { id: 'pending', measuredAt: '2026-10-02', heightCm: 120, weightKg: null, dataStatus: 'pending_confirmation' },
  ]
  const report = buildVisitSheet(input, {}, now)
  const raw = JSON.stringify(report)
  assert.ok(raw.includes('待核对，不计入变化统计'))
  assert.ok(raw.includes('120 cm'))
  assert.ok(!raw.includes('84 → 120'))
})
