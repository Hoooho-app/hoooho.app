import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import {FamilyMemberRepository} from '../../members/repositories/family-member-repository.mjs'
import {CaseContinuityService} from '../../events/case-continuity-service.mjs'
import {AIBusinessService} from './service.mjs'
import {resolveBusinessAssetInput} from './asset-input.mjs'

async function fixture(t){
  const dataDirectory=await mkdtemp(path.join(os.tmpdir(),'hoooho-case-asset-'));t.after(()=>rm(dataDirectory,{recursive:true,force:true}))
  const member=await new FamilyMemberRepository(dataDirectory).create({accountId:'synthetic',name:'合成成员',relationship:'child'}),calls=[]
  const files=await Promise.all(['#ff0000','#0000ff'].map(async(background,index)=>({name:`原件${index+1}.png`,mimeType:'image/png',dataUrl:'data:image/png;base64,'+(await sharp({create:{width:8,height:8,channels:3,background}}).png().toBuffer()).toString('base64')})))
  const ids=files.map((_,index)=>String(index+1).padStart(64,'0'))
  const model={provider:{name:'test',visionModel:'same-vision-model'},structured:async input=>{
    calls.push(input.task==='document-page'?input.input[0].content[1].image_url:input.task)
    return input.task==='document-page'?{value:{text:'合成资料',status:'readable'},diagnostics:{}}:{value:{items:[{category:'symptom',title:'合成观察',timeText:null,subject:'current',archiveCategory:null,relationKey:null,fields:[{name:'symptom',value:'没有呕吐',quote:'没有呕吐',sourceId:'input',page:1}]}]},diagnostics:{}}
  }}
  const business=new AIBusinessService({dataDirectory,model,logger:{info(){}}}),cases=new CaseContinuityService({dataDirectory,business})
  const jobs={scope:async(account,memberId)=>business.scoped(account,memberId),asset:(account,memberId,id)=>{assert.equal(account,'synthetic');assert.equal(memberId,member.id);const file=files[ids.indexOf(id)];if(!file)throw new Error('unknown asset');return {mimeType:file.mimeType,bytes:Buffer.from(file.dataUrl.split(',')[1],'base64').length}},materialize:async(_scope,refs)=>refs.map(id=>files[ids.indexOf(id)])}
  const prepare=async input=>business.prepare('synthetic',member.id,await resolveBusinessAssetInput(jobs,'synthetic',member.id,{text:'没有呕吐',task:'record',sourceIdentity:'pending',...input}))
  return {business,cases,member,files,ids,calls,prepare}
}
test('adding a new original reuses completed OCR pages in the same draft without changing the extraction model contract',async t=>{
  const f=await fixture(t)
  const raw=await f.prepare({assetIds:[f.ids[0]],deferRecognition:true});assert.equal(f.calls.length,0);assert.equal(raw.state,'changed')
  const ready=await f.prepare({id:raw.id,version:raw.version})
  const appended=await f.prepare({id:ready.id,version:ready.version,assetIds:f.ids,deferRecognition:true})
  assert.equal(appended.id,ready.id);assert.equal(appended.sources.filter(source=>source.id!=='input').length,1)
  const final=await f.prepare({id:appended.id,version:appended.version})
  assert.equal(final.id,ready.id);assert.equal(final.state,'ready')
  assert.equal(f.calls.filter(value=>value===f.files[0].dataUrl).length,1);assert.equal(f.calls.filter(value=>value===f.files[1].dataUrl).length,1)
  assert.equal(f.calls.filter(value=>value==='draft-extraction').length,2)
  assert.equal((await f.business.get('synthetic',f.member.id,final.id)).recognitionBinding,undefined)
})
test('first-save can link the deferred draft to a real raw record without recognizing or deleting its originals',async t=>{
  const f=await fixture(t),draft=await f.prepare({assetIds:[f.ids[0]],deferRecognition:true})
  const saved=await f.cases.capture('synthetic',f.member.id,{text:'没有呕吐',files:[f.files[0]],aiDraftId:draft.id,identity:'pending',requestId:'stable-first-save',occurredAt:new Date(Date.now()-1000).toISOString(),timeUnknown:false})
  const record=await f.cases.records.getOwnedRecord('synthetic',saved.recordId)
  assert.equal(record.caseContext.aiDraftId,draft.id);assert.equal(f.calls.length,0)
  assert.equal((await f.business.read('synthetic',f.member.id,draft.id)).state,'changed')
  assert.equal((await f.cases.attachments.findByEventId(saved.eventId)).length,1)
  assert.equal((await f.business.file('synthetic',f.member.id,draft.id,draft.pages[0].id)).buffer.toString('base64'),f.files[0].dataUrl.split(',')[1])
})
