import test from 'node:test'
import assert from 'node:assert/strict'
import {calendarUpdateDays} from './calendarUpdates'
import type {RecordUpdate} from './store'
import type {JournalEntry} from '../../pages/HealthEvents/timeViewModel'
const update=(id:string,more:Partial<RecordUpdate>={}):RecordUpdate=>({id,accountId:'a',memberId:'m',destination:'calendar',recordId:id,label:'',at:new Date('2026-10-18T02:30:00').getTime(),...more})
test('calendar dots follow actual occurrence for symptoms and daily records, keeping profiles separate',()=>{
  const backfill={id:'backfill',occurredAt:'2026-10-12T10:00:00',timePrecision:'exact'} as JournalEntry
  const days=calendarUpdateDays([update('backfill'),update('today'),update('profile',{destination:'profile'}),update('symptom',{destination:'symptom'})],[backfill])
  assert.deepEqual(days.get('2026-10-12'),['backfill'])
  assert.deepEqual(days.get('2026-10-18'),['today','symptom'])
})
test('notice occurrence metadata works before the journal refresh completes',()=>{
  const days=calendarUpdateDays([update('new',{occurredAt:'2026-10-01T12:23:00'})],[])
  assert.deepEqual(days.get('2026-10-01'),['new'])
})
