import {buildFrontDeskFactSources} from './front-desk-source-context.mjs'
import {frontDeskQuestionClaims} from './front-desk-answer-context.mjs'

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
const nonempty=value=>typeof value==='string'&&Boolean(value.trim())
const list=value=>Array.isArray(value)?value:[]
const bare=/^(?:(?:暂时|还|不太)?(?:不知道|不清楚|没注意|没留意|没有|没|有|嗯|好|是|不是)|[+\-]?\d+(?:[.．]\d+)?\s*(?:[a-zA-Z℃°%]+)?)[。！!\s]*$/u
const canonical=value=>Array.isArray(value)?value.map(canonical):object(value)?Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,canonical(value[key])])):value
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b))
const time=message=>Number.isFinite(message.inputAt)?message.inputAt:Date.parse(message.at)
const order=(a,b)=>time(a)-time(b)||a.id.localeCompare(b.id)
const noValues=value=>value==null||Array.isArray(value)&&value.length===0
const hasEdits=value=>value?.editedBy==='user'||Object.keys(value??{}).some(key=>/EditedBy$/u.test(key)&&value[key]!=null)
const compatibleOwner=(value,draft)=>!value||['unknown','current'].includes(value.kind)&&(!value.memberId||value.memberId===draft.memberId)
const nonRecordTarget=/(?:save|archiv|delete|export|cancel|stop|permission|consent|subject|member|identity|confirm|city|location_context|产品|操作|保存|归档|删除|导出|取消|停止|归属|身份|成员|城市)/iu
const operationQuestion=/(?:保存|归档|入档|删除|导出|取消|停止|撤销|发送|提交|切换|同意|授权|允许|归属|家庭成员|哪位|谁|名字|身份|我帮你|我来|需要我)/u
// Only mutable ownership-confirmation metadata is outside this comparison.
// Literal content, source references, sourceAt and question metadata stay exact.
function withoutOwnership(value){
 const {subject,subjectResolution,subjectConfirmed,subjectMemberId,subjectConfirmedBy,...rest}=value
 return rest
}
const sourceKey=source=>`${source.id}:${source.page}`
const sortedSources=sources=>sources.map(withoutOwnership).sort((a,b)=>sourceKey(a).localeCompare(sourceKey(b)))
const factShape=fact=>Object.fromEntries(['id','contextId','accountId','memberId','changeId','sourceMessageId','text','scope','polarity','status','sources'].filter(key=>fact[key]!==undefined).map(key=>[key,fact[key]]))
const sameFacts=(left,right)=>equal(left.map(factShape).sort((a,b)=>a.id.localeCompare(b.id)),right.map(factShape).sort((a,b)=>a.id.localeCompare(b.id)))
function inScope(value,draft,requireOwnership=false){
 return value.contextId===draft.frontContextId&&['accountId','memberId'].every(key=>value[key]===draft[key]||!requireOwnership&&value[key]==null)
}
function actualQuestion(source,answer,messages,draft){
 const metadata=source.questionContext
 if(!object(metadata)||!['id','messageId','text','target'].every(key=>nonempty(metadata[key]))||nonRecordTarget.test(metadata.target)||operationQuestion.test(metadata.text))return null
 const before=messages.filter(message=>message.kind==='assistant'&&inScope(message,draft,true)&&time(message)<time(answer)).sort(order).at(-1)
 const question=before?.understanding?.nextQuestion
 if(!before||before.status!=='completed'||before.id!==metadata.messageId||!object(question)||question.id!==metadata.id||question.text!==metadata.text||question.target!==metadata.target||before.retracted||before.quoted||before.role&&before.role!=='assistant'||['operation','history'].includes(before.understanding.responseMode)||before.understanding.requestedAction?.type&&before.understanding.requestedAction.type!=='none')return null
 // Metadata alone cannot create an asked question. Quoted questions, stale
 // earlier questions and two-question turns are deliberately ineligible.
 const original=String(before.text??''),masked=original.replace(/```[\s\S]*?```|“[^”]*”|「[^」]*」|『[^』]*』|"[^"\n]*"|^\s*>.*$/gmu,match=>match.replace(/[^\n]/g,' '))
 const questions=[...masked.matchAll(/[^。！？.!?\n]*[?？]/gu)]
 if(questions.length!==1)return null
 const range=questions[0],shown=original.slice(range.index,range.index+range[0].length).trim()
 return shown===metadata.text?metadata:null
}

/**
 * Classifies only exact original question/answer records, never clinical facts.
 * Call positively before AI summarization, and recheck with current server-owned
 * messages/facts at save. This is not an AI-verification-failure fallback, an
 * ownership check, a save authorization, or a client-supplied capability marker.
 */
export function isFrontDeskVerbatimQuestionDraft(draft,{messages,facts=draft?.frontFacts}={}){
 try{
  if(!object(draft)||draft.frontDeskRecord!==true||draft.semanticVersion!==2||!['preparing','ready'].includes(draft.state)||!['accountId','memberId','frontContextId'].every(key=>nonempty(draft[key]))||!Number.isInteger(draft.frontEvidenceVersion)||draft.frontEvidenceVersion<1)return false
  const understanding=draft.frontUnderstanding,action=understanding?.requestedAction
  if(understanding?.version!=='front-desk-understanding-v2'||understanding.recordChangesPending!==false||understanding.action!=='record'||!['record','clarification','conversation'].includes(understanding.responseMode)||!['new','continue','resume'].includes(understanding.taskRelation)||!['new',draft.frontContextId].includes(understanding.contextId)||action?.type!=='none'||action.confirmation!=='none'||!noValues(action.targetIds)||action.targetVersion!=null||action.quote!=='')return false
  if(!compatibleOwner(understanding.subject,draft)||draft.manualOriginal||draft.profileBatch||draft.profileBatchId||draft.followUp===true||draft.sourceRecordId||draft.targetEventId||draft.preview!=null||draft.error||draft.summaryRecoveryCount||draft.coverageRecoveryCount)return false
  for(const key of ['documents','pages','unresolvedItems','unmappedRows','documentWarnings','pageProblems','answerObservations','supersededAnswers','frontPreviousItems','frontPreviousSources'])if(!noValues(draft[key]))return false
  if(!Array.isArray(messages)||!messages.length||!Array.isArray(facts)||!facts.length||!Array.isArray(draft.frontFacts)||!sameFacts(facts,draft.frontFacts)||!Array.isArray(draft.sources)||!Array.isArray(draft.items)||!draft.items.length)return false
  if(messages.some(message=>!object(message)||!nonempty(message.id)||!Number.isFinite(time(message)))||new Set(messages.map(message=>message.id)).size!==messages.length)return false
  if(new Set(facts.map(fact=>fact.id)).size!==facts.length)return false
  for(const fact of facts){
   if(!nonempty(fact.id)||!inScope(fact,draft)||fact.status!=='active'||fact.scope!=='record'||!['affirmed','negated','unknown'].includes(fact.polarity)||!bare.test(fact.text??'')||fact.saved||fact.recordId||!noValues(fact.recordIds)||fact.replaces||fact.retractedBy||fact.supersededBy||fact.retracted||hasEdits(fact)||!['unknown','current'].includes(fact.subject?.kind)||fact.subject?.memberId&&fact.subject.memberId!==draft.memberId||list(fact.sources).length!==1)return false
  }
  const changes=understanding.recordChanges
  if(!Array.isArray(changes)||!changes.length||changes.some(change=>change.type!=='add'||change.targetId!=null||change.scope!=='record'||!facts.some(fact=>fact.changeId===change.id&&fact.text===change.text&&fact.polarity===change.polarity&&equal(fact.sources,change.sources))))return false
  const rebuilt=buildFrontDeskFactSources({facts,messages})
  if(rebuilt.length!==facts.length||new Set(rebuilt.map(sourceKey)).size!==rebuilt.length||draft.sources.length!==rebuilt.length||!equal(sortedSources(draft.sources),sortedSources(rebuilt))||draft.frontSources!=null&&(!Array.isArray(draft.frontSources)||!equal(sortedSources(draft.frontSources),sortedSources(rebuilt))))return false
  if([...draft.sources,...list(draft.frontSources)].some(source=>!compatibleOwner(source.subject,draft)))return false
  const pairs=new Map(),usedQuestions=new Set(),usedVoices=new Set()
  for(const source of rebuilt){
   const fact=facts.find(fact=>fact.id===source.id),reference=source.originalReferences?.[0],answer=messages.find(message=>message.id===reference?.messageId)
   if(!fact||source.changeType!=='add'||source.status!=='readable'||source.retainedFromFactId||source.amendedBy||source.literalCorrection||source.originalReferences?.length!==1||!answer||!inScope(answer,draft,true)||answer.status!=='completed'||answer.role&&answer.role!=='user'||!['text','voice'].includes(answer.kind)||answer.quoted||answer.retracted||hasEdits(answer)||answer.revision!=null&&answer.revision!==1||list(answer.files).length||list(answer.attachments).length||!bare.test(answer.text??'')||answer.text.trim()!==source.text||fact.text!==source.text||reference.quote!==source.text||fact.sourceMessageId!==answer.id)return false
   if(answer.kind==='voice'&&(answer.transcriptVerified!==true||!reference.attachmentId||!list(answer.voices).some(voice=>voice.id===reference.attachmentId&&voice.mimeType?.startsWith('audio/')))||answer.kind==='text'&&(reference.attachmentId||list(answer.voices).length))return false
   if(answer.kind==='voice')usedVoices.add(reference.attachmentId)
   const question=actualQuestion(source,answer,messages,draft)
   if(!question||usedQuestions.has(question.messageId))return false
   usedQuestions.add(question.messageId);pairs.set(source.id,{source,answer,question})
  }
  if(list(draft.voices).length!==usedVoices.size||list(draft.voices).some(voice=>!usedVoices.has(voice.id)||!voice.mimeType?.startsWith('audio/'))||new Set(list(draft.voices).map(voice=>voice.id)).size!==usedVoices.size)return false
  const seen=new Set()
  for(const item of draft.items){
   if(!nonempty(item.id)||item.category!=='other'||item.archiveCategory!==null||item.title!=='问答记录'||item.timeText!==null||hasEdits(item)||item.manualAdded||item.timeEditedBy||item.unassigned||item.needsReview||item.occurrenceUncertain||!noValues(item.timeSources)||!noValues(item.unresolvedItems)||!noValues(item.answerObservations)||!noValues(item.supersededAnswers)||!noValues(item.visibilityCategories)||!['unknown','current'].includes(item.subject)||item.subjectMemberId&&item.subjectMemberId!==draft.memberId||!compatibleOwner(item.subjectResolution,draft)||!Array.isArray(item.fields)||!item.fields.length)return false
   if(item.journal&&(!equal(item.journal.categories,['other'])||item.journal.timePrecision!=='unknown'||Object.keys(item.journal).some(key=>!['categories','timePrecision'].includes(key))))return false
   if(item.time&&(item.time.raw!=null||item.time.resolvedStart!=null||item.time.resolvedEnd!=null||item.time.precision!=='unknown'||item.time.defaulted))return false
   const itemSources=[]
   for(const field of item.fields){
    if(field.name!=='conclusion'||hasEdits(field)||field.resolvedValue!=null||field.timeResolution||field.sources?.length!==1)return false
    const reference=field.sources[0],pair=pairs.get(reference.sourceId)
    if(!pair||seen.has(reference.sourceId)||reference.page!==pair.source.page||reference.quote!==pair.source.text||field.value!==pair.source.text||reference.sourceKind&&reference.sourceKind!=='user_text'||reference.start!=null&&reference.start!==0||reference.end!=null&&reference.end!==pair.source.text.length||reference.valueStart!=null&&reference.valueStart!==0||reference.valueEnd!=null&&reference.valueEnd!==pair.source.text.length)return false
    seen.add(reference.sourceId);itemSources.push(pair.source)
   }
   const expected=itemSources.map(source=>({sourceId:source.id,page:source.page,questionId:source.questionContext.id,questionMessageId:source.questionContext.messageId,questionText:source.questionContext.text,answerText:source.text}))
   if(!equal(item.contextualAnswers,expected))return false
   const claims=frontDeskQuestionClaims(item,rebuilt)
   if(claims.length!==item.fields.length)return false
   if(item.professionalSummary){
    const canonicalClaims=claims.map(({text,factIds})=>({text,factIds})),summary=item.professionalSummary
    if(summary.version!=='professional-summary-v1'||summary.text!==canonicalClaims.map(claim=>claim.text).join('；')+'。'||!equal(summary.claims,canonicalClaims)||summary.verification||summary.title!=null)return false
   }
  }
  return seen.size===pairs.size
 }catch{return false}
}
