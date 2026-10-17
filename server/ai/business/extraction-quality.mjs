import {clinicalAssertions,literalBodyObservations} from '../../../shared/clinical-evidence.mjs'
import { LocalFactProvider, extractTimeMentions } from '../providers/local-fact-provider.mjs'
import { resolveItemTime } from './contract.mjs'
import { outputFailure } from '../providers/output-diagnostics.mjs'
import { evidenceFailure } from './evidence-diagnostics.mjs'

const symptomFields=new Set(['symptom','location','severityOriginal','handling'])
const noMedication = /^(?:今天|昨天|昨晚|目前|暂时)?\s*(?:未用药|没有用药|没用药|未服药|没有服药|没服药|没有吃药|没吃药|未吃药)[。！!]?$/u
// Preserve the exact evidence while keeping absence out of actual intake counts.
// Any affirmative field prevents this narrow correction.
export function normalizeMedicationAbsence(item) {
 const values=item.fields.map(field=>field.value.trim()).filter(Boolean)
 if(item.category==='medication' && values.length && values.every(value=>noMedication.test(value))) {
  item.categoryResolution={original:item.category,source:'explicit_no_medication'};item.category='other';item.archiveCategory=null
 }
 return item
}

// A routine activity's visible effect is not, on its own, a symptom. Keep the
// sourced wording and never override a parent's reviewed category or a clinical
// observation (including a negative observation such as “不痛不痒”).
export function normalizeRoutineActivity(item) {
 if(item.categoryEditedBy==='user'||!['symptom','other'].includes(item.category)||item.archiveCategory)return item
 if(!item.fields.length||!item.fields.every(f=>['symptom','location','activity','durationMinutes'].includes(f.name)))return item
 const evidence=item.fields.map(f=>f.value).join('；')
 const ordinary=/(?:晒黑|晒得[^，。；\n]{0,12}黑)/u.test(evidence)||item.fields.some(f=>f.name==='activity')&&!item.fields.some(f=>f.name==='symptom')
 const clinical=/(?:晒伤|疼|痛|痒|红|肿|疹|起泡|水疱|脱皮|破皮|出血|发热|发烧|咳|吐|泻|过敏|不舒服|异常|不适|受伤|呼吸|头晕|恶心|喘|麻木|乏力|疲倦|晕倒)/u.test(evidence)
 if(ordinary&&!clinical){
  item.categoryResolution={original:item.category,source:'routine_activity_evidence'};item.category='activity'
 }
 return item
}
// Reconcile metadata only after exact quote validation. Do not create fields,
// remove negation, infer diagnoses, or replace the supplier's extracted facts.
export async function reconcileExtraction(items,sources,context){
 const parsed=new Map(),local=new LocalFactProvider()
 for(const source of sources)parsed.set(`${source.id}:${source.page}`,await local.organize(source.text))
 const reconciled=items.map((item,index)=>{
  const result=structuredClone(item)
  normalizeMedicationAbsence(result)
  normalizeRoutineActivity(result)
  if(['examination','other'].includes(result.category)&&result.fields.some(f=>f.name==='symptom')&&result.fields.every(f=>symptomFields.has(f.name))){
   result.categoryResolution={original:result.category,source:'field_contract'};result.category='symptom'
  }
  const times=new Set(),timeSources=[]
  for(const field of result.fields.filter(f=>f.name==='symptom'))for(const ref of field.sources){
   const source=sources.find(s=>s.id===ref.sourceId&&s.page===ref.page)
   const quoteStart=ref.valueStart??ref.start,quoteEnd=ref.valueEnd??ref.end
   if(!source)continue
   const scoped=[...clinicalAssertions(source.text),...literalBodyObservations(source.text)].filter(a=>a.start>=quoteStart&&a.end<=quoteEnd)
   const history=scoped.find(a=>a.temporality==='historical')
   if(history&&!result.timeText&&field.value.includes(history.historicalTime)){
    if(scoped.some(a=>a.temporality==='current'))throw evidenceFailure('同一事项混有历史和当前观察，请分别核对时间','/items','temporal_context')
    result.timeText=history.historicalTime
   }
   const facts=parsed.get(`${source.id}:${source.page}`).facts.filter(f=>f.type==='symptom'&&f.subject==='event_subject'&&f.sourceText&&source.text.includes(f.sourceText))
   for(const fact of facts){
    const start=source.text.indexOf(fact.sourceText),end=start+fact.sourceText.length
    if(end<=quoteStart||start>=quoteEnd||source.text.indexOf(fact.sourceText)!==source.text.lastIndexOf(fact.sourceText))continue
    if(extractTimeMentions(fact.sourceText).length>1)throw Object.assign(outputFailure('发生时间有冲突，请分别核对每条原话；草稿未保存','semantic_validation',`/items/${index}/timeText`,'time_conflict','AI_TIME_CONFLICT'),{status:422})
    const raw=fact.time?.raw
    // Inherited time must remain in this sentence, never leak across a period
    // or another page. The local parser is read-only contextual evidence.
    const sentenceStart=Math.max(...['。','；',';','\n','!','！','?','？'].map(mark=>source.text.lastIndexOf(mark,start)))+1
    const scope=source.text.slice(sentenceStart,end)
    if(raw&&scope.includes(raw)){times.add(raw);timeSources.push({sourceId:source.id,page:source.page,quote:raw})}
   }
  }
  if(times.size>1)throw Object.assign(outputFailure('同一条记录含多个发生时间，请拆分后核对；草稿未保存','semantic_validation',`/items/${index}/timeText`,'time_conflict','AI_TIME_CONFLICT'),{status:422})
  const raw=[...times][0]
  if(raw&&result.timeText){
   const expected=resolveItemTime({timeText:raw},context),chosen=resolveItemTime(result,context)
   if(expected.resolvedStart!==chosen.resolvedStart||expected.resolvedEnd!==chosen.resolvedEnd||expected.precision!==chosen.precision)throw Object.assign(outputFailure('生成的时间与该条原话不一致，请核对；草稿未保存','semantic_validation',`/items/${index}/timeText`,'time_conflict','AI_TIME_CONFLICT'),{status:422})
  }else if(raw){result.timeText=raw;result.timeResolution={source:'local_source_context',references:timeSources}}
  return result
 })
 // Recover a narrowly supported colloquial observation if a feeding item
 // swallowed it. The existing parser supplies subject, polarity and time; no
 // diagnosis, invented fact or additional provider call is involved.
 for(const source of sources){
  for(const fact of parsed.get(`${source.id}:${source.page}`).facts.filter(f=>f.name==='臀部发红'&&f.subject==='event_subject'&&f.polarity==='affirmed'&&f.temporality==='current'&&f.assertionType==='observation')){
   const quote=fact.sourceText
   if(!quote||!source.text.includes(quote)||source.text.indexOf(quote)!==source.text.lastIndexOf(quote))continue
   const represented=reconciled.filter(item=>item.fields.some(f=>f.sources.some(r=>r.sourceId===source.id&&r.page===source.page)&&/红屁股|(?:屁股|臀部).*红/u.test(f.value)))
   const start=source.text.indexOf(quote),end=start+quote.length
   const sentenceStart=Math.max(...['。','；',';','\n','!','！','?','？'].map(mark=>source.text.lastIndexOf(mark,start)))+1
   const sentenceEnd=source.text.slice(end).search(/[。；;\n!！?？]/u)
   const boundary=sentenceEnd<0?source.text.length:end+sentenceEnd
   const timeText=fact.time?.raw??null
   const expected=resolveItemTime({timeText},context)
   const candidates=reconciled.filter(item=>item.category==='diet'&&item.fields.some(f=>f.name==='food'&&f.sources.some(ref=>ref.sourceId===source.id&&ref.page===source.page&&ref.start>=sentenceStart&&ref.start<boundary))&&(!item.timeText||!timeText||resolveItemTime(item,context).resolvedStart===expected.resolvedStart))
   if(represented.length){
    const clinical=represented.length===1?represented[0]:null
    if(candidates.length===1&&clinical?.category==='symptom'&&!clinical.archiveCategory&&clinical.fields.every(f=>symptomFields.has(f.name)&&f.sources.every(ref=>ref.sourceId===source.id&&ref.page===source.page&&ref.start>=sentenceStart&&ref.end<=boundary))&&(!clinical.timeText||!timeText||resolveItemTime(clinical,context).resolvedStart===expected.resolvedStart)){
      candidates[0].fields.push(...clinical.fields)
      reconciled.splice(reconciled.indexOf(clinical),1)
    }
    continue
   }
   const field={name:'symptom',value:quote,sources:[{sourceId:source.id,page:source.page,quote,start,end}],confirmed:false,editedBy:'source',recovery:'explicit_colloquial_observation'}
   if(candidates.length===1)candidates[0].fields.push(field)
   else reconciled.push({id:`source-symptom-${reconciled.length+1}`,category:'symptom',title:quote.slice(0,80),timeText,fields:[field],archiveCategory:null,relationKey:null})
  }
 }
 const values=new Map()
 // A routine item must not silently swallow a separate, explicit observation.
 // Use only the deterministic parser's direct current-person observations, and
 // require a symptom/reaction field (or an actual symptom item) to cover them.
 const routineCategories=new Set(['diet','sleep','elimination','activity','care'])
 for(const [sourceIndex,source] of sources.entries()){
  for(const [factIndex,fact] of parsed.get(`${source.id}:${source.page}`).facts.entries()){
   if(!(fact.type==='symptom'&&fact.subject==='event_subject'&&fact.polarity==='negated'))continue
   let represented=false
   for(const field of reconciled.flatMap(i=>i.fields).filter(f=>f.sources.some(ref=>ref.sourceId===source.id&&ref.page===source.page))){
    if(!values.has(field.value))values.set(field.value,await local.organize(field.value))
    if(values.get(field.value).facts.some(f=>f.type==='symptom'&&f.name===fact.name&&f.polarity==='negated')){represented=true;break}
   }
   if(!represented)throw evidenceFailure('生成结果遗漏了原话中的否定观察，请核对；原稿未修改','/items','negated_fact_coverage',{sourceIndex,factIndex,page:source.page})
  }
  const sourceItems=reconciled.filter(item=>item.fields.some(field=>field.sources.some(ref=>ref.sourceId===source.id&&ref.page===source.page)))
  if(!sourceItems.some(item=>routineCategories.has(item.category)))continue
  // Check literal body observations even when the general fact vocabulary has
  // no clinical concept for them. Reject omission; never manufacture a diagnosis.
  for(const observation of literalBodyObservations(source.text)){
   if(observation.subject!=='current'||observation.temporality!=='current')continue
   const represented=sourceItems.some(item=>item.fields.some(field=>
    (item.category==='symptom'||['symptom','reaction'].includes(field.name))&&
    field.sources.some(ref=>ref.sourceId===source.id&&ref.page===source.page&&
     [...clinicalAssertions(field.value),...literalBodyObservations(field.value)].some(a=>a.concept===observation.concept&&a.polarity===observation.polarity&&(ref.valueStart??ref.start)+a.start>=observation.clause.start&&(ref.valueStart??ref.start)+a.end<=observation.clause.end)
    )
   ))
   if(!represented)throw evidenceFailure('生成结果遗漏了原话中的身体观察，请核对；原稿未修改','/items','literal_observation_coverage',{sourceIndex,page:source.page})
  }
  for(const [factIndex,fact] of parsed.get(`${source.id}:${source.page}`).facts.entries()){
   if(!(fact.type==='symptom'&&fact.subject==='event_subject'&&fact.polarity==='affirmed'&&fact.temporality==='current'&&fact.assertionType==='observation'))continue
   let represented=false
   for(const item of sourceItems)for(const field of item.fields.filter(f=>(item.category==='symptom'||['symptom','reaction'].includes(f.name))&&f.sources.some(ref=>ref.sourceId===source.id&&ref.page===source.page))){
    if(!values.has(field.value))values.set(field.value,await local.organize(field.value))
    if(values.get(field.value).facts.some(f=>f.type==='symptom'&&f.name===fact.name&&f.polarity==='affirmed'&&f.subject==='event_subject')){represented=true;break}
   }
   if(!represented)throw evidenceFailure('生成结果遗漏了原话中的身体观察，请核对；原稿未修改','/items','affirmed_fact_coverage',{sourceIndex,factIndex,page:source.page})
  }
 }
 return reconciled
}
