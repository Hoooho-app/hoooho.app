import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {FamilyMemberRepository} from '../members/repositories/family-member-repository.mjs'
import {MedicationReminderService,buildOccurrences} from './medication-reminder-service.mjs'

const owner='dst-issue-owner',now=new Date('2026-03-01T00:00:00Z')
const basePlan={medicationName:'独立测试药',medicationType:'syrup',amount:1,unit:'毫升',route:'oral',mode:'daily',startDate:'2026-03-07',durationDays:3,times:['01:30','02:30'],timezone:'America/New_York'}
async function fixture(t){const dataDirectory=await mkdtemp(path.join(os.tmpdir(),'hoooho-dst-issues-'));const members=new FamilyMemberRepository(dataDirectory);const child=await members.create({accountId:owner,name:'DST验收',relationship:'child'});const service=new MedicationReminderService({dataDirectory,members});t.after(()=>rm(dataDirectory,{recursive:true,force:true}));return{service,child}}
async function legacy(service,child,id,plan){await service.store.update(data=>({...data,reminders:[...data.reminders,{id,accountId:owner,memberId:child.id,status:'active',plan,completions:[],createdAt:now.toISOString(),updatedAt:now.toISOString()}]}))}

test('new finite courses reject a later nonexistent clock with actionable date and keep non-gap courses unchanged',async t=>{
  const{service,child}=await fixture(t)
  for(const plan of [basePlan,{...basePlan,durationDays:undefined,endDate:'2026-03-09'}])await assert.rejects(service.create(owner,{memberId:child.id,plan},now),e=>e.code==='INVALID_MEDICATION_SCHEDULE'&&e.status===400&&e.message.includes('2026-03-08')&&e.message.includes('02:30')&&e.message.includes('America/New_York'))
  assert.equal((await service.list(owner,child.id,now)).length,0)
  const normal=await service.create(owner,{memberId:child.id,plan:{...basePlan,times:['01:30','03:30']}},now)
  assert.equal(normal.occurrences.length,6);assert.equal(new Set(normal.occurrences.map(x=>x.id)).size,6)
  assert.equal(Object.hasOwn(normal,'scheduleIssues'),false)
})

test('legacy finite course lists stay usable, disclose the missing local slot and never share a completion',async t=>{
  const{service,child}=await fixture(t)
  await legacy(service,child,'legacy-gap',basePlan)
  await legacy(service,child,'legacy-normal',{...basePlan,times:['10:00']})
  const list=await service.list(owner,child.id,new Date('2026-03-10T00:00:00Z'))
  assert.equal(list.length,2)
  const affected=list.find(x=>x.id==='legacy-gap'),normal=list.find(x=>x.id==='legacy-normal')
  assert.equal(affected.occurrences.length,5);assert.equal(new Set(affected.occurrences.map(x=>x.id)).size,5)
  assert.deepEqual(affected.scheduleIssues.map(x=>({day:x.day,time:x.time})),[{day:'2026-03-08',time:'02:30'}])
  assert.match(affected.scheduleIssues[0].reason,/当地时间不存在/)
  assert.equal(normal.occurrences.length,3);assert.equal(Object.hasOwn(normal,'scheduleIssues'),false)
  const completed=await service.complete(owner,affected.id,affected.occurrences[0].id,{},new Date('2026-03-10T00:00:00Z'))
  assert.equal(completed.occurrences.filter(x=>x.completed).length,1)
  assert.equal(completed.completions.length,1);assert.equal(completed.scheduleIssues.length,1)
  assert.equal((await service.records.repository.findByAccountId(owner)).length,1)
  assert(Array.isArray(buildOccurrences('legacy-gap',basePlan,now)))
})

test('long-term rolling projection discovers future gaps without moving a clock or erasing stable earlier IDs',async t=>{
  const{service,child}=await fixture(t)
  const plan={...basePlan,startDate:'2026-03-01',longTerm:true,durationDays:undefined}
  const before=await service.create(owner,{memberId:child.id,plan},new Date('2026-02-01T00:00:00Z'))
  assert.equal(Object.hasOwn(before,'scheduleIssues'),false)
  const after=(await service.list(owner,child.id,new Date('2026-03-01T00:00:00Z')))[0]
  assert.equal(after.scheduleIssues.length,1)
  assert.equal(after.scheduleIssues[0].day,'2026-03-08');assert.equal(after.scheduleIssues[0].time,'02:30')
  assert(before.occurrences.every(x=>after.occurrences.some(y=>y.id===x.id&&y.scheduledAt===x.scheduledAt)))
  assert.equal(after.occurrences.filter(x=>x.day==='2026-03-08').length,1)
  assert.equal(after.occurrences.filter(x=>x.completed).length,0)
  assert.equal(new Set(after.occurrences.map(x=>x.id)).size,after.occurrences.length)
})

test('legacy plans whose first clock is absent return issues and an empty projection instead of crashing the list',async t=>{
  const{service,child}=await fixture(t)
  await legacy(service,child,'legacy-empty',{...basePlan,startDate:'2026-03-08',durationDays:1,times:['02:30']})
  await legacy(service,child,'legacy-interval-empty',{...basePlan,startDate:'2026-03-08',durationDays:1,times:['02:30'],mode:'interval',intervalHours:8})
  const list=await service.list(owner,child.id,now)
  for(const reminder of list){assert.deepEqual(reminder.occurrences,[]);assert.equal(reminder.nextOccurrence,null);assert.equal(reminder.scheduleIssues.length,1);assert.equal(reminder.scheduleIssues[0].time,'02:30')}
  await assert.rejects(service.complete(owner,'legacy-empty','missing-gap-id',{},new Date('2026-03-09T00:00:00Z')),e=>e.code==='MEDICATION_OCCURRENCE_NOT_FOUND')
})

test('explicit end dates use the existing 3650-day finite-course bound including both endpoints',async t=>{
  const{service,child}=await fixture(t)
  const start='2026-01-01';const endAt=days=>new Date(Date.parse(start+'T00:00:00Z')+(days-1)*86400000).toISOString().slice(0,10)
  await assert.rejects(service.create(owner,{memberId:child.id,plan:{...basePlan,startDate:start,times:['08:00'],timezone:'Asia/Shanghai',durationDays:undefined,endDate:endAt(3651)}},now),e=>e.status===400&&e.message.includes('3650'))
  const boundary=await service.create(owner,{memberId:child.id,plan:{...basePlan,startDate:start,times:['08:00'],timezone:'Asia/Shanghai',durationDays:undefined,endDate:endAt(3650)}},now)
  assert.equal(boundary.totalDays,3650);assert.equal(boundary.occurrences.length,3650)
})

test('elapsed-hour interval plans cross DST with the same interval and no spurious daily-clock issue',async t=>{
  const{service,child}=await fixture(t)
  const saved=await service.create(owner,{memberId:child.id,plan:{...basePlan,mode:'interval',intervalHours:8,times:['01:30']}},now)
  assert.equal(Object.hasOwn(saved,'scheduleIssues'),false)
  for(let i=1;i<saved.occurrences.length;i++)assert.equal(Date.parse(saved.occurrences[i].scheduledAt)-Date.parse(saved.occurrences[i-1].scheduledAt),8*3600000)
})
