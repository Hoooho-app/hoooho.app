import test from 'node:test'
import assert from 'node:assert/strict'
import {guideFrontDeskReply,questionTopic} from './front-desk-question-progress.mjs'
import {frontDeskRecordSections,recordSectionsText} from './front-desk-record-sections.mjs'
const q=(id,text,target='observation')=>({id,text,target})
const value=question=>({reply:question?`了解目前的观察。${question.text}`:'可以继续补充。',nextQuestion:question,taskRelation:'continue'})
test('unknown comparison is not asked again in different wording; unknown location exposes the existing picker',()=>{
 const previous={turnCount:2,askedQuestionIds:['bath'],checks:[]},latest={id:'m2',text:'洗澡前没观察过，无法比较。'}
 const result=guideFrontDeskReply(value(q('bath-again','洗完澡之后更明显吗？')),{previous,latest,effectiveQuestion:q('bath','洗澡前后有没有变化？')})
 assert.equal(result.question,null);assert.doesNotMatch(result.reply,/更明显/);assert.equal(result.interview.checks[0].state,'uncertain')
 const location=guideFrontDeskReply(value(null),{latest:{id:'m3',text:'说不清具体位置。'},effectiveQuestion:q('where','具体在哪个部位？')})
 assert.equal(location.interview.bodyLocationSuggested,true)
 assert.equal(location.interview.checks[0].state,'uncertain')
})
test('second question counts, relevant original choices are retained, unrelated generic questions do not collapse',()=>{
 const result=guideFrontDeskReply(value(q('skin-sensation','会痒或者疼吗？')),{previous:{turnCount:1,askedQuestionIds:['where']},knowledge:[{id:'skin-sensation',options:[{label:'看到抓挠',value:'我看到孩子反复抓挠。'}]}]})
 assert.equal(result.interview.turnCount,2);assert.equal(result.question.options[0].label,'看到抓挠')
 assert.notEqual(questionTopic(q('one','什么颜色？')).key,questionTopic(q('two','持续多久？')).key)
})
test('checking environment does not exclude a disease; another matter or deleted answer cannot supply progress',()=>{
 const previous={checks:[{key:'exposure',answerMessageId:'deleted',answerText:'没有',state:'answered'}]}
 const result=guideFrontDeskReply({...value(q('contact','有没有新接触的物品？')),taskRelation:'side_topic'},{previous,messages:[],latest:{id:'m',text:'我换个话题。'},effectiveQuestion:q('last','有没有新接触的物品？')})
 assert.deepEqual(result.interview.checks,[]);assert.ok(result.question);assert.doesNotMatch(result.reply,/排除|确诊/)
})
test('different observations in one display group remain separate; no observed scratching is an answer, not unobserved',()=>{
 assert.notEqual(questionTopic(q('a','孩子精神怎么样？')).key,questionTopic(q('b','孩子食欲怎么样？')).key)
 assert.notEqual(questionTopic(q('a','会痒吗？')).key,questionTopic(q('b','会疼吗？')).key)
 const result=guideFrontDeskReply(value(q('pain','会疼吗？')),{latest:{id:'m',text:'没有看到抓挠。'},effectiveQuestion:q('itch','会痒吗？')})
 assert.ok(result.question);assert.equal(result.interview.checks[0].state,'answered')
})
test('an upgraded conversation retires an older unknown target using persisted question bindings',()=>{
 const messages=[{id:'old-answer',kind:'text',status:'completed',text:'洗澡之前没有看过，无法比较。',contextQuestion:q('old-bath','洗澡前后有没有变化？')}]
 const result=guideFrontDeskReply(value(q('new-wording','洗完澡之后更红吗？')),{messages})
 assert.equal(result.question,null);assert.equal(result.interview.checks[0].state,'uncertain')
})
test('a body picker supplement does not answer the other observation currently being asked',()=>{
 const result=guideFrontDeskReply(value(q('bath','洗澡前后有没有变化？')),{latest:{id:'selection',text:'暂时无法确认具体症状部位。'},effectiveQuestion:q('bath','洗澡前后有没有变化？')})
 assert.ok(result.question);assert.deepEqual(result.interview.checks.map(check=>check.key),['location']);assert.equal(result.interview.checks[0].state,'uncertain')
 const first=guideFrontDeskReply(value(q('exposure','有没有新接触的衣物？')),{latest:{id:'first',text:'手上有红点，具体位置说不清。'}})
 assert.equal(first.interview.bodyLocationSuggested,true)
 const selected=guideFrontDeskReply(value(null),{previous:first.interview,latest:{id:'selected',text:'补充症状部位：左掌心。'}})
 assert.equal(selected.interview.bodyLocationSuggested,false);assert.equal(selected.interview.checks[0].state,'answered')
})
test('record fallback groups only current source-backed facts; excludes concern, retracted facts, and unknown negative inference',()=>{
 const subject={kind:'current',memberId:'child',confirmed:true},messages=[{id:'m1',contextId:'ctx',kind:'voice',status:'completed',text:'胳膊有红点。担心是不是过敏。'},{id:'m2',contextId:'ctx',kind:'text',status:'completed',text:'洗澡之前没有观察，不确定。'}]
 const facts=[{id:'f1',contextId:'ctx',text:'胳膊有红点',scope:'record',polarity:'affirmed',status:'active',subject,sources:[{messageId:'m1',quote:'胳膊有红点'}]},{id:'f2',contextId:'ctx',text:'担心是不是过敏',scope:'record',polarity:'concern',status:'active',subject,sources:[{messageId:'m1',quote:'担心是不是过敏'}]},{id:'f3',contextId:'ctx',text:'红点更多了',scope:'record',polarity:'affirmed',status:'superseded',subject,sources:[{messageId:'m1',quote:'红点更多了'}]}]
 const sections=frontDeskRecordSections({facts,interview:{checks:[{key:'bath-comparison',label:'洗浴前后变化',state:'uncertain',answerMessageId:'m2',answerText:messages[1].text}]}},messages)
 const text=recordSectionsText(sections)
 assert.match(text,/【情况概述】/);assert.match(text,/【待补充与核对】/);assert.match(text,/胳膊有红点/);assert.doesNotMatch(text,/担心|更多|没有变化|不过敏/)
})

test('numeric values are requested directly; unrelated observations do not complete temperature',()=>{
 const measurement=q('fever-measurement','有没有量过具体体温？','temperature')
 const result=guideFrontDeskReply(value(measurement),{knowledge:[{id:measurement.id,options:[{label:'已经量过',value:'已量'},{label:'还没量',value:'没量'}]}]})
 assert.equal(result.question.inputKind,'temperature');assert.deepEqual(result.question.options,[])
 assert.doesNotMatch(result.reply,/有没有量过/);assert.match(result.reply,/填写/)
 const unrelated=guideFrontDeskReply(value(null),{latest:{id:'m',text:'精神和平时一样。'},effectiveQuestion:measurement})
 assert.deepEqual(unrelated.interview.checks,[])
 const unknown=guideFrontDeskReply(value(measurement),{latest:{id:'m',text:'还没量。'},effectiveQuestion:measurement})
 assert.equal(unknown.question,null);assert.equal(unknown.interview.checks[0].state,'uncertain')
 const measured=guideFrontDeskReply(value(null),{latest:{id:'m',text:'测得体温 38.6℃。'},effectiveQuestion:measurement})
 assert.equal(measured.interview.checks[0].state,'answered')
})
