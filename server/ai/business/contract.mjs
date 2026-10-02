import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { TimeResolverService } from '../time-resolver-service.mjs'
import { validateJournal } from '../../events/journal-metadata.mjs'
import { outputFailure } from '../providers/output-diagnostics.mjs'

export const categories = ['diet','sleep','elimination','activity','emotion','social','symptom','measurement','growth','injury','medication','care','vaccination','environment','visit','examination','other']
export const fieldNames = ['symptom','location','severityOriginal','handling','food','amount','unit','reaction','sleepAt','wakeAt','sleepKind','quality','bowelShape','bowelColor','bowelPain','bowelCount','activity','durationMinutes','institution','department','doctorStatement','diagnosisCertainty','testName','result','referenceRange','abnormalFlag','conclusion','medicationName','doseOriginal','allergen','allergyStatus','ABC_A','ABC_B','ABC_C','correction','reportType','chiefComplaint','followUp','historyName','frequency','route','statusRaw','relationship','vaccineName','manufacturerName','batchNumber']
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
function validateExtractionContent(output, sources) {
  if (!output || !Array.isArray(output.items) || output.items.length > 30) throw fail('整理结果格式无效，未更新草稿')
  if(output.items.length===30)throw fail('结果已达到单批事项上限，请分批核对，未将可能遗漏的内容保存为完整结果',422,'AI_SOURCE_LIMIT')
  return output.items.flatMap((item, index) => {
    if (Object.keys(item).some(key => !['category','title','timeText','fields','archiveCategory','subject','relationKey'].includes(key))) throw fail('整理结果包含不允许的字段')
    if (!categories.includes(item.category) || !['current','other','unknown'].includes(item.subject) || !Array.isArray(item.fields) || item.fields.length > 50) throw fail('记录分类或主体无效')
    if (item.subject !== 'current') return []
    const fields = item.fields.map((field,fieldIndex) => {
      if (!fieldNames.includes(field.name) || !Number.isInteger(field.page) || field.page < 1) throw fail('字段或来源位置无效')
      const source = sources.find(source => source.id === field.sourceId && source.page === field.page)
      const quote = safeText(field.quote, 4000), value = safeText(field.value, 4000)
      if (!source || !quote || !source.text.includes(quote) || !value || !quote.includes(value)) throw Object.assign(outputFailure('部分内容与原文不一致，请核对，未保存生成结果','source_validation',`/items/${index}/fields/${fieldIndex}`,'source_mismatch','AI_EVIDENCE_MISMATCH'),{status:422})
      if(/没有|未见|否认|无(?:明显)?|排除|疑似|可能|待排查/.test(quote)&&!/(?:没有|未见|否认|无(?:明显)?|排除|疑似|可能|待排查)/.test(value))throw fail('否定或不确定性被遗漏，请核对',422,'AI_EVIDENCE_MISMATCH')
      if(['symptom','reaction','diagnosisCertainty','allergyStatus','historyName','ABC_A','doctorStatement','conclusion'].includes(field.name)){
        const position=source.text.indexOf(quote),prefix=source.text.slice(Math.max(0,position-8),position).split(/[，。；\n,;.!]/).at(-1)
        if(/(?:没有|未见|否认|排除|疑似|可能|无|未确诊)[^，。；\n,;.!]{0,3}$/.test(prefix)&&!/没有|未见|否认|排除|疑似|可能|无|未确诊/.test(value))throw fail('引文截去了否定或疑似前缀，请对照完整原话',422,'AI_EVIDENCE_MISMATCH')
      }
      return { name: field.name, value, sources: [{ sourceId: source.id, page: source.page, quote, start: source.text.indexOf(quote), end: source.text.indexOf(quote) + quote.length }], confirmed: false, editedBy: 'model' }
    })
    const timeText = item.timeText == null ? null : safeText(item.timeText, 100)
    const itemSources=new Set(fields.flatMap(f=>f.sources.map(s=>`${s.sourceId}:${s.page}`)))
    if (timeText && !fields.some(field => field.sources.some(ref => ref.quote.includes(timeText))) && !sources.some(source => itemSources.has(`${source.id}:${source.page}`)&&source.text.includes(timeText))) throw fail('发生时间缺少同一条资料的原文依据')
    if (!fields.length) return []
    if (item.archiveCategory != null && !archiveCategories.includes(item.archiveCategory)) throw fail('归档栏目无效')
    return [{ id: `item-${index + 1}`, category: item.category, title: fields[0].value.slice(0,80), timeText, fields, archiveCategory: item.archiveCategory ?? null, relationKey: safeText(item.relationKey, 100) || null }]
  })
}

export function validateExtraction(output,sources){
  try{return validateExtractionContent(output,sources)}catch(error){
    if(error.validation)throw error
    const safe=outputFailure(error.message,error.code==='AI_EVIDENCE_MISMATCH'?'source_validation':'semantic_validation','/items',error.code==='AI_EVIDENCE_MISMATCH'?'source_mismatch':'invalid_extraction',error.code??'AI_BUSINESS_INVALID')
    safe.status=error.status??422;throw safe
  }
}

export function resolveItemTime(item, options) {
  const raw = item.timeText
  const day = typeof raw === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  const iso = typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(raw) && Number.isFinite(Date.parse(raw))
  const time = iso ? { raw, resolvedStart: new Date(raw).toISOString(), resolvedEnd:null, precision:'exact', source:'user_text' } : new TimeResolverService().resolve(day ? `${day[1]}年${Number(day[2])}月${Number(day[3])}日` : raw, options)
  time.raw = raw
  if(time.resolvedStart)time.resolvedStart=new Date(time.resolvedStart).toISOString()
  if(time.resolvedEnd)time.resolvedEnd=new Date(time.resolvedEnd).toISOString()
  if (time.resolvedStart && Date.parse(time.resolvedStart) > new Date(options.referenceNow).getTime()) throw fail('发生时间晚于现在，请核对')
  return time
}

const field = (item, name) => item.fields.find(field => field.name === name)?.value
const known = (value, choices) => choices.includes(value) ? value : undefined
export function buildJournal(item) {
  const journal = { categories: [item.category], timePrecision: item.time?.precision === 'exact' ? 'exact' : item.time?.precision === 'unknown' || !item.time ? 'unknown' : 'period' }
  if (item.category === 'symptom') journal.symptom = { symptomCategory: /皮肤|疹|痒/.test(field(item,'symptom') || '') ? 'skin' : 'other', narrative: field(item,'symptom'), locations: bodyLocations(field(item,'location')), descriptors: [], locationText: field(item,'location') }
  if (item.category === 'sleep') {
    const sleepAt = field(item,'sleepAt'), wakeAt = field(item,'wakeAt')
    // ISO values are used only after a user supplied them or the time resolver
    // resolved the exact source phrase. No model-computed sleep duration.
    const kind=known(field(item,'sleepKind'),['nap','午睡','小睡'])?'nap':known(field(item,'sleepKind'),['night','夜间睡眠','夜间','晚上','昨晚'])?'night':null
    if (sleepAt && wakeAt && kind) journal.sleep = { sleepAt, wakeAt, durationMinutes: 0, kind, quality: known(field(item,'quality'), ['睡得安稳','有些翻动','频繁醒来']), observations: [] }
  }
  if (item.category === 'elimination') journal.bowel = { shapes: field(item,'bowelShape') ? [known(field(item,'bowelShape'), ['硬小颗粒','细小颗粒','成团偏硬','光滑条状','松散软块','糊状','水样','无法判断'])].filter(Boolean) : [], color: known(field(item,'bowelColor'), ['灰白','黄色','黄褐','棕色','深棕','绿色','近黑','红色','无法判断']), observations: /^(肚子痛|腹痛|肚子疼)$/.test(field(item,'bowelPain')??'') ? ['肚子痛（孩子能表达时）'] : [] }
  if (item.category === 'activity') {
    const activity = field(item,'activity'), minute = field(item,'durationMinutes')
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
      category:{type:'string',enum:categories,description:'按事实类型而非上传形式分类。身体症状、否定症状观察属于symptom；examination必须有真实检查项目/结果，visit必须是就诊事实。仅有症状原话不能分类为检查。'},title:{type:'string'},timeText:{type:['string','null'],description:'同一事项来源中的原始发生时间文字，例如今天、昨天、昨日；跨事项不同日期分别拆分。参考日期与timezone由服务端提供，只抽取原话，不生成具体时刻。只有来源未说时间或存在未解决时间冲突才为null。'},archiveCategory:{type:['string','null']},subject:{type:'string',enum:['current','other','unknown']},relationKey:{type:['string','null']},
      fields:{type:'array',maxItems:50,items:{type:'object',additionalProperties:false,required:['name','value','sourceId','quote','page'],properties:{name:{type:'string',enum:fieldNames},value:{type:'string'},sourceId:{type:'string'},quote:{type:'string'},page:{type:'integer'}}}
    }
  }}}}
}
