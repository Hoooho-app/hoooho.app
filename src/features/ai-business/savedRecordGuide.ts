import { recordCategoryLabels, type SmartRecordDraft } from './smartRecordTypes'

export interface SavedRecordGuide { id:string; memberId:string; eventId:string; recordId:string; category?:string; sectionId?:string; entryId?:string; text:string; dismissed?:boolean; followUpEnabled?:boolean; at:number }
export function dismissSavedRecordGuide(guides:SavedRecordGuide[],id:string):SavedRecordGuide[] {
  return guides.map(guide=>guide.id===id?{...guide,dismissed:true}:guide)
}
export function savedRecordGuides(draft:SmartRecordDraft, memberId:string):SavedRecordGuide[] {
  if(draft.state!=='saved')return []
  return (draft.result?.records??[]).filter(r=>r.recordId&&r.eventId&&(!r.memberId||r.memberId===memberId)).flatMap(record=>{
    const destinations=record.profileEntries?.length?record.profileEntries:[undefined]
    return destinations.map(profile=>{
      const name=record.category==='vaccination'?'接种记录':record.category&&record.category!=='other'?(record.categories??[record.category]).map(c=>recordCategoryLabels[c]).filter(Boolean).join('、'):undefined
      return {id:`${draft.id}:${record.recordId}:${profile?.entryId??'journal'}`,memberId,eventId:record.eventId,recordId:record.recordId,category:record.category,sectionId:profile?.sectionId,entryId:profile?.entryId,followUpEnabled:record.category==='symptom'&&draft.followUp!==false,text:profile?`${name??'记录'}已保存，可在健康档案查看。`:`${name??'记录'}已记好，可在健康随记查看。`,at:Date.now()}
    })
  })
}
export function savedRecordUrl(guide:SavedRecordGuide) {
  const query=new URLSearchParams({memberId:guide.memberId})
  if(guide.sectionId&&guide.entryId){query.set('entryId',guide.entryId);return `/health-profile/${encodeURIComponent(guide.sectionId)}?${query}`}
  query.set('eventId',guide.eventId);query.set('recordId',guide.recordId)
  return `/health-events?${query}`
}
