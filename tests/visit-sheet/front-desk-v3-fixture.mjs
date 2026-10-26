// Local UI test double only. Never import from server/src or describe its
// deterministic replies as model understanding, image recognition or clinical QA.
const unknown=()=>({kind:'unknown',memberId:null,label:null,sources:[]})
const noAction=()=>({type:'none',targetIds:[],targetVersion:null,confirmation:'none',quote:''})
const courtesy=/^(?:谢谢(?:你|您|护士)?|感谢|辛苦了|收到|知道了)[。！!\s]*$/u
const command=/^(?:保存这条|保存这条记录|先记下来|先整理|继续处理|停止追问|不再追问|先按已经说过的情况记录)[。！!\s]*$/u
const contextualAck=/^(?:好|好的|嗯)[。！!\s]*$/u
const fail=message=>Object.assign(new Error(message),{code:'UI_FIXTURE_NEEDS_EXPLICIT_FRONT_REPLY'})

export const isExtendedFrontDeskFixtureRequest=body=>Boolean(body?.text?.format?.schema?.properties?.responseMode)
export function fixtureContextId(input){
 return input?.conversation?.activeContextId??input?.history?.at(-1)?.id??'new'
}
// These replace only local controller aliases. An explicit /front-reply-data
// override remains the authoritative provider output, even when malformed.
export function resolveFrontDeskFixtureAliases(value,input){
 if(value==='@latest')return input.latest.id
 if(value==='@context')return fixtureContextId(input)
 if(Array.isArray(value))return value.map(item=>resolveFrontDeskFixtureAliases(item,input))
 return value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,resolveFrontDeskFixtureAliases(item,input)])):value
}

function literalTextChanges(input){
 const text=input.latest.text??''
 if(!text.trim()||courtesy.test(text)||command.test(text)||!/[\p{L}\p{N}]/u.test(text)||contextualAck.test(text)&&!input.conversation?.effectiveQuestion)return []
 // This double supports a bounded literal grammar, not production clinical
 // classification. Complex citations/replacements need /front-reply-data.
 if(/[“”「」『』"`]|(?:不是|不对)[^，,。；;]*[，,](?:而)?是|假设|如果|忽略规则|立即保存/u.test(text))throw fail('Configure an explicit synthetic front reply for quoted, corrected or instruction-like input')
 const clauses=[...text.matchAll(/[^，,。；;！!？?\n]+/gu)].map(match=>match[0].trim()).filter(Boolean)
 if(clauses.length>10)throw fail('Configure explicit synthetic facts for a long UI fixture')
 return clauses.filter(clause=>!command.test(clause)).map(clause=>{
  let polarity='affirmed'
  if(/^(?:我)?担心/u.test(clause))polarity='concern'
  else if(/^(?:(?:今天|昨天|刚才|现在)\s*)?(?:不知道|不清楚|没注意|未注意|没观察|未观察)/u.test(clause))polarity='unknown'
  else if(/^(?:(?:今天|昨天|刚才|现在)\s*)?(?:没有|未见|并无|无|没)(?!注意|观察)/u.test(clause))polarity='negated'
  else if(/^(?:明天|后天|下周|计划|准备)/u.test(clause))polarity='planned'
  else if(/不知道|不清楚|没注意|未观察|不确定|好像|似乎|可能|没有|未见|否认|担心|计划/u.test(clause))throw fail('Split or explicitly configure mixed-polarity UI fixture text')
  const source={messageId:input.latest.id,attachmentId:null,quote:clause}
  return {type:'add',targetId:null,text:clause,scope:'record',polarity,subject:{...unknown(),sources:[source]},sources:[source]}
 })
}

/** Returns a legal extended contract from explicit local synthetic sources. */
export function extendedFrontDeskFixtureOutput(input,{semanticDecision,visualOutput}={}){
 if(!input?.latest||typeof input.latest.id!=='string'||typeof input.latest.text!=='string')throw fail('UI fixture requires a real latest message ID and literal text')
 const contextId=fixtureContextId(input),changes=literalTextChanges(input)
 const image=input.latest.attachments?.find(file=>file.mimeType?.startsWith('image/'))
 // Only a controller-declared synthetic observation may stand in for pixels.
 // An arbitrary uploaded image never creates a canned rash/report/diagnosis.
 if(image&&visualOutput?.kind==='observation'&&visualOutput.status==='readable'){
  for(const observation of visualOutput.observations??[]){
   if(typeof observation.text!=='string'||!observation.text.trim())throw fail('Synthetic observation must contain its declared literal text')
   const source={messageId:input.latest.id,attachmentId:image.id,quote:observation.text}
   changes.push({type:'add',targetId:null,text:observation.text,scope:'record',polarity:'affirmed',subject:{...unknown(),sources:[source]},sources:[source]})
  }
 }
 const controlledQuestion=semanticDecision?.status==='ask'?semanticDecision.question:null
 const question=controlledQuestion?{id:null,text:controlledQuestion.text,target:`fixture:${controlledQuestion.slot??'observation'}`,sourceMessageId:input.latest.id}:null
 return {
  reply:courtesy.test(input.latest.text)?'好的，需要补充时接着说。':question?.text??(image&&!changes.length?'测试图片已收到，可继续补充说明。':'测试替身已收到这条原文。'),
  contextId,responseMode:question?'clarification':changes.length?'record':'conversation',taskRelation:contextId==='new'?'new':changes.length?'continue':'side_topic',subject:unknown(),recordChanges:changes,nextQuestion:question,requestedAction:noAction(),uncertainties:[],emergency:{currentChild:false,quote:''}
 }
}
