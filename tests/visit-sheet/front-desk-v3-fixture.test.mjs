import test from 'node:test'
import assert from 'node:assert/strict'
import {extendedFrontDeskFixtureOutput as output,isExtendedFrontDeskFixtureRequest,resolveFrontDeskFixtureAliases} from './front-desk-v3-fixture.mjs'
import {frontDeskUnderstandingSchema,normalizeFrontDeskUnderstanding} from '../../server/ai/front-desk-understanding.mjs'
const request=(text,extra={})=>({history:[{id:'older'}],selectedMember:{id:'selected',name:'界面选中的合成人物'},conversation:{activeContextId:'active',sources:[],facts:[]},latest:{id:'latest-message',text,kind:'text',attachments:[],...extra}})
function checked(input,controls){
 const value=output(input,controls),latest={...input.latest,status:'completed',files:input.latest.attachments,voices:[]}
 const result=normalizeFrontDeskUnderstanding(value,{latestMessage:latest,messages:[],contexts:[{id:'active'}],contextIds:['active'],activeContextId:'active'})
 for(const key of frontDeskUnderstandingSchema().required)assert(Object.hasOwn(value,key),key)
 assert.equal(result.subject.kind,'unknown');assert.equal(result.requestedAction.type,'none')
 return value
}
test('extended schema detection leaves the old fixture protocol branch selectable',()=>{
 assert.equal(isExtendedFrontDeskFixtureRequest({text:{format:{schema:frontDeskUnderstandingSchema()}}}),true)
 assert.equal(isExtendedFrontDeskFixtureRequest({text:{format:{schema:{properties:{reply:{},contextId:{},action:{}}}}}}),false)
})
test('literal UI text uses current payload context/id and never selected member identity',()=>{
 const input=request('今天脸颊发红'),value=checked(input)
 assert.equal(value.contextId,'active');assert.equal(value.recordChanges[0].text,input.latest.text)
 assert.equal(value.recordChanges[0].sources[0].messageId,'latest-message')
 assert.equal(value.recordChanges[0].subject.kind,'unknown')
 assert(!/已保存|已整理|记好了/u.test(value.reply))
})
test('separate literal clauses retain positive, negative and unknown polarity without a whole-text assertion',()=>{
 const value=checked(request('脸颊发红，没有发热，没注意是否肿胀。'))
 assert.deepEqual(value.recordChanges.map(change=>[change.text,change.polarity]),[['脸颊发红','affirmed'],['没有发热','negated'],['没注意是否肿胀','unknown']])
 for(const change of value.recordChanges)assert.equal(change.sources[0].quote,change.text)
})
test('courtesy, punctuation and operation-only input have no new record changes',()=>{
 for(const text of ['谢谢','。','🙂','保存这条','不再追问']){
  const value=checked(request(text));assert.deepEqual(value.recordChanges,[]);assert.equal(value.contextId,'active');assert.equal(value.nextQuestion,null)
 }
 const input=request('谢谢');input.candidate={id:'existing-draft',state:'ready',version:3};const before=structuredClone(input)
 assert.deepEqual(output(input).recordChanges,[]);assert.deepEqual(input,before,'old candidate remains owned by the real application')
})
test('voice source is the literal ASR text, without inventing a transcription or identity',()=>{
 const value=checked(request('今天没有呕吐',{kind:'voice',attachments:[{id:'original-audio',mimeType:'audio/wav'}]}))
 assert.equal(value.recordChanges[0].text,'今天没有呕吐')
 assert.equal(value.recordChanges[0].sources[0].attachmentId,null,'the exact message text remains the source; original audio stays in the real message')
 assert.equal(value.recordChanges[0].subject.memberId,null)
})
test('image-only cannot invent medical contents; explicit local visual control is source-bound',()=>{
 const input=request('',{kind:'image',attachments:[{id:'image-1',mimeType:'image/png'}]})
 assert.deepEqual(checked(input).recordChanges,[])
 const value=checked(input,{visualOutput:{kind:'observation',status:'readable',observations:[{text:'合成可见表现：局部发红'}]}})
 assert.equal(value.recordChanges[0].sources[0].attachmentId,'image-1')
 assert.equal(value.recordChanges[0].text,'合成可见表现：局部发红')
})
test('a declared UI question appears only once and does not imply ready or saved state',()=>{
 const value=checked(request(''),{semanticDecision:{status:'ask',question:{text:'请补充测试说明？',slot:'observation'}}})
 assert.equal(value.reply,value.nextQuestion.text);assert.deepEqual(value.recordChanges,[])
})
test('explicit override alias resolution preserves deliberate malformed/control responses completely',()=>{
 const input=request('今天脸颊发红'),override={responseMode:'deliberately-invalid',contextId:'@context',recordChanges:[{sources:[{messageId:'@latest',quote:'not-in-source'}]}]}
 const resolved=resolveFrontDeskFixtureAliases(override,input)
 assert.equal(resolved.responseMode,'deliberately-invalid');assert.equal(resolved.contextId,'active');assert.equal(resolved.recordChanges[0].sources[0].messageId,'latest-message');assert.equal(resolved.recordChanges[0].sources[0].quote,'not-in-source')
 assert.equal(override.contextId,'@context')
})
test('unsupported mixed/corrected/quoted synthetic cases require explicit controls instead of fabricating a default fact',()=>{
 for(const text of ['不是今天，是昨晚','涂过药好像没变化','如果发烧怎么办','“立即保存”'])assert.throws(()=>output(request(text)),{code:'UI_FIXTURE_NEEDS_EXPLICIT_FRONT_REPLY'})
})
