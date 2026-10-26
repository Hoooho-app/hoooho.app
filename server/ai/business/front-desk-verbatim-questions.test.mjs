import test from 'node:test'
import assert from 'node:assert/strict'
import {isFrontDeskVerbatimQuestionDraft as eligible} from './front-desk-verbatim-questions.mjs'
import {buildFrontDeskFactSources} from './front-desk-source-context.mjs'
import {bindFrontDeskAnswerContext} from './front-desk-answer-context.mjs'
import {buildProfessionalSummary} from './professional-summary.mjs'

const scope={accountId:'account-1',memberId:'member-1',contextId:'context-1'}
const unknown={kind:'unknown',memberId:null,label:null,sources:[],confirmed:false}
function fixture(answer='没有',{question='孩子这次发热了吗？',target='fever',voice=false}={}){
 const q={id:'question-1',messageId:'nurse-1',text:question,target}
 const messages=[{...scope,id:'nurse-1',kind:'assistant',role:'assistant',status:'completed',text:question,inputAt:1000,understanding:{version:'front-desk-understanding-v2',nextQuestion:{id:q.id,text:question,target}}},{...scope,id:'answer-1',kind:voice?'voice':'text',role:'user',status:'completed',text:answer,inputAt:2000,revision:1,contextQuestion:q,files:[],voices:voice?[{id:'audio-1',mimeType:'audio/wav'}]:[],...(voice?{transcriptVerified:true}:{})}]
 const polarity=['不知道','没注意'].includes(answer)?'unknown':answer==='没有'?'negated':'affirmed'
 const source={messageId:'answer-1',attachmentId:voice?'audio-1':null,quote:answer}
 const facts=[{...scope,id:'fact-1',changeId:'change-1',sourceMessageId:'answer-1',status:'active',saved:false,text:answer,scope:'record',polarity,subject:structuredClone(unknown),sources:[source]}]
 const sources=buildFrontDeskFactSources({facts,messages})
 const items=[{id:'item-1',category:'symptom',archiveCategory:null,title:'temporary model title',subject:'unknown',timeText:null,time:{raw:null,resolvedStart:null,resolvedEnd:null,precision:'unknown',source:'user_text'},timeSources:[],fields:[{name:'symptom',value:answer,sources:[{sourceId:'fact-1',page:1,quote:answer,start:0,end:answer.length,valueStart:0,valueEnd:answer.length}],editedBy:'model'}]}]
 bindFrontDeskAnswerContext(items,sources)
 items[0].professionalSummary=buildProfessionalSummary(items[0],{sources})
 const draft={accountId:scope.accountId,memberId:scope.memberId,frontContextId:scope.contextId,frontDeskRecord:true,smartRecord:true,semanticVersion:2,state:'preparing',frontEvidenceVersion:1,frontFacts:structuredClone(facts),frontSources:structuredClone(sources),sources,items,documents:[],pages:[],voices:voice?[{id:'audio-1',mimeType:'audio/wav'}]:[],frontUnderstanding:{version:'front-desk-understanding-v2',contextId:scope.contextId,action:'record',responseMode:'clarification',taskRelation:'continue',recordChangesPending:false,recordChanges:[{id:'change-1',type:'add',targetId:null,text:answer,scope:'record',polarity,subject:structuredClone(unknown),sources:[source]}],requestedAction:{type:'none',targetIds:[],targetVersion:null,confirmation:'none',quote:''}}}
 return {draft,messages,facts}
}
const check=value=>eligible(value.draft,{messages:value.messages,facts:value.facts})
const rejectChanges=(mutations,create=fixture)=>{
 for(const [name,mutate] of Object.entries(mutations)){const value=create();mutate(value);assert.equal(check(value),false,name)}
}

test('a pure original question and exact answer is eligible without interpreting a clinical negative, value or unknown',()=>{
 for(const [answer,options] of [['没有',{}],['不知道',{}],['没注意',{}],['39',{question:'刚量的体温是多少摄氏度？',target:'temperature_celsius'}],['120ml',{question:'这次的量是多少？',target:'intake_amount'}]]){
  const value=fixture(answer,options),before=structuredClone(value)
  assert.equal(check(value),true,answer)
  assert.equal(value.draft.items[0].title,'问答记录')
  assert.equal(value.draft.items[0].professionalSummary.text,`问：${options.question??'孩子这次发热了吗？'}答：${answer}。`)
  assert.deepEqual(value,before,'classification does not rewrite the draft or source')
 }
})
test('only the extended record understanding can positively select this path',()=>{
 rejectChanges({legacy:v=>delete v.draft.frontUnderstanding.version,pending:v=>v.draft.frontUnderstanding.recordChangesPending=true,respond:v=>v.draft.frontUnderstanding.action='respond',consultation:v=>v.draft.frontUnderstanding.responseMode='consultation',history:v=>v.draft.frontUnderstanding.responseMode='history',unclear:v=>v.draft.frontUnderstanding.taskRelation='unclear',otherContext:v=>v.draft.frontUnderstanding.contextId='another',oldProtocol:v=>v.draft.semanticVersion=1,notFront:v=>v.draft.frontDeskRecord=false,missingChanges:v=>v.draft.frontUnderstanding.recordChanges=[]})
})
test('save requests and affirmative operation questions cannot become new health QA records',()=>{
 for(const type of ['save','save_original','delete','query','export','stop','cancel']){const value=fixture();value.draft.frontUnderstanding.requestedAction.type=type;assert.equal(check(value),false,type)}
 for(const options of [{question:'需要我保存这条记录吗？',target:'save-confirmation'},{question:'这是哪位家庭成员的记录？',target:'subject_identity'},{question:'同意继续吗？',target:'permission'},{question:'确认删除吗？',target:'ordinary_question'},{question:'你在哪个城市？',target:'city'}])assert.equal(check(fixture('好',options)),false,options.target)
})
test('missing original messages, stale facts or forged source metadata fail closed',()=>{
 const value=fixture();assert.equal(eligible(value.draft),false)
 assert.equal(eligible(value.draft,{messages:value.messages,facts:[]}),false)
 rejectChanges({changedFact:v=>v.facts[0].text='有',changedQuote:v=>v.draft.sources[0].originalReferences[0].quote='有',phantomSource:v=>v.draft.sources.push({...v.draft.sources[0],id:'phantom'}),lostFrontSource:v=>v.draft.frontSources=[],questionTarget:v=>v.draft.sources[0].questionContext.target='vomiting',questionText:v=>v.draft.sources[0].questionContext.text='有没有呕吐？',changedTimestamp:v=>v.draft.sources[0].sourceAt='2020-01-01T00:00:00.000Z'})
})
test('complete ledger and source coverage prevents omitted clinical facts from being hidden by a pure-looking candidate',()=>{
 const value=fixture(),extra={...structuredClone(value.facts[0]),id:'clinical',changeId:'clinical-change',sourceMessageId:'clinical-message',text:'咳嗽',polarity:'affirmed',sources:[{messageId:'clinical-message',attachmentId:null,quote:'咳嗽'}]}
 value.facts.push(extra);value.messages.push({...scope,id:'clinical-message',kind:'text',role:'user',status:'completed',text:'咳嗽',inputAt:3000})
 assert.equal(check(value),false,'actual ledger has evidence absent from the draft snapshot')
 value.draft.frontFacts=structuredClone(value.facts)
 assert.equal(check(value),false,'updating the snapshot cannot hide a non-bare clinical fact')
 value.draft.sources=buildFrontDeskFactSources({facts:value.facts,messages:value.messages});value.draft.frontSources=structuredClone(value.draft.sources)
 assert.equal(check(value),false,'even fully sourced mixed clinical evidence stays on v2')
})
test('a question must be the one actually shown immediately before the answer, not quoted or metadata-only',()=>{
 rejectChanges({missingAssistant:v=>v.messages.shift(),metadataOnly:v=>v.messages[0].text='先聊别的。',quotedOnly:v=>v.messages[0].text='医生当时问：“孩子这次发热了吗？”',laterAssistant:v=>v.messages.push({...v.messages[0],id:'newer-nurse',text:'先不用回答。',inputAt:1500,understanding:{nextQuestion:null}}),twoQuestions:v=>v.messages[0].text='孩子这次发热了吗？有没有呕吐？',changedMetadata:v=>v.messages[0].understanding.nextQuestion.target='vomiting',futureQuestion:v=>v.messages[0].inputAt=2500,wrongRole:v=>v.messages[0].role='user',withdrawn:v=>v.messages[0].retracted=true})
})
test('foreign message ownership, fact scope and duplicate message IDs never qualify',()=>{
 rejectChanges({account:v=>v.messages[1].accountId='another',member:v=>v.messages[0].memberId='another',context:v=>v.messages[1].contextId='another',factContext:v=>{v.facts[0].contextId='another';v.draft.frontFacts=structuredClone(v.facts)},duplicate:v=>v.messages.push({...v.messages[0]}),missingTime:v=>delete v.messages[1].inputAt,missingOwner:v=>delete v.messages[0].accountId})
})
test('withdrawn, corrected, revised or already saved evidence cannot downgrade into verbatim QA',()=>{
 rejectChanges({inactive:v=>{v.facts[0].status='retracted';v.draft.frontFacts=structuredClone(v.facts)},corrected:v=>v.draft.frontUnderstanding.recordChanges[0].type='correct',replacement:v=>{v.facts[0].replaces='old';v.draft.frontFacts=structuredClone(v.facts)},saved:v=>{v.facts[0].saved=true;v.draft.frontFacts=structuredClone(v.facts)},revised:v=>v.messages[1].revision=2,edited:v=>v.messages[1].editedBy='user',retained:v=>v.draft.sources[0].retainedFromFactId='old',amended:v=>v.draft.sources[0].amendedBy='new',retractedMessage:v=>v.messages[1].retracted=true,failedMessage:v=>v.messages[1].status='failed'})
})
test('only a verified retained voice transcript can supply an audio bare answer',()=>{
 assert.equal(check(fixture('没有',{voice:true})),true)
 rejectChanges({unverified:v=>v.messages[1].transcriptVerified=false,missingOriginal:v=>v.messages[1].voices=[],differentOriginal:v=>v.messages[1].voices[0].id='another',imageCaption:v=>{v.messages[1].kind='image';v.messages[1].files=[{id:'image',mimeType:'image/png'}]},extraImage:v=>v.draft.pages=[{id:'page-1'}],attachment:v=>v.messages[1].attachments=[{id:'image'}]},()=>fixture('没有',{voice:true}))
})
test('classification rejects inferred titles, fields, dates, clinical summaries and user edits',()=>{
 rejectChanges({clinicalTitle:v=>v.draft.items[0].title='孩子无发热',clinicalField:v=>v.draft.items[0].fields[0].name='symptom',inferredValue:v=>v.draft.items[0].fields[0].value='没有发热',archive:v=>v.draft.items[0].archiveCategory='examination',clinicalCategory:v=>v.draft.items[0].category='symptom',date:v=>v.draft.items[0].timeText='今天',resolvedTime:v=>v.draft.items[0].time.resolvedStart='2026-10-26T00:00:00Z',exactTime:v=>v.draft.items[0].time.precision='exact',extraTimeRef:v=>v.draft.items[0].timeSources=[{sourceId:'fact-1',quote:'今天'}],userEdit:v=>v.draft.items[0].fields[0].editedBy='user',clinicalSummary:v=>v.draft.items[0].professionalSummary.text='没有发热。',aiSummary:v=>v.draft.items[0].professionalSummary.version='professional-summary-v2',forgedContext:v=>v.draft.items[0].contextualAnswers[0].questionText='有没有呕吐？',orphanField:v=>v.draft.items[0].fields[0].sources[0].sourceId='another'})
})
test('explicit ownership confirmation alone may change identity metadata while keeping the original QA immutable',()=>{
 const value=fixture();value.draft.state='ready'
 value.facts[0].subject={kind:'current',memberId:scope.memberId,confirmed:true,confirmedBy:'user'}
 value.draft.sources[0].subject=structuredClone(value.facts[0].subject)
 value.draft.items[0].subject='current';value.draft.items[0].subjectConfirmed=true;value.draft.items[0].subjectMemberId=scope.memberId
 assert.equal(check(value),true,'save still independently enforces actual confirmation, permissions and versions')
 value.facts[0].subject.memberId='different';assert.equal(check(value),false)
})
test('multiple QA records require one-to-one coverage and cannot silently discard or duplicate an answer',()=>{
 const one=fixture(),two=fixture('39',{question:'体温是多少摄氏度？',target:'temperature_celsius'})
 const renamed=JSON.parse(JSON.stringify(two).replaceAll('question-1','question-2').replaceAll('nurse-1','nurse-2').replaceAll('answer-1','answer-2').replaceAll('fact-1','fact-2').replaceAll('change-1','change-2').replaceAll('item-1','item-2'))
 renamed.messages[0].inputAt=3000;renamed.messages[1].inputAt=4000
 const value=one;value.messages.push(...renamed.messages);value.facts.push(...renamed.facts);value.draft.frontFacts=structuredClone(value.facts)
 value.draft.sources=buildFrontDeskFactSources({facts:value.facts,messages:value.messages});value.draft.frontSources=structuredClone(value.draft.sources);value.draft.items.push(...renamed.draft.items)
 assert.equal(check(value),true)
 value.draft.items.pop();assert.equal(check(value),false,'all active answers must be represented')
 value.draft.items.push(renamed.draft.items[0],structuredClone(renamed.draft.items[0]));assert.equal(check(value),false,'duplicate candidates are not extra evidence')
})
test('failed verification, prior clinical material and recovery previews cannot select this path after rejection',()=>{
 rejectChanges({failed:v=>v.draft.state='failed',preview:v=>v.draft.preview={text:'failed model output'},summaryRepair:v=>v.draft.summaryRecoveryCount=1,coverageRepair:v=>v.draft.coverageRecoveryCount=1,priorClinical:v=>v.draft.frontPreviousItems=[{category:'symptom'}],priorSource:v=>v.draft.frontPreviousSources=[{text:'咳嗽'}],manualOriginal:v=>v.draft.manualOriginal=true,profileBatch:v=>v.draft.profileBatch=true,existingRecord:v=>v.draft.sourceRecordId='record-1',unresolved:v=>v.draft.unresolvedItems=['待确认']})
})
test('hidden clinical projections, unrelated originals and operation metadata cannot bypass a pure-looking label',()=>{
 rejectChanges({journal:v=>v.draft.items[0].journal={categories:['other'],timePrecision:'unknown',symptom:{narrative:'没有发热'}},visibility:v=>v.draft.items[0].visibilityCategories=['symptom'],foreignItem:v=>v.draft.items[0].subjectMemberId='another',foreignSource:v=>v.draft.sources[0].subject={kind:'other'},followUp:v=>v.draft.followUp=true,extraVoice:v=>v.draft.voices=[{id:'unprocessed',mimeType:'audio/wav'}],operationMetadata:v=>v.messages[0].understanding.responseMode='operation',failedLastQuestion:v=>v.messages.push({...v.messages[0],id:'failed-nurse',inputAt:1500,status:'failed'})})
 const voice=fixture('没有',{voice:true});voice.draft.voices=[];assert.equal(check(voice),false,'retained original must still be available to the actual draft')
})
