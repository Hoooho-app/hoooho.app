import assert from 'node:assert/strict'
import test from 'node:test'
import { effectiveStatus, nextOccurrences, planLabel } from './medicationReminderLogic.ts'

const plan = { medicationName:'药', medicationType:'drops' as const, amount:5, unit:'滴', route:'oral', mode:'daily' as const, times:['08:00','20:00'], startDate:'2026-09-13', durationDays:5, reminderTargets:['我'], timezone:'Asia/Shanghai', nextOccurrenceAt:'2026-09-13T12:00:00.000Z', occurrenceKey:'a', confirmedOccurrenceKeys:[] }
test('每天固定时间按真实起点计算三次提醒',()=>assert.deepEqual(nextOccurrences(plan,new Date('2026-09-13T01:00:00'),3).map(x=>x.getHours()),[8,20,8]))
test('间隔计划不改变规律地计算后续提醒',()=>assert.equal(nextOccurrences({...plan,mode:'interval',times:['08:00'],intervalHours:6},new Date('2026-09-13T09:00:00'),3)[0].getHours(),14))
test('三五七天计划均以开始日为第一天且不会多出一天',()=>{for(const days of [3,5,7]){const values=nextOccurrences({...plan,times:['20:00'],durationDays:days},new Date('2026-09-13T00:00:00'),20);assert.equal(values.length,days);assert.equal(values.at(-1)?.getDate(),13+days-1)}})
test('自定义结束日期包含结束日且多时间点去重排序',()=>assert.deepEqual(nextOccurrences({...plan,times:['20:00','08:00','08:00'],durationDays:undefined,endDate:'2026-09-14'},new Date('2026-09-13T00:00:00'),8).map(x=>`${x.getDate()}-${x.getHours()}`),['13-8','13-20','14-8','14-20']))
test('单次和无效时间不会制造默认提醒',()=>{assert.equal(nextOccurrences({...plan,mode:'once',times:['09:30'],durationDays:undefined},new Date('2026-09-13T09:00:00'),3).length,1);assert.deepEqual(nextOccurrences({...plan,times:['']},new Date('2026-09-13T00:00:00'),3),[])})
test('通知异常优先于执行状态',()=>assert.equal(effectiveStatus('due',plan,'denied',0),'notification_disabled'))
test('已暂停或已结束不会被通知权限覆盖',()=>{assert.equal(effectiveStatus('paused',plan,'denied',0),'paused');assert.equal(effectiveStatus('ended',plan,'unsupported',0),'ended')})
test('计划标签和状态文案分离',()=>assert.equal(planLabel(plan),'每日2次'))
