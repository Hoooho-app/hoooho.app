import {clinicalContext,evidenceClause} from '../../../shared/clinical-evidence.mjs'
import {nursingObservationContext} from './nursing-observation-context.mjs'
import {extractTimeMentions} from '../providers/local-fact-provider.mjs'
import {resolveItemTime} from './contract.mjs'
import {evidenceFailure} from './evidence-diagnostics.mjs'

// Additional source scope for live parent narration. Clinical document header
// dates keep their existing reconciliation path. Never repair a mismatched date
// by choosing an unconfirmed date for the parent.
export function groundNursingEvidence(items,sources,context){
 const primaryNames=new Set(['symptom','quality','reaction','chiefComplaint','statusRaw'])
 const domains=items.map(item=>new Set(nursingObservationContext(item.fields.filter(f=>primaryNames.has(f.name)).map(f=>f.value).join('\n')).active))
 return items.map(item=>{
  if(item.archiveCategory==='family-history'&&item.category!=='symptom'||!['symptom','sleep','injury','other'].includes(item.category))return item
  const grounded=structuredClone(item),localTimes=[],primaryScopes=[]
  for(const field of grounded.fields){
   if(field.editedBy==='user')continue
   for(const ref of field.sources??[]){
    const source=sources.find(s=>s.id===ref.sourceId&&s.page===ref.page)
    if(source?.id!=='input')continue
    const start=Number.isInteger(ref.valueStart)?ref.valueStart:source.text.indexOf(field.value,Math.max(0,ref.start??0)),end=start+field.value.length
    if(start<0||source.text.slice(start,end)!==field.value)continue
    if((context.supersededAnswers??[]).some(a=>Number.isInteger(a.rawStart)&&Number.isInteger(a.rawEnd)&&start<a.rawEnd&&end>a.rawStart))throw evidenceFailure('这段回答已经更正，请按最新原话重新整理','/items','superseded_answer')
    const clause=evidenceClause(source.text,start,end),before=source.text.slice(clause.start,start)
    const owner=nursingObservationContext(source.text).clauses.find(c=>c.start<=start&&c.end>=Math.min(end,clause.end))
    if(owner?.subject==='other'&&['symptom','quality','reaction','chiefComplaint','statusRaw','doctorStatement'].includes(field.name))throw evidenceFailure('这段观察的描述对象尚需核对，原话已保留','/items','subject_context')
    // Preserve low-confidence parent wording instead of promoting the final
    // disease word to a confirmed diagnosis. The full local clause is evidence.
    if(['symptom','reaction','chiefComplaint','statusRaw','doctorStatement'].includes(field.name)&&(/(?:不太像|不大像|不像|看不出(?:是|有)?|说不准(?:是|有)?|可能|好像|似乎|怀疑|疑似|感觉像|不知道(?:是不是|是否))(?:(?:是不是|孩子|宝宝|一点|有点|明显|轻微|这次|本次|是|有|为|的|很|特别)){0,6}$/u.test(before)||/(?:保姆|老师|家人|照护者).{0,6}(?:说|告诉|转述)/u.test(before))){
     field.value=clause.text.trim();field.sources=[{sourceId:source.id,page:source.page,quote:field.value,start:clause.start,end:clause.end,valueStart:clause.start,valueEnd:clause.end}]
    }
    if(['symptom','quality','reaction','chiefComplaint','statusRaw'].includes(field.name)){
     primaryScopes.push({text:clause.text,source})
     localTimes.push(...extractTimeMentions(clause.text).map(t=>t.value))
     const prior=source.text.slice(0,clause.start).replace(/[，,。；;！!？?\n\s]+$/u,'').split(/[，,。；;！!？?\n]/u).at(-1)??'',priorTimes=extractTimeMentions(prior)
     if(priorTimes.length===1&&/^(?:开始|发生|起)?$/u.test(prior.replace(priorTimes[0].value,'').trim()))localTimes.push(priorTimes[0].value)
     if(item.timeText&&clause.text.includes(item.timeText))localTimes.push(item.timeText)
    }
   }
  }
  // A persisted answer to this observation's onset question may be a separate
  // source turn. Bind it only to one unambiguous item, never to every item that
  // happens to share the input source or a neighbouring line.
  const boundTimes=[]
  for(const answer of context.answerContext??[]){
   if(!context.frontContextId||answer.contextId!==context.frontContextId||answer.status!=='active'||answer.questionId!==`${answer.domain}-onset`)continue
   const matches=items.filter((candidate,index)=>domains[index].size===1&&domains[index].has(answer.domain))
   if(matches.length!==1||matches[0]!==item)continue
   const source=primaryScopes.find(scope=>scope.source.id==='input'&&Number.isInteger(answer.rawStart)&&Number.isInteger(answer.rawEnd)&&scope.source.text.slice(answer.rawStart,answer.rawEnd)===answer.answerText)?.source
   if(!source||nursingObservationContext(answer.answerText).active.some(domain=>domain!==answer.domain))continue
   const times=extractTimeMentions(answer.answerText)
   // A model may quote the full bound onset phrase, including its duration.
   // Require literal source wording; all date ranges and precisions are still
   // compared below, so a duration or a conflicting date cannot become onset.
   if(!grounded.timeText||!answer.answerText.includes(grounded.timeText)||!times.some(time=>grounded.timeText.includes(time.value)))continue
   localTimes.push(...times.map(time=>time.value))
   boundTimes.push({sourceId:source.id,page:source.page,quote:answer.answerText,start:answer.rawStart,end:answer.rawEnd,sourceMessageId:answer.sourceMessageId,questionId:answer.questionId})
  }
  if(grounded.timeText&&primaryScopes.length&&!localTimes.length&&primaryScopes.some(s=>s.source.text.includes(grounded.timeText))&&!primaryScopes.some(s=>s.text.includes(grounded.timeText)))throw Object.assign(evidenceFailure('该时间属于另一段描述，原话已保留','/items/timeText','temporal_context'),{code:'AI_TIME_CONFLICT',status:422})
  if(grounded.timeText&&localTimes.length){
   const chosen=resolveItemTime(grounded,context),unique=[...new Set(localTimes)]
   if(!unique.every(raw=>{const expected=resolveItemTime({timeText:raw},context);return expected.resolvedStart===chosen.resolvedStart&&expected.resolvedEnd===chosen.resolvedEnd&&expected.precision===chosen.precision}))throw Object.assign(evidenceFailure('生成时间与这条观察的原话不一致，原话已保留','/items/timeText','time_context'),{code:'AI_TIME_CONFLICT',status:422})
  }
  if(boundTimes.length)grounded.timeResolution={source:'bound_nursing_answer',references:boundTimes}
  return grounded
 })
}
