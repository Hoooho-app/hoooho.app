import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import {frontDeskRecognitionPreview} from './front-desk-recognition-preview.mjs'
import {AIBusinessService} from './business/service.mjs'
import {FrontDeskRecord} from './front-desk-record.mjs'
import {FamilyMemberRepository} from '../members/repositories/family-member-repository.mjs'

const observed='合成观察：图片中的局部发红'
const item=(extra={})=>({id:'recognized-item',category:'symptom',title:'图片观察',subject:'current',subjectConfirmed:true,timeText:null,time:{resolvedStart:null,precision:'unknown'},fields:[{name:'symptom',value:observed,sources:[{sourceId:'photo',page:1,quote:observed}]}],...extra})
const draft=(extra={})=>({id:'recognized-draft',version:1,state:'ready',frontEvidenceVersion:1,items:[item()],sources:[],documentWarnings:[],unmappedRows:[],conflicts:[],...extra})
const options={evidenceVersion:1,usable:false,hasOriginals:true}

for(const [name,patch] of Object.entries({pending_item:{items:[item({needsReview:true})]},uncertain_source:{sources:[{status:'uncertain'}]},page_warning:{documentWarnings:['原件第2页不清楚']},unmapped_row:{unmappedRows:[{text:'另一行待核对'}]},unknown_time:{items:[item({occurrenceUncertain:true})]},archive_conflict:{conflicts:[{text:'已有不同记录'}]}}))test(`partial upload retains sourced text and truthful warnings: ${name}`,()=>{
 const review=draft(patch),before=structuredClone(review),preview=frontDeskRecognitionPreview(review,options)
 assert.ok(preview.text.includes(observed));assert.ok(preview.warnings.length);assert.equal(preview.draftVersion,1)
 assert.deepEqual(review,before)
})
test('stale results, unsafe subjects and unsourced model text cannot be silently adopted',()=>{
 assert.equal(frontDeskRecognitionPreview(draft({frontEvidenceVersion:0}),options),null)
 assert.equal(frontDeskRecognitionPreview(draft({state:'failed'}),options),null)
 assert.equal(frontDeskRecognitionPreview(draft(),{...options,usable:true}),null)
 assert.equal(frontDeskRecognitionPreview(draft(),{...options,hasOriginals:false}),null)
 assert.equal(frontDeskRecognitionPreview(draft({items:[item({fields:[{name:'symptom',value:'无来源猜测',sources:[]}]})]}),options),null)
 for(const subject of ['unknown','other','multiple']){
  const preview=frontDeskRecognitionPreview(draft({items:[item({subject,subjectConfirmed:false})]}),options)
  assert.ok(preview.text.includes(observed));assert.equal(preview.canAdopt,false);assert.equal(preview.canConfirmSubject,subject==='unknown')
 }
})
test('a completed transcription survives even without structured items',()=>{
 const preview=frontDeskRecognitionPreview(draft({items:[],sources:[{id:'photo',name:'合成资料.png',page:1,status:'uncertain',text:'可读部分：4.2；其余[不清楚]'}]}),options)
 assert.match(preview.text,/可读部分：4.2/);assert.equal(preview.canAdopt,false)
})
test('an OCR-only draft becomes reviewable after explicit original-subject confirmation',()=>{
 const review=draft({items:[],sources:[{id:'photo',page:1,status:'readable',text:'原件可读文字'}]})
 assert.equal(frontDeskRecognitionPreview(review,options).canConfirmSubject,true)
 const confirmed=frontDeskRecognitionPreview({...review,frontSubject:{kind:'current',confirmed:true,confirmedBy:'user'}},options)
 assert.equal(confirmed.canAdopt,true);assert.equal(confirmed.canConfirmSubject,false)
 assert.equal(frontDeskRecognitionPreview({...review,frontSubject:{kind:'other'}},options).canConfirmSubject,false)
})

async function fixture(t){
 const directory=await mkdtemp(path.join(os.tmpdir(),'hoooho-partial-upload-'));t.after(()=>rm(directory,{recursive:true,force:true}))
 const member=await new FamilyMemberRepository(directory).create({accountId:'synthetic',name:'合成孩子',relationship:'child'})
 const now=()=>new Date('2026-10-28T10:00:00Z'),business=new AIBusinessService({dataDirectory:directory,now,model:{structured(){assert.fail('no supplier calls')}}}),front=new FrontDeskRecord({dataDirectory:directory,business,events:business.events,now})
 const at='2026-10-28T09:00:00.123Z',contextId='partial-context',subject={kind:'current',memberId:member.id,confirmed:true,confirmedBy:'selection'}
 const image=await sharp({create:{width:12,height:12,channels:3,background:'#448866'}}).png().toBuffer(),file={id:'photo',name:'合成原件.png',mimeType:'image/png',dataUrl:`data:image/png;base64,${image.toString('base64')}`}
 await front.store.update(()=>({contexts:[{id:contextId,accountId:'synthetic',memberId:member.id,continuousRecord:true,version:1,evidenceVersion:1,draftId:'recognized-draft',firstDescribedAt:at,createdAt:at,updatedAt:at,subject}],messages:[{id:'image-message',accountId:'synthetic',memberId:member.id,contextId,kind:'image',status:'completed',acceptedInput:true,text:'',inputAt:Date.parse(at),at,subject,files:[file],voices:[]}]}))
 let review=draft({items:[item({needsReview:true})]});business.read=async()=>review
 return {front,business,file,member,at,args:['synthetic',member.id,contextId],review:()=>review,setReview:value=>{review=value}}
}
test('image-only pending result is visible, remains uncommitted and can explicitly save originals',async t=>{
 const f=await fixture(t),card=await f.front.continuous(...f.args)
 assert.equal(card.text,'');assert.deepEqual(card.items,[]);assert.ok(card.recognitionPreview.text.includes(observed));assert.ok(card.hasOriginals)
 const saved=await f.front.continuous(...f.args,{action:'save_current',expectedVersion:card.version,confirmed:true})
 const original=await f.business.records.getOwnedRecord('synthetic',saved.saved.recordId)
 assert.equal(original.content,'附件记录');assert.equal(original.aiProvenance.structuredItems.length,0)
 assert.equal((await f.business.records.repository.findByAccountId('synthetic')).length,1)
 assert.equal((await f.business.attachments.findByEventId(saved.saved.eventId))[0].dataUrl,f.file.dataUrl)
})
test('reviewing pending text updates the same record after original save; reopen preserves text and source bytes',async t=>{
 const f=await fixture(t),saved=await f.front.continuous(...f.args,{action:'save_current',expectedVersion:1,confirmed:true})
 const card=await f.front.continuous(...f.args),text=card.recognitionPreview.text+'\n家长已核对'
 const edited=await f.front.continuous(...f.args,{action:'edit_current',expectedVersion:card.version,text,title:'已核对的图片记录',occurredAt:card.occurredAt,recognitionDraft:{id:'recognized-draft',version:1}})
 assert.equal(edited.text,text);assert.equal(edited.recognitionPreview,null);assert.equal(edited.occurredAt,f.at)
 const confirmed=await f.front.continuous(...f.args,{action:'save_current',expectedVersion:edited.version,confirmed:true})
 assert.equal(confirmed.saved.recordId,saved.saved.recordId)
 const reopened=await f.front.continuous(...f.args)
 assert.equal(reopened.text,text);assert.equal((await f.business.records.getOwnedRecord('synthetic',confirmed.saved.recordId)).content,text)
 assert.equal((await f.business.records.repository.findByAccountId('synthetic')).length,1)
 assert.equal((await f.business.attachments.findByEventId(confirmed.saved.eventId))[0].dataUrl,f.file.dataUrl)
})
test('a changed recognition draft rejects stale adoption without losing its original or creating a record',async t=>{
 const f=await fixture(t);f.setReview({...f.review(),version:2})
 await assert.rejects(()=>f.front.continuous(...f.args,{action:'edit_current',expectedVersion:1,text:observed,title:'旧结果',occurredAt:f.at,recognitionDraft:{id:'recognized-draft',version:1}}),{code:'FRONT_RECOGNITION_CHANGED'})
 assert.equal((await f.business.records.repository.findByAccountId('synthetic')).length,0)
 assert.ok((await f.front.continuous(...f.args)).recognitionPreview.text.includes(observed))
})
