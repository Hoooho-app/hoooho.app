import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarDays, inMonth, moveMonth, onDate, financeCalendarItems, type CalendarItem } from './arrangement-model.ts'

test('month cells start on Monday and include leap days, six-week months and year boundaries', () => {
  assert.equal(calendarDays('2026-03').length, 42)
  assert.equal(new Date(`${calendarDays('2026-03')[0]}T00:00:00Z`).getUTCDay(), 1)
  assert.ok(calendarDays('2028-02').includes('2028-02-29'))
  assert.equal(moveMonth('2026-12', 1), '2027-01')
  assert.equal(moveMonth('2027-01', -1), '2026-12')
})
test('month-only plans stay in their month while date ranges appear in every intersecting month and day', () => {
  const item: CalendarItem = { id: 'test', module: 'schedule', page: 'travel', title: '出游', month: '2026-10', startDate: '', endDate: '', owner: '', note: '', status: 'pending' }
  assert.equal(inMonth(item, '2026-10'), true)
  assert.equal(inMonth(item, '2026-11'), false)
  assert.equal(onDate(item, '2026-10-21'), false)
  const range = { ...item, startDate: '2026-10-30', endDate: '2026-11-02' }
  assert.equal(inMonth(range, '2026-10'), true)
  assert.equal(inMonth(range, '2026-11'), true)
  assert.equal(inMonth(range, '2026-12'), false)
  assert.equal(onDate(range, '2026-11-02'), true)
  assert.equal(onDate(range, '2026-11-03'), false)
})
test('finance projection includes real dates and planned unconfirmed budgets and links to source pages', () => {
  const projected = financeCalendarItems({ debts: [{ id: 'debt', name: '房贷', balance: 1000, dueDate: '2026-10-25' }, { id: 'paid', name: '已结清', balance: 0, dueDate: '2026-10-25' }], policies: [{ id: 'policy', name: '保险', status: 'active', dueDate: '2026-10-26' }, { id: 'cancelled', name: '停保', status: 'cancelled', dueDate: '2026-10-26' }], goals: [{ id: 'goal', name: '旅行资金', dueDate: '2026-11-01' }], flows: [{ id: 'budget', name: '本月出游', month: '2026-10', budget: 1000, actual: null }, { id: 'actual', name: '已核对', month: '2026-10', budget: 1000, actual: 0 }] })
  assert.equal(projected.length, 4)
  assert.equal(projected.find(item => item.id === 'finance-debt-debt')?.location?.section, 'balance')
  assert.equal(projected.find(item => item.id === 'finance-policy-policy')?.module, 'safety')
  assert.equal(projected.find(item => item.id === 'finance-flow-budget')?.startDate, '')
})
