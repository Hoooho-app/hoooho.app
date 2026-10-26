import {evidenceClause} from '../../shared/clinical-evidence.mjs'

// A bounded language/authority guard, not a diagnosis or clinically approved
// triage policy. It never supplies a replacement answer or a medical threshold.
const quotes=/```[\s\S]*?```|“[^”]*”|「[^」]*」|『[^』]*』|"[^"\n]*"|'[^'\n]*'/gu
const doctor=/(?:医生|医师|大夫|医护|医嘱)(?:[^，,。；;！!？?\n]{0,10}?)(?:说|讲|告知|交代|嘱咐|建议|原话|记载|写|表示|认为)/u
const packageLabel=/(?:药盒|包装|标签|说明书)(?:[^，,。；;！!？?\n]{0,12})(?:写|标|注明|记载|说明|提示|建议)/u
const personal=/(?:我建议|建议(?:你|您)|你(?:可以|应当|应该|就)|您(?:可以|应当|应该|就)|所以|因此|据此|那么|可见)/u
const normalize=text=>String(text??'').replace(/\s+/gu,'').replace(/[。.!！?？；;]+$/gu,'').toLowerCase()
const amount=/[\d０-９一二两三四五六七八九十百半]+(?:[.．点][\d０-９一二两三四五六七八九十百]+)?\s*(?:毫克|毫升|微克|克|片|粒|袋|滴|mg|ml|[µμ]g|g)(?![a-z])/giu
const directions=/(?:建议|推荐|应当|应该|你可以|您可以|给(?:孩子|宝宝|患儿)|按(?:照)?体重|每公斤体重)/u
const perDose=/(?:每次|一次|单次|每剂|每天|每日|每晚|每早|每公斤|剂量|口服|服用|喂药|吃药|注射)[^，,。；;！!？?\n]{0,14}$/u
const feeding=/(?:喝奶|奶量|母乳|配方奶|辅食|喝水|饮水|食物|水果|吃粥|吃饭)/u
const medication=/(?:用药|服药|服用|吃药|喂药|药物|药液|药盒|剂量|注射|口服|毫克|mg)/iu
const rules=[
 ['UNREVIEWED_HOME_TRIAGE',/(?<!不)(?:可以|可|能够|能|建议|适合|只需|仅需|不妨|宜|先|继续|就)[^，,。；;！!？?\n]{0,14}(?:居家|在家|家中)(?:观察|休息|护理|处理|休养|调养)/gu],
 ['UNREVIEWED_HOME_TRIAGE',/(?:居家|在家|家中)(?:观察|休息|护理|处理|休养|调养)(?:就行|即可|就可以|可以了|吧)/gu],
 ['UNREVIEWED_CARE_DOWNGRADE',/(?:无须|无需|不用|不必|不需要|没有必要|没必要|不建议)(?:再|去|到|立即|马上|急着|进行|接受|做|额外|特别|任何|医院){0,5}(?:就医|就诊|去医院|看医生|看病|检查|拍片|复查|复诊|急诊)/gu],
 ['UNREVIEWED_RISK_INFERENCE',/(?:能|可(?:以)?|仍能|仍可)[^，,。；;！!？?“”「」『』"'\n]{1,14}(?:说明|意味着|表明|提示|所以|因此|可见|就(?:能|可(?:以)?)?(?:判断|认为))[^，,。；;！!？?“”「」『』"'\n]{0,16}风险(?:相对|比较|较|很|更|非常|十分|通常|一般|明显){0,4}(?:低|小|不高|不大|下降|降低|减少)/gu],
 ['UNSOURCED_EXCLUSION',/(?:已(?:经)?|可(?:以)?|能够|能|完全|肯定|明确|足以|确定)(?:排除|除外)[^，,。；;！!？?“”「」『』"'\n]{0,20}|(?:排除|除外)(?:了)?(?:骨折|骨裂)|(?:骨折|骨裂)(?:已经|已|可以)?(?:被)?(?:排除|除外)|(?:没有|并无|无|不是)(?:骨折|骨裂)/gu],
 ['UNSOURCED_CERTAINTY',/(?:肯定|一定|确定|绝对)(?:是|已经|已|可以|会|没有|没)?(?:无碍|无大碍|没有大碍|没事|没问题|没有问题|不会有问题|安全)/gu]
]
const invalid=reason=>Object.assign(new Error('护士回复尚需核对，原内容已保留'),{status:503,code:'FRONT_REPLY_SAFETY_INVALID',reason})

function textSources(messages){
 return messages.filter(message=>message&&message.role!=='assistant'&&message.kind!=='assistant'&&!['discarded','retracted','failed'].includes(message.status)).flatMap(message=>[
  typeof message.text==='string'?message.text:'',
  ...[...message.files??[],...message.voices??[],...message.attachments??[]].flatMap(file=>[file.recognizedText,file.text].filter(value=>typeof value==='string'))
 ]).filter(Boolean)
}
function quoteParts(reply){
 const ranges=[...reply.matchAll(quotes)].map(match=>({start:match.index,end:match.index+match[0].length,text:match[0].replace(/^```[^\n]*\n?|```$|^[“「『"']|[”」』"']$/gu,'')}))
 // Like existing unquoted checks, but preserve offsets for evidenceClause.
 let plain=reply
 for(const range of ranges)plain=plain.slice(0,range.start)+plain.slice(range.start,range.end).replace(/[^\n]/gu,' ')+plain.slice(range.end)
 return {plain,ranges}
}
function cautious(before,after=''){
 const prefix=before.trimEnd()
 return /(?:不能|不可以|不能够|无法|尚不能|尚无法|还不能|未能|不应|不宜|不得|不可|不要|禁止|别|并非|不是|不代表|不等于|尚未|未曾|无需|无须|不必|不用|不需要|没有必要|没必要|未|不)$/u.test(prefix)
  || /(?:不能|无法|尚未|并未|未能|未)(?:完全|明确|彻底|直接)?$/u.test(prefix)
  || /(?:不能|不要|不应|不宜|不得|不可|不建议)(?:直接|自行|随意|贸然|仅|只)?$/u.test(prefix)
  || /(?:不建议|不应该|不应当|不能|不要|不应|不得|不可)(?:直接|自行|随意|贸然)?(?:给(?:孩子|宝宝|患儿)|每次|每剂|一次|口服|服用)[^，,。；;！!？?\n]{0,16}$/u.test(prefix)
  || /(?:不能|无法|不应|不宜|不得|不可|不要)[^，,。；;！!？?\n]{0,24}(?:判断|断定|确认|说明|认为|保证|建议|推断|说)[^，,。；;！!？?\n]{0,12}$/u.test(prefix)
  || /(?:不能|无法|不应|不宜|不可)(?:仅|只)?(?:凭|根据|因为)[^，,。；;！!？?\n]{0,16}(?:就)?$/u.test(prefix)
  || /(?:不能|不要|不应|不得|不可|不建议)(?:直接|自行|随意|贸然|仅|只)?(?:根据|依据|按照|按|照)[^，,。；;！!？?\n]{0,16}$/u.test(prefix)
  || /^\s*[，,]?\s*(?:但|并|也)?(?:(?:这一|这个|这样的|这种|的)?(?:说法|判断|结论))?\s*(?:并|也|仍)?(?:不成立|缺乏依据|没有依据|不能作为(?:结论|建议))/u.test(after)
  || /^\s*[，,]?\s*(?:但|并|也)?(?:这一?说法|这样的?说法|这一?判断|这个结论|的结论|结论|说法)?(?:还|尚|仍)?(?:不能|无法|不应|不可|不成立|不一定|缺乏)[^。；;！!？?\n]{0,30}(?:判断|确定|确认|断定|成立|依据|支持|得出|保证|下结论|作为)/u.test(after)
}
function sourceSupports(sources,phrase,requireDoctor){
 const needle=normalize(phrase)
 if(!needle)return false
 return sources.some(original=>{
  const normalized=normalize(original),parts=quoteParts(normalized)
  for(let at=normalized.indexOf(needle);at>=0;at=normalized.indexOf(needle,at+Math.max(1,needle.length))){
   const context=evidenceClause(normalized,at,at+needle.length),before=normalized.slice(context.start,at)
   // A positive substring of "cannot exclude" or "do not take" is not a
   // faithful quotation, even though the words themselves exist in the source.
   if(cautious(before)||/(?:不要|禁止|别|不让|不许|不准)[^，,。；;！!？?\n]{0,8}$/u.test(before))continue
   const range=parts.ranges.find(item=>item.start<=at&&item.end>=at+needle.length)
   const scope=range?evidenceClause(parts.plain,range.start,range.end):context
   const attribution=range?parts.plain.slice(scope.start,range.start):normalized.slice(context.start,at+needle.length)
   if(!requireDoctor||doctor.test(attribution))return true
  }
  return false
 })
}
const supportedDoctor=(sources,phrase)=>sourceSupports(sources,phrase,true)
function doctorReadback(sources,before,phrase,statement){
 const attributed=doctor.exec(before)
 const end=attributed?attributed.index+attributed[0].length:0
 const claim=statement?statement.slice(end).replace(/^\s*[：:]\s*/u,''):phrase
 return Boolean(attributed&&!personal.test(before.slice(end))&&supportedDoctor(sources,claim))
}
function factualDoseReadback(sources,clause,phrase){
 return /(?:你说|您说|家长说|原话|描述|记录|提到|昨天|昨晚|当时|已经服|已服|服用了|吃了)/u.test(clause)&&!/(?:建议|推荐|应该|应当|你可以|您可以)/u.test(clause)&&sourceSupports(sources,phrase,false)
}
function diagnosticPurpose(before,claim){
 // Seeking an examination to exclude something is not a claim that it has
 // already been excluded. Keep this exception local to a pending purpose;
 // it cannot authorize a completed result or any other advice in the reply.
 if(!/^(?:排除|除外)(?!了)/u.test(claim))return false
 const prefix=before.trimEnd()
 if(/(?:已(?:经)?|曾(?:经)?|完成|证实|确定|肯定|明确|成功|检查后|就医后)/u.test(prefix))return false
 return /(?:待|有待|尚待|仍需|还需|需要|需)(?:进一步)?$/u.test(prefix)
  || /(?:需要|需|应当|应该|建议|请|要|准备|计划|将)[^，,。；;！!？?\n]{0,30}(?:就医|就诊|检查|拍片)(?:以|来|以便|用于|以期)?$/u.test(prefix)
  || /(?:就医|就诊|检查|拍片)(?:以|来|以便|用于|以期)$/u.test(prefix)
}

/** Returns the exact validated reply; never creates a medical recommendation. */
export function assertFrontDeskReplySafety({reply,messages=[],responseMode}={}){
 if(typeof reply!=='string'||!Array.isArray(messages))throw invalid('INVALID_REPLY_INPUT')
 // Mode is context only; a record/conversation label cannot authorize advice.
 void responseMode
 const sources=textSources(messages),{plain,ranges}=quoteParts(reply)
 function allowed(match,{dose=false,exclusionGoal=false}={}){
  const start=match.index,end=start+match[0].length,range=ranges.find(item=>item.start<=start&&item.end>=end)
  const clause=evidenceClause(plain,start,end),before=plain.slice(clause.start,start),after=plain.slice(end,clause.end)
  const outerBefore=range?plain.slice(clause.start,range.start):before
  const afterQuote=range?plain.slice(range.end).split(/[。；;！!？?\n]/u)[0]:after
  const inner=range?evidenceClause(reply,start,end):null
  if(cautious(before,range?afterQuote:after)||inner&&cautious(reply.slice(inner.start,start),reply.slice(end,inner.end)))return true
  if(exclusionGoal&&diagnosticPurpose(inner?reply.slice(inner.start,start):before,match[0]))return true
  const phrase=range?range.text:match[0],attribution=(range?outerBefore:before)+(!range?match[0]:'')
  const sentenceEnd=reply.slice(end).search(/[。；;！!？?\n]/u)
  const attributedStatement=range?null:reply.slice(clause.start,sentenceEnd<0?reply.length:end+sentenceEnd)
  if(doctorReadback(sources,attribution,phrase,attributedStatement))return true
  if(dose){
   // Reading a label is not a personalized instruction. Do not turn a quoted
   // amount into "you can take this" later in the same reply.
   const label=packageLabel.exec(attribution)
   if(label&&!personal.test(attribution.slice(label.index+label[0].length)))return true
   if(!doctor.test(attribution)&&factualDoseReadback(sources,reply.slice(clause.start,clause.end),phrase))return true
  }
  return false
 }
 for(const [reason,pattern] of rules)for(const match of reply.matchAll(pattern))if(!allowed(match,{exclusionGoal:reason==='UNSOURCED_EXCLUSION'}))throw invalid(reason)
 for(const match of reply.matchAll(amount)){
  const clause=evidenceClause(reply,match.index,match.index+match[0].length)
  if(feeding.test(clause.text)&&!medication.test(clause.text))continue
  const prefix=reply.slice(clause.start,match.index),range=ranges.find(item=>item.start<=match.index&&item.end>=match.index+match[0].length)
  const outer=range?plain.slice(Math.max(0,plain.lastIndexOf('。',range.start-1)+1),range.start):''
  if((directions.test(prefix)||perDose.test(prefix)||doctor.test(outer))&&!allowed(match,{dose:true}))throw invalid('INDIVIDUALIZED_MEDICATION_DOSE')
 }
 if([...reply.matchAll(amount)].length){
  const copy=/(?:你|您)(?:可以|应该|应当|就)[^，,。；;！!？?\n]{0,10}(?:按|照)[^，,。；;！!？?\n]{0,14}(?:服用|服药|用药|吃药|喂药)|(?:按|照)(?:着|此|这个|这剂量|此剂量|包装|说明书|药盒)[^，,。；;！!？?\n]{0,10}给(?:孩子|宝宝|患儿)[^，,。；;！!？?\n]{0,6}(?:服|喂|吃药)/gu
  for(const match of reply.matchAll(copy))if(!allowed(match,{dose:true}))throw invalid('INDIVIDUALIZED_MEDICATION_DOSE')
 }
 return reply
}
