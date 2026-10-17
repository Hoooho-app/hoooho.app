import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {AIBusinessService} from './service.mjs'
import {validateExtraction} from './contract.mjs'
import {FamilyMemberRepository} from '../../members/repositories/family-member-repository.mjs'
import {symptomCorePhrase} from '../../../shared/symptom-core-phrase.mjs'
const item=(category,name,value,quote=value)=>({category,title:'合成提取',subject:'current',archiveCategory:null,relationKey:null,timeText:null,fields:[{name,value,quote,sourceId:'input',page:1}]})
const validate=(text,category,name,value,quote=value)=>validateExtraction({items:[item(category,name,value,quote)]},[{id:'input',page:1,text}])
async function save(t,text,category,name,value){
 const directory=await mkdtemp(path.join(os.tmpdir(),'ai-qualifier-regression-'));t.after(()=>rm(directory,{recursive:true,force:true}))
 const member=await new FamilyMemberRepository(directory).create({accountId:'qualifier-test',name:'虚构测试儿童',relationship:'child'})
 const service=new AIBusinessService({dataDirectory:directory,model:{structured:async()=>({value:{items:[item(category,name,value)]},diagnostics:{provider:'local-fixture'}})},now:()=>new Date('2026-10-18T10:00:00Z'),logger:{info(){},warn(){}}})
 const d=await service.prepare('qualifier-test',member.id,{text,smartRecord:true}),saved=await service.save('qualifier-test',member.id,d.id,{version:d.version,confirmed:true})
 const record=await service.records.getOwnedRecord('qualifier-test',saved.result.records[0].recordId)
 assert.equal(record.sourceText,text);return {draft:d,record}
}
for(const [text,value] of [['今天喝了无糖酸奶','酸奶'],['今天喝了无乳糖牛奶','牛奶'],['今天喝了无菌牛奶','牛奶'],['今天喝了无糖酸奶','无糖酸奶']])test('food adjective retains the established contract: '+text,async t=>{const {record}=await save(t,text,'diet','food',value);assert.ok(record.content.includes(value))})
for(const [text,value] of [['不是只有咳嗽，还有鼻塞','咳嗽'],['并非仅有皮疹，还有发烧','皮疹'],['不是仅仅咳嗽，也会喘','咳嗽'],['没少咳嗽','咳嗽']])test('affirmative quantifier is not denied: '+text,async t=>{const {record}=await save(t,text,'symptom','symptom',value);assert.ok(record.content.includes(value))})
for(const text of ['医生说不是过敏','医生认为并非过敏','医生说无过敏','医生说过敏已排除','医生说过敏未确诊','医生说过敏待确认','医生说呕吐未出现'])test('clipped clinical qualifier is rejected: '+text,()=>{const value=text.includes('呕吐')?'呕吐':'过敏';assert.throws(()=>validate(text,'symptom','symptom',value),{code:'AI_EVIDENCE_MISMATCH'})})
for(const value of ['过敏已排除','过敏未确诊','过敏待确认','呕吐未出现'])test('complete clinical qualifier remains in saved title: '+value,async t=>{const {draft,record}=await save(t,'医生说'+value,'symptom','symptom',value);assert.equal(draft.items[0].title,value);assert.equal(record.journal.symptom.generatedSummary,value);assert.ok(record.content.includes(value))})
test('direct suffix does not invent denial from an unrelieved symptom or incomplete exclusion',()=>{for(const [text,title] of [['咳嗽没有缓解','咳嗽'],['头痛没有改善','头痛'],['过敏排除不了','过敏排除不了']])assert.equal(symptomCorePhrase(text),title)})
test('complete broad quotes use the value own clause and keep exact evidence',()=>{assert.equal(validate('没有呕吐，只有恶心','symptom','symptom','恶心','没有呕吐，只有恶心')[0].fields[0].value,'恶心');assert.equal(validate('不是过敏原检测，是皮肤点刺检测','examination','testName','皮肤点刺检测').length,1)})
