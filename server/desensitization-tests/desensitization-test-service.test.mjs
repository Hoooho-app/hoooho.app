import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { AccountDataService } from '../account/account-data-service.mjs'
import { DesensitizationTestService, classifyFoodName } from './desensitization-test-service.mjs'

const accountId = 'account-a'
const memberId = 'member-a'
const now = new Date('2026-09-26T02:00:00.000Z')

function dietRecord(id, eventId, occurredAt, foods, extra = {}) {
  return {
    id, accountId, eventId, type: 'journal', occurredAt, createdAt: occurredAt,
    content: foods.join('、'), sourceText: foods.join('和'),
    journal: { categories: ['diet'], diet: { foods, supplementNames: [], amount: extra.amount ?? '', foodForm: extra.preparation ?? '', reactions: extra.reactions ?? [] } }
  }
}

async function fixture(records = []) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-desensitization-'))
  const members = { async findById(id) { return id === memberId ? { id: memberId, accountId } : null } }
  const events = { async findByAccountId(id) { return id === accountId ? [...new Set(records.filter((item)=>item.accountId===id&&!item.eventId.includes('other')).map((item)=>item.eventId))].map((eventId)=>({ id:eventId, memberId, accountId })) : [] } }
  const healthRecords = { async findByAccountId(id) { return records.filter((item) => item.accountId === id) } }
  const service = new DesensitizationTestService({ dataDirectory, members, events, healthRecords })
  return { service, cleanup: () => rm(dataDirectory, { recursive: true, force: true }) }
}

async function startObservation(service, input, operationId = `operation-${input}`) {
  const preview = await service.resolve(accountId, { memberId, input }, now)
  return service.commitResolution(accountId, { memberId, input, selectedTaskIds: preview.selectedTaskIds, resolutionVersion: preview.resolutionVersion, operationId }, now)
}

function observation(index, actualFood) {
  return { status:'effective', symptomAnswer:'absent', exposureAnswer:'eaten', symptoms:[], note:'', actualFood, preparation:'', amount:'', occurredAt:`2026-09-${String(10 + index).padStart(2,'0')}T01:00:00.000Z`, idempotencyKey:`record-${actualFood}-${index}` }
}

test('food classification keeps beef and milk separate and rejects ambiguous 牛', () => {
  assert.deepEqual(classifyFoodName('牛肉'), { categoryKey: 'beef', categoryLabel: '牛肉来源', confidence: 'confirmed' })
  assert.deepEqual(classifyFoodName('牛奶'), { categoryKey: 'cow_milk', categoryLabel: '牛乳来源', confidence: 'confirmed' })
  assert.throws(() => classifyFoodName('牛'), (error) => error.code === 'AMBIGUOUS_FOOD')
  assert.equal(classifyFoodName('鳕鱼').categoryKey, 'custom:鳕鱼')
})

test('suggestions use real last-30-day diet frequency and source links stay member scoped', async (t) => {
  const records = [
    dietRecord('r1', 'event-1', '2026-09-25T01:00:00.000Z', ['牛肉'], { amount: '10g' }),
    dietRecord('r2', 'event-2', '2026-09-24T01:00:00.000Z', ['牛肉']),
    dietRecord('r3', 'event-3', '2026-09-23T01:00:00.000Z', ['牛肉']),
    dietRecord('r4', 'event-4', '2026-09-22T01:00:00.000Z', ['牛肉丸']),
    dietRecord('r5', 'event-other', '2026-09-25T01:00:00.000Z', ['牛肉']),
    dietRecord('r6', 'event-a', '2026-08-01T01:00:00.000Z', ['牛肉'])
  ]
  const { service, cleanup } = await fixture(records); t.after(cleanup)
  const before = await service.list(accountId, memberId, now)
  assert.deepEqual(before.suggestions.map((item) => [item.name, item.count]), [['牛肉', 3]])
  const created = await service.create(accountId, { memberId, displayName: '牛肉' }, now)
  assert.equal(created.task.linkedRecords.find((item) => item.recordId === 'r1')?.relation, 'confirmed')
  assert.equal(created.task.linkedRecords.find((item) => item.recordId === 'r4')?.relation, 'pending')
  assert.equal(created.task.linkedRecords.some((item) => item.recordId === 'r5'), false)
})

test('cross-layer resolution exposes food, source, component and explicit ambiguity without guessing', async (t) => {
  const { service, cleanup } = await fixture(); t.after(cleanup)
  assert.equal((await service.resolve(accountId,{memberId,input:'面包'},now)).entity.type,'food')
  assert.equal((await service.resolve(accountId,{memberId,input:'小麦'},now)).entity.type,'source')
  assert.equal((await service.resolve(accountId,{memberId,input:'牛乳酪蛋白'},now)).entity.type,'component')
  for (const input of ['牛','麸','麦芽','酪蛋白']) {
    const preview=await service.resolve(accountId,{memberId,input},now)
    assert.ok(preview.ambiguity.length>=2,`${input} must not silently pick a scope`)
    assert.equal(preview.entity.type,'unknown')
  }
})

test('bread joins an existing wheat observation as a pending clue without creating an event or duplicate task', async (t) => {
  const { service, cleanup } = await fixture(); t.after(cleanup)
  const wheat=(await startObservation(service,'小麦','start-wheat')).task
  for(let index=0;index<6;index+=1)await service.saveRecord(accountId,wheat.id,observation(index,'馒头'),now)
  const before=await service.store.read()
  const preview=await service.resolve(accountId,{memberId,input:'面包'},now)
  assert.equal(preview.action.mode,'join')
  assert.equal(preview.preview.recordCount,6)
  const committed=await service.commitResolution(accountId,{memberId,input:'面包',selectedTaskIds:preview.selectedTaskIds,resolutionVersion:preview.resolutionVersion,operationId:'join-bread'},now)
  const after=await service.store.read(),listed=await service.list(accountId,memberId,now)
  assert.equal(listed.tasks.length,1)
  assert.equal(committed.task.foodLinks.find((item)=>item.entityId==='food:bread')?.evidenceStatus,'pending')
  assert.equal(committed.task.records.length,6)
  assert.equal(after.records.length,before.records.length,'joining must not fabricate an eating event')
})

test('wheat merge deduplicates only the same source event, preserves food results and plans, and is idempotent and undoable', async (t) => {
  const { service, cleanup } = await fixture(); t.after(cleanup)
  const bun=(await startObservation(service,'馒头','start-bun')).task
  const noodle=(await startObservation(service,'小麦面条','start-noodle')).task
  for(let index=0;index<4;index+=1)await service.saveRecord(accountId,bun.id,observation(index,'馒头'),now)
  for(let index=0;index<3;index+=1)await service.saveRecord(accountId,noodle.id,observation(index,'小麦面条'),now)
  await service.store.update((data)=>{const bunRecords=data.records.filter((item)=>item.taskId===bun.id),noodleRecords=data.records.filter((item)=>item.taskId===noodle.id);return {...data,records:data.records.map((item)=>{const bunIndex=bunRecords.findIndex((record)=>record.id===item.id),noodleIndex=noodleRecords.findIndex((record)=>record.id===item.id);if(bunIndex>=0)return {...item,sourceEventId:`meal-${bunIndex+1}`};if(noodleIndex>=0)return {...item,sourceEventId:`meal-${noodleIndex+4}`};return item})}})
  const plan={sourceType:'caregiver_transcription',sourceName:'原就诊记录',visitDate:'2026-09-01',food:'',preparation:'',firstAmount:'',unit:'',location:'',frequency:'',observationPeriod:'',progressionCondition:'',stopRule:'',reviewDate:''}
  await service.savePlan(accountId,bun.id,{...plan,food:'馒头'},now)
  await service.savePlan(accountId,noodle.id,{...plan,food:'小麦面条'},now)
  const preview=await service.resolve(accountId,{memberId,input:'小麦'},now)
  assert.deepEqual(new Set(preview.selectedTaskIds),new Set([bun.id,noodle.id]))
  assert.equal(preview.preview.recordCount,6)
  assert.equal(preview.preview.deduplicatedCount,1)
  const input={memberId,input:'小麦',selectedTaskIds:preview.selectedTaskIds,resolutionVersion:preview.resolutionVersion,operationId:'merge-wheat'}
  const merged=await service.commitResolution(accountId,input,now)
  assert.equal(merged.task.records.length,6)
  assert.equal(merged.task.mergedFrom.length,2)
  assert.equal(merged.task.mergedPlans.length,2)
  const repeated=await service.commitResolution(accountId,input,now)
  assert.equal(repeated.idempotent,true)
  assert.equal((await service.list(accountId,memberId,now)).tasks.length,1)
  const undone=await service.undoOperation(accountId,'merge-wheat',now)
  assert.equal(undone.tasks.filter((item)=>[bun.id,noodle.id].includes(item.id)).length,2)
  assert.equal(undone.tasks.some((item)=>item.scope.entityId==='source:wheat'),false)
})

test('cow-milk casein reuses the milk entry but keeps component-applicable counts separate', async (t) => {
  const { service, cleanup } = await fixture(); t.after(cleanup)
  const milk=(await startObservation(service,'牛乳','start-milk')).task
  await service.saveRecord(accountId,milk.id,observation(0,'酸奶'),now)
  await service.saveRecord(accountId,milk.id,observation(1,'奶酪'),now)
  const preview=await service.resolve(accountId,{memberId,input:'牛乳酪蛋白'},now)
  assert.equal(preview.action.mode,'join')
  const joined=await service.commitResolution(accountId,{memberId,input:'牛乳酪蛋白',selectedTaskIds:preview.selectedTaskIds,resolutionVersion:preview.resolutionVersion,operationId:'join-casein'},now)
  assert.equal(joined.task.id,milk.id)
  assert.equal(joined.task.componentFocus[0].entityId,'component:cow-milk-casein')
  await service.saveRecord(accountId,milk.id,observation(2,'配料明确的奶酪'),now)
  const task=(await service.list(accountId,memberId,now)).tasks[0]
  assert.equal(task.records.length,3)
  assert.equal(task.associationSummary.componentRecordCounts[0].applicableRecordCount,1,'earlier milk records must not be relabelled as casein-confirmed')
})

test('beef starts from three real historical events and preserves each original occurrence time', async (t) => {
  const sources=[
    dietRecord('beef-1','beef-event-1','2026-09-11T03:00:00.000Z',['牛肉']),
    dietRecord('beef-2','beef-event-2','2026-09-16T04:00:00.000Z',['清蒸牛肉']),
    dietRecord('beef-3','beef-event-3','2026-09-21T05:00:00.000Z',['纯牛肉泥'])
  ]
  const { service, cleanup } = await fixture(sources); t.after(cleanup)
  const preview=await service.resolve(accountId,{memberId,input:'牛肉'},now)
  assert.equal(preview.matches.length,0)
  assert.equal(preview.preview.historyRecordCount,3)
  const committed=await service.commitResolution(accountId,{memberId,input:'牛肉',selectedTaskIds:[],resolutionVersion:preview.resolutionVersion,operationId:'start-beef'},now)
  assert.deepEqual(committed.task.linkedRecords.map((item)=>item.occurredAt).sort(),sources.map((item)=>item.occurredAt).sort())
  assert.equal(committed.task.records.length,0,'history is referenced, not copied into new caregiver observations')
})

test('partial overlap creates a linked component observation without erasing source identity', async (t) => {
  const { service, cleanup } = await fixture(); t.after(cleanup)
  const wheat=(await startObservation(service,'小麦','start-wheat-partial')).task
  const preview=await service.resolve(accountId,{memberId,input:'麸质'},now)
  assert.equal(preview.matches[0].relation,'partial_overlap')
  assert.equal(preview.action.mode,'linked')
  const linked=await service.commitResolution(accountId,{memberId,input:'麸质',selectedTaskIds:[wheat.id],resolutionVersion:preview.resolutionVersion,operationId:'link-gluten'},now)
  assert.notEqual(linked.task.id,wheat.id)
  assert.equal(linked.task.scope.entityId,'component:gluten')
  const listed=await service.list(accountId,memberId,now)
  assert.equal(listed.tasks.some((item)=>item.scope.entityId==='source:wheat'),true)
  assert.equal(listed.tasks.some((item)=>item.scope.entityId==='component:gluten'),true)
})

test('merge undo keeps records added afterwards in a clearly marked target instead of losing or guessing ownership', async (t) => {
  const { service, cleanup } = await fixture(); t.after(cleanup)
  const bun=(await startObservation(service,'馒头','start-bun-later')).task
  const noodle=(await startObservation(service,'小麦面条','start-noodle-later')).task
  const preview=await service.resolve(accountId,{memberId,input:'小麦'},now)
  const merged=await service.commitResolution(accountId,{memberId,input:'小麦',selectedTaskIds:preview.selectedTaskIds,resolutionVersion:preview.resolutionVersion,operationId:'merge-with-later-record'},now)
  const later=await service.saveRecord(accountId,merged.task.id,observation(4,'不确定的面食'),now)
  const undone=await service.undoOperation(accountId,'merge-with-later-record',now)
  const pending=undone.tasks.find((item)=>item.displayName.includes('待整理'))
  assert.ok(pending)
  assert.equal(pending.records.some((item)=>item.id===later.record.id),true)
  assert.equal(undone.tasks.some((item)=>item.id===bun.id),true)
  assert.equal(undone.tasks.some((item)=>item.id===noodle.id),true)
})

test('stale resolve versions and failed history queries stop safely instead of creating from false empty state', async (t) => {
  const { service, cleanup } = await fixture(); t.after(cleanup)
  const wheat=(await startObservation(service,'小麦','start-wheat-conflict')).task
  const preview=await service.resolve(accountId,{memberId,input:'面包'},now)
  await service.updateName(accountId,wheat.id,{displayName:'小麦来源观察',version:wheat.version},now)
  await assert.rejects(service.commitResolution(accountId,{memberId,input:'面包',selectedTaskIds:preview.selectedTaskIds,resolutionVersion:preview.resolutionVersion,operationId:'stale-join'},now),(error)=>error.code==='RESOLUTION_CONFLICT')
  service.healthRecords={async findByAccountId(){throw new Error('history unavailable')}}
  await assert.rejects(service.resolve(accountId,{memberId,input:'牛肉'},now),/history unavailable/)
})

test('association management restores one merged entry and rejects stale versions', async (t) => {
  const { service, cleanup } = await fixture(); t.after(cleanup)
  const bun=(await startObservation(service,'馒头','manage-bun')).task
  const noodle=(await startObservation(service,'小麦面条','manage-noodle')).task
  const preview=await service.resolve(accountId,{memberId,input:'小麦'},now)
  const merged=await service.commitResolution(accountId,{memberId,input:'小麦',selectedTaskIds:preview.selectedTaskIds,resolutionVersion:preview.resolutionVersion,operationId:'manage-merge'},now)
  await assert.rejects(service.manageAssociation(accountId,merged.task.id,{action:'restore-merged',sourceTaskId:bun.id,version:merged.task.version-1},now),(error)=>error.code==='VERSION_CONFLICT')
  const result=await service.manageAssociation(accountId,merged.task.id,{action:'restore-merged',sourceTaskId:bun.id,version:merged.task.version},now)
  assert.equal(result.tasks.some((item)=>item.id===bun.id),true)
  assert.equal(result.task.mergedFrom.some((item)=>item.taskId===bun.id),false)
  assert.equal(result.task.mergedFrom.some((item)=>item.taskId===noodle.id),true)
})

test('legacy tasks with missing relationship fields stay readable and resolve through the compatibility scope', async (t) => {
  const { service, cleanup } = await fixture(); t.after(cleanup)
  await service.store.update((data)=>({...data,tasks:[{id:'legacy-wheat',accountId,memberId,displayName:'旧小麦观察',categoryKey:'wheat',categoryLabel:'小麦类',confidence:'confirmed',status:'active',version:1,progressionPaused:false,createdAt:now.toISOString(),updatedAt:now.toISOString()}]}))
  const listed=await service.list(accountId,memberId,now)
  assert.equal(listed.tasks[0].scope.entityId,'source:wheat')
  assert.deepEqual(listed.tasks[0].foodLinks,[])
  assert.deepEqual(listed.tasks[0].componentFocus,[])
  const preview=await service.resolve(accountId,{memberId,input:'小麦'},now)
  assert.equal(preview.action.mode,'continue')
  assert.equal(preview.selectedTaskIds[0],'legacy-wheat')
})

test('when legacy data contains archived and active copies, exact active scope wins without restoring a duplicate', async (t) => {
  const { service, cleanup } = await fixture(); t.after(cleanup)
  const active=(await startObservation(service,'小麦','active-wheat')).task
  await service.store.update((data)=>({...data,tasks:[...data.tasks,{...structuredClone(data.tasks[0]),id:'archived-copy',status:'archived',version:4,archivedAt:now.toISOString(),displayName:'归档小麦'}]}))
  const preview=await service.resolve(accountId,{memberId,input:'小麦'},now)
  assert.equal(preview.selectedTaskIds[0],active.id)
  assert.equal(preview.action.mode,'continue')
})

test('same-category tasks do not duplicate and archived tasks are returned for an explicit restore choice', async (t) => {
  const { service, cleanup } = await fixture(); t.after(cleanup)
  const first = await service.create(accountId, { memberId, displayName: '牛肉' }, now)
  const duplicate = await service.create(accountId, { memberId, displayName: '牛肉泥' }, now)
  assert.equal(duplicate.existing, true)
  assert.equal(duplicate.task.id, first.task.id)
  const archivedTask = await service.mutateTask(accountId, first.task.id, 'archive', now, first.task.version)
  const archived = await service.create(accountId, { memberId, displayName: '炖牛肉' }, now)
  assert.equal(archived.task.status, 'archived')
  await assert.rejects(service.mutateTask(accountId, first.task.id, 'restore', now, first.task.version), (error) => error.code === 'VERSION_CONFLICT')
  await service.mutateTask(accountId, first.task.id, 'restore', now, archivedTask.version)
  assert.equal((await service.list(accountId, memberId, now)).tasks[0].status, 'active')
})

test('effective records require two explicit answers, support symptom without exposure, and preserve pause state', async (t) => {
  const { service, cleanup } = await fixture(); t.after(cleanup)
  const { task } = await service.create(accountId, { memberId, displayName: '鸡蛋' }, now)
  await assert.rejects(service.saveRecord(accountId, task.id, { status: 'effective', symptomAnswer: null, exposureAnswer: null, symptoms: [], note: '', actualFood: '', preparation: '', amount: '', occurredAt: now.toISOString() }, now), (error) => error.code === 'INCOMPLETE_OBSERVATION')
  await assert.rejects(service.saveRecord(accountId, task.id, { status: 'effective', symptomAnswer: 'absent', exposureAnswer: 'eaten', symptoms: [], note: '', actualFood: '', preparation: '', amount: '', occurredAt: '2026-09-27T00:00:00.000Z' }, now), (error) => error.code === 'FUTURE_OCCURRED_AT')
  const input = { status: 'effective', symptomAnswer: 'present', exposureAnswer: 'not_eaten', symptoms: ['红疹'], note: '', actualFood: '', preparation: '', amount: '', occurredAt: '2026-09-25T01:00:00.000Z', idempotencyKey: 'same-submit' }
  const first = await service.saveRecord(accountId, task.id, input, now)
  const repeated = await service.saveRecord(accountId, task.id, input, now)
  assert.equal(first.idempotent, false)
  assert.equal(repeated.idempotent, true)
  let listed = await service.list(accountId, memberId, now)
  assert.equal(listed.tasks[0].records.length, 1)
  assert.equal(listed.tasks[0].progressionPaused, true)
  assert.equal(listed.tasks[0].trend.at(-2).state, 'symptom')
  const updated = await service.updateRecord(accountId, task.id, first.record.id, { ...input, symptomAnswer: 'absent', symptoms: [], version: first.record.version }, now)
  listed = await service.list(accountId, memberId, now)
  assert.equal(listed.tasks[0].progressionPaused, true, 'ordinary edits must not resume progression')
  await service.undoRecordUpdate(accountId, task.id, first.record.id, updated.version, now)
  assert.equal((await service.list(accountId, memberId, now)).tasks[0].records[0].symptomAnswer, 'present')
  await assert.rejects(service.undoRecordUpdate(accountId, task.id, first.record.id, updated.version, now), (error) => error.code === 'UNDO_CONFLICT')
  const incompletePlan = { sourceType: 'caregiver_transcription', sourceName: '某医院', visitDate: '2026-09-20', food: '熟鸡蛋', preparation: '', firstAmount: '', unit: '', location: '', frequency: '', observationPeriod: '', progressionCondition: '', stopRule: '', reviewDate: '', resumeProgression: true }
  await service.savePlan(accountId, task.id, incompletePlan, now)
  assert.equal((await service.list(accountId, memberId, now)).tasks[0].progressionPaused, true)
  await service.savePlan(accountId, task.id, { ...incompletePlan, firstAmount: '1', unit: '克', location: '医院', observationPeriod: '2小时', stopRule: '出现症状即停止并按医生安排处理' }, now)
  assert.equal((await service.list(accountId, memberId, now)).tasks[0].progressionPaused, false)
})

test('drafts and withdrawn records do not become false all-clear days; delete supports undo without touching sources', async (t) => {
  const sources = [dietRecord('source-1', 'event-a', '2026-09-25T01:00:00.000Z', ['花生'])]
  const { service, cleanup } = await fixture(sources); t.after(cleanup)
  const { task } = await service.create(accountId, { memberId, displayName: '花生' }, now)
  const draft = await service.saveRecord(accountId, task.id, { status: 'draft', symptomAnswer: null, exposureAnswer: null, symptoms: [], note: '待补', actualFood: '', preparation: '', amount: '', occurredAt: '2026-09-25T02:00:00.000Z' }, now)
  let listed = await service.list(accountId, memberId, now)
  assert.equal(listed.tasks[0].trend.at(-2).state, 'unknown')
  const effective = await service.saveRecord(accountId, task.id, { status: 'effective', symptomAnswer: 'absent', exposureAnswer: 'eaten', symptoms: [], note: '', actualFood: '花生', preparation: '', amount: '', occurredAt: '2026-09-25T03:00:00.000Z' }, now)
  await service.withdrawRecord(accountId, task.id, effective.record.id, effective.record.version, now)
  listed = await service.list(accountId, memberId, now)
  assert.equal(listed.tasks[0].trend.at(-2).state, 'unknown')
  assert.equal(listed.tasks[0].records[0].id, draft.record.id)
  const deleted = await service.mutateTask(accountId, task.id, 'delete', now)
  assert.equal((await service.list(accountId, memberId, now)).tasks.length, 0)
  await service.mutateTask(accountId, deleted.id, 'undo-delete', now)
  listed = await service.list(accountId, memberId, now)
  assert.equal(listed.tasks.length, 1)
  assert.equal(listed.tasks[0].linkedRecords[0].recordId, 'source-1')
})

test('member ownership is enforced for every list entry point', async (t) => {
  const { service, cleanup } = await fixture(); t.after(cleanup)
  await assert.rejects(service.list('other-account', memberId, now), (error) => error.code === 'MEMBER_NOT_FOUND')
  await assert.rejects(service.create('other-account', { memberId, displayName: '牛奶' }, now), (error) => error.code === 'MEMBER_NOT_FOUND')
})

test('guest registration merge carries both tasks and records into the registered account', async (t) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-desensitization-merge-')); t.after(() => rm(dataDirectory, { recursive: true, force: true }))
  const data = new AccountDataService({ dataDirectory })
  await data.store('desensitization-tests.json', 'tasks').update((value) => ({ ...value, tasks: [{ id: 'task-guest', accountId: 'guest:one' }] }))
  await data.store('desensitization-tests.json', 'records').update((value) => ({ ...value, records: [{ id: 'record-guest', accountId: 'guest:one' }] }))
  const merged = await data.mergeGuest('guest:one', 'registered-one', now)
  assert.equal(merged.merged, true)
  const stored = await data.store('desensitization-tests.json', 'tasks').read()
  assert.equal(stored.tasks[0].accountId, 'registered-one')
  assert.equal(stored.records[0].accountId, 'registered-one')
})
