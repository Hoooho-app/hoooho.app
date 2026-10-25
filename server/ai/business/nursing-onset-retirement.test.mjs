import test from 'node:test'
import assert from 'node:assert/strict'
import {nursingAnswerObservations} from './nursing-interview.mjs'
const onset={id:'onset',kind:'text',status:'completed',text:'昨天开始，持续了十分钟',answerTo:{contextId:'cold-context',questionId:'cold-onset'},answerQuestion:{text:'什么时候开始，持续多久？',domain:'cold'}}
const follow=text=>({id:'followup',kind:'text',status:'completed',text})
for(const text of ['今天喝了一杯水','今天吃了半碗粥','昨天睡了一个小时','今天咳嗽','今天身体还是凉'])test('dated unrelated or ongoing observation cannot retire an onset: '+text,()=>{
 const answers=nursingAnswerObservations([onset,follow(text)])
 assert.equal(answers.length,1)
 assert.equal(answers[0].sourceMessageId,'onset')
})
for(const text of ['其实今天开始','开始时间记错了，实际从今天开始','开始时间记错了，今天喝了一杯水','日期是前天','昨天开始，持续了二十分钟','记错了，其实今天开始','说错了，刚才没看清','孩子身体发冷是今天开始'])test('time-only or explicit same-topic correction retires old onset: '+text,()=>{
 assert.equal(nursingAnswerObservations([onset,follow(text)]).length,0)
})
test('a second bound onset answer replaces the first only in its own context and domain',()=>{
 const next={...onset,id:'replacement',text:'今天开始'}
 const answers=nursingAnswerObservations([onset,next])
 assert.deepEqual(answers.map(answer=>answer.sourceMessageId),['replacement'])
 const foreign={...next,answerTo:{contextId:'another-context',questionId:'cold-onset'}}
 assert.equal(nursingAnswerObservations([onset,foreign]).some(answer=>answer.sourceMessageId==='onset'),true)
})
test('generic correction handling for other nursing questions remains intact',()=>{
 const breathing={id:'breathing',kind:'text',status:'completed',text:'没有',answerTo:{contextId:'cough',questionId:'resp-effort'},answerQuestion:{text:'呼吸是否费力？',domain:'respiratory'}}
 assert.equal(nursingAnswerObservations([breathing,follow('说错了，刚才没看清')]).length,0)
 assert.equal(nursingAnswerObservations([breathing,follow('今天喝了一杯水')]).length,1)
})
