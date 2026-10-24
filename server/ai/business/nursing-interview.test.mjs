import test from 'node:test'
import assert from 'node:assert/strict'
import { nursingMemberContext, nursingKnowledgeFor, nursingInterview, stopsNursingInterview, interpretNursingAnswer, nursingAnswerObservations } from './nursing-interview.mjs'

test('month age uses Shanghai civil birthday instead of UTC midnight',()=>{
  assert.equal(nursingMemberContext({birthday:'2026-04-25'},'2026-10-24T16:30:00Z').ageMonths,6)
  assert.equal(nursingMemberContext({birthday:'2026-04-25'},'2026-10-24T15:30:00Z').ageMonths,5)
  assert.equal(nursingMemberContext({},'2026-10-24T16:30:00Z').ageMonths,null)
})
test('normal or unknown background does not swallow the actual concern',()=>{
  for(const [text,domain] of [['今天拉稀，尿量和平时一样','bowel'],['昨晚小腿起红点，呼吸正常','skin'],['身上有点东西，尿量正常','skin'],['没有咳嗽，昨晚睡不好','sleep']])assert.equal(nursingKnowledgeFor(text).domain,domain,text)
})
test('infant observation uses caregiver behaviour rather than spoken itch or pain',()=>{
  const infant=nursingKnowledgeFor('小腿红点，昨晚开始',{ageMonths:6}).nodes.find(n=>n.id==='skin-sensation')
  assert.match(infant.text,/观察|抓挠|躲开/)
  assert.doesNotMatch(infant.options.map(o=>o.value).join(''),/孩子说/)
  assert.match(nursingKnowledgeFor('小腿红点，昨晚开始',{ageMonths:120}).nodes.find(n=>n.id==='skin-sensation').text,/说痒|说痒或疼/)
})
test('oral observation requires a cue and never claims a dental diagnosis',()=>{
  assert.equal(nursingKnowledgeFor('这两晚醒来哭',{ageMonths:24}).nodes.some(n=>n.id==='oral-observation'),false)
  const oral=nursingKnowledgeFor('这两晚醒来哭，白天摸嘴',{ageMonths:24}).nodes.find(n=>n.id==='oral-observation')
  assert.ok(oral)
  assert.doesNotMatch(JSON.stringify(oral),/蛀牙|龋齿|最可能/)
})
test('unknown, gratitude and explicit finish end ordinary questions',()=>{
  for(const text of ['不知道','没注意','我想先记下来','先按已经说过的情况记录，不再追问。','谢谢','暂时没注意具体部位，先按已经说过的情况记录。']){
    assert.equal(stopsNursingInterview(text),true,text)
    assert.equal(nursingInterview({text:'身上有点东西\n'+text,latestText:text,member:{}}).question,null)
  }
  assert.equal(stopsNursingInterview('不知道几点开始，但现在呼吸费力'),false)
})
test('ordinary budget is enforced even if a provider asks for another question',()=>{
  const previous={askedQuestionIds:['skin-location','skin-appearance','skin-sensation']}
  const result=nursingInterview({text:'身上有点东西',latestText:'还记不清开始时间',previous,requestedQuestionId:'skin-onset',member:{}})
  assert.equal(result.status,'ready');assert.equal(result.turnCount,3);assert.equal(result.question,null)
})
test('a low-value third question is omitted and a completed interview stays complete',()=>{
  const result=nursingInterview({text:'昨晚小腿出现红点，很痒',latestText:'很痒',previous:{askedQuestionIds:['skin-location','skin-appearance']},member:{}})
  assert.equal(result.status,'ready')
  assert.equal(nursingInterview({text:'咳嗽',latestText:'再补一条咳嗽',previous:{status:'ready',askedQuestionIds:[]},member:{}}).status,'ready')
})
test('quick options do not add an unobserved denial or change or to and',()=>{
  const skin=nursingKnowledgeFor('昨晚小腿红点').nodes.find(n=>n.id==='skin-sensation')
  assert.equal(skin.options.find(o=>o.label==='看到抓挠').value,'我看到孩子反复抓挠那里。')
  const sleep=nursingKnowledgeFor('这两晚醒来哭').nodes.find(n=>n.id==='sleep-consolation')
  assert.equal(sleep.options.find(o=>o.label==='能平静下来').value,'哭闹后经家长安抚，孩子可以平静下来。')
})
test('only unambiguous answers to a specific question can be interpreted',()=>{
  assert.equal(interpretNursingAnswer('resp-effort','没有').text,'家长未见孩子有明显呼吸费力')
  assert.equal(interpretNursingAnswer('skin-location','没有'),null)
  assert.equal(interpretNursingAnswer('resp-effort','不知道').polarity,'unknown')
  assert.equal(interpretNursingAnswer('resp-effort','没有咳嗽'),null)
})
test('answer evidence stays linked to one question and yields to a later relevant update',()=>{
  const answer={id:'answer-1',kind:'voice',text:'没有',status:'completed',answerTo:{questionId:'resp-effort',contextId:'one'},answerQuestion:{text:'呼吸有没有明显费力？',domain:'respiratory'}}
  const found=nursingAnswerObservations([answer])
  assert.equal(found[0].sourceMessageId,'answer-1');assert.equal(found[0].questionId,'resp-effort')
  assert.deepEqual(nursingAnswerObservations([answer,{kind:'text',text:'现在呼吸明显费力',status:'completed'}]),[])
})
test('time-of-night background cannot hide cough, and multiple active concerns remain selectable',()=>{
 const night=nursingKnowledgeFor('夜里咳嗽，把自己咳醒了。')
 assert.equal(night.domain,'respiratory')
 assert.ok(night.nodes.some(n=>n.id==='resp-effort'))
 const mixed=nursingKnowledgeFor('昨天尿量少，今天主要想记孩子咳嗽。')
 assert.equal(mixed.domain,'respiratory')
 assert.equal(mixed.nodes[0].id,'resp-effort')
 assert.equal(nursingInterview({text:'小腿红点，还有咳嗽',latestText:'还有咳嗽',requestedQuestionId:'resp-effort',member:{}}).domain,'respiratory')
 assert.ok(nursingKnowledgeFor('孩子白天摸嘴，不愿吃硬的').nodes.some(n=>n.id==='oral-observation'))
})
test('only relevant authored observation cards and actual handling responses enter retrieval',()=>{
 const knowledge=nursingKnowledgeFor('今天小腿红点，涂了药')
 assert.equal(knowledge.cards.length,1)
 assert.equal(knowledge.cards[0].domain,'skin')
 assert.equal(knowledge.cards[0].reviewStatus,'pending_clinical_review')
 assert.ok(knowledge.cards[0].forbiddenInference.length)
 assert.ok(knowledge.nodes.some(n=>n.id==='handling-response'))
 for(const text of ['今天小腿红点，打算涂了药再看看','今天小腿红点，没有涂了药','今天小腿红点，姐姐涂了药','今天小腿红点，涂了药，涂药后没有变化'])assert.equal(nursingKnowledgeFor(text).nodes.some(n=>n.id==='handling-response'),false,text)
 const infant=nursingKnowledgeFor('这两晚醒来哭，白天摸嘴',{ageMonths:6}).nodes.find(n=>n.id==='oral-observation')
 assert.doesNotMatch(JSON.stringify(infant.options),/孩子自述|孩子说/)
})
