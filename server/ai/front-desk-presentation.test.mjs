import assert from 'node:assert/strict'
import test from 'node:test'
import {continuousPresentation,visitPreparationEligible} from './front-desk-presentation.mjs'

const user = text => ({kind:'text',status:'completed',text})
const assistant = text => ({kind:'assistant',status:'completed',text})
test('ordinary symptoms, historical care and refusals do not offer a visit sheet',()=>{
  for(const text of ['昨晚有点咳嗽','今天胃口不好','上次挂号排了很久','昨天去医院看过了，医生开的药','不用去医院','暂时不想看医生'])assert.equal(visitPreparationEligible([user(text)]),false,text)
  assert.equal(visitPreparationEligible([user('我准备去医院'),user('先不去医院了')]),false)
  assert.equal(visitPreparationEligible([assistant('要不要去医院？'),user('先不去了')]),false)
  assert.equal(visitPreparationEligible([assistant('需要去医院评估。')]),false)
})
test('explicit care-preparation questions and accepted contextual invitations are eligible',()=>{
  for(const text of ['挂什么科？','应该去哪个医院？','什么情况需要看医生？','我准备去医院','一直不舒服，想去医院','帮我整理就诊情况单','明天去医院看病'])assert.equal(visitPreparationEligible([user(text)]),true,text)
  assert.equal(visitPreparationEligible([user('还没有好转'),assistant('需要去医院进一步评估，要不要先准备就诊资料？'),user('好的，准备一下')]),true)
  assert.equal(visitPreparationEligible([user('准备去医院'),user('暂不整理')]),false)
  assert.equal(visitPreparationEligible([{...user('准备去医院'),status:'pending'}]),false)
})
test('only completed question-free input can be offered for generation; consent binds to evidence and edits',()=>{
  const context={evidenceVersion:2,editRevision:0,interview:{status:'ready'}},card={recordable:true,hasOriginals:false,saved:null}
  assert.equal(continuousPresentation(context,[user('咳嗽')],card).generated,false)
  assert.equal(continuousPresentation(context,[user('咳嗽')],card).canGenerate,true)
  assert.equal(continuousPresentation({...context,interview:{status:'asking',question:{text:'还有什么情况？'}}},[user('咳嗽')],card).canGenerate,false)
  assert.equal(continuousPresentation(context,[{...user('咳嗽'),status:'pending'}],card).canGenerate,false)
  const confirmed={...context,recordGeneration:{evidenceVersion:2,editRevision:0}}
  assert.equal(continuousPresentation(confirmed,[user('咳嗽')],card).generated,true)
  assert.equal(continuousPresentation({...confirmed,evidenceVersion:3},[user('更正')],card).generated,false)
  assert.equal(continuousPresentation({...confirmed,editRevision:1},[user('修改')],card).generated,false)
  assert.equal(continuousPresentation(context,[user('咳嗽')],{...card,saved:{evidenceVersion:2,editRevision:0}}).generated,true)
})
