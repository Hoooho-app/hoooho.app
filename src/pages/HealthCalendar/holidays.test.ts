import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarDayInfo } from './holidays'
import { calendarCategories, calendarCategoryLabels, calendarRecordTone } from './presentation'

test('2026 official holidays and makeup workdays cover all seven holiday arrangements', () => {
  for (const [start,end] of [['01-01','01-03'],['02-15','02-23'],['04-04','04-06'],['05-01','05-05'],['06-19','06-21'],['09-25','09-27'],['10-01','10-07']]) {
    assert.equal(calendarDayInfo(`2026-${start}`).rest,true)
    assert.equal(calendarDayInfo(`2026-${end}`).rest,true)
  }
  for (const md of ['01-04','02-14','02-28','05-09','09-20','10-10']) {
    const info=calendarDayInfo(`2026-${md}`)
    assert.equal(info.weekend,true);assert.equal(info.work,true);assert.equal(info.rest,false)
  }
  assert.equal(calendarDayInfo('2026-10-08').rest,false)
  assert.equal(calendarDayInfo('2026-10-11').weekend,true)
})
test('festival dates are civil dates with lunar festivals distinct from vacation ranges', () => {
  for (const [date,name] of [['2026-02-16','除夕'],['2026-02-17','春节'],['2026-04-05','清明'],['2026-06-19','端午'],['2026-09-25','中秋'],['2026-10-01','国庆'],['2025-10-06','中秋'],['2024-06-10','端午']]) assert.equal(calendarDayInfo(date).festival,name)
  assert.equal(calendarDayInfo('2024-02-09').rest,false)
  assert.equal(calendarDayInfo('2025-10-11').work,true)
  assert.equal(calendarDayInfo('2025-04-27').work,true)
  assert.equal(calendarDayInfo('2024-10-12').work,true)
  assert.equal(calendarDayInfo('2026-02-30').description,'')
  // No guessed compensatory workdays for years without an official annual table.
  assert.equal(calendarDayInfo('2030-10-12').work,false)
})
test('calendar uses short labels and hides only legacy creation/filter choices', () => {
  assert.ok(calendarCategories.every(c=>calendarCategoryLabels[c].length===2))
  for (const legacy of ['measurement','environment','social']) assert.ok(!calendarCategories.includes(legacy as typeof calendarCategories[number]))
  assert.equal(calendarRecordTone(['symptom','sleep']),'red')
  assert.equal(calendarRecordTone(['vaccination']),'orange')
  for (const c of ['diet','sleep','growth','care','elimination'] as const) assert.equal(calendarRecordTone([c]),'blue')
  assert.equal(calendarRecordTone(['symptom','sleep'],'sleep'),'blue')
})
