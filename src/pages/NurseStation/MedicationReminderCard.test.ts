import assert from 'node:assert/strict'
import test from 'node:test'
import type { MedicationReminderDto, MedicationReminderOccurrence } from '../../services/medicationReminders.ts'
import { reminderActionState, reminderCoursePlanText, reminderCourseText, reminderProgressGroupLabel, weekRows } from './medicationCardLogic.ts'

function reminder(days: number): MedicationReminderDto {
  const start = new Date('2026-09-01T00:00:00.000Z')
  const occurrences: MedicationReminderOccurrence[] = Array.from({ length: days * 2 }, (_, index) => {
    const dayIndex = Math.floor(index / 2)
    const value = new Date(start.getTime() + dayIndex * 86_400_000 + (index % 2 ? 12 : 0) * 3_600_000)
    const day = value.toISOString().slice(0, 10)
    return { id: `occ-${index}`, scheduledAt: value.toISOString(), day, dayIndex, weekIndex: Math.floor(dayIndex / 7), slotIndex: index % 2, completed: false, completion: null }
  })
  return { id: 'reminder', accountId: 'account', memberId: 'member', clientId: null, status: 'active', plan: { medicationName: '药', medicationType: 'tablet', amount: 1, unit: '片', route: 'oral', mode: 'daily', times: ['08:00', '20:00'], startDate: '2026-09-01', durationDays: days, reminderTargets: ['我'], timezone: 'UTC', nextOccurrenceAt: occurrences[0].scheduledAt, occurrenceKey: occurrences[0].id, confirmedOccurrenceKeys: [] }, completions: [], occurrences, nextOccurrence: occurrences[0], totalDays: days, createdAt: start.toISOString(), updatedAt: start.toISOString() }
}

test('每行最多四周且末行按实际周数等分', () => {
  const expected = { 1: [1], 2: [2], 3: [3], 4: [4], 5: [4, 1], 6: [4, 2], 7: [4, 3], 8: [4, 4], 9: [4, 4, 1] }
  for (const [weeks, rows] of Object.entries(expected)) assert.deepEqual(weekRows(reminder(Number(weeks) * 7)).map((row) => row.length), rows)
})

test('不足一周只输出真实天数且疗程日按日期位置计算', () => {
  const value = reminder(9)
  const rows = weekRows(value)
  assert.equal(rows[0][0].days.length, 7)
  assert.equal(rows[0][1].days.length, 2)
  assert.equal(reminderCourseText(value, new Date('2026-09-08T12:00:00.000Z')), '共9天 · 第8天')
  assert.equal(reminderCourseText(value, new Date('2026-08-31T12:00:00.000Z')), '共9天 · 尚未开始')
  assert.equal(reminderCourseText(value, new Date('2026-09-11T12:00:00.000Z')), '共9天 · 疗程已结束')
})

test('卡片摘要使用疗程规律文案且短疗程按当前天数标注进度', () => {
  const short = reminder(3)
  assert.equal(reminderCoursePlanText(short), '共3天，每天2次')
  assert.equal(reminderProgressGroupLabel(short, new Date('2026-09-01T12:00:00.000Z'), 0), '第1天')
  assert.equal(reminderProgressGroupLabel(short, new Date('2026-09-02T12:00:00.000Z'), 0), '第2天')
  assert.equal(reminderProgressGroupLabel(reminder(9), new Date('2026-09-08T12:00:00.000Z'), 1), '第2周')
})

test('未到点禁用，到点启用，完成后重新判断下一条计划', () => {
  const value = reminder(2)
  assert.equal(reminderActionState(value, new Date('2026-08-31T23:59:00.000Z')).due, false)
  assert.equal(reminderActionState(value, new Date('2026-09-01T00:00:00.000Z')).due, true)
  value.occurrences[0] = { ...value.occurrences[0], completed: true }
  value.nextOccurrence = value.occurrences[1]
  assert.equal(reminderActionState(value, new Date('2026-09-01T11:59:00.000Z')).due, false)
  assert.equal(reminderActionState(value, new Date('2026-09-01T12:00:00.000Z')).due, true)
})

test('今日与整个疗程完成使用准确的按钮状态且撤回后可恢复', () => {
  const value = reminder(2)
  value.occurrences[0] = { ...value.occurrences[0], completed: true }
  value.occurrences[1] = { ...value.occurrences[1], completed: true }
  value.completions = value.occurrences.slice(0, 2).map((occurrence, index) => ({
    id: `completion-${index}`,
    occurrenceId: occurrence.id,
    scheduledAt: occurrence.scheduledAt,
    actualTakenAt: occurrence.scheduledAt,
    completedAt: occurrence.scheduledAt,
    undoneAt: null,
    eventId: `event-${index}`,
    recordId: `record-${index}`
  }))
  value.nextOccurrence = value.occurrences[2]
  let state = reminderActionState(value, new Date('2026-09-01T20:01:00.000Z'))
  assert.deepEqual({ label: state.takeLabel, todayDone: state.todayDone, count: state.todayCompleted }, { label: '今日已完成', todayDone: true, count: 2 })
  value.occurrences = value.occurrences.map((item) => ({ ...item, completed: true }))
  value.nextOccurrence = null
  state = reminderActionState(value, new Date('2026-09-02T20:01:00.000Z'))
  assert.deepEqual({ label: state.takeLabel, allComplete: state.allComplete }, { label: '疗程已完成', allComplete: true })
  value.occurrences[0] = { ...value.occurrences[0], completed: false }
  value.nextOccurrence = value.occurrences[0]
  state = reminderActionState(value, new Date('2026-09-02T20:01:00.000Z'))
  assert.deepEqual({ label: state.takeLabel, due: state.due }, { label: '记录服用', due: true })
})

test('补记逾期服用后按实际服用日更新今日计数', () => {
  const value = reminder(2)
  value.occurrences = [value.occurrences[0], value.occurrences[3]]
  const completion = {
    id: 'completion-overdue',
    occurrenceId: value.occurrences[0].id,
    scheduledAt: value.occurrences[0].scheduledAt,
    actualTakenAt: '2026-09-02T00:01:00.000Z',
    completedAt: '2026-09-02T00:01:00.000Z',
    undoneAt: null,
    eventId: 'event-overdue',
    recordId: 'record-overdue'
  }
  value.completions = [completion]
  value.occurrences[0] = { ...value.occurrences[0], completed: true, completion }
  value.nextOccurrence = value.occurrences[1]

  const state = reminderActionState(value, new Date('2026-09-02T00:01:00.000Z'))
  assert.deepEqual({ count: state.todayCompleted, total: state.todayTotal }, { count: 1, total: 1 })
  assert.equal(state.todayScheduledCompleted, 0)
  value.completions[0] = { ...value.completions[0], undoneAt: '2026-09-02T00:02:00.000Z' }
  assert.equal(reminderActionState(value, new Date('2026-09-02T00:02:00.000Z')).todayCompleted, 0)
})

test('多次补记历史服药不扩大今日计划分母，也不冒充今日计划完成', () => {
  const value = reminder(3)
  value.completions = value.occurrences.slice(0, 3).map((occurrence, index) => ({ id: `backfill-${index}`, occurrenceId: occurrence.id, scheduledAt: occurrence.scheduledAt, actualTakenAt: '2026-09-03T00:01:00Z', completedAt: '2026-09-03T00:01:00Z', undoneAt: null, eventId: 'event', recordId: `record-${index}` }))
  value.occurrences = value.occurrences.map((occurrence, index) => index < 3 ? { ...occurrence, completed: true, completion: value.completions[index] } : occurrence)
  const state = reminderActionState(value, new Date('2026-09-03T00:02:00Z'))
  assert.deepEqual({ actual: state.todayCompleted, planned: state.todayTotal, completedPlan: state.todayScheduledCompleted }, { actual: 3, planned: 2, completedPlan: 0 })
  const afterCourse = reminderActionState(value, new Date('2026-09-04T00:02:00Z'))
  assert.equal(afterCourse.todayTotal, 0)
})

test('历史未确认计划不冒充未来下次，也不自动归档或补为已服用', () => {
  const value = reminder(3), now = new Date('2026-09-02T01:00:00Z')
  const state = reminderActionState(value, now)
  assert.equal(state.historical, true)
  assert.equal(state.next?.scheduledAt, '2026-09-01T00:00:00.000Z')
  assert.equal(state.future?.scheduledAt, '2026-09-02T12:00:00.000Z')
  assert.equal(state.takeLabel, '记录服用')
  const ended = reminderActionState(value, new Date('2026-09-10T01:00:00Z'))
  assert.equal(ended.future, null); assert.equal(ended.todayTotal, 0)
  assert.equal(value.status, 'active'); assert.equal(value.completions.length, 0)
})
