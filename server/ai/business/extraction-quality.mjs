import { LocalFactProvider, extractTimeMentions } from '../providers/local-fact-provider.mjs'
import { resolveItemTime } from './contract.mjs'
import { outputFailure } from '../providers/output-diagnostics.mjs'
import { evidenceFailure } from './evidence-diagnostics.mjs'

const symptomFields=new Set(['symptom','location','severityOriginal','handling'])
// Reconcile metadata only after exact quote validation. Do not create fields,
// remove negation, infer diagnoses, or replace the supplier's extracted facts.
export async function reconcileExtraction(items,sources,context){
 const parsed=new Map(),local=new LocalFactProvider()
 for(const source of sources)parsed.set(`${source.id}:${source.page}`,await local.organize(source.text))
 const reconciled=items.map((item,index)=>{
  const result=structuredClone(item)
  if(['examination','other'].includes(result.category)&&result.fields.some(f=>f.name==='symptom')&&result.fields.every(f=>symptomFields.has(f.name))){
   result.categoryResolution={original:result.category,source:'field_contract'};result.category='symptom'
  }
  const times=new Set(),timeSources=[]
  for(const field of result.fields.filter(f=>f.name==='symptom'))for(const ref of field.sources){
   const source=sources.find(s=>s.id===ref.sourceId&&s.page===ref.page)
   const quoteStart=ref.start,quoteEnd=ref.end
   if(!source||source.text.indexOf(ref.quote)!==source.text.lastIndexOf(ref.quote))continue
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
 const values=new Map()
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
 }
 return reconciled
}
