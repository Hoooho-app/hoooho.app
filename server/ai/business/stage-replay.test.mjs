import test from 'node:test'
import assert from 'node:assert/strict'
import {replayStages} from '../../../scripts/replay-ai-business-stages.mjs'
import {syntheticCases,syntheticFixtureId,syntheticText} from './fixtures/synthetic-evidence-cases.mjs'
import {syntheticImageFixtureId,syntheticImageHash} from './synthetic-contract.mjs'
const reference={referenceNow:'2026-10-03T03:00:00Z',timezone:'Asia/Shanghai',sources:[{id:'input',page:1,text:syntheticText,status:'readable'}]}
const textArtifact=output=>({fixtureId:syntheticFixtureId,reference,stages:[{task:'draft-extraction',structuredText:JSON.stringify(output)}]})
test('人工阶段回放：正确引用通过，否定/错引/新增事实拒绝，不调用模型',async()=>{
 for(const c of syntheticCases())assert.equal((await replayStages(textArtifact(c.output))).status,c.expected==='pass'?'pass':'reject')
})
test('人工OCR回放：协议错误定位type/JSON；正确OCR和抽取复用来源',async()=>{
 const image={fixtureId:syntheticImageFixtureId,imageHash:syntheticImageHash,reference:{...reference,sources:[]},stages:[{task:'document-page',structuredText:'{"text":{},"status":"readable"}'}]}
 assert.equal((await replayStages(image)).validation.fieldPath,'/text')
 image.stages[0].structuredText='not-json';assert.equal((await replayStages(image)).validation.stage,'json_parse')
 image.stages[0].structuredText=JSON.stringify({text:syntheticText,status:'readable'});assert.equal((await replayStages(image)).status,'ocr-pass-extraction-not-executed')
 image.reference.sources=[{id:'file-fixed',page:1,text:syntheticText,status:'readable'}]
 const output=syntheticCases()[0].output;for(const i of output.items)for(const f of i.fields)f.sourceId='file-fixed'
 image.stages.push({task:'draft-extraction',structuredText:JSON.stringify(output)});assert.equal((await replayStages(image)).status,'pass')
 image.reference.sources[0].text='changed';await assert.rejects(()=>replayStages(image),/provenance mismatch/)
})
test('人工journal映射失败回放与普通schema成功分开标记；非白名单和凭据不接收',async()=>{
 const output=syntheticCases()[0].output;output.items[1].fields[0].name='reaction'
 const result=await replayStages(textArtifact(output));assert.equal(result.code,'INVALID_JOURNAL_SYMPTOM');assert.equal(result.validation.fieldPath,'/items/1/journal')
 await assert.rejects(()=>replayStages({...textArtifact(output),fixtureId:'medical'}))
 const unsafe=textArtifact(output);unsafe.stages[0].structuredText='Bearer fixture-secret';await assert.rejects(()=>replayStages(unsafe),/Unsafe stage/)
})
