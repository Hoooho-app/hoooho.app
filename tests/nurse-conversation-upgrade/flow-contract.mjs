import assert from 'node:assert/strict'
import path from 'node:path'

export function completedSleepInput(now=Date.now()){
 const local=new Date(now+8*3600000),day=local.toISOString().slice(0,10),hour=local.getUTCHours()
 const shift=(value,n)=>new Date(Date.parse(value+'T00:00:00Z')+n*86400000).toISOString().slice(0,10)
 const wakeDay=shift(day,hour<7?-1:0),sleepDay=shift(wakeDay,-1)
 return {text:`这是SYNTHETIC-CHILD的睡眠记录，${sleepDay}晚上10点睡，${wakeDay}早上7点醒。请先整理供我核对，暂不保存。`,sleepDay,wakeDay}
}
export async function loadSavedGuideImplementation(root){
 const {build}=await import('esbuild')
 const result=await build({entryPoints:[path.join(root,'src/features/ai-business/savedRecordGuide.ts')],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'})
 return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'))
}
export function requireRealCandidate(job){
 const context=job.frontDesk?.context,draft=job.review??context?.review
 assert(context?.id&&Number.isInteger(context.version),'REAL_CONTEXT_MISSING')
 assert(['ready','needs_review'].includes(job.state)&&!(job.unresolvedInputs??[]).length,'RECOGNITION_NOT_COMPLETED')
 assert(draft?.state==='ready'&&draft.id&&draft.items?.length,'REAL_CANDIDATE_NOT_GENERATED')
 return {context,draft}
}
export function assertSavedFlow({kind,job,memberId,eventRecords,cases,profileRows,guideApi}){
 const receipt=job.operationReceipt,draft=receipt?.savedDraft??job.review
 assert.equal(job.resultKind,'saved','NO_REAL_SAVE_RESULT')
 assert.equal(receipt?.state,'saved','NO_REAL_OPERATION_RECEIPT')
 assert.equal(draft?.state,'saved','DRAFT_NOT_PERSISTED')
 assert(draft.result?.records?.length,'NO_RECORD_IDS')
 const records=draft.result.records
 assert(records.every(record=>record.memberId===memberId&&record.eventId&&record.recordId),'WRONG_MEMBER_OR_MISSING_RECORD_ID')
 for(const reference of records){
  const saved=eventRecords.find(record=>record.id===reference.recordId&&record.eventId===reference.eventId)
  assert(saved,'SAVED_ID_NOT_READABLE_IN_EVENT_RECORDS')
  const categories=saved.journal?.categories??[saved.aiProvenance?.category]
  assert(categories.includes(kind),'WRONG_SAVED_JOURNAL_CATEGORY');assert(!categories.includes('symptom'),'ORDINARY_SAVE_BECAME_SYMPTOM')
 }
 assert.equal(cases.active?.length,0,'ORDINARY_RECORD_CREATED_SYMPTOM_TRACKING')
 const guides=guideApi.savedRecordGuides(draft,memberId)
 assert(guides.length,'NO_GUIDE_FOR_REAL_RECEIPT')
 for(const guide of guides){
  const target=new URL(guideApi.savedRecordUrl(guide),'http://127.0.0.1')
  assert.equal(target.searchParams.get('memberId'),memberId)
  if(kind==='vaccination'){
   assert.equal(guide.sectionId,'vaccination');assert(guide.entryId,'NO_REAL_PROFILE_ENTRY_ID')
   assert(profileRows.some(row=>row.id===guide.entryId&&row.recordId===guide.recordId),'PROFILE_ENTRY_NOT_READABLE')
   assert.equal(target.pathname,'/health-profile/vaccination');assert.equal(target.searchParams.get('entryId'),guide.entryId)
   assert.equal(guide.text,'接种记录已保存，可在健康档案查看。')
  }else{
   assert.equal(target.pathname,'/health-events');assert.equal(target.searchParams.get('recordId'),guide.recordId);assert.equal(target.searchParams.get('eventId'),guide.eventId)
   assert.equal(guide.text,'睡眠已记好，可在健康随记查看。')
  }
  const dismissed=guideApi.dismissSavedRecordGuide(guides,guide.id).find(item=>item.id===guide.id)
  assert.equal(dismissed.dismissed,true);assert.equal(dismissed.recordId,guide.recordId)
 }
 return {draftId:draft.id,operationId:receipt.operationId,records,guides:guides.map(guide=>({...guide,url:guideApi.savedRecordUrl(guide)})),activeSymptoms:cases.active.length}
}
