import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { JsonStore } from '../auth/storage/json-store.mjs'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { HealthEventRepository } from '../events/repositories/health-event-repository.mjs'
import { HealthEventRecordRepository } from '../events/repositories/health-event-record-repository.mjs'
import { FOOD_KNOWLEDGE_VERSION, displayNameForEntity, legacyScope, normalizeFoodInput, relationBetween, relationForFoodName, resolveEntity } from './food-relationship-knowledge.mjs'

const dayMs = 86_400_000
const statuses = new Set(['active', 'archived'])
const symptomAnswers = new Set(['present', 'absent'])
const exposureAnswers = new Set(['eaten', 'not_eaten'])
const symptomCatalog = new Set(['红疹', '瘙痒', '风团', '肿胀', '腹痛', '呕吐', '腹泻', '便血', '咳嗽', '喘鸣', '呼吸困难', '喉咙紧'])
const severeSymptoms = new Set(['呼吸困难', '喉咙紧'])

const normalizeName = normalizeFoodInput
const sourceKey = (entityId) => ({ 'source:beef':'beef', 'source:cow-milk':'cow_milk', 'source:egg':'egg', 'source:wheat':'wheat', 'source:peanut':'peanut', 'source:soy':'soy' }[entityId] ?? entityId)

export class DesensitizationTestError extends Error {
  constructor(message, status = 400, code = 'DESENSITIZATION_TEST_ERROR', details) {
    super(message); this.status = status; this.code = code; if (details) this.details = details
  }
}

export function classifyFoodName(rawName) {
  const name = normalizeName(rawName)
  if (!name) throw new DesensitizationTestError('请输入食物名称', 400, 'EMPTY_FOOD_NAME')
  const resolution=resolveEntity(name)
  if (resolution.ambiguity.length) throw new DesensitizationTestError('请先选择更明确的范围，或按原名待核实', 422, 'AMBIGUOUS_FOOD', { choices: resolution.ambiguity.map((item)=>item.label) })
  const entity=resolution.entity
  return { categoryKey:sourceKey(entity.id), categoryLabel:entity.categoryLabel, confidence:entity.confidence }
}

function cleanText(value, limit, required = false) {
  const text = typeof value === 'string' ? value.trim() : ''
  if ((required && !text) || text.length > limit) throw new DesensitizationTestError(required ? '请填写完整信息' : '填写内容过长')
  return text
}

function localDateKey(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function validOccurredAt(value, now) {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) throw new DesensitizationTestError('请填写发生或观察时间', 400, 'INVALID_OCCURRED_AT')
  if (date.getTime() > now.getTime()) throw new DesensitizationTestError('发生或观察时间不能晚于现在', 400, 'FUTURE_OCCURRED_AT')
  return date.toISOString()
}

function normalizeRecord(input, now, previous = null) {
  const status = input?.status === 'draft' ? 'draft' : 'effective'
  const symptomAnswer = symptomAnswers.has(input?.symptomAnswer) ? input.symptomAnswer : null
  const exposureAnswer = exposureAnswers.has(input?.exposureAnswer) ? input.exposureAnswer : null
  const symptoms = [...new Set((Array.isArray(input?.symptoms) ? input.symptoms : []).map(String).filter((item) => symptomCatalog.has(item)))]
  const note = cleanText(input?.note, 1000)
  if (status === 'effective' && (!symptomAnswer || !exposureAnswer)) throw new DesensitizationTestError('请分别选择症状情况和是否吃过', 400, 'INCOMPLETE_OBSERVATION')
  if (symptomAnswer === 'present' && !symptoms.length && !note) throw new DesensitizationTestError('请选择具体症状，或补充其他表现', 400, 'MISSING_SYMPTOM_DETAIL')
  return {
    ...(previous ?? {}), status, symptomAnswer, exposureAnswer,
    symptoms: symptomAnswer === 'present' ? symptoms : [], note,
    actualFood: cleanText(input?.actualFood, 120), preparation: cleanText(input?.preparation, 120), amount: cleanText(input?.amount, 80),
    occurredAt: validOccurredAt(input?.occurredAt, now),
    source: 'caregiver_record', idempotencyKey: cleanText(input?.idempotencyKey, 180),
    withdrawnAt: null
  }
}

function normalizePlan(input, nextVersion, now) {
  const sourceType = input?.sourceType === 'verified_source' ? 'verified_source' : 'caregiver_transcription'
  const fields = {
    sourceType, sourceName: cleanText(input?.sourceName, 160), visitDate: cleanText(input?.visitDate, 10),
    food: cleanText(input?.food, 120), preparation: cleanText(input?.preparation, 160),
    firstAmount: cleanText(input?.firstAmount, 40), unit: cleanText(input?.unit, 30),
    location: cleanText(input?.location, 120), frequency: cleanText(input?.frequency, 120),
    observationPeriod: cleanText(input?.observationPeriod, 160), progressionCondition: cleanText(input?.progressionCondition, 500),
    stopRule: cleanText(input?.stopRule, 500), reviewDate: cleanText(input?.reviewDate, 10)
  }
  const complete = Boolean(fields.sourceName && fields.food && fields.firstAmount && fields.unit && fields.location && fields.observationPeriod && fields.stopRule)
  return { id: randomUUID(), version: nextVersion, ...fields, complete, createdAt: now.toISOString() }
}

function recordFoods(record) {
  const diet = record.journal?.diet
  if (!record.journal?.categories?.includes('diet') || !diet) return []
  return [...new Set((diet.foods ?? []).map(normalizeName).filter(Boolean))]
}

function taskScope(task) {
  const entity=legacyScope(task)
  return task.scope ?? { entityId:entity.id, entityType:entity.type, label:entity.label, sourceIds:entity.sourceIds, originalInput:task.displayName, knowledgeVersion:FOOD_KNOWLEDGE_VERSION }
}

function baseTask({accountId,memberId,entity,originalInput,now,id=randomUUID()}) {
  const timestamp=now.toISOString()
  return { id,accountId,memberId,displayName:displayNameForEntity(entity),categoryKey:sourceKey(entity.id),categoryLabel:entity.categoryLabel,confidence:entity.confidence,status:'active',version:1,scope:{entityId:entity.id,entityType:entity.type,label:entity.label,sourceIds:entity.sourceIds,originalInput,knowledgeVersion:FOOD_KNOWLEDGE_VERSION},foodLinks:entity.type==='food'?[{entityId:entity.id,label:entity.label,evidenceStatus:'confirmed',evidenceSource:'knowledge',brand:'',formula:'',validFrom:timestamp,validTo:null,addedAt:timestamp}]:[],componentFocus:entity.type==='component'?[{entityId:entity.id,label:entity.label,addedAt:timestamp}]:[],mergedFrom:[],relatedTaskIds:[],planVersions:[],mergedPlans:[],progressionPaused:false,archivedAt:null,deletedAt:null,createdAt:timestamp,updatedAt:timestamp }
}

function uniqueBy(items,key) { const seen=new Set(); return items.filter((item)=>{const value=key(item);if(seen.has(value))return false;seen.add(value);return true}) }

function linkedRecordsFor(task,memberRecords) {
  const entity=legacyScope(task), linked=[]
  for(const record of memberRecords) {
    const foods=recordFoods(record), matched=foods.map((food)=>({food,relation:relationForFoodName(food,entity)})).filter((item)=>item.relation)
    if(!matched.length)continue
    linked.push({recordId:record.id,eventId:record.eventId,occurredAt:record.occurredAt,sourceText:record.sourceText,content:record.content,foods,amount:record.journal?.diet?.amount??'',preparation:record.journal?.diet?.foodForm??'',reactions:record.journal?.diet?.reactions??[],relation:matched.some((item)=>item.relation==='confirmed')?'confirmed':'pending',matchedFoods:matched.map((item)=>item.food)})
  }
  return uniqueBy(linked,(item)=>item.eventId||item.recordId)
}

function resolutionFingerprint(resolution,tasks) {
  return [FOOD_KNOWLEDGE_VERSION,resolution.entity?.id??'',...tasks.map((task)=>`${task.id}:${task.version}`).sort()].join('|')
}

export class DesensitizationTestService {
  constructor(options = {}) {
    this.store = new JsonStore(path.join(options.dataDirectory, 'desensitization-tests.json'), { tasks: [], records: [] })
    this.members = options.members ?? new FamilyMemberRepository(options.dataDirectory)
    this.events = options.events ?? new HealthEventRepository(options.dataDirectory)
    this.healthRecords = options.healthRecords ?? new HealthEventRecordRepository(options.dataDirectory)
  }

  async assertMember(accountId, memberId) {
    const member = await this.members.findById(memberId)
    if (!member || member.accountId !== accountId) throw new DesensitizationTestError('未找到当前记录对象', 404, 'MEMBER_NOT_FOUND')
    return member
  }

  async owned(accountId, id, includeDeleted = false) {
    const data = await this.store.read()
    const task = data.tasks.find((item) => item.id === id && item.accountId === accountId && (includeDeleted || item.status !== 'deleted'))
    if (!task) throw new DesensitizationTestError('未找到这项排敏测试', 404, 'DESENSITIZATION_TEST_NOT_FOUND')
    return task
  }

  async healthContext(accountId, memberId, now) {
    const [events, records] = await Promise.all([this.events.findByAccountId(accountId), this.healthRecords.findByAccountId(accountId)])
    const eventIds = new Set(events.filter((item) => item.memberId === memberId).map((item) => item.id))
    const memberRecords = records.filter((item) => eventIds.has(item.eventId))
    const cutoff = now.getTime() - 30 * dayMs
    const foodStats = new Map(), seenEvents = new Set()
    for (const record of memberRecords) {
      if (Date.parse(record.occurredAt) < cutoff) continue
      for (const food of recordFoods(record)) {
        const eventKey=`${record.eventId||record.id}:${food}`
        if(seenEvents.has(eventKey))continue
        seenEvents.add(eventKey)
        const previous = foodStats.get(food) ?? { name: food, count: 0, latestAt: '' }
        previous.count += 1; if (record.occurredAt > previous.latestAt) previous.latestAt = record.occurredAt
        foodStats.set(food, previous)
      }
    }
    const suggestions = [...foodStats.values()].filter((item) => item.count >= 3).sort((a, b) => b.count - a.count || b.latestAt.localeCompare(a.latestAt)).slice(0, 4)
    return { memberRecords, suggestions }
  }

  async publicTask(data, task, memberRecords, timeZone, now) {
    const records = uniqueBy(data.records.filter((item) => item.taskId === task.id && !item.withdrawnAt).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.createdAt.localeCompare(a.createdAt)),(item)=>item.sourceEventId?`event:${item.sourceEventId}`:`record:${item.id}`)
    const linkedRecords = linkedRecordsFor(task,memberRecords)
    const trend = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now.getTime() - (6 - index) * dayMs); const day = localDateKey(date, timeZone)
      const items = records.filter((item) => item.status === 'effective' && localDateKey(new Date(item.occurredAt), timeZone) === day)
      const state = items.some((item) => item.symptomAnswer === 'present') ? 'symptom' : items.length && items.every((item) => item.symptomAnswer === 'absent') ? 'clear' : 'unknown'
      return { day, state, recordIds: items.map((item) => item.id) }
    })
    const effective = records.filter((item) => item.status === 'effective')
    const latest = effective[0] ?? null
    let consecutiveClear = 0
    for (const item of effective) { if (item.symptomAnswer !== 'absent') break; consecutiveClear += 1 }
    const latestSummary = !latest ? '还没有观察记录' : latest.symptomAnswer === 'present' ? `${localDateKey(new Date(latest.occurredAt), timeZone)}记录症状` : `最近${consecutiveClear}次未见症状`
    const plans=task.planVersions??[], mergedPlans=task.mergedPlans??[]
    const nextStep = task.progressionPaused ? '已暂停进阶，请按已有安排处理并联系医疗团队' : mergedPlans.length ? '查看各食品原有安排；合并不会生成统一剂量' : latest?.symptomAnswer === 'present' ? '查看这次记录与处理经过' : trend.filter((item) => item.state === 'unknown').length >= 3 ? '看看哪些日期资料不足' : plans.at(-1)?.reviewDate ? `${plans.at(-1).reviewDate} 按已录入安排复评` : '查看变化与下一步'
    const scope=taskScope(task), foodLinks=task.foodLinks??[], componentFocus=task.componentFocus??[], mergedFrom=task.mergedFrom??[]
    const componentRecordCounts=componentFocus.map((focus)=>{const entity=resolveEntity(focus.label).entity,componentLinks=entity?.type==='component'?linkedRecordsFor({scope:{entityId:entity.id,entityType:entity.type,label:entity.label,sourceIds:entity.sourceIds,originalInput:focus.label,knowledgeVersion:FOOD_KNOWLEDGE_VERSION},displayName:focus.label},memberRecords).filter((item)=>item.relation==='confirmed'):[];const keys=[...records.filter((item)=>item.status==='effective'&&item.focusEntityIds?.includes(focus.entityId)).map((item)=>`observation:${item.sourceEventId??item.id}`),...componentLinks.map((item)=>`health:${item.eventId||item.recordId}`)];return {entityId:focus.entityId,label:focus.label,applicableRecordCount:new Set(keys).size}})
    const confirmedKeys=new Set([...records.filter((item)=>item.status==='effective').map((item)=>`observation:${item.sourceEventId??item.id}`),...linkedRecords.filter((item)=>item.relation==='confirmed').map((item)=>`health:${item.eventId||item.recordId}`)])
    const pendingKeys=new Set([...linkedRecords.filter((item)=>item.relation==='pending').map((item)=>`health:${item.eventId||item.recordId}`),...foodLinks.filter((item)=>item.evidenceStatus==='pending').map((item)=>`association:${item.entityId}`)])
    return { ...task, scope,foodLinks,componentFocus,mergedFrom,mergedPlans,relatedTaskIds:task.relatedTaskIds??[], records, linkedRecords, trend, suggestions: undefined, latestSummary, nextStep, currentPlan: plans.at(-1) ?? null, associationSummary:{foods:foodLinks.map((item)=>item.label),components:componentFocus.map((item)=>item.label),mergedSources:mergedFrom.map((item)=>item.displayName),confirmedRecordCount:confirmedKeys.size,pendingRecordCount:pendingKeys.size,componentRecordCounts} }
  }

  async list(accountId, memberId, now = new Date(), timeZone = 'Asia/Shanghai') {
    await this.assertMember(accountId, memberId)
    const [data, context] = await Promise.all([this.store.read(), this.healthContext(accountId, memberId, now)])
    const tasks = await Promise.all(data.tasks.filter((item) => item.accountId === accountId && item.memberId === memberId && !['deleted','merged'].includes(item.status)).map((task) => this.publicTask(data, task, context.memberRecords, timeZone, now)))
    const redirects=data.tasks.filter((item)=>item.accountId===accountId&&item.memberId===memberId&&item.status==='merged'&&item.mergedInto).map((item)=>({taskId:item.id,targetTaskId:item.mergedInto,filterLabel:item.displayName}))
    return { tasks, suggestions: context.suggestions, redirects }
  }

  async resolve(accountId, input, now = new Date(), timeZone = 'Asia/Shanghai') {
    const memberId=cleanText(input?.memberId,180,true); await this.assertMember(accountId,memberId)
    const originalInput=normalizeName(input?.input)
    if(!originalInput)throw new DesensitizationTestError('请输入想观察的食物或成分',400,'EMPTY_FOOD_NAME')
    const resolution=resolveEntity(originalInput,cleanText(input?.focusId,180))
    const [data,context]=await Promise.all([this.store.read(),this.healthContext(accountId,memberId,now)])
    const candidates=data.tasks.filter((task)=>task.accountId===accountId&&task.memberId===memberId&&!['deleted','merged'].includes(task.status))
    const publicCandidates=await Promise.all(candidates.map((task)=>this.publicTask(data,task,context.memberRecords,timeZone,now)))
    const rank={same:0,component_focus:1,shared_source:2,partial_overlap:3,possible:4}
    const matches=publicCandidates.map((task)=>{const relation=relationBetween(resolution.entity,task);if(!relation)return null;const explicit=task.linkedRecords.filter((item)=>item.relation==='confirmed').length;const pending=task.linkedRecords.filter((item)=>item.relation==='pending').length;return {taskId:task.id,displayName:task.displayName,status:task.status,version:task.version,relation:relation.kind,certainty:relation.certainty,reason:relation.reason,recordCount:uniqueBy([...task.records.map((item)=>({key:item.sourceEventId??item.id})),...task.linkedRecords.map((item)=>({key:`${item.eventId}:${item.recordId}`}))],(item)=>item.key).length,confirmedRecordCount:explicit,pendingRecordCount:pending,scope:task.scope}}).filter(Boolean).sort((a,b)=>rank[a.relation]-rank[b.relation]||(a.status==='active'?-1:1))
    const requested=Array.isArray(input?.selectedTaskIds)?new Set(input.selectedTaskIds.map(String)):null
    let selected=requested?[...requested].filter((id)=>matches.some((item)=>item.taskId===id)):[]
    if(!requested) {
      const exactActive=matches.find((item)=>item.relation==='same'&&item.status==='active')
      const exactArchived=matches.find((item)=>item.relation==='same'&&item.status==='archived')
      if(exactActive)selected=[exactActive.taskId]
      else if(resolution.entity.type==='source'&&matches.filter((item)=>item.relation==='shared_source'&&item.certainty==='confirmed').length)selected=matches.filter((item)=>item.relation==='shared_source'&&item.certainty==='confirmed').map((item)=>item.taskId)
      else if(matches.find((item)=>item.relation==='component_focus'&&item.status==='active'))selected=[matches.find((item)=>item.relation==='component_focus'&&item.status==='active').taskId]
      else if(exactArchived)selected=[exactArchived.taskId]
      else if(matches.length===1)selected=[matches[0].taskId]
    }
    const sameScope=matches.find((item)=>item.relation==='same'&&item.status==='active')??matches.find((item)=>item.relation==='same')
    if(sameScope&&!selected.includes(sameScope.taskId))selected=[sameScope.taskId]
    const selectedMatches=matches.filter((item)=>selected.includes(item.taskId))
    const historyTask={displayName:resolution.entity.label,categoryKey:sourceKey(resolution.entity.id),scope:{entityId:resolution.entity.id,entityType:resolution.entity.type,label:resolution.entity.label,sourceIds:resolution.entity.sourceIds,originalInput,knowledgeVersion:FOOD_KNOWLEDGE_VERSION}}
    const history=linkedRecordsFor(historyTask,context.memberRecords)
    const selectedTasks=publicCandidates.filter((task)=>selected.includes(task.id))
    const allRecordKeys=[...history.map((item)=>({key:`health:${item.eventId||item.recordId}`,relation:item.relation})),...selectedTasks.flatMap((task)=>task.linkedRecords.map((item)=>({key:`health:${item.eventId||item.recordId}`,relation:item.relation}))),...selectedTasks.flatMap((task)=>task.records.filter((item)=>item.status==='effective').map((item)=>({key:`observation:${item.sourceEventId??item.id}`,relation:'confirmed'})))]
    const deduped=uniqueBy(allRecordKeys,(item)=>item.key)
    const exact=selectedMatches.find((item)=>item.relation==='same')
    let mode='new',label='开始观察',targetName=displayNameForEntity(resolution.entity),description=history.length?`将沿用 ${history.length} 条历史健康随记的原发生时间。`:'尚无相关观察，可从现在开始。'
    if(exact?.status==='active'){mode='continue';label='继续已有观察';targetName=exact.displayName;description='观察范围相同，不会创建重复任务。'}
    else if(exact?.status==='archived'){mode='restore';label='恢复并加入观察';targetName=exact.displayName;description='恢复原观察并保留原有记录和归档历史。'}
    else if(selectedMatches.length&&resolution.entity.type==='source'&&selectedMatches.every((item)=>item.relation==='shared_source'&&item.certainty==='confirmed')){mode='merge';label=`合并为「${targetName}」`;description=`合并 ${selectedMatches.length} 项观察，原食品、结果和医生安排分别保留。`}
    else if(selectedMatches.length>1&&selectedMatches.every((item)=>['same','shared_source'].includes(item.relation))){mode='merge';label=`合并为「${targetName}」`;description=`合并 ${selectedMatches.length} 项观察，相同源事件只计一次。`}
    else if(selectedMatches.length===1&&selectedMatches[0].relation==='component_focus'){mode='join';label=`加入「${selectedMatches[0].displayName}」观察`;targetName=selectedMatches[0].displayName;description=`沿用来源观察，本次增加“${resolution.entity.label}”成分关注。`}
    else if(selectedMatches.length===1&&selectedMatches[0].relation==='possible'){mode='join';label=`加入「${selectedMatches[0].displayName}」观察`;targetName=selectedMatches[0].displayName;description='实际配料尚未明确，本次只加入待核实线索。'}
    else if(selectedMatches.length===1&&selectedMatches[0].relation==='partial_overlap'){mode='linked';label='建立关联观察';description='只引用适用记录，原观察范围保持不变。'}
    else if(selectedMatches.length===1&&selectedMatches[0].relation==='shared_source'){mode='join';label=`加入「${selectedMatches[0].displayName}」观察`;targetName=selectedMatches[0].displayName;description='共用明确来源，保留具体食品与原有结果。'}
    const fingerprint=resolutionFingerprint(resolution,candidates)
    const associationPending=mode==='join'&&selectedMatches[0]?.relation==='possible'?1:0
    return {originalInput,entity:resolution.entity,ambiguity:resolution.ambiguity,knowledgeVersion:resolution.knowledgeVersion,resolutionVersion:fingerprint,matches,selectedTaskIds:selected,historyRecords:history,expectedVersions:Object.fromEntries(matches.map((item)=>[item.taskId,item.version])),action:{mode,label,targetName,description,canObserveSeparately:!exact&&(['possible','partial_overlap'].includes(selectedMatches[0]?.relation)||resolution.entity.type==='unknown')},preview:{selectedCount:selectedMatches.length,recordCount:deduped.length,confirmedRecordCount:deduped.filter((item)=>item.relation==='confirmed').length,pendingRecordCount:deduped.filter((item)=>item.relation==='pending').length+associationPending,deduplicatedCount:allRecordKeys.length-deduped.length,historyRecordCount:history.length}}
  }

  async commitResolution(accountId,input,now=new Date(),timeZone='Asia/Shanghai') {
    const memberId=cleanText(input?.memberId,180,true), operationId=cleanText(input?.operationId,180,true)
    await this.assertMember(accountId,memberId)
    const existingData=await this.store.read(), existingOperation=(existingData.operations??[]).find((item)=>item.accountId===accountId&&item.memberId===memberId&&item.id===operationId)
    if(existingOperation){const listed=await this.list(accountId,memberId,now,timeZone),task=listed.tasks.find((item)=>item.id===existingOperation.targetTaskId);if(!task)throw new DesensitizationTestError('处理已保存，但观察列表需要刷新',409,'RESULT_REFRESH_REQUIRED');return {task,operationId:existingOperation.id,undoable:!existingOperation.undoneAt,idempotent:true,message:'本次关联操作已处理'}}
    const preview=await this.resolve(accountId,input,now,timeZone)
    if(input?.resolutionVersion&&input.resolutionVersion!==preview.resolutionVersion)throw new DesensitizationTestError('已有观察刚刚发生变化，请核对更新后的结果',409,'RESOLUTION_CONFLICT')
    let taskId='',operation=null,idempotent=false,message=''
    await this.store.update((data)=>{
      const existingOperation=(data.operations??[]).find((item)=>item.accountId===accountId&&item.memberId===memberId&&item.id===operationId)
      if(existingOperation){taskId=existingOperation.targetTaskId;operation=existingOperation;idempotent=true;return data}
      const selected=(preview.selectedTaskIds??[]).map((id)=>data.tasks.find((task)=>task.id===id&&task.accountId===accountId&&task.memberId===memberId&&!['deleted','merged'].includes(task.status))).filter(Boolean)
      for(const task of selected){if(preview.expectedVersions[task.id]!==task.version)throw new DesensitizationTestError('观察任务已在其他位置更新，请刷新后重试',409,'VERSION_CONFLICT')}
      const timestamp=now.toISOString(), entity=preview.entity, mode=input?.separate===true?'new':preview.action.mode
      if(mode==='continue'){taskId=selected[0].id;message='已打开已有观察';return data}
      let tasks=[...data.tasks],records=[...data.records],target=null,createdTarget=false
      const beforeTasks=selected.map((task)=>structuredClone(task)),recordAssignments=[]
      if(mode==='new'||mode==='linked'){
        const duplicate=tasks.find((task)=>task.accountId===accountId&&task.memberId===memberId&&task.status==='active'&&taskScope(task).entityId===entity.id)
        if(duplicate){target=duplicate;message='已沿用刚刚创建的同范围观察'}else{target=baseTask({accountId,memberId,entity,originalInput:preview.originalInput,now});target.relatedTaskIds=mode==='linked'?selected.map((task)=>task.id):[];tasks.push(target);createdTarget=true;message=preview.preview.historyRecordCount?`已开始观察，并沿用 ${preview.preview.historyRecordCount} 条历史记录`:'已开始观察'}
      } else if(mode==='restore'){
        target={...selected[0],status:'active',archivedAt:null,updatedAt:timestamp,version:selected[0].version+1};tasks=tasks.map((item)=>item.id===target.id?target:item);message='已恢复原观察并保留全部关联'
      } else if(mode==='join'){
        const source=selected[0],relation=relationBetween(entity,source)
        const foodLinks=[...(source.foodLinks??[])],componentFocus=[...(source.componentFocus??[])]
        if(relation?.kind==='component_focus'&&!componentFocus.some((item)=>item.entityId===entity.id))componentFocus.push({entityId:entity.id,label:entity.label,addedAt:timestamp})
        else if(!foodLinks.some((item)=>item.entityId===entity.id))foodLinks.push({entityId:entity.id,label:entity.label,evidenceStatus:relation?.certainty==='confirmed'?'confirmed':'pending',evidenceSource:'knowledge',brand:'',formula:'',validFrom:timestamp,validTo:null,addedAt:timestamp})
        target={...source,foodLinks,componentFocus,updatedAt:timestamp,version:source.version+1};tasks=tasks.map((item)=>item.id===target.id?target:item);message=relation?.kind==='component_focus'?`已在“${source.displayName}”中加入${entity.label}关注`:`已加入“${source.displayName}”，配料状态单独保留`
      } else if(mode==='merge'){
        target=selected.find((task)=>taskScope(task).entityId===entity.id)??baseTask({accountId,memberId,entity,originalInput:preview.originalInput,now})
        createdTarget=!selected.some((task)=>task.id===target.id); if(createdTarget)tasks.push(target)
        const sources=selected.filter((task)=>task.id!==target.id)
        target={...target,displayName:displayNameForEntity(entity),scope:{entityId:entity.id,entityType:entity.type,label:entity.label,sourceIds:entity.sourceIds,originalInput:preview.originalInput,knowledgeVersion:FOOD_KNOWLEDGE_VERSION},mergedFrom:[...(target.mergedFrom??[]),...sources.map((task)=>({taskId:task.id,displayName:task.displayName,previousStatus:task.status,scope:taskScope(task),mergedAt:timestamp}))],mergedPlans:[...(target.mergedPlans??[]),...sources.flatMap((task)=>(task.planVersions??[]).map((plan)=>({sourceTaskId:task.id,sourceDisplayName:task.displayName,plan})))],progressionPaused:Boolean(target.progressionPaused||sources.some((task)=>task.progressionPaused)),updatedAt:timestamp,version:target.version+(createdTarget?0:1)}
        tasks=tasks.map((item)=>item.id===target.id?target:sources.some((source)=>source.id===item.id)?{...item,status:'merged',mergedInto:target.id,previousStatus:item.status,updatedAt:timestamp,version:item.version+1}:item)
        records=records.map((record)=>{if(!sources.some((task)=>task.id===record.taskId))return record;recordAssignments.push({recordId:record.id,taskId:record.taskId});return {...record,originTaskId:record.originTaskId??record.taskId,taskId:target.id,updatedAt:timestamp,version:(record.version??1)+1}})
        message=`已合并 ${selected.length} 项观察，保留 ${preview.preview.recordCount} 条去重记录`
      }
      taskId=target.id
      const affectedIds=new Set([target.id,...selected.map((task)=>task.id)]),postVersions=Object.fromEntries(tasks.filter((task)=>affectedIds.has(task.id)).map((task)=>[task.id,task.version]))
      operation={id:operationId,accountId,memberId,type:mode,targetTaskId:target.id,createdTarget,beforeTasks,recordAssignments,postVersions,createdAt:timestamp,undoneAt:null,knowledgeVersion:FOOD_KNOWLEDGE_VERSION}
      return {...data,tasks,records,operations:[...(data.operations??[]),operation]}
    })
    const listed=await this.list(accountId,memberId,now,timeZone), task=listed.tasks.find((item)=>item.id===taskId)
    if(!task)throw new DesensitizationTestError('处理已保存，但观察列表需要刷新',409,'RESULT_REFRESH_REQUIRED')
    return {task,operationId:operation?.id??null,undoable:Boolean(operation),idempotent,message}
  }

  async undoOperation(accountId,operationId,now=new Date(),timeZone='Asia/Shanghai') {
    let memberId='',resultTaskId=''
    await this.store.update((data)=>{
      const operation=(data.operations??[]).find((item)=>item.id===operationId&&item.accountId===accountId)
      if(!operation)throw new DesensitizationTestError('未找到这次关联操作',404,'OPERATION_NOT_FOUND')
      if(operation.undoneAt)throw new DesensitizationTestError('这次操作已经撤回',409,'OPERATION_ALREADY_UNDONE')
      memberId=operation.memberId
      for(const [taskId,version] of Object.entries(operation.postVersions??{})){const current=data.tasks.find((task)=>task.id===taskId);if(current&&current.version!==version)throw new DesensitizationTestError('观察已在其他位置更新，不能覆盖新数据',409,'UNDO_CONFLICT')}
      const beforeById=new Map((operation.beforeTasks??[]).map((task)=>[task.id,task])), timestamp=now.toISOString()
      const newTargetRecords=data.records.filter((record)=>record.taskId===operation.targetTaskId&&!operation.recordAssignments?.some((item)=>item.recordId===record.id)&&Date.parse(record.createdAt)>=Date.parse(operation.createdAt))
      let tasks=data.tasks.map((task)=>beforeById.has(task.id)?beforeById.get(task.id):task)
      if(operation.createdTarget&&!beforeById.has(operation.targetTaskId)){
        tasks=tasks.map((task)=>task.id!==operation.targetTaskId?task:newTargetRecords.length?{...task,mergedFrom:[],relatedTaskIds:[],displayName:`${task.displayName}（待整理）`,updatedAt:timestamp,version:task.version+1}:{...task,status:'deleted',deletedAt:timestamp,updatedAt:timestamp,version:task.version+1})
      }
      const assignments=new Map((operation.recordAssignments??[]).map((item)=>[item.recordId,item.taskId]))
      const records=data.records.map((record)=>assignments.has(record.id)?{...record,taskId:assignments.get(record.id),updatedAt:timestamp,version:(record.version??1)+1}:record)
      const operations=(data.operations??[]).map((item)=>item.id===operation.id?{...item,undoneAt:timestamp}:item)
      resultTaskId=operation.beforeTasks?.[0]?.id??operation.targetTaskId
      return {...data,tasks,records,operations}
    })
    const listed=await this.list(accountId,memberId,now,timeZone)
    return {tasks:listed.tasks,focusTaskId:listed.tasks.some((task)=>task.id===resultTaskId)?resultTaskId:listed.tasks[0]?.id??'',message:'已撤回本次关联调整，源记录保持不变'}
  }

  async manageAssociation(accountId,taskId,input,now=new Date(),timeZone='Asia/Shanghai') {
    const task=await this.owned(accountId,taskId)
    if(Number.isInteger(input?.version)&&task.version!==input.version)throw new DesensitizationTestError('观察已在其他位置更新，请刷新后重试',409,'VERSION_CONFLICT')
    const action=String(input?.action??''),entityId=cleanText(input?.entityId,180),sourceTaskId=cleanText(input?.sourceTaskId,180),timestamp=now.toISOString()
    await this.store.update((data)=>{
      let tasks=[...data.tasks],records=[...data.records]
      if(action==='remove-food')tasks=tasks.map((item)=>item.id===task.id?{...item,foodLinks:(item.foodLinks??[]).filter((link)=>link.entityId!==entityId),updatedAt:timestamp,version:item.version+1}:item)
      else if(action==='remove-component')tasks=tasks.map((item)=>item.id===task.id?{...item,componentFocus:(item.componentFocus??[]).filter((link)=>link.entityId!==entityId),updatedAt:timestamp,version:item.version+1}:item)
      else if(action==='restore-merged'){
        const merged=data.tasks.find((item)=>item.id===sourceTaskId&&item.accountId===accountId&&item.memberId===task.memberId&&item.status==='merged'&&item.mergedInto===task.id)
        if(!merged)throw new DesensitizationTestError('原观察已变化，无法恢复入口',409,'MERGED_SOURCE_CONFLICT')
        const duplicate=data.tasks.find((item)=>item.id!==merged.id&&item.id!==task.id&&item.accountId===accountId&&item.memberId===task.memberId&&item.status==='active'&&taskScope(item).entityId===taskScope(merged).entityId)
        if(duplicate)throw new DesensitizationTestError('同范围观察已经在进行中，请刷新后处理',409,'DUPLICATE_ACTIVE_TEST')
        tasks=tasks.map((item)=>item.id===task.id?{...item,mergedFrom:(item.mergedFrom??[]).filter((source)=>source.taskId!==merged.id),updatedAt:timestamp,version:item.version+1}:item.id===merged.id?{...item,status:statuses.has(item.previousStatus)?item.previousStatus:'active',mergedInto:null,updatedAt:timestamp,version:item.version+1}:item)
        records=records.map((record)=>record.taskId===task.id&&record.originTaskId===merged.id?{...record,taskId:merged.id,updatedAt:timestamp,version:(record.version??1)+1}:record)
      } else throw new DesensitizationTestError('关联操作不支持',400,'INVALID_ASSOCIATION_ACTION')
      return {...data,tasks,records}
    })
    const listed=await this.list(accountId,task.memberId,now,timeZone)
    return {task:listed.tasks.find((item)=>item.id===task.id)??null,tasks:listed.tasks}
  }

  async create(accountId, input, now = new Date(), timeZone = 'Asia/Shanghai') {
    const memberId = cleanText(input?.memberId, 180, true); await this.assertMember(accountId, memberId)
    const displayName = normalizeName(input?.displayName); const classification = classifyFoodName(displayName); const resolution=resolveEntity(displayName); const entity=resolution.entity
    let result
    await this.store.update((data) => {
      const existing = data.tasks.find((item) => item.accountId === accountId && item.memberId === memberId && taskScope(item).entityId === entity.id && item.status !== 'deleted')
      if (existing) { result = { task: existing, existing: true }; return data }
      const deleted = data.tasks.find((item) => item.accountId === accountId && item.memberId === memberId && taskScope(item).entityId === entity.id && item.status === 'deleted')
      const timestamp = now.toISOString()
      const task = deleted ? { ...deleted, displayName, status: 'archived', deletedAt: null, updatedAt: timestamp, version: deleted.version + 1 } : { ...baseTask({accountId,memberId,entity,originalInput:displayName,now}),displayName,...classification }
      result = { task, existing: Boolean(deleted), restoredArchived: Boolean(deleted) }
      return { ...data, tasks: deleted ? data.tasks.map((item) => item.id === deleted.id ? task : item) : [...data.tasks, task] }
    })
    const listed = await this.list(accountId, memberId, now, timeZone)
    return { ...result, task: listed.tasks.find((item) => item.id === result.task.id) }
  }

  async mutateTask(accountId, id, action, now = new Date(), expectedVersion = null) {
    const task = await this.owned(accountId, id, action === 'undo-delete')
    if (Number.isInteger(expectedVersion) && task.version !== expectedVersion) throw new DesensitizationTestError('观察任务已在其他位置更新，请刷新后重试', 409, 'VERSION_CONFLICT')
    let saved
    await this.store.update((data) => ({ ...data, tasks: data.tasks.map((item) => {
      if (item.id !== task.id) return item
      if (action === 'archive') saved = { ...item, status: 'archived', archivedAt: now.toISOString(), updatedAt: now.toISOString(), version: item.version + 1 }
      if (action === 'restore') {
        const duplicate = data.tasks.find((other) => other.id !== item.id && other.accountId === item.accountId && other.memberId === item.memberId && taskScope(other).entityId === taskScope(item).entityId && other.status === 'active')
        if (duplicate) throw new DesensitizationTestError('同类观察已经在进行中', 409, 'DUPLICATE_ACTIVE_TEST')
        saved = { ...item, status: 'active', archivedAt: null, deletedAt: null, updatedAt: now.toISOString(), version: item.version + 1 }
      }
      if (action === 'delete') saved = { ...item, previousStatus: item.status, status: 'deleted', deletedAt: now.toISOString(), updatedAt: now.toISOString(), version: item.version + 1 }
      if (action === 'undo-delete') saved = { ...item, status: statuses.has(item.previousStatus) ? item.previousStatus : 'active', deletedAt: null, updatedAt: now.toISOString(), version: item.version + 1 }
      return saved ?? item
    }) }))
    return saved
  }

  async updateName(accountId, id, input, now = new Date()) {
    const task = await this.owned(accountId, id); const displayName = normalizeName(input?.displayName)
    if (!displayName) throw new DesensitizationTestError('请输入食物名称')
    if (Number.isInteger(input?.version) && task.version !== input.version) throw new DesensitizationTestError('观察任务已在其他位置更新，请刷新后重试', 409, 'VERSION_CONFLICT')
    let saved
    await this.store.update((data) => ({ ...data, tasks: data.tasks.map((item) => item.id === task.id ? (saved = { ...item, displayName, updatedAt: now.toISOString(), version: item.version + 1 }) : item) }))
    return saved
  }

  async saveRecord(accountId, taskId, input, now = new Date()) {
    const task = await this.owned(accountId, taskId); await this.assertMember(accountId, task.memberId)
    let saved; let taskSaved = task; let idempotent = false
    await this.store.update((data) => {
      const duplicate = input?.idempotencyKey ? data.records.find((item) => item.taskId === task.id && item.idempotencyKey === input.idempotencyKey) : null
      if (duplicate) { saved = duplicate; idempotent = true; return data }
      const timestamp = now.toISOString(); const record = { id: randomUUID(), accountId, memberId: task.memberId, taskId: task.id, scopeEntityId:taskScope(task).entityId, focusEntityIds:(task.componentFocus??[]).map((item)=>item.entityId), createdAt: timestamp, updatedAt: timestamp, version: 1, versions: [], planVersion: (task.planVersions??[]).at(-1)?.version ?? null, ...normalizeRecord(input, now) }
      saved = record
      if (record.status === 'effective' && record.symptomAnswer === 'present') taskSaved = { ...task, progressionPaused: true, pausedAt: timestamp, updatedAt: timestamp, version: task.version + 1 }
      return { ...data, records: [...data.records, record], tasks: data.tasks.map((item) => item.id === task.id ? taskSaved : item) }
    })
    return { record: saved, task: taskSaved, idempotent }
  }

  async updateRecord(accountId, taskId, recordId, input, now = new Date()) {
    const task = await this.owned(accountId, taskId); const data = await this.store.read()
    const previous = data.records.find((item) => item.id === recordId && item.taskId === task.id && item.accountId === accountId && !item.withdrawnAt)
    if (!previous) throw new DesensitizationTestError('未找到这条排敏记录', 404, 'OBSERVATION_NOT_FOUND')
    if (input?.version !== previous.version) throw new DesensitizationTestError('记录已在其他位置更新，请刷新后重试', 409, 'VERSION_CONFLICT')
    const { versions: previousVersions = [], ...previousSnapshot } = previous
    const replacement = { ...normalizeRecord(input, now, previous), id: previous.id, accountId, memberId: task.memberId, taskId: task.id, createdAt: previous.createdAt, updatedAt: now.toISOString(), version: previous.version + 1, versions: [...previousVersions, previousSnapshot], planVersion: previous.planVersion }
    const taskReplacement = replacement.status === 'effective' && replacement.symptomAnswer === 'present' && !task.progressionPaused ? { ...task, progressionPaused: true, pausedAt: now.toISOString(), updatedAt: now.toISOString(), version: task.version + 1 } : task
    await this.store.update((current) => ({ ...current, records: current.records.map((item) => item.id === previous.id ? replacement : item), tasks: current.tasks.map((item) => item.id === task.id ? taskReplacement : item) }))
    return replacement
  }

  async undoRecordUpdate(accountId, taskId, recordId, expectedVersion, now = new Date()) {
    await this.owned(accountId, taskId); let saved
    await this.store.update((data) => ({ ...data, records: data.records.map((item) => {
      if (item.id !== recordId || item.taskId !== taskId || item.accountId !== accountId) return item
      if (item.version !== expectedVersion || !item.versions?.length) throw new DesensitizationTestError('记录已变化，无法撤销刚才的修改', 409, 'UNDO_CONFLICT')
      const previous = item.versions.at(-1)
      return (saved = { ...previous, id: item.id, accountId: item.accountId, memberId: item.memberId, taskId: item.taskId, createdAt: item.createdAt, versions: item.versions.slice(0, -1), version: item.version + 1, updatedAt: now.toISOString() })
    }) }))
    if (!saved) throw new DesensitizationTestError('未找到这条排敏记录', 404, 'OBSERVATION_NOT_FOUND')
    return saved
  }

  async withdrawRecord(accountId, taskId, recordId, expectedVersion = null, now = new Date()) {
    await this.owned(accountId, taskId); let saved
    await this.store.update((data) => ({ ...data, records: data.records.map((item) => {
      if (item.id !== recordId || item.taskId !== taskId || item.accountId !== accountId) return item
      if (Number.isInteger(expectedVersion) && item.version !== expectedVersion) throw new DesensitizationTestError('记录已变化，无法撤回刚才的操作', 409, 'UNDO_CONFLICT')
      return (saved = { ...item, withdrawnAt: now.toISOString(), updatedAt: now.toISOString(), version: item.version + 1 })
    }) }))
    if (!saved) throw new DesensitizationTestError('未找到这条排敏记录', 404, 'OBSERVATION_NOT_FOUND')
    return saved
  }

  async restoreRecord(accountId, taskId, recordId, expectedVersion, now = new Date()) {
    await this.owned(accountId, taskId); let saved
    await this.store.update((data) => ({ ...data, records: data.records.map((item) => {
      if (item.id !== recordId || item.taskId !== taskId || item.accountId !== accountId) return item
      if (item.version !== expectedVersion || !item.withdrawnAt) throw new DesensitizationTestError('记录已变化，无法撤回刚才的操作', 409, 'UNDO_CONFLICT')
      return (saved = { ...item, withdrawnAt: null, updatedAt: now.toISOString(), version: item.version + 1 })
    }) }))
    if (!saved) throw new DesensitizationTestError('未找到这条排敏记录', 404, 'OBSERVATION_NOT_FOUND')
    return saved
  }

  async savePlan(accountId, taskId, input, now = new Date()) {
    const task = await this.owned(accountId, taskId)
    if (Number.isInteger(input?.taskVersion) && task.version !== input.taskVersion) throw new DesensitizationTestError('观察任务已在其他位置更新，请刷新后重试', 409, 'VERSION_CONFLICT')
    const plan = normalizePlan(input, ((task.planVersions??[]).at(-1)?.version ?? 0) + 1, now)
    let saved
    await this.store.update((data) => ({ ...data, tasks: data.tasks.map((item) => item.id === task.id ? (saved = { ...item, planVersions: [...(item.planVersions??[]), plan], progressionPaused: input?.resumeProgression === true && plan.complete ? false : item.progressionPaused, pausedAt: input?.resumeProgression === true && plan.complete ? null : item.pausedAt, updatedAt: now.toISOString(), version: item.version + 1 }) : item) }))
    return { task: saved, plan }
  }
}
