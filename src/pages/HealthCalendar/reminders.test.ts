import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarReminderDays, medicationCalendarReminders, type CalendarReminder } from './reminders'
import type { MedicationReminderDto } from '../../services/medicationReminders'
const plan = { id:'plan',accountId:'owner',memberId:'child',status:'active',plan:{medicationName:'已设药品',amount:0.5,unit:'mL'},occurrences:[{id:'future',scheduledAt:'2026-10-18T00:00:00Z',completed:false},{id:'taken',scheduledAt:'2026-10-18T01:00:00Z',completed:true},{id:'past',scheduledAt:'2026-10-10T00:00:00Z',completed:false}] } as MedicationReminderDto
test('pending projections exclude completed, archived, duplicate and cross-member/account reminders', () => {
 const rows=medicationCalendarReminders([plan,plan,{...plan,id:'archived',status:'archived'},{...plan,id:'foreign',memberId:'other'},{...plan,id:'foreign-owner',accountId:'other'}],'owner','child','2026-10-14')
 assert.equal(rows.length,1);assert.equal(rows[0].title,'已设药品');assert.equal(rows[0].detail,'0.5mL');assert.equal(rows[0].day,'2026-10-18')
 assert.equal(Object.hasOwn(rows[0],'occurredAt'),false)
})
test('generic reminders and records filter independently by the same presentation groups', () => {
 const medication=medicationCalendarReminders([plan],'owner','child','2026-10-14')[0]
 const vaccine={...medication,id:'vaccine',sourceId:'vaccine',kind:'vaccination',group:'materials',title:'已有疫苗预约'} as CalendarReminder
 assert.equal(calendarReminderDays([medication,vaccine],'').get('2026-10-18')?.length,2)
 assert.equal(calendarReminderDays([medication,vaccine],'medication').get('2026-10-18')?.length,1)
 assert.equal(calendarReminderDays([medication,vaccine],'materials').get('2026-10-18')?.[0].kind,'vaccination')
 assert.equal(calendarReminderDays([medication,vaccine],'daily').size,0)
})
