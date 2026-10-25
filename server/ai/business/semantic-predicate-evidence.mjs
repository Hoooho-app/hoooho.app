// It suppresses redundant questions only. Never turn this result into a field,
// diagnosis, new negative finding, or proof that the whole history is complete.
import {clinicalAssertions,clinicalContext} from '../../../shared/clinical-evidence.mjs'
import {nursingObservationContext} from './nursing-observation-context.mjs'

const predicates=new Set(['bleeding','pain','itch','breathing_effort','activity_impact','handling_done'])
const unknown=/不(?:太)?(?:知道|清楚|确定)|没(?:有)?(?:注意|留意|观察|看清)|未观察|看不清|说不准|拿不准|不记得|记不清|是否|有没有|是不是|会不会|好像|可能|似乎|疑似|怀疑|不能排除|不排除|不是没有|并非没有|并未否认/u
const historical=/昨天|昨日|昨晚|昨夜|前天|上周|上个月|去年|以前|之前|小时候|当时|曾经|过去|刚才|[一二两三四五六七八九十\d]+(?:分钟|小时|天|周)前/gu
const current=/现在|目前|此刻|正在|现已|今天|今日/gu
const conditional=/如果|假如|假设|万一|要是|若是|若出现|若发生|明天|后天|下周|将来|准备|计划|打算/u
const reported=/(?:医生|护士|老师|家人|保姆|妈妈|爸爸|别人|报告|资料|图片|照片|截图)[^，,。；;！!？?\n]{0,12}(?:说|问|交代|表示|建议|写着|显示|看到|可见|告诉|转述)|听说|网上|说明书|举个例子/u
const last=(pattern,text)=>[...text.matchAll(pattern)].at(-1)?.index??-1
// Veto only: these labels never become a body-location field or a fact. Missing
// or conflicting detail means keep asking rather than infer an event target.
function bodyScope(text){
 const value=String(text??''),families=[]
 for(const [name,pattern] of [
  ['foot',/脚|[左右双]足|足(?:部|趾|底|背|跟|踝|小趾)/u],
  ['hand',/手(?!术|动|机|续|册|臂)|掌心|手掌|手指|手腕/u],
  ['leg',/腿|膝/u],['arm',/胳膊|手臂|上臂|前臂|肘/u],
  ['head',/头部|头皮|额头|脑袋/u],['face',/脸|面部|颊/u],['neck',/颈|脖/u],['eye',/眼/u],['ear',/耳/u],
  ['mouth',/嘴|口腔|牙龈|牙齿/u],['abdomen',/肚|腹/u],['back',/背部|后背/u],['chest',/胸/u],['shoulder',/肩/u],['waist',/腰/u],['buttock',/臀|屁股/u],
 ])if(pattern.test(value))families.push(name)
 const sides=[...new Set([...value.matchAll(/左|右/gu)].map(m=>m[0]))],details=[]
 if(families.includes('foot'))for(const [name,pattern] of [['little_toe',/小拇指|小趾|小脚趾|第五趾/u],['big_toe',/大拇(?:指|趾)|大脚趾|拇趾|第一趾/u],['ankle',/脚踝|足踝/u],['heel',/脚跟|足跟/u],['sole',/脚底|足底/u]])if(pattern.test(value))details.push(name)
 if(families.includes('hand'))for(const [name,pattern] of [['little_finger',/小拇指|小指/u],['wrist',/手腕/u],['palm',/手掌|掌心/u]])if(pattern.test(value))details.push(name)
 const ambiguous=families.length>1||sides.length>1||details.length>1||/多处|两处|另一处|另外一处|两个(?:伤口|部位)|几处/u.test(value)||!families.length&&/小拇指|小指|小趾|另一(?:只|个)伤口/u.test(value)
 return {family:families[0]??null,side:sides[0]??null,detail:details[0]??null,explicit:families.length>0||sides.length>0||ambiguous,ambiguous}
}
function sameBodyTarget(anchorText,answerText){
 const anchor=bodyScope(anchorText),answer=bodyScope(answerText)
 if(anchor.ambiguous||answer.ambiguous)return false
 if(!anchor.family)return !answer.explicit
 if(answer.family&&answer.family!==anchor.family)return false
 if(answer.side&&anchor.side&&answer.side!==anchor.side)return false
 if(answer.detail&&anchor.detail&&answer.detail!==anchor.detail)return false
 return true
}
function insideQuote(text,index){const pairs={'“':'”','‘':'’','「':'」','『':'』','"':'"',"'":"'"},stack=[];for(const c of text.slice(0,index)){if(stack.length&&c===stack.at(-1))stack.pop();else if(Object.hasOwn(pairs,c))stack.push(pairs[c])}return stack.length>0}
function candidates(text,predicate){
 if(['bleeding','pain','itch'].includes(predicate))return clinicalAssertions(text).filter(a=>predicate==='bleeding'?a.concept==='出血':predicate==='itch'?a.concept==='瘙痒':['疼痛','头痛','腹痛','咽痛'].includes(a.concept))
 const pattern=predicate==='breathing_effort'?/呼吸(?:明显)?费力|呼吸困难|喘不过气/gu:predicate==='activity_impact'?/日常活动(?:没有受到|未受到|未受|受到|受)(?:明显)?影响/gu:predicate==='handling_done'?/还(?:没有|没)(?:做|进行|采取)?(?:过)?处理|尚未(?:做|进行|采取)?处理|没有(?:做|进行|采取)?(?:过)?处理|未处理|已(?:经)?(?:做过|做了|采取过|采取了|进行过|进行了)?处理|(?:做了|做过|采取了|进行过)处理/gu:null
 return pattern?[...text.matchAll(pattern)].map(m=>({start:m.index,end:m.index+m[0].length,text:m[0],...clinicalContext(text,m.index,m.index+m[0].length),...(predicate==='handling_done'||predicate==='activity_impact'?{explicitPolarity:/没有|没|未/u.test(m[0])?'no':'yes'}:{})})):[]
}
function classify(text,predicate){
 const context=nursingObservationContext(text),observations=[]
 for(const a of candidates(text,predicate)){
  const owner=context.clauses.find(c=>c.start<=a.start&&c.end>=a.end)
  if(!owner?.eligible||owner.subject!=='current'||a.subject!=='current'||a.temporality!=='current'||insideQuote(text,a.start))continue
  const sentenceStart=Math.max(...[...text.slice(0,a.start).matchAll(/[。；;！!？?\n]/gu)].map(m=>m.index+1),0),before=text.slice(sentenceStart,a.start),local=a.clause.text
  if(conditional.test(before)||reported.test(text.slice(sentenceStart,a.end))||/照片|图上|图片|图中|图里|报告|病历/u.test(local)||last(historical,before)>last(current,before))continue
  const isQuestion=/[?？]/u.test(text.slice(a.clause.start,a.clause.end+1))||/[吗么]\s*$/u.test(local)
  if(unknown.test(local)||isQuestion||!['affirmed','negated'].includes(a.polarity)){observations.push({known:false});continue}
  observations.push({known:true,predicate,polarity:a.explicitPolarity??(a.polarity==='negated'?'no':'yes'),quote:local,start:a.clause.start,end:a.clause.end})
 }
 if(!observations.length)return null
 // A contradictory or explicitly unknown current description cannot inherit an
 // older clear negative. Preserve the ambiguity for the semantic model.
 if(observations.some(o=>!o.known)||new Set(observations.map(o=>o.polarity)).size>1)return {known:false}
 return observations.at(-1)
}

export function findCurrentLiteralPredicateAnswer(messages,predicate,{contextId,topic}={}){
 if(!predicates.has(predicate)||!Array.isArray(messages))return null
 for(const message of [...messages].reverse()){
  if(message.kind==='assistant'||message.status!=='completed'||message.recordable===false||['unknown','other'].includes(message.semanticSubject)||typeof message.text!=='string'||contextId&&message.contextId!==contextId)continue
  const bound=message.answerQuestion?.semantic
  if(topic&&bound?.topic&&bound.topic!==topic)continue
  const raw=message.text.trim().replace(/[。！!，,\s]+$/u,'')
  // Only the exact persisted, single-predicate question can bind a bare short
  // reply. A composite/null-predicate question cannot supply its meaning.
  if(bound?.version===2&&bound.predicate===predicate){
   if(/^(?:不知道|不清楚|没注意|没留意|不记得|看不清)$/u.test(raw))return null
   const no=/^(?:没有|没|不是|不会|没看到|没发现)$/u.test(raw),yes=/^(?:有|有的|是|是的|会)$/u.test(raw)
   if(no||yes)return {predicate,polarity:no?'no':'yes',sourceMessageId:message.id,quote:message.text,start:0,end:message.text.length}
  }
  const observation=classify(message.text,predicate)
  if(observation)return observation.known?{predicate,polarity:observation.polarity,sourceMessageId:message.id,quote:observation.quote,start:observation.start,end:observation.end}:null
 }
 return null
}

// Narrow controller entry point: only the incoming answer to the exact
// server-owned persisted question can suppress a new same-predicate question.
// The caller must still enforce current subject, safe media and non-urgent state.
export function findBoundCurrentLiteralPredicateAnswer(message,predicate,{contextId,questionId,topic,anchorText}={}){
 const target=message?.answerTo,question=message?.answerQuestion,bound=question?.semantic
 if(typeof contextId!=='string'||typeof questionId!=='string'||!target||target.contextId!==contextId||target.questionId!==questionId||question?.id!==questionId||bound?.version!==2||bound.predicate!==predicate||!predicates.has(predicate)||topic&&(bound.topic??question.domain)!==topic)return null
 if(!['pending','completed'].includes(message.status)||message.kind==='assistant'||message.recordable===false||['unknown','other'].includes(message.semanticSubject))return null
 if(!sameBodyTarget(anchorText,message.text))return null
 // FrontDeskRecord keeps an incoming answer in its provisional context until
 // model selection commits it. Use its already-validated answerTo scope here;
 // no persisted message is mutated and no evidence is added to the draft.
 return findCurrentLiteralPredicateAnswer([{...message,contextId:target.contextId,status:'completed'}],predicate,{contextId,topic})
}

// Integration: prefer the strict bound helper above for the current incoming
// answer, after semantic selection. If the proposed q predicate has evidence,
// suppress that one q with a
// distinct stopReason (e.g. answered_predicate), preserving unresolvedItems.
// Do not bypass intent/current-owner/safe-media/urgent gates. A model rewrite,
// if desired, may run once; a second duplicate must end as incomplete, not loop.
