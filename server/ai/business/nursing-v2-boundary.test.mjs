import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import cases from './fixtures/nursing-v2-boundaries.json' with {type:'json'}
import registry from './nursing-source-registry.json' with {type:'json'}
import library from './nursing-question-library.json' with {type:'json'}
import {confirmedCurrentEmergency} from '../nurse-emergency.mjs'
import {nursingResponseIntent} from './nursing-response-intent.mjs'
import {nursingKnowledgeFor,nursingInterview,interpretNursingAnswer,nursingAnswerObservations} from './nursing-interview.mjs'

for(const c of cases.urgent)test(`source-scoped important observation: ${c.id}`,()=>{
 assert.equal(confirmedCurrentEmergency({currentChild:c.currentChild,quote:c.quote},{text:c.text}),c.expected)
})
for(const [i,c] of cases.response.entries())test(`reply intent ${i+1}: ${c.text}`,()=>{
 const found=nursingResponseIntent(c.text)
 assert.equal(found.kind,c.kind)
 assert.equal(found.stop,c.kind!=='none')
 if(c.kind==='unknown')assert.equal(interpretNursingAnswer('resp-effort',c.text)?.polarity,'unknown')
})
test('every full unknown choice stops and remains unknown instead of becoming a negative finding',()=>{
 for(const q of library.questions){
  const choice=q.options.find(o=>o.label==='没注意')
  if(!choice)continue
  assert.equal(nursingResponseIntent(choice.value).stop,true,q.id)
  assert.equal(interpretNursingAnswer(q.id,choice.value)?.polarity,'unknown',q.id)
 }
})
test('question facts are scoped to the same child, topic and observation slot',()=>{
 const checks=[
  ['三天没大便，便便很硬。','bowel',[],['stool-count','bowel-urine']],
  ['便秘了，排出来都是一粒粒的。','bowel',[],['stool-count']],
  ['今天拉稀，药吃了2次。','bowel',['stool-count'],[]],
  ['今天身上有东西，昨天头碰了一下。','skin',['skin-location'],[]],
  ['今天发烧，妈妈精神挺好。','fever',['fever-state'],[]],
  ['今天有点不对劲。','behaviour',['behaviour-change'],[]],
  ['睡得挺好，但是今天咳嗽。','respiratory',['resp-effort'],['sleep-awakening','sleep-consolation']],
  ['一睡觉就咳嗽。','respiratory',['resp-effort'],['sleep-awakening']],
  ['今天流鼻涕。','respiratory',['nasal-appearance'],['cough-pattern','cough-impact']],
  ['今天揉左眼，外观没看清。','eye',[],['eye-side']],
  ['今天老扯右耳朵，没说疼。','ear',[],['ear-side','pain-location']],
  ['孩子白天摸嘴，不愿吃硬的。','oral',[],['oral-observation']],
  ['孩子一直哭，我不知道是不是哪里疼。','behaviour',['cry-context'],['pain-location']],
  ['孩子用手挠身上，没看见红点。','skin',['skin-location','skin-appearance'],[]],
  ['孩子小腿红点，还不会说话。','skin',['skin-sensation'],[]]
 ]
 for(const [text,domain,required,forbidden] of checks){
  const k=nursingKnowledgeFor(text,{ageMonths:72}),ids=k.nodes.map(n=>n.id)
  assert.equal(k.domain,domain,text)
  for(const id of required)assert.ok(ids.includes(id),`${text}: missing ${id}; got ${ids}`)
  for(const id of forbidden)assert.ok(!ids.includes(id),`${text}: repeated/unfounded ${id}`)
  if(text.includes('不会说话'))assert.doesNotMatch(JSON.stringify(k.nodes.find(n=>n.id==='skin-sensation')),/孩子说/)
 }
})
test('new current-child correction retires a bound meaning, while another person cannot erase it',()=>{
 const answer={id:'a',kind:'voice',text:'没有',status:'completed',answerTo:{questionId:'resp-effort',contextId:'c'},answerQuestion:{text:'呼吸是否费力？',domain:'respiratory'}}
 for(const text of ['说错了，有。','孩子现在呼吸明显费力。'])assert.deepEqual(nursingAnswerObservations([answer,{kind:'text',status:'completed',text}]),[])
 for(const text of ['哥哥喘。','妈妈呼吸费力。','更正，咳嗽是昨晚开始的。','刚才日期说错了，是昨天。','刚才次数说错了，拉稀其实2次。'])assert.equal(nursingAnswerObservations([answer,{kind:'text',status:'completed',text}])[0]?.polarity,'no',text)
 assert.equal(nursingInterview({text:'咳嗽',latestText:'先记录这一次',member:{}}).question,null)
})
test('recovery retires the old observation without borrowing a later other-person danger sign',()=>{
 for(const [text,expected] of [['孩子叫不醒。现在正常了，哥哥呼吸困难',false],['孩子叫不醒。现在正常了，但又开始呼吸困难',true],['孩子刚才叫不醒，不过现在好了',false],['孩子现在呼吸困难，但是已经恢复了',false]])assert.equal(confirmedCurrentEmergency({currentChild:true,quote:text},{text}),expected,text)
})
test('licensed archives retain integrity and attribution; retrieval exposes only bounded selected methods',async()=>{
 for(const source of registry.sources.filter(s=>s.file)){
  const bytes=await readFile(new URL(source.file,import.meta.url))
  assert.equal(createHash('sha256').update(bytes).digest('hex'),source.sha256,source.id)
  assert.equal(bytes.length,source.bytes,source.id)
  assert.equal(source.license,'CC-BY-4.0')
  assert.equal(source.production_retrieval_enabled,false)
  assert.equal(source.clinical_review,'pending')
 }
 assert.ok(registry.policy.attribution.includes('Ernstmeyer'))
 for(const text of ['孩子咳嗽','三天没大便，便便硬','今天拉稀','今天小腿红点']){
  const k=nursingKnowledgeFor(text)
  assert.ok(k.evidence.length<=2)
  for(const e of k.evidence){assert.equal(e.license,'CC-BY-4.0');assert.ok(e.attribution);assert.ok(e.changes);assert.ok(e.sourceUrl.startsWith('https://wtcs.pressbooks.pub/'))}
  assert.doesNotMatch(JSON.stringify(k),/Capillary|respirations per minute|Table 16|mg\/kg/)
 }
})
