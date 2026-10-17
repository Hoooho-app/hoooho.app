import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { FamilyMemberService } from './members/family-member-service.mjs'
import { GrowthMeasurementService } from './growth/growth-measurement-service.mjs'
import { RoutineService } from './routines/routine-service.mjs'
import { dailySnapshot, zonedInstant } from './routines/daily-record-service.mjs'
import { MedicationReminderService, buildOccurrences } from './medication-reminders/medication-reminder-service.mjs'
import { DesensitizationTestService } from './desensitization-tests/desensitization-test-service.mjs'

const now = new Date('2026-10-17T16:30:00.000Z')
const owner = 'data-regression-owner'
async function fixture(t) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-data-fix-'))
  const family = new FamilyMemberService({ dataDirectory })
  const child = await family.create(owner, { name: '安安', relationship: 'child', birthday: '2025-01-01' }, now, 'Asia/Shanghai')
  const growth = new GrowthMeasurementService({ dataDirectory, members: family.repository })
  const routine = new RoutineService({ dataDirectory, members: family.repository, quickRecords: { create: async () => ({ recordId: 'not-written' }) } })
  const reminders = new MedicationReminderService({ dataDirectory, members: family.repository })
  const des = new DesensitizationTestService({ dataDirectory, members: family.repository })
  t.after(async () => { if (routine.daily.dbPromise) (await routine.daily.database()).close(); await rm(dataDirectory, { recursive: true, force: true }) })
  return { dataDirectory, family, child, growth, routine, reminders, des }
}
const invalid = (error) => Number.isInteger(error.status) && error.status >= 400 && error.status < 500
const measurement = { measuredAt: '2026-10-01', measurementType: 'height', heightCm: 82, weightKg: 10.125 }
const basePlan = { medicationName: '测试药', medicationType: 'syrup', amount: 2.5, unit: '毫升', route: 'oral', mode: 'daily', startDate: '2026-10-17', durationDays: 2, times: ['08:00', '20:00'], timezone: 'Asia/Shanghai' }

test('member creation and edits reject malformed objects, invalid child ages and coerced measurements while keeping numeric strings', async (t) => {
  const { family, child } = await fixture(t)
  for (const input of [null, [], true]) await assert.rejects(family.create(owner, input, now), invalid)
  for (const input of [null, [], true]) await assert.rejects(family.update(owner, child.id, input, now), invalid)
  await assert.rejects(family.create(owner, { name: '成年', relationship: 'child', birthday: '2010-01-01' }, now), (e) => e.code === 'INVALID_CHILD_BIRTHDAY')
  const other = await family.create(owner, { name: '成年亲属', relationship: 'other', birthday: '1990-01-01' }, now)
  await assert.rejects(family.update(owner, other.id, { relationship: 'child' }, now), (e) => e.code === 'INVALID_CHILD_BIRTHDAY')
  for (const value of [true, [10], { value: 10 }, '   ']) await assert.rejects(family.update(owner, child.id, { weightKg: value }, now), invalid)
  const saved = await family.update(owner, child.id, { heightCm: '82.5', weightKg: '10.125' }, now)
  assert.equal(saved.heightCm, 82.5); assert.equal(saved.weightKg, 10.125)
  assert.equal((await family.get(owner, child.id)).birthday, '2025-01-01')
})

test('growth partial updates validate the complete remaining record and current parent without damaging saved data', async (t) => {
  const { growth, family, child } = await fixture(t)
  for (const value of [true, [10], { value: 10 }, '   ']) await assert.rejects(growth.upsert(owner, { memberId: child.id, ...measurement, weightKg: value }, now), invalid)
  const saved = await growth.upsert(owner, { memberId: child.id, ...measurement, heightCm: '82', weightKg: '10.125' }, now)
  await assert.rejects(growth.update(owner, saved.id, { heightCm: null, weightKg: null }, now), (e) => e.code === 'EMPTY_MEASUREMENT')
  assert.equal((await growth.list(owner, child.id))[0].weightKg, 10.125)
  const partial = await growth.update(owner, saved.id, { heightCm: null }, now)
  assert.equal(partial.heightCm, null); assert.equal(partial.weightKg, 10.125)
  await family.delete(owner, child.id)
  await assert.rejects(growth.update(owner, saved.id, { weightKg: 12 }, now), (e) => e.code === 'MEMBER_NOT_FOUND')
})

test('routine date and actual interval inputs reject impossible dates and preserve a valid cross-midnight template', async (t) => {
  const { routine, child } = await fixture(t)
  const items = { breakfast: { enabled: true, time: '08:00', endTime: '08:30' } }
  await assert.rejects(routine.saveTemplateVersion(owner, child.id, { effectiveFrom: '2026-02-30', items }, now), invalid)
  await assert.rejects(routine.getDay(owner, child.id, '2026-02-30'), invalid)
  await routine.saveTemplateVersion(owner, child.id, { effectiveFrom: '2026-10-01', items }, now)
  await assert.rejects(routine.setOverride(owner, child.id, '2026-10-17', 'breakfast', { action: 'confirm', occurredAt: '2026-02-30T00:00:00Z', startedAt: '2026-02-30T00:00:00Z', endedAt: '2026-03-02T00:30:00Z' }, now), invalid)
  const stored = await routine.getDay(owner, child.id, '2026-10-17')
  assert.equal(stored.tracks.length, 1); assert.equal(stored.tracks[0].status, 'routine')
})

test('daily snapshots reject boolean doses and impossible day queries without changing valid numeric string and sleep behavior', async (t) => {
  const { routine, child } = await fixture(t)
  for (const value of [true, [150], { value: 150 }]) assert.throws(() => dailySnapshot('feeding', { feedingMethod: 'formula', bottleMl: value }), invalid)
  assert.equal(dailySnapshot('feeding', { feedingMethod: 'formula', bottleMl: '150' }).diet.bottleMl, 150)
  for (const value of [true, [1], { value: 1 }]) assert.throws(() => dailySnapshot('medication', { mode: 'fixed', medicationName: '药', amountValue: value, amountUnit: '毫升', untilClosed: true }), invalid)
  const medication = dailySnapshot('medication', { mode: 'fixed', medicationName: '药', amountValue: '1.5', amountUnit: '毫升', untilClosed: true })
  assert.equal(medication.medication.amountValue, 1.5)
  const sleep = dailySnapshot('sleep', { kind: 'night', endTime: '07:00' }, '2026-10-17', '21:00', 'Asia/Shanghai')
  assert.equal(Date.parse(sleep.sleep.wakeAt) - Date.parse(sleep.sleep.sleepAt), 10 * 3600_000)
  assert.equal(zonedInstant('2026-03-08', '02:30', 'America/New_York'), null)
  await assert.rejects(routine.daily.instances(owner, child.id, '2026-02-30'), invalid)
})

test('medication plans reject malformed numbers and every malformed time instead of discarding requested reminders', async (t) => {
  const { reminders, child } = await fixture(t)
  for (const value of [true, [2.5], { value: 2.5 }, '  ']) await assert.rejects(reminders.create(owner, { memberId: child.id, plan: { ...basePlan, amount: value } }, now), invalid)
  for (const times of [['08:00', '25:00'], ['08:00', null], ['08:00', ['20:00']]]) await assert.rejects(reminders.create(owner, { memberId: child.id, plan: { ...basePlan, times } }, now), invalid)
  await assert.rejects(reminders.create(owner, { memberId: child.id, plan: { ...basePlan, startDate: '2026-02-30' } }, now), invalid)
  const saved = await reminders.create(owner, { memberId: child.id, plan: { ...basePlan, amount: '2.5', durationDays: '2' } }, now)
  assert.equal(saved.plan.amount, 2.5); assert.equal(saved.occurrences.length, 4)
})

test('DST gaps reject invalid first-day slots; existing or future recurring plans remain readable with unique dose identities', async (t) => {
  const { reminders, child } = await fixture(t)
  const gapPlan = { ...basePlan, startDate: '2026-03-08', durationDays: 1, times: ['01:30', '02:30'], timezone: 'America/New_York' }
  await assert.rejects(reminders.create(owner, { memberId: child.id, plan: gapPlan }, now), invalid)
  const existing = { ...gapPlan, startDate: '2026-03-07', durationDays: 3 }
  const occurrences = buildOccurrences('stable-plan', existing, now)
  assert.equal(occurrences.length, 5)
  assert.equal(new Set(occurrences.map((x) => x.id)).size, 5)
  assert.equal(occurrences.filter((x) => x.day === '2026-03-08').length, 1)
  assert.equal(occurrences.filter((x) => x.day === '2026-03-09').length, 2)
  await reminders.store.update((data) => ({ ...data, reminders: [...data.reminders, { id: 'future-gap-legacy', accountId: owner, memberId: child.id, status: 'active', plan: existing, completions: [], createdAt: now.toISOString(), updatedAt: now.toISOString() }] }))
  const created = (await reminders.list(owner, child.id, now)).find((x) => x.id === 'future-gap-legacy')
  const completed = await reminders.complete(owner, created.id, created.occurrences[0].id, {}, now)
  assert.equal(completed.occurrences.filter((x) => x.completed).length, 1)
  await reminders.store.update((data) => ({ ...data, reminders: [...data.reminders, { id: 'legacy-dst-gap', accountId: owner, memberId: child.id, status: 'active', plan: { ...gapPlan, times: ['02:30'] }, completions: [], createdAt: now.toISOString(), updatedAt: now.toISOString() }] }))
  const list = await reminders.list(owner, child.id, now)
  assert.deepEqual(list.find((x) => x.id === 'legacy-dst-gap').occurrences, [])
})

test('long-term plans discard mutually exclusive limits and legacy residual end dates do not truncate future projection', async (t) => {
  const { reminders, child } = await fixture(t)
  const saved = await reminders.create(owner, { memberId: child.id, plan: { ...basePlan, longTerm: true, endDate: '2026-10-17' } }, now)
  assert.equal(Object.hasOwn(saved.plan, 'endDate'), false)
  assert.equal(Object.hasOwn(saved.plan, 'durationDays'), false)
  await reminders.store.update((data) => ({ ...data, reminders: data.reminders.map((x) => ({ ...x, plan: { ...x.plan, endDate: '2026-10-17', durationDays: 1 } })) }))
  const legacy = (await reminders.list(owner, child.id, new Date('2026-10-20T00:00:00Z')))[0]
  assert.equal(legacy.totalDays, null)
  assert(legacy.occurrences.some((x) => x.scheduledAt > '2026-10-20T00:00:00.000Z'))
})

test('desensitization names, observation states and calendar dates validate before persistence while legal leap dates remain intact', async (t) => {
  const { des, child } = await fixture(t)
  for (const displayName of [{ food: '鸡蛋' }, true, ['鸡蛋'], '食'.repeat(31)]) await assert.rejects(des.create(owner, { memberId: child.id, displayName }, now), invalid)
  const { task } = await des.create(owner, { memberId: child.id, displayName: ' 鸡 蛋 ' }, now)
  const observation = { status: 'effective', symptomAnswer: 'absent', exposureAnswer: 'eaten', symptoms: [], note: '', actualFood: '鸡蛋', amount: '5克', occurredAt: '2026-10-17T01:00:00Z' }
  await assert.rejects(des.saveRecord(owner, task.id, { ...observation, occurredAt: '2026-02-30T08:00:00Z' }, now), (e) => e.code === 'INVALID_OCCURRED_AT')
  await assert.rejects(des.saveRecord(owner, task.id, { ...observation, status: 'broken' }, now), (e) => e.code === 'INVALID_OBSERVATION_STATUS')
  for (const patch of [{ visitDate: '2026-02-30' }, { reviewDate: 'not-a-date' }, { reviewDate: ['2026-10-20'] }]) await assert.rejects(des.savePlan(owner, task.id, patch, now), (e) => e.code === 'INVALID_PLAN_DATE')
  const valid = await des.saveRecord(owner, task.id, { ...observation, occurredAt: '2024-02-29T08:00:00+08:00' }, now)
  assert.equal(valid.record.occurredAt, '2024-02-29T00:00:00.000Z')
  const savedPlan = await des.savePlan(owner, task.id, { visitDate: '', reviewDate: '2026-10-20' }, now)
  assert.equal(savedPlan.plan.reviewDate, '2026-10-20')
  const listed = (await des.list(owner, child.id, now)).tasks[0]
  assert.equal(listed.records.length, 1)
  assert.equal(listed.records[0].status, 'effective')
})
