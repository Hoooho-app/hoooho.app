import {create} from 'zustand'
import {persist} from 'zustand/middleware'
export type RecordUpdate={id:string;accountId:string;memberId:string;destination:'symptom'|'calendar'|'profile';eventId?:string;recordId?:string;sectionId?:string;entryId?:string;label:string;at:number}
export const useUpdateStore=create<{items:RecordUpdate[];add:(items:RecordUpdate[])=>void;read:(ids:string[],through?:number)=>void}>()(persist((set)=>({items:[],add:items=>set(s=>({items:[...s.items.filter(old=>!items.some(i=>i.id===old.id)),...items].slice(-500)})),read:(ids,through=Date.now())=>set(s=>({items:s.items.filter(i=>!ids.includes(i.id)||i.at>through)}))}),{name:'hoooho-record-updates-v1'}))
export type UpdateScope={accountId:string;memberId:string}
export function trackSavedMutation(scope:UpdateScope,path:string,method:string,input:any,data:any) {
 if(!scope.accountId||!scope.memberId||!data||typeof data!=='object'||data.memberId&&data.memberId!==scope.memberId||input?.memberId&&input.memberId!==scope.memberId)return
 if(method==='DELETE') {
  const record=/^\/api\/records\/([^/]+)$/.exec(path),event=/^\/api\/events\/([^/]+)$/.exec(path)
  const ids=useUpdateStore.getState().items.filter(i=>i.accountId===scope.accountId&&i.memberId===scope.memberId&&(record&&i.recordId===decodeURIComponent(record[1])||event&&i.eventId===decodeURIComponent(event[1]))).map(i=>i.id)
  if(ids.length)useUpdateStore.getState().read(ids)
  return
 }
 const at=Date.now(),updates:RecordUpdate[]=[]
 const push=(row:Partial<RecordUpdate>&Pick<RecordUpdate,'destination'|'label'>)=>{const id=JSON.stringify([scope.accountId,scope.memberId,row.destination,row.sectionId??'',row.entryId??row.recordId??row.eventId??'section']);updates.push({...scope,...row,id,at})}
 const record=(row:any)=>{if(!row?.id||!row.eventId)return;const symptom=row.type==='symptom'||row.journal?.categories?.includes('symptom');push({destination:symptom?'symptom':'calendar',eventId:row.eventId,recordId:row.id,label:row.content?.slice(0,32)||'新记录'})}
 const memberMatch=/^\/api\/members\/([^/]+)/.exec(path)
 if(memberMatch&&decodeURIComponent(memberMatch[1])!==scope.memberId)return
 if(/\/ai-drafts\/[^/]+\/save$/.test(path)&&data.state==='saved') for(const row of data.result?.records??[]) {
  if(row.memberId&&row.memberId!==scope.memberId)continue
  if(row.profileEntries?.length)for(const p of row.profileEntries)push({destination:'profile',sectionId:p.sectionId,entryId:p.entryId,label:'档案已更新'})
  else push({destination:(row.categories??[row.category]).includes('symptom')?'symptom':'calendar',eventId:row.eventId,recordId:row.recordId,label:'新记录'})
 }
 else if(/\/case-records$/.test(path)&&data.recordId)push({destination:input?.journal?.categories?.includes('symptom')?'symptom':'calendar',eventId:data.eventId,recordId:data.recordId,label:input?.text?.slice(0,32)||'新记录'})
 else if(/\/profile-list\//.test(path)) {
  const sectionId=path.split('/profile-list/')[1].split('/')[0]
  if(input?.action==='delete'){const ids=useUpdateStore.getState().items.filter(i=>i.accountId===scope.accountId&&i.memberId===scope.memberId&&i.sectionId===sectionId&&i.entryId===input.id).map(i=>i.id);useUpdateStore.getState().read(ids)}
  if(input?.action!=='delete') {
   const row=data.rows?.find((row:any)=>row.id===input?.id)||data.rows?.find((row:any)=>row.name===input?.name)
   push({destination:'profile',sectionId,entryId:row?.id,label:row?.name||'档案已更新'})
  }
 }
 else if(path==='/api/auth/profile-sections'&&!input?.importOnly&&data.sectionId)push({destination:'profile',sectionId:data.sectionId,label:'档案已更新'})
 else if(/\/cases\/[^/]+\/merge$/.test(path)&&input?.action==='merge')push({destination:'symptom',eventId:data.id,label:'情况已合并'})
 else if(/\/records(?:\/|$)|\/quick-records(?:\/|$)|\/daily\/instances\//.test(path)) {record(data.record??data);if(data.recordId&&data.eventId&&!data.record)push({destination:input?.journal?.categories?.includes('symptom')?'symptom':'calendar',eventId:data.eventId,recordId:data.recordId,label:input?.content?.slice(0,32)||'日常记录已更新'})}
 if(updates.length)useUpdateStore.getState().add(updates)
}
