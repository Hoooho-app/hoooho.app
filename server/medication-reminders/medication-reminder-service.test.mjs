import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { HealthEventRecordRepository } from '../events/repositories/health-event-record-repository.mjs'
import { HealthEventRepository } from '../events/repositories/health-event-repository.mjs'
import { MedicationReminderService, buildOccurrences, zonedDateTime } from './medication-reminder-service.mjs'

const basePlan = { medicationName: '阿司匹林', medicationType: 'tablet', amount: 1, unit: '粒', route: 'oral', mode: 'daily', times: ['08:00', '20:00'], startDate: '2026-01-01', durationDays: 28, reminderTargets: ['我'], timezone: 'Asia/Shanghai' }

test('疗程按连续七天分周，1到9周和不足一周只生成真实实例', () => {
  for (let weeks = 1; weeks <= 9; weeks += 1) {
    const occurrences = buildOccurrences('plan', { ...basePlan, durationDays: weeks * 7 })
    assert.equal(Math.max(...occurrences.map((item) => item.weekIndex)) + 1, weeks)
    assert.equal(occurrences.length, weeks * 14)
  }
  const partial = buildOccurrences('plan', { ...basePlan, durationDays: 9 })
  assert.equal(partial.length, 18)
  assert.equal(partial.filter((item) => item.weekIndex === 1).length, 4)
})

test('每天1到4次只增加周内行数且每个计划实例都有稳定唯一标识', () => {
  for (let count = 1; count <= 4; count += 1) {
    const times = ['08:00', '12:00', '16:00', '20:00'].slice(0, count)
    const first = buildOccurrences('plan', { ...basePlan, times, durationDays: 7 })
    const second = buildOccurrences('plan', { ...basePlan, times, durationDays: 7 })
    assert.equal(first.length, count * 7)
    assert.equal(Math.max(...first.map((item) => item.slotIndex)) + 1, count)
    assert.deepEqual(first.map((item) => item.id), second.map((item) => item.id))
    assert.equal(new Set(first.map((item) => item.id)).size, first.length)
  }
})

test('固定本地时间跨夏令时后仍保持同一钟点', () => {
  const before = zonedDateTime('2026-03-07', '08:00', 'America/New_York')
  const after = zonedDateTime('2026-03-09', '08:00', 'America/New_York')
  const clock = (value) => new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(value)
  assert.equal(clock(before), '08:00')
  assert.equal(clock(after), '08:00')
  assert.equal(after.getTime() - before.getTime(), 47 * 3_600_000)
})

async function context() {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-medication-reminder-'))
  const members = new FamilyMemberRepository(dataDirectory)
  const member = await members.create({ accountId: 'account-1', name: '孩子', relationship: 'child' })
  const other = await members.create({ accountId: 'account-2', name: '另一个孩子', relationship: 'child' })
  const service = new MedicationReminderService({ dataDirectory, members })
  return { dataDirectory, member, other, service }
}

test('服务端校验到点、顺序和幂等，并逐次跨周撤回', async () => {
  const value = await context()
  const now = new Date('2026-01-08T14:00:00.000Z')
  try {
    let reminder = await value.service.create('account-1', { memberId: value.member.id, plan: basePlan }, now)
    await assert.rejects(value.service.complete('account-1', reminder.id, reminder.occurrences[16].id, {}, now), (error) => error.code === 'MEDICATION_OCCURRENCE_NOT_DUE')
    await assert.rejects(value.service.complete('account-1', reminder.id, reminder.occurrences[1].id, {}, now), (error) => error.code === 'MEDICATION_OCCURRENCE_OUT_OF_ORDER')
    const duplicate = await Promise.all([
      value.service.complete('account-1', reminder.id, reminder.occurrences[0].id, {}, now),
      value.service.complete('account-1', reminder.id, reminder.occurrences[0].id, {}, now)
    ])
    assert.equal(duplicate.filter((item) => item.idempotent === false).length, 1)
    assert.equal(duplicate.filter((item) => item.idempotent === true).length, 1)
    reminder = duplicate[0]
    for (let index = 1; index < 15; index += 1) reminder = await value.service.complete('account-1', reminder.id, reminder.occurrences[index].id, {}, now)
    assert.equal(reminder.occurrences.filter((item) => item.completed && item.weekIndex === 0).length, 14)
    assert.equal(reminder.occurrences.filter((item) => item.completed && item.weekIndex === 1).length, 1)
    reminder = await value.service.undo('account-1', reminder.id, now)
    assert.deepEqual([reminder.occurrences.filter((item) => item.completed && item.weekIndex === 0).length, reminder.occurrences.filter((item) => item.completed && item.weekIndex === 1).length], [14, 0])
    reminder = await value.service.undo('account-1', reminder.id, now)
    assert.deepEqual([reminder.occurrences.filter((item) => item.completed && item.weekIndex === 0).length, reminder.occurrences.filter((item) => item.completed && item.weekIndex === 1).length], [13, 0])
    reminder = await value.service.undo('account-1', reminder.id, now)
    assert.deepEqual([reminder.occurrences.filter((item) => item.completed && item.weekIndex === 0).length, reminder.occurrences.filter((item) => item.completed && item.weekIndex === 1).length], [12, 0])
    assert.equal(reminder.nextOccurrence.id, reminder.occurrences[12].id)
  } finally { await rm(value.dataDirectory, { recursive: true, force: true }) }
})

test('账号人物隔离、归档保留进度，删除彻底移除提醒及关联服用事件', async () => {
  const value = await context()
  const now = new Date('2026-01-01T13:00:00.000Z')
  try {
    let reminder = await value.service.create('account-1', { memberId: value.member.id, plan: basePlan, clientId: 'legacy-1' }, now)
    const same = await value.service.create('account-1', { memberId: value.member.id, plan: basePlan, clientId: 'legacy-1' }, now)
    assert.equal(same.id, reminder.id)
    await assert.rejects(value.service.list('account-1', value.other.id, now), (error) => error.code === 'MEMBER_NOT_FOUND')
    await assert.rejects(value.service.archive('account-2', reminder.id, now), (error) => error.code === 'MEDICATION_REMINDER_NOT_FOUND')
    reminder = await value.service.complete('account-1', reminder.id, reminder.nextOccurrence.id, {}, now)
    const records = new HealthEventRecordRepository(value.dataDirectory)
    const events = new HealthEventRepository(value.dataDirectory)
    assert.equal((await records.findByAccountId('account-1')).length, 1)
    assert.equal((await events.findByAccountId('account-1')).length, 1)
    reminder = await value.service.archive('account-1', reminder.id, now)
    assert.equal(reminder.status, 'archived')
    assert.equal(reminder.completions.filter((item) => !item.undoneAt).length, 1)
    await assert.rejects(value.service.complete('account-1', reminder.id, reminder.nextOccurrence.id, {}, now), (error) => error.code === 'MEDICATION_REMINDER_INACTIVE')
    assert.deepEqual(await value.service.delete('account-1', reminder.id, now), { deleted: true, idempotent: false })
    assert.equal((await value.service.list('account-1', value.member.id, now)).length, 0)
    assert.equal((await records.findByAccountId('account-1')).length, 0)
    assert.equal((await events.findByAccountId('account-1')).length, 0)
    assert.deepEqual(await value.service.delete('account-1', reminder.id, now), { deleted: true, idempotent: true })
  } finally { await rm(value.dataDirectory, { recursive: true, force: true }) }
})

for (const action of ['undo', 'delete']) {
  test(`${action} preserves the parent and independently added records after removing its completion`, async (t) => {
    const value = await context(); t.after(() => rm(value.dataDirectory, { recursive: true, force: true }))
    const now = new Date('2026-01-01T13:00:00.000Z')
    let reminder = await value.service.create('account-1', { memberId: value.member.id, plan: basePlan }, now)
    reminder = await value.service.complete('account-1', reminder.id, reminder.nextOccurrence.id, {}, now)
    const completion = reminder.completions[0]
    const note = await value.service.records.create('account-1', completion.eventId, { type: 'note', content: '另外观察到的情况', occurredAt: now.toISOString() }, now)
    assert.equal((await value.service.records.list('account-1', completion.eventId)).length, 2)
    const refreshed = [], recompute = value.service.records.recomputeAfterMutation.bind(value.service.records)
    value.service.records.recomputeAfterMutation = async (...args) => { refreshed.push(args[1]); return recompute(...args) }
    const result = await value.service[action]('account-1', reminder.id, now)
    if (action === 'undo') reminder = result
    assert.equal(await value.service.records.repository.findById(completion.recordId), null)
    assert.deepEqual(await value.service.records.repository.findById(note.id), note)
    assert.equal((await value.service.events.repository.findById(completion.eventId)).id, completion.eventId)
    assert.deepEqual((await value.service.records.list('account-1', completion.eventId)).map(record => record.id), [note.id])
    assert.deepEqual(refreshed, [completion.eventId], 'kept event summaries/annotations are refreshed after removing the completion')
    if (action === 'undo') {
      // Re-completion owns a fresh event. Deleting the reminder later must still
      // retain the old event/note without retaining its empty new event.
      reminder = await value.service.complete('account-1', reminder.id, reminder.nextOccurrence.id, {}, now)
      const second = reminder.completions.at(-1)
      assert.notEqual(second.eventId, completion.eventId)
      await value.service.delete('account-1', reminder.id)
      assert.equal(await value.service.events.repository.findById(second.eventId), null)
      assert.deepEqual((await value.service.records.list('account-1', completion.eventId)).map(record => record.id), [note.id])
    }
  })
}

test('undo still cleans the empty event when no independent records were added', async (t) => {
  const value = await context(); t.after(() => rm(value.dataDirectory, { recursive: true, force: true }))
  const now = new Date('2026-01-01T13:00:00.000Z')
  let reminder = await value.service.create('account-1', { memberId: value.member.id, plan: basePlan }, now)
  reminder = await value.service.complete('account-1', reminder.id, reminder.nextOccurrence.id, {}, now)
  const completion = reminder.completions[0]
  const undone = await value.service.undo('account-1', reminder.id, now)
  assert.equal(undone.completions[0].undoneAt, now.toISOString())
  assert.equal(await value.service.events.repository.findById(completion.eventId), null)
  assert.equal(await value.service.records.repository.findById(completion.recordId), null)
})
