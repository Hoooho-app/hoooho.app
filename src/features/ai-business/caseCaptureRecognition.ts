import { mapWithConcurrency } from '../../services/concurrentTasks'
import { fileBytes } from './draftFiles'
import { uploadRecognitionFile } from './recognitionJobs'

export type CaseRecognitionDraft = { id:string;version:number;state:string;items:{category:string;title:string}[] }
export type CaseRecognitionCache = { assets:Record<string,string>;draft?:{id:string;version:number} }
export async function casePhotoKey(file:File) {
  const digest=await crypto.subtle.digest('SHA-256',await fileBytes(file))
  return `case-photo:${file.type}:${Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')}`
}

// Keep the original two-step checkpoint -> recognize contract. Only transport
// changes: completed assets and the exact preceding draft are reused.
export async function recognizeCasePhotos({memberId,token,text,files,eventId,signal,cache,onAsset,onOriginal,onPrepared}:{memberId:string;token:string;text:string;files:File[];eventId?:string;signal:AbortSignal;cache:CaseRecognitionCache;onAsset:(key:string,id:string)=>void;onOriginal:(draft:CaseRecognitionDraft)=>void;onPrepared:(draft:CaseRecognitionDraft)=>void}) {
  const url=`/api/members/${encodeURIComponent(memberId)}/ai-drafts`
  const request=async(path:string,method:'GET'|'POST',input?:unknown)=>{
    signal.throwIfAborted()
    const response=await fetch(path,{method,headers:{Authorization:`Bearer ${token}`,...(input?{'Content-Type':'application/json'}:{})},body:input?JSON.stringify(input):undefined,signal})
    const value=await response.json()
    signal.throwIfAborted()
    if(!response.ok)throw Object.assign(new Error(value.error?.message??'识别未完成'),{status:response.status,code:value.error?.code})
    return value as CaseRecognitionDraft
  }
  const ids=await mapWithConcurrency(files,2,async file=>{
    signal.throwIfAborted()
    const key=await casePhotoKey(file);signal.throwIfAborted()
    let id=cache.assets[key]
    if(!id){id=await uploadRecognitionFile(memberId,token,file,signal);signal.throwIfAborted();cache.assets[key]=id;onAsset(key,id)}
    return id
  },signal)
  // Exact duplicates have the same source identity in existing prepareDocuments.
  const assetIds=[...new Set(ids)]
  let previous:CaseRecognitionDraft|undefined
  if(cache.draft){
    try{previous=await request(`${url}/${encodeURIComponent(cache.draft.id)}`,'GET')}
    catch(error){if(signal.aborted||!(error&&typeof error==='object'&&'status' in error&&error.status===404))throw error}
    if(previous?.state==='saved')previous=undefined
  }
  let original:CaseRecognitionDraft
  try{original=await request(url,'POST',{...(previous?{id:previous.id,version:previous.version}:{}),text,task:'record',sourceIdentity:'pending',deferRecognition:true,...(eventId?{eventId}:{}),assetIds})}
  catch(error){
    if(error&&typeof error==='object'&&'code' in error&&error.code==='RECOGNITION_ASSET_NOT_FOUND'){
      const referenced=new Set(assetIds)
      for(const [key,id] of Object.entries(cache.assets))if(referenced.has(id)){delete cache.assets[key];onAsset(key,'')}
    }
    throw error
  }
  cache.draft={id:original.id,version:original.version};onOriginal(original)
  signal.throwIfAborted()
  const prepared=await request(url,'POST',{id:original.id,version:original.version,text,task:'record',sourceIdentity:'pending'})
  cache.draft={id:prepared.id,version:prepared.version};onPrepared(prepared)
  return prepared
}
