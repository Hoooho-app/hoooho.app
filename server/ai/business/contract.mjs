import {nursingObservationContext} from './nursing-observation-context.mjs'
import {clinicalAssertions} from '../../../shared/clinical-evidence.mjs'
import {locateEvidence} from './evidence-location.mjs'
import { itemRecordCategories } from '../../../shared/record-categories.mjs'
import { symptomItemCorePhrase } from '../../../shared/symptom-core-phrase.mjs'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { TimeResolverService } from '../time-resolver-service.mjs'
import { validateJournal } from '../../events/journal-metadata.mjs'
import { outputFailure } from '../providers/output-diagnostics.mjs'
import { evidenceFailure } from './evidence-diagnostics.mjs'
import { parseStrictInstant } from '../../time/strict-date.mjs'

export const categories = ['diet','sleep','elimination','activity','emotion','social','symptom','measurement','growth','injury','medication','care','vaccination','environment','visit','examination','other']
export const fieldNames = ['symptom','location','severityOriginal','handling','food','amount','unit','reaction','sleepAt','wakeAt','sleepKind','quality','bowelShape','bowelColor','bowelPain','bowelCount','activity','durationMinutes','institution','department','doctorStatement','diagnosisCertainty','testName','result','referenceRange','abnormalFlag','conclusion','medicationName','doseOriginal','allergen','allergyStatus','correction','reportType','chiefComplaint','followUp','historyName','frequency','route','statusRaw','relationship','vaccineName','manufacturerName','batchNumber']
export const archiveCategories = ['allergy','chronic','medication','surgery','family-history','vaccination','important','examination','medical-history']
export const fail = (message, status = 422, code = 'AI_BUSINESS_INVALID') => Object.assign(new Error(message), { status, code })
export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const safeText = (value, limit = 500) => typeof value === 'string' && value.length <= limit ? value.trim() : ''
const bodyCatalog = JSON.parse(readFileSync(new URL('../../../src/features/body-location/child-data/locations.json',import.meta.url),'utf8'))
export function bodyLocations(raw) {
  if(!raw)return []
  const matches=bodyCatalog.regions.flatMap(region=>region.items.map(item=>({region,item}))).filter(({item})=>[item.label,...(item.aliases??[])].includes(raw))
  if(matches.length!==1)return []
  const {region,item}=matches[0]
  return [{id:item.id,label:item.label,locationNumber:1,locationLayer:'surface',localRegion:region.label,parentId:region.id,schemaVersion:bodyCatalog.schemaVersion}]
}

// A schema is not a factual validator. Every extracted value must be supported
// by an exact quote in a supplied source, not by the model's confidence score.
function validateExtractionContent(output, sources, options={}) {
  if (!output || !Array.isArray(output.items) || output.items.length > 30) throw fail('整理结果格式无效，未更新草稿')
  if(output.items.length===30)throw fail('结果已达到单批事项上限，请分批核对，未将可能遗漏的内容保存为完整结果',422,'AI_SOURCE_LIMIT')
  const observationScopes=new Map()
  const sourceAssertions=new Map(sources.map(source=>[source,clinicalAssertions(source.text)]))
  const items=output.items.flatMap((item, index) => {
    if (Object.keys(item).some(key => !['category','title','timeText','fields','archiveCategory','subject','relationKey'].includes(key))) throw fail('整理结果包含不允许的字段')
    if (!categories.includes(item.category) || !['current','other','unknown'].includes(item.subject) || !Array.isArray(item.fields) || item.fields.length > 50) throw fail('记录分类或主体无效')
    if (item.subject !== 'current') return []
    const fields = item.fields.map((field,fieldIndex) => {
      if (!fieldNames.includes(field.name) || !Number.isInteger(field.page) || field.page < 1) throw fail('字段或来源位置无效')
      const source = sources.find(source => source.id === field.sourceId && source.page === field.page)
      const quote = safeText(field.quote, 4000)
      let value = safeText(field.value, 4000),evidenceProjection
      const scopedObservation=options.verbatimObservations&&['symptom','reaction','chiefComplaint','quality','statusRaw','location','handling'].includes(field.name)
      // New dialogue summaries have a separate semantic generation stage. If
      // the supplier paraphrases an observation, discard that value and use its
      // exact, supplied quote; every scope check below still applies.
      if(scopedObservation&&source&&quote&&source.text.includes(quote)&&value&&!quote.includes(value)){value=quote;evidenceProjection='verbatim_quote'}
      const fieldPath=`/items/${index}/fields/${fieldIndex}`
      if (!source || !quote || !source.text.includes(quote) || !value || !quote.includes(value)) throw evidenceFailure('部分内容与原文不一致，请核对，未保存生成结果',fieldPath,!source?'source_missing':!quote?'quote_missing':!source.text.includes(quote)?'quote_not_in_source':!value?'value_missing':'value_not_in_quote')
      if(scopedObservation){
        const scope=locateEvidence(source,quote,value,{...field,name:'symptom'},item,fieldPath,sourceAssertions.get(source))
        if(!observationScopes.has(source))observationScopes.set(source,nursingObservationContext(source.text).clauses)
        if(observationScopes.get(source).some(c=>c.subject==='other'&&c.start<scope.valueEnd&&c.end>scope.valueStart))throw evidenceFailure('这段观察属于其他人物，原话已保留',fieldPath,'subject_context')
      }
      const located=locateEvidence(source,quote,value,field,item,fieldPath,sourceAssertions.get(source))
      return { name: field.name, value,...(evidenceProjection?{evidenceProjection}:{}), sources: [{ sourceId: source.id, page: source.page, quote, ...located,...(source.sourceKind==='visual_observation'?{sourceKind:'visual_observation'}:{}) }], confirmed: false, editedBy: 'model' }
    })
    const timeText = item.timeText == null ? null : safeText(item.timeText, 100)
    if (!fields.length) return []
    if (item.archiveCategory != null && !archiveCategories.includes(item.archiveCategory)) throw fail('归档栏目无效')
    const title = item.category === 'symptom' ? symptomItemCorePhrase({fields}) : fields[0].value.slice(0,80)
    return [{ id: `item-${index + 1}`, category: item.category, title, timeText, fields, archiveCategory: item.archiveCategory ?? null, relationKey: safeText(item.relationKey, 100) || null }]
  })
  for(const item of items){
    const itemSources=new Set(item.fields.flatMap(f=>f.sources.map(s=>`${s.sourceId}:${s.page}`)))
    const sameSource=item.fields.some(field=>field.sources.some(ref=>ref.quote.includes(item.timeText)))||sources.some(source=>itemSources.has(`${source.id}:${source.page}`)&&source.text.includes(item.timeText))
    const bound=options.timeEvidence?.(item,items)??[]
    const supported=bound.some(ref=>{const source=sources.find(s=>s.id===ref.sourceId&&s.page===ref.page);return source&&Number.isInteger(ref.start)&&Number.isInteger(ref.end)&&source.text.slice(ref.start,ref.end)===ref.quote&&ref.quote.includes(item.timeText)})
    if(item.timeText&&!sameSource&&!supported)throw fail('发生时间缺少同一条资料的原文依据')
  }
  return items
}

export function validateExtraction(output,sources,options){
  try{return validateExtractionContent(output,sources,options)}catch(error){
    if(error.validation)throw error
    const safe=outputFailure(error.message,error.code==='AI_EVIDENCE_MISMATCH'?'source_validation':'semantic_validation','/items',error.code==='AI_EVIDENCE_MISMATCH'?'source_mismatch':'invalid_extraction',error.code??'AI_BUSINESS_INVALID')
    safe.status=error.status??422;throw safe
  }
}

export function resolveItemTime(item, options) {
  const raw = item.timeText
  const day = typeof raw === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  const isZonedISO = typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}[T ].*(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)
  const iso = isZonedISO ? parseStrictInstant(raw.replace(' ', 'T')) : null
  if(isZonedISO&&!iso)throw fail('发生时间格式错误，请核对日期和时分',422,'INVALID_OCCURRED_AT')
  const time = iso ? { raw, resolvedStart: iso.toISOString(), resolvedEnd:null, precision:'exact', source:'user_text' } : new TimeResolverService().resolve(day ? `${day[1]}年${Number(day[2])}月${Number(day[3])}日` : raw, options)
  time.raw = raw
  if(time.resolvedStart)time.resolvedStart=new Date(time.resolvedStart).toISOString()
  if(time.resolvedEnd)time.resolvedEnd=new Date(time.resolvedEnd).toISOString()
  if (time.resolvedStart && Date.parse(time.resolvedStart) > new Date(options.referenceNow).getTime()) throw fail('发生时间晚于现在，请核对')
  return time
}

const field = (item, name) => item.fields.find(field => field.name === name)?.value
const known = (value, choices) => choices.includes(value) ? value : undefined
export function buildJournal(item) {
  const journal = { categories: itemRecordCategories(item), timePrecision: item.time?.precision === 'exact' ? 'exact' : item.time?.precision === 'unknown' || !item.time ? 'unknown' : 'period' }
  if (item.category === 'symptom' || journal.categories.includes('symptom') && field(item,'symptom')) journal.symptom = { symptomCategory: /皮肤|疹|痒|红屁股|臀部|屁股.*红/.test(field(item,'symptom') || '') ? 'skin' : 'other', narrative: field(item,'symptom'), locations: bodyLocations(field(item,'location')), descriptors: [], locationText: field(item,'location'), generatedSummary: symptomItemCorePhrase(item) }
  if (item.category === 'sleep') {
    const sleepAt = field(item,'sleepAt'), wakeAt = field(item,'wakeAt')
    // ISO values are used only after a user supplied them or the time resolver
    // resolved the exact source phrase. No model-computed sleep duration.
    const kind=known(field(item,'sleepKind'),['nap','午睡','小睡'])?'nap':known(field(item,'sleepKind'),['night','夜间睡眠','夜间','晚上','昨晚'])?'night':null
    if (sleepAt && wakeAt && kind) journal.sleep = { sleepAt, wakeAt, durationMinutes: 0, kind, quality: known(field(item,'quality'), ['睡得安稳','有些翻动','频繁醒来']), observations: [] }
  }
  if (item.category === 'elimination') journal.bowel = { shapes: field(item,'bowelShape') ? [known(field(item,'bowelShape'), ['硬小颗粒','细小颗粒','成团偏硬','光滑条状','松散软块','糊状','水样','无法判断'])].filter(Boolean) : [], color: known(field(item,'bowelColor'), ['灰白','黄色','黄褐','棕色','深棕','绿色','近黑','红色','无法判断']), observations: /^(肚子痛|腹痛|肚子疼)$/.test(field(item,'bowelPain')??'') ? ['肚子痛（孩子能表达时）'] : [] }
  if (item.category === 'activity') {
    const activity = field(item,'activity') ?? field(item,'symptom'), minute = field(item,'durationMinutes')
    const minutes=minute==='半小时'?30:/^\d+(?:\.\d+)?\s*(?:小时|分钟|分)?$/.test(minute??'')?Number.parseFloat(minute)*(/小时/.test(minute)?60:1):null
    const kind = ({散步:'walking',跑跳:'running_jumping',骑行:'cycling_balance_bike',攀爬:'climbing'})[activity] || 'other'
    journal.outdoorActivity = { activities: [kind], ...(kind === 'other' && activity ? { activityOtherText: activity } : {}), places: [], contacts: [], observations: [], ...(Number.isInteger(minutes)&&minutes>0 ? { durationMinutes: minutes } : {}) }
  }
  // A food and amount alone do not specify feeding, snack or meal. Keep their
  // sourced fields and real category without inventing the legacy required kind.
  if (item.category === 'visit') journal.visit = { visitType: 'other', visitTypeOtherText:'原资料未明确就医方式',institutionName: field(item,'institution'), department: field(item,'department'), doctorStatement: field(item,'doctorStatement'),reasonText:field(item,'chiefComplaint'), recognitionStatus: 'draft_unverified' }
  if (item.category === 'vaccination' && field(item,'vaccineName')) {
    const dose=field(item,'doseOriginal')??'', match=/^(?:第)?([1-4一二三四])(?:剂|针|次)?$/.exec(dose), number=match&&({'一':1,'二':2,'三':3,'四':4}[match[1]]??Number(match[1]))
    journal.vaccination={items:[{id:item.id,vaccineName:field(item,'vaccineName'),doseSequence:number?`dose_${number}`:/加强/.test(dose)?'booster':'unknown',manufacturerName:field(item,'manufacturerName'),batchNumber:field(item,'batchNumber')}],institutionName:field(item,'institution'),observations:[],note:item.fields.map(f=>f.value).join('；'),recognitionStatus:'user_edited'}
  }
  return validateJournal(journal)
}

// Matching never crosses scope: caller supplies one authenticated member only.
// Different date, dose, result, polarity or episode remain separate variants.
export function mergeItems(items) {
  const result = [], byKey = new Map()
  for (const item of items) {
    const key = fingerprint({ category:item.category, occurredAt:item.occurredAt ?? item.time?.resolvedStart ?? item.timeText, fields:item.fields.map(({name,value})=>({name,value})).sort((a,b)=>a.name.localeCompare(b.name)||a.value.localeCompare(b.value)) })
    let existing = byKey.get(key)
    const anchor = name=>item.fields.find(f=>f.name===name)?.value
    if(!existing&&['visit','examination'].includes(item.category)&&item.time?.resolvedStart&&anchor('institution'))existing=result.find(other=>other.category===item.category&&other.time?.resolvedStart===item.time.resolvedStart&&other.fields.some(f=>f.name==='institution'&&f.value===anchor('institution'))&&(item.category==='visit'||anchor('testName')&&other.fields.some(f=>f.name==='testName'&&f.value===anchor('testName')))&&!item.fields.some(f=>other.fields.some(o=>o.name===f.name&&o.value!==f.value)))
    if (!existing) { const copy = structuredClone(item); copy.fields = copy.fields.map(f=>({...f,sources:f.sources??[{sourceId:f.sourceId,page:f.page,quote:f.quote}]})); result.push(copy); byKey.set(key,copy); continue }
    for (const f of item.fields) {
      const target = existing.fields.find(other => other.name === f.name && other.value === f.value)
      if (target) target.sources = [...new Map([...target.sources,...(f.sources ?? [{sourceId:f.sourceId,page:f.page,quote:f.quote}])].map(ref=>[JSON.stringify(ref),ref])).values()]
      else existing.fields.push({...structuredClone(f),sources:f.sources??[{sourceId:f.sourceId,page:f.page,quote:f.quote}]})
    }
    existing.mergedIds = [...(existing.mergedIds ?? []),item.id]
  }
  return result
}

export const extractionSchema = {
  type:'object', additionalProperties:false, required:['items'], properties:{items:{type:'array',maxItems:30,items:{
    type:'object',additionalProperties:false,required:['category','title','timeText','fields','archiveCategory','subject','relationKey'],properties:{
      category:{type:'string',enum:categories,description:'按完整事件分类。症状/受伤及针对它的就医、医生判断、观察要求保留在同一item的不同字段；上传附件不是新的健康事项。独立饮食/睡眠/用药、不同日期或多次发生才拆分。examination必须有真实检查项目/结果，“医生说没事”不是检查。'},title:{type:'string'},timeText:{type:['string','null'],description:'同一事项来源中的原始发生时间文字，例如今天、昨天、昨日；跨事项不同日期分别拆分。参考日期与timezone由服务端提供，只抽取原话，不生成具体时刻。没说时间必须为null，不能自行补今天或00:00；实时录入的缺省时分由程序处理。'},archiveCategory:{type:['string','null']},subject:{type:'string',enum:['current','other','unknown']},relationKey:{type:['string','null'],description:'同一次具体健康随记的关联标识；不是对话ID。同一事件的症状、就医、医生原话和观察要求优先合为一条，独立事件或不明确关联用null。'},
      fields:{type:'array',maxItems:50,items:{type:'object',additionalProperties:false,required:['name','value','sourceId','quote','page'],properties:{name:{type:'string',enum:fieldNames},value:{type:'string'},sourceId:{type:'string'},quote:{type:'string'},page:{type:'integer'}}}
    }
  }}}}
}
