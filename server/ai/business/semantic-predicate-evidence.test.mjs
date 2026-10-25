import test from 'node:test'
import assert from 'node:assert/strict'
import {findCurrentLiteralPredicateAnswer,findBoundCurrentLiteralPredicateAnswer} from './semantic-predicate-evidence.mjs'

const predicateMessage=(text,patch={})=>({id:'answer',contextId:'context',kind:'text',status:'completed',recordable:true,semanticSubject:'current',text,...patch})
const predicateAnswer=(text,predicate='bleeding',patch={})=>findCurrentLiteralPredicateAnswer([predicateMessage(text,patch)],predicate,{contextId:'context',topic:'injury'})
const boundPredicate=(predicate='bleeding',patch={})=>({id:'semantic:shown',text:'目前还有出血吗？',semantic:{version:2,slot:'observation',topic:'injury',predicate,...patch}})

test('complete literal answer suppresses only its explicit bleeding predicate and never changes the source',()=>{
 const text='现在没有出血，能正常走路，还没有做处理',messages=[predicateMessage(text)],before=structuredClone(messages)
 const result=findCurrentLiteralPredicateAnswer(messages,'bleeding',{contextId:'context',topic:'injury'})
 assert.equal(result.polarity,'no');assert.equal(result.sourceMessageId,'answer');assert.equal(result.quote,'现在没有出血')
 assert.equal(text.slice(result.start,result.end),result.quote);assert.deepEqual(messages,before)
 assert.equal(findCurrentLiteralPredicateAnswer(messages,'pain',{contextId:'context'}),null)
 assert.equal(findCurrentLiteralPredicateAnswer(messages,'activity_impact',{contextId:'context'}),null,'normal walking does not prove every daily activity unaffected')
 assert.equal(findCurrentLiteralPredicateAnswer(messages,'handling_done',{contextId:'context'}).polarity,'no')
})

test('current positive and explicit negative literal observations remain distinct',()=>{
 for(const [text,predicate,polarity] of [
  ['现在还在出血','bleeding','yes'],['目前没有出血','bleeding','no'],
  ['现在有疼痛','pain','yes'],['目前没有疼痛','pain','no'],
  ['目前有瘙痒','itch','yes'],['现在没有瘙痒','itch','no'],
  ['目前呼吸明显费力','breathing_effort','yes'],['目前没有呼吸明显费力','breathing_effort','no'],
  ['目前日常活动受到影响','activity_impact','yes'],['目前日常活动没有受到影响','activity_impact','no'],
  ['已经做了处理','handling_done','yes'],['还没有做处理','handling_done','no'],
 ])assert.equal(predicateAnswer(text,predicate)?.polarity,polarity,text)
})

test('unknown, indirect, hypothetical, historical and compound-query text never become a current negative',()=>{
 for(const text of [
  '没注意有没有出血','不知道有没有出血','目前出血情况没注意','不确定是否出血','现在看不清有没有出血',
  '好像没有出血','可能没有出血','不能排除出血','不是没有出血',
  '妈妈现在没有出血','哥哥现在没有出血','妈妈说，目前没有出血','老师说现在没有出血',
  '昨天没有出血','昨天脚趾破了，没有出血','刚才没有出血','小时候没有出血',
  '如果现在没有出血就好了','要是没有出血再记录','明天没有出血再说',
  '现在出血吗？','现在有没有出血或疼痛？','“现在没有出血”只是举例。',
  '医生说：“目前这样。现在没有出血。再观察。”','照片上看不到出血',
  '现在有出血又没有出血',
 ])assert.equal(predicateAnswer(text),null,text)
})

test('per-message scope preserves a new current observation after an unrelated historical or unknown clause',()=>{
 assert.equal(predicateAnswer('昨天没有出血，现在又出血了')?.polarity,'yes')
 assert.equal(predicateAnswer('没注意具体时间，现在没有出血')?.polarity,'no')
 assert.equal(predicateAnswer('妈妈说她不舒服。宝宝现在没有出血')?.polarity,'no')
})

test('pending, excluded, assistant, other-owner and other-context messages cannot answer the current predicate',()=>{
 for(const patch of [{status:'pending'},{recordable:false},{kind:'assistant'},{semanticSubject:'unknown'},{semanticSubject:'other'},{contextId:'foreign'}])assert.equal(predicateAnswer('目前没有出血','bleeding',patch),null,JSON.stringify(patch))
})

test('bare replies bind only the same persisted single predicate; null or another predicate cannot be treated as bleeding denial',()=>{
 assert.equal(predicateAnswer('没有','bleeding',{answerQuestion:boundPredicate()})?.polarity,'no')
 assert.equal(predicateAnswer('有','bleeding',{answerQuestion:boundPredicate()})?.polarity,'yes')
 for(const question of [undefined,boundPredicate(null),boundPredicate('pain'),boundPredicate('bleeding',{topic:'skin'})])assert.equal(predicateAnswer('没有','bleeding',{answerQuestion:question}),null)
 assert.equal(predicateAnswer('没注意','bleeding',{answerQuestion:boundPredicate()}),null)
})

test('later current uncertainty clears an older known answer, while another persons observation does not replace it',()=>{
 const old=predicateMessage('目前没有出血',{id:'old'}),latest=predicateMessage('现在又开始出血了',{id:'new'})
 assert.equal(findCurrentLiteralPredicateAnswer([old,latest],'bleeding',{contextId:'context'})?.sourceMessageId,'new')
 for(const text of ['没注意有没有出血','目前出血情况没注意'])assert.equal(findCurrentLiteralPredicateAnswer([old,predicateMessage(text)],'bleeding',{contextId:'context'}),null)
 assert.equal(findCurrentLiteralPredicateAnswer([old,predicateMessage('妈妈现在有出血')],'bleeding',{contextId:'context'})?.sourceMessageId,'old')
 assert.equal(findCurrentLiteralPredicateAnswer([old,predicateMessage('没注意',{answerQuestion:boundPredicate()})],'bleeding',{contextId:'context'}),null)
})

test('controller duplicate suppression accepts the complete incoming literal answer only when its exact persisted question binding matches',()=>{
 const text='现在没有出血，能正常走路，还没有做处理',message=predicateMessage(text,{status:'pending',contextId:'provisional',answerTo:{contextId:'context',questionId:'semantic:shown'},answerQuestion:boundPredicate()}),before=structuredClone(message)
 const scope={contextId:'context',questionId:'semantic:shown',topic:'injury'}
 assert.equal(findBoundCurrentLiteralPredicateAnswer(message,'bleeding',scope)?.polarity,'no')
 assert.deepEqual(message,before)
 for(const patch of [
  {answerTo:undefined},
  {answerTo:{contextId:'foreign',questionId:'semantic:shown'}},
  {answerTo:{contextId:'context',questionId:'semantic:old'}},
  {answerQuestion:{...boundPredicate(),id:'semantic:other'}},
  {answerQuestion:boundPredicate('pain')},
  {answerQuestion:boundPredicate(null)},
  {answerQuestion:boundPredicate('bleeding',{topic:'skin'})},
  {semanticSubject:'unknown'},
  {semanticSubject:'other'},
  {recordable:false},
  {status:'failed'},
 ])assert.equal(findBoundCurrentLiteralPredicateAnswer({...message,...patch},'bleeding',scope),null,JSON.stringify(patch))
 assert.equal(findBoundCurrentLiteralPredicateAnswer({...message,text:'没注意有没有出血'},'bleeding',scope),null)
 assert.equal(findBoundCurrentLiteralPredicateAnswer(message,'pain',scope),null)
})

test('bound same-predicate evidence cannot answer a different body site or side, or choose between several wounds',()=>{
 const base=predicateMessage('现在没有出血',{status:'pending',contextId:'provisional',answerTo:{contextId:'context',questionId:'semantic:shown'},answerQuestion:boundPredicate()}),scope={contextId:'context',questionId:'semantic:shown',topic:'injury'}
 const find=(anchorText,text)=>findBoundCurrentLiteralPredicateAnswer({...base,text},'bleeding',{...scope,anchorText})
 assert.equal(find('今天脚的小拇指被踢破了','手没出血'),null)
 assert.equal(find('今天左脚小拇指被踢破了','右脚现在没有出血'),null)
 assert.equal(find('脚的小拇指破皮了','脚踝现在没有出血'),null)
 assert.equal(find('脚的小拇指破皮了','脸上现在没有出血'),null)
 assert.equal(find('手指和脚趾各有破皮','没有'),null)
 assert.equal(find('脚大拇指和脚小拇指都有伤口','没有'),null)
 assert.equal(find('脚趾有两处伤口','现在没有出血'),null)
 assert.equal(find('脚的小拇指破皮了','另一处伤口没有出血'),null)
 assert.equal(find(undefined,'手没出血'),null)
 assert.equal(find(undefined,'脚现在没有出血'),null,'no anatomy in the persisted question means no guessing a body-specific answer')
 assert.equal(find(undefined,'现在没有出血')?.polarity,'no')
 assert.equal(find(undefined,'没有')?.polarity,'no','a bare reply still binds the exact single question')
 assert.equal(find('脚的小拇指被踢破了','是脚的小拇指表面破皮，今天刚被踢到；现在没有出血，能正常走路，还没有做处理。')?.polarity,'no')
 assert.equal(find('左脚小拇指被踢破了','左脚的小拇指目前没有出血')?.polarity,'no')
})
