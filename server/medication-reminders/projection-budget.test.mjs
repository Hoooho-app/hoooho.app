import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdtemp,rm} from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {FamilyMemberRepository} from '../members/repositories/family-member-repository.mjs'
import {MedicationReminderService,buildOccurrences} from './medication-reminder-service.mjs'
const now=new Date('2026-10-17T16:30:00Z'),owner='projection-budget-owner'
const times=Array.from({length:1440},(_,i)=>`${String(Math.floor(i/60)).padStart(2,'0')}:${String(i%60).padStart(2,'0')}`)
const plan={medicationName:'本地预算测试药',medicationType:'syrup',amount:1,unit:'毫升',route:'oral',mode:'daily',startDate:'2026-10-17',durationDays:3650,times,timezone:'UTC'}
async function fixture(t){const dataDirectory=await mkdtemp(path.join(os.tmpdir(),'hoooho-budget-regression-'));const members=new FamilyMemberRepository(dataDirectory);const child=await members.create({accountId:owner,name:'预算验收',relationship:'child'});const service=new MedicationReminderService({dataDirectory,members});t.after(()=>rm(dataDirectory,{recursive:true,force:true}));return{service,child}}
async function seed(service,child,id,p,completions=[]){await service.store.update(data=>({...data,reminders:[...data.reminders,{id,accountId:owner,memberId:child.id,status:'active',plan:p,completions,createdAt:now.toISOString(),updatedAt:now.toISOString()}]}))}

test('new finite dense and ancient longTerm schedules reject over the existing projection budget before persistence',async t=>{
  const{service,child}=await fixture(t)
  await assert.rejects(service.create(owner,{memberId:child.id,plan},now),e=>e.status===400&&e.code==='SCHEDULE_TOO_LARGE'&&e.message.includes('100000')&&e.message.includes('重新设置'))
  await assert.rejects(service.create(owner,{memberId:child.id,plan:{...plan,startDate:'0100-01-01',times:['08:00'],longTerm:true,durationDays:undefined}},now),e=>e.status===400&&e.code==='SCHEDULE_TOO_LARGE')
  assert.deepEqual(await service.list(owner,child.id,now),[])
})

test('legacy multi-million projection returns one readable issue without changing plan or execution confirmations',async t=>{
  const{service,child}=await fixture(t)
  const completion={id:'retained-completion',occurrenceId:'retained-occurrence',scheduledAt:'2026-10-17T08:00:00Z',actualTakenAt:'2026-10-17T08:00:00Z',completedAt:'2026-10-17T08:00:00Z',recordId:'retained-record',eventId:'retained-event',undoneAt:null}
  await seed(service,child,'dense-legacy',plan,[completion])
  await seed(service,child,'normal-legacy',{...plan,durationDays:3,times:['08:00']})
  const list=await service.list(owner,child.id,now),dense=list.find(x=>x.id==='dense-legacy'),normal=list.find(x=>x.id==='normal-legacy')
  assert.deepEqual(dense.occurrences,[]);assert.equal(dense.nextOccurrence,null)
  assert.equal(dense.scheduleIssues[0].code,'SCHEDULE_TOO_LARGE')
  assert.deepEqual(dense.plan,plan);assert.deepEqual(dense.completions,[completion]);assert.equal(dense.totalDays,3650)
  assert.equal(normal.occurrences.length,3);assert.equal(Object.hasOwn(normal,'scheduleIssues'),false)
  const stored=await service.store.read();assert.deepEqual(stored.reminders.find(x=>x.id==='dense-legacy').completions,[completion])
})

test('legacy ancient interval projection reports budget overflow rather than silently returning the first 100000 doses',async t=>{
  const{service,child}=await fixture(t)
  const ancient={...plan,mode:'interval',intervalHours:1,times:['08:00'],startDate:'0100-01-01',longTerm:true,durationDays:undefined}
  await seed(service,child,'ancient-interval',ancient)
  const value=(await service.list(owner,child.id,now))[0]
  assert.deepEqual(value.occurrences,[]);assert.equal(value.scheduleIssues[0].code,'SCHEDULE_TOO_LARGE')
  assert.deepEqual(buildOccurrences('ancient-interval',ancient,now),[])
  await assert.rejects(service.create(owner,{memberId:child.id,plan:ancient},now),e=>e.status===400&&e.code==='SCHEDULE_TOO_LARGE')
})

test('ordinary projection IDs and future occurrences stay stable across restarts',async t=>{
  const{service,child}=await fixture(t)
  const normalPlan={...plan,durationDays:7,times:['08:00','12:00','16:00','20:00']}
  const created=await service.create(owner,{memberId:child.id,plan:normalPlan},now)
  const read=(await service.list(owner,child.id,now))[0]
  assert.equal(read.occurrences.length,28);assert.equal(Object.hasOwn(read,'scheduleIssues'),false)
  assert.deepEqual(read.occurrences.map(x=>x.id),created.occurrences.map(x=>x.id))
})
