import {useEffect} from 'react'
import {useAppStore} from '../../store/useAppStore'
import {useUpdateStore,type RecordUpdate} from './store'
import './updates.css'
export function useRecordUpdates(){const accountId=useAppStore(s=>s.authUser?.id),memberId=useAppStore(s=>s.currentMemberId),items=useUpdateStore(s=>s.items);return items.filter(i=>i.accountId===accountId&&i.memberId===memberId)}
export function UpdateDot({show=true}:{show?:boolean}){return show?<span className="record-update-dot" role="img" aria-label="有新内容"/>:null}
export function updateUrl(i:RecordUpdate){const q=new URLSearchParams({memberId:i.memberId});if(i.destination==='profile'){if(i.entryId)q.set('entryId',i.entryId);return `/health-profile/${i.sectionId??''}?${q}`}if(i.eventId)q.set('eventId',i.eventId);if(i.recordId)q.set('recordId',i.recordId);return `${i.destination==='symptom'?'/cases':'/health-events'}?${q}`}
function useReadUpdates(items:RecordUpdate[]){const key=JSON.stringify(items.map(i=>[i.id,i.at]));useEffect(()=>{const entries=JSON.parse(key) as [string,number][];if(entries.length)useUpdateStore.getState().read(entries.map(e=>e[0]),Math.max(...entries.map(e=>e[1])))},[key])}
export function useReadRecordUpdates(recordIds:string[],eventIds:string[]=[],sectionId?:string,through=Infinity){useReadUpdates(useRecordUpdates().filter(i=>i.at<=through&&(recordIds.includes(i.recordId??'')||!i.recordId&&eventIds.includes(i.eventId??'')||sectionId&&i.destination==='profile'&&i.sectionId===sectionId)))}
export function useReadDestinationUpdates(destination:RecordUpdate['destination'],active:boolean){useReadUpdates(useRecordUpdates().filter(i=>active&&i.destination===destination))}
