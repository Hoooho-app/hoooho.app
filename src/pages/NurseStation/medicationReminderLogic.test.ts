import assert from 'node:assert/strict'
import test from 'node:test'
import { effectiveStatus, nextOccurrences, planLabel } from './medicationReminderLogic.ts'

const plan = { medicationName:'药', medicationType:'drops' as const, amount:5, unit:'滴', route:'oral', mode:'daily' as const, times:['08:00','20:00'], startDate:'2026-09-13', durationDays:5, reminderTargets:['我'], timezone:'Asia/Shanghai', nextOccurrenceAt:'2026-09-13T12:00:00.000Z', occurrenceKey:'a', confirmedOccurrenceKeys:[] }
test('每天固定时间按真实起点计算三次提醒',()=>assert.deepEqual(nextOccurrences(plan,new Date('2026-09-13T01:00:00'),3).map(x=>x.getHours()),[8,20,8]))
test('间隔计划不改变规律地计算后续提醒',()=>assert.equal(nextOccurrences({...plan,mode:'interval',times:['08:00'],intervalHours:6},new Date('2026-09-13T09:00:00'),3)[0].getHours(),14))
test('通知异常优先于执行状态',()=>assert.equal(effectiveStatus('due',plan,'denied',0),'notification_disabled'))
test('计划标签和状态文案分离',()=>assert.equal(planLabel(plan),'每日2次'))
