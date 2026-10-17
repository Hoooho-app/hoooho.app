import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import Ajv from 'ajv'
import {NurseService} from '../../server/ai/nurse-service.mjs'
import {FamilyMemberRepository} from '../../server/members/repositories/family-member-repository.mjs'
import {HealthEventService} from '../../server/events/health-event-service.mjs'
import {currentSituationPassages,currentSituationTransportSchema,restoreCurrentSituationEvidence} from '../../server/visit-sheets/current-situation-model.mjs'
import {normalizeMedicalSummary} from '../../server/ai/providers/openai-provider.mjs'
import {situationRaw,situationOutput} from './current-situation-v2.fixture.mjs'
import {nurseFixtureOutput,currentSituationFixtureOutput,isCurrentSituationTransport} from './ai-fixture-contract.mjs'
const ajv=new Ajv({strict:false})
const sources=[{id:'record:focus',text:situationRaw}]
function summaryBody(values=sources){return {input:JSON.stringify(currentSituationPassages(values).input),text:{format:{schema:currentSituationTransportSchema()}}}}

test('shared nurse fixture matches actual conversation, assessment and organization request contracts',async t=>{
 const dataDirectory=await mkdtemp(path.join(os.tmpdir(),'hoooho-fixture-contract-'));t.after(()=>rm(dataDirectory,{recursive:true,force:true}))
 const member=await new FamilyMemberRepository(dataDirectory).create({accountId:'synthetic',name:'合成测试',relationship:'child'})
 const observed=[],provider={model:'fixture',baseUrl:'https://fixture.invalid',fetch:async(_,init)=>{
  const body=JSON.parse(init.body),value=nurseFixtureOutput(body),validate=ajv.compile(body.text.format.schema)
  assert.equal(validate(value),true,JSON.stringify(validate.errors));observed.push(Object.keys(value).sort())
  return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]})
 }}
 const nurse=new NurseService({dataDirectory,events:new HealthEventService({dataDirectory}),provider})
 for(const mode of [{},{assessOnly:true},{organize:true}]){
  let draft=await nurse.open('synthetic',member.id,{scope:member.id+':'+JSON.stringify(mode)})
  draft=await nurse.change('synthetic',member.id,draft.id,{version:draft.version,turn:{id:'first',role:'user',text:'脸颊发红发痒，没有发热。我担心鸡蛋过敏，涂过保湿霜好像没变化。',at:new Date().toISOString(),final:true,status:'completed'}})
  await nurse.generate('synthetic',member.id,draft.id,{version:draft.version,...mode})
 }
 assert.deepEqual(observed[0],['emergency','intent','reply']);assert.deepEqual(observed[1],['emergency','intent'])
 assert.ok(observed[2].includes('fields'));assert.ok(observed[2].includes('concernCoverage'))
})

test('legacy valid current-situation fixtures are encoded as exact contiguous passage ranges',()=>{
 const body=summaryBody(),value=currentSituationFixtureOutput(body,situationOutput())
 assert.equal(isCurrentSituationTransport(body),true);assert.equal(ajv.compile(body.text.format.schema)(value),true)
 const restored=restoreCurrentSituationEvidence(value,currentSituationPassages(sources).byId),result=normalizeMedicalSummary(restored,{currentSituationSources:sources})
 assert.equal(result.currentSituation.symptoms.length,3);assert.equal(result.currentSituation.symptoms[2].kind,'temperature');assert.match(result.currentSituation.symptoms[1].note,/家属怀疑/)
 assert.doesNotMatch(JSON.stringify(value),/sourceId|noteQuote|"quote"/)
})

test('default current-situation fixture satisfies current transport and runtime evidence checks',()=>{
 const values=[{id:'record:synthetic',text:'前臂皮肤发红，第8条观察'}],body=summaryBody(values),value=currentSituationFixtureOutput(body)
 assert.equal(ajv.compile(body.text.format.schema)(value),true)
 const result=normalizeMedicalSummary(restoreCurrentSituationEvidence(value,currentSituationPassages(values).byId),{currentSituationSources:values})
 assert.equal(result.currentSituation.description[0].text,values[0].text)
})

test('numeric, unknown-evidence, cross-source and malformed response injections are not repaired into success',()=>{
 const body=summaryBody(),numeric=situationOutput();numeric.currentSituation.symptoms[2].text='37.5℃'
 assert.throws(()=>normalizeMedicalSummary(restoreCurrentSituationEvidence(currentSituationFixtureOutput(body,numeric),currentSituationPassages(sources).byId),{currentSituationSources:sources}),/Unverified summary number/)
 const missing=situationOutput();missing.currentSituation.description[0].quote='模型新增的错误引用'
 assert.throws(()=>restoreCurrentSituationEvidence(currentSituationFixtureOutput(body,missing),currentSituationPassages(sources).byId),error=>error.validation.rule==='invalid_passage_range')
 const values=[{id:'a',text:'左脸发红。'},{id:'b',text:'右手有红点。'}],cross={currentSituation:{description:[{sourceId:'a',quote:'左脸发红。右手有红点。',text:'左脸发红。右手有红点。',emphasis:[]}],symptoms:[],diet:[],changes:[],treatment:[],keywords:[]}}
 assert.throws(()=>restoreCurrentSituationEvidence(currentSituationFixtureOutput(summaryBody(values),cross),currentSituationPassages(values).byId))
 const native=currentSituationFixtureOutput(body,situationOutput());native.currentSituation.description[0].from='p999999'
 assert.deepEqual(currentSituationFixtureOutput(body,native),native)
 const malformed={overview:'合成错误摘要',keyPoints:[],missingInformation:['性别尚未提供']}
 assert.deepEqual(currentSituationFixtureOutput(body,malformed),malformed);assert.equal(ajv.compile(body.text.format.schema)(malformed),false)
})
