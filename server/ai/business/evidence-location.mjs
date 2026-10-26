import {clinicalAssertions,clinicalContext,evidenceClause} from '../../../shared/clinical-evidence.mjs'
import {extractTimeMentions} from '../providers/local-fact-provider.mjs'
import {evidenceFailure} from './evidence-diagnostics.mjs'

const assertionFields=new Set(['symptom','reaction','diagnosisCertainty','allergyStatus','historyName','doctorStatement','conclusion','food','medicationName','vaccineName','testName','statusRaw'])
function positions(text,part){const result=[];let at=0;while((at=text.indexOf(part,at))>=0){result.push(at);at+=Math.max(1,part.length)}return result}
const timeKey=text=>text.replace(/昨日/gu,'昨天').replace(/今日/gu,'今天').replace(/\s/gu,'')
// Repeated quotes are candidate ranges, never a promise that the first match is
// the right occurrence. A chosen value range travels with its exact quote.
export function locateEvidence(source,quote,value,field,item,path,sourceAssertions=clinicalAssertions(source.text),{allowOtherSubject=false}={}){
 const candidates=[],failures=[]
 for(const start of positions(source.text,quote))for(const offset of positions(quote,value)){
  const valueStart=start+offset,valueEnd=valueStart+value.length
  const assertions=sourceAssertions.filter(a=>a.start>=valueStart&&a.end<=valueEnd)
  const contexts=assertions.length?assertions:[clinicalContext(source.text,valueStart,valueEnd)]
  let invalid=null
  if(assertionFields.has(field.name))for(const context of contexts){
   const q=context.qualifier
   if(q&&(q.start<valueStart||q.end>valueEnd)){
    invalid={rule:q.start>=start&&q.end<=start+quote.length?'negation_scope':'negation_prefix',message:'引文或字段遗漏了该事项的否定或不确定限定，请核对完整原话'};break
   }
   const observation=item.category==='symptom'||['symptom','reaction'].includes(field.name)
   if(observation&&context.subject==='other'&&!allowOtherSubject){
    invalid={rule:'subject_context',message:'原话描述的是其他人物，不能保存为当前人物的症状'};break
   }
   if(observation&&['conditional','future'].includes(context.temporality)){
    invalid={rule:'temporal_context',message:'原话是假设或未来事项，不能保存为已经发生的症状'};break
   }
   if(observation&&context.temporality==='historical'){
    const preserved=context.historicalTime&&(value.includes(context.historicalTime)||item.timeText?.includes(context.historicalTime))
    if(!preserved){invalid={rule:'temporal_context',message:'原话的历史限定未进入记录，请保留历史时间后核对'};break}
   }
  }
  if(invalid){failures.push(invalid);continue}
  candidates.push({start,end:start+quote.length,valueStart,valueEnd})
 }
 let chosen=candidates
 if(chosen.length>1&&item.timeText){
  const matching=chosen.filter(c=>extractTimeMentions(evidenceClause(source.text,c.valueStart,c.valueEnd).text).some(t=>timeKey(t.value).includes(timeKey(item.timeText))||timeKey(item.timeText).includes(timeKey(t.value))))
  if(matching.length)chosen=matching
 }
 if(chosen.length!==1){
  if(!chosen.length&&failures.length){const f=failures[0];throw evidenceFailure(f.message,path,f.rule)}
  throw evidenceFailure('原话中存在多处相同引文，请引用含时间或主体的完整分句后核对',path,'evidence_ambiguous')
 }
 return chosen[0]
}
