import test from 'node:test'
import assert from 'node:assert/strict'
import type { HealthEventApiDto, HealthEventRecordApiDto } from '../../types'
import { calendarBoundary, calendarCounts, calendarEntries, calendarExport, calendarItems, calendarMonthDays, scopeEntries, type CalendarEntry } from './model'
const now = new Date('2026-10-09T14:00:00Z'), tz = 'Asia/Shanghai'
const event = (id: string, memberId = 'child', accountId = 'account') => ({ id, memberId, accountId, title: id, status: 'ongoing', startTime: '2026-10-08T01:00:00Z', createdAt: '2026-10-08T01:00:00Z', updatedAt: '2026-10-08T01:00:00Z', category: 'other' }) as HealthEventApiDto
const record = (id: string, at: string, overrides: Partial<HealthEventRecordApiDto> = {}): HealthEventRecordApiDto => ({ id, accountId: 'account', eventId: 'case', type: 'symptom', content: id, occurredAt: at, createdAt: '2026-10-09T01:00:00Z', updatedAt: '2026-10-09T01:00:00Z', ...overrides })
const flatten = (rows: HealthEventRecordApiDto[]) => calendarEntries([event('case')], new Map([['case', rows]]), 'child')
const entry = (id: string, at: string, other: Partial<CalendarEntry> = {}) => flatten([record(id, at)])[0] && { ...flatten([record(id, at)])[0], ...other }

test('member and account isolation; updates keep every original occurrence without fabricated event rows', () => {
 const entries = calendarEntries([event('case'), event('other','sibling'), event('empty')], new Map([['case',[record('initial','2026-10-08T01:00:00Z'),record('update','2026-10-09T01:00:00Z',{note:'event-update:initial'}),record('wrong','2026-10-08T01:00:00Z',{accountId:'elsewhere'})]],['other',[record('sibling','2026-10-08T01:00:00Z',{eventId:'other'})]]]),'child')
 assert.deepEqual(entries.map(e=>e.id),['initial','update'])
 assert.equal(calendarItems(entries,'2026-10-08','desc',now,tz)[0].entry.id,'initial')
})
test('chronology uses instants, backfills do not jump ahead, ties are stable; supports reading forward', () => {
 const rows = flatten([record('early','2026-10-08T09:00:00+08:00',{createdAt:'2026-10-09T12:00:00Z'}),record('late','2026-10-08T03:00:00Z'),record('tie-a','2026-10-08T03:00:00Z'),record('tie-b','2026-10-08T03:00:00Z')])
 assert.deepEqual(calendarItems(rows,'2026-10-08','desc',now,tz).map(i=>i.entry.id),['tie-b','tie-a','late','early'])
 assert.equal(calendarItems(rows,'2026-10-08','asc',now,tz)[0].entry.id,'early')
})
test('unknown date never uses upload timestamp, imprecise times stay separate', () => {
 const rows=flatten([record('unknown','2026-10-08T01:00:00Z',{journal:{timePrecision:'unknown'}}),record('day','2026-10-08T01:00:00Z',{journal:{timePrecision:'day'}}),record('exact','2026-10-08T02:00:00Z')])
 const items=calendarItems(rows,'2026-10-08','asc',now,tz)
 assert.deepEqual(items.map(i=>i.entry.id),['exact','day'])
 assert.equal(calendarCounts(items).symptom,2)
})
test('cross-midnight sleep has real start/wake milestones, no double count or future plan', () => {
 const sleep=entry('sleep','2026-10-09T00:00:00Z',{categories:['sleep'],sleep:{sleepAt:'2026-10-08T14:00:00Z',wakeAt:'2026-10-09T00:00:00Z',durationMinutes:600,kind:'night',status:'completed'}})
 assert.equal(calendarItems([sleep],'2026-10-08','asc',now,tz)[0].label,'入睡')
 assert.equal(calendarItems([sleep],'2026-10-09','asc',now,tz)[0].label,'醒来')
 const nap={...sleep,sleep:{...sleep.sleep!,sleepAt:'2026-10-08T05:00:00Z',wakeAt:'2026-10-08T06:00:00Z'}}
 assert.equal(calendarItems([nap],'2026-10-08','asc',now,tz).length,2)
 assert.equal(calendarCounts(calendarItems([nap],'2026-10-08','asc',now,tz)).sleep,1)
 assert.equal(calendarItems([sleep],'2026-10-10','asc',now,tz).length,0)
})
test('only explicit followup links qualify; temporal neighbors do not become associations', () => {
 const root=entry('symptom','2026-10-08T02:00:00Z',{symptom:{symptomCategory:'skin',locations:[],descriptors:[],linkedRecordIds:{diet:['food']}}})
 const food=entry('food','2026-10-08T01:00:00Z',{eventId:'daily',categories:['diet']})
 const unrelated=entry('neighbor','2026-10-08T01:30:00Z',{eventId:'daily',categories:['diet']})
 assert.deepEqual(scopeEntries([root,food,unrelated],'case','').map(e=>e.id),['symptom','food'])
 assert.deepEqual(scopeEntries([root,food,unrelated],'case','diet').map(e=>e.id),['food'])
 assert.equal(root.eventId,'case')
})
test('export obeys dates/scope, includes cross-day intervals, original uncertainty and escapes HTML', () => {
 const early=entry('early','2026-10-08T01:00:00Z',{content:'<script>alert(1)</script>',originalText:'家长怀疑牛奶，但不确定'})
 const late=entry('late','2026-10-08T02:00:00Z')
 const unknown=entry('unknown','2026-10-08T01:00:00Z',{timePrecision:'unknown'})
 const outside=entry('outside','2026-10-07T01:00:00Z')
 const input={memberName:'孩子',from:'2026-10-08',to:'2026-10-08',scope:'全部事项',timeZone:tz,includeUnknown:false,now}
 const html=calendarExport([late,early,unknown,outside],input)
 assert.ok(html.includes(calendarBoundary));assert.ok(html.indexOf('2026-10-08 09:00') < html.indexOf('2026-10-08 10:00'))
 assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('家长怀疑牛奶，但不确定'))
 assert.ok(!html.includes('outside'));assert.ok(!html.includes('unknown'))
 const withUnknown=calendarExport([unknown],{...input,includeUnknown:true})
 assert.ok(withUnknown.includes('日期明确的记录 · 0条'));assert.ok(withUnknown.includes('不归入所选日期'))
 assert.throws(()=>calendarExport([],{...input,from:'2026-10-09'}))
 assert.throws(()=>calendarExport([],{...input,to:'2026-10-10'}))
})
test('month uses Monday start, leap years and valid dates', () => {
 assert.equal(calendarMonthDays('2024-02').filter(Boolean).length,29)
 assert.equal(calendarMonthDays('2026-10')[3],'2026-10-01')
 assert.deepEqual(calendarMonthDays('2026-13'),[])
})
