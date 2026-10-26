import type {Page} from '@playwright/test'

/** A pre-V3 byte snapshot, distinct from a new microphone capture. */
export async function seedLegacyPendingVoice(page:Page,memberId:string){
 return page.evaluate(async memberId=>{
  const bytes=new ArrayBuffer(32044),view=new DataView(bytes)
  const text=(at:number,s:string)=>{for(let i=0;i<s.length;i++)view.setUint8(at+i,s.charCodeAt(i))}
  text(0,'RIFF');view.setUint32(4,32036,true);text(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,32000,true)
  for(let i=0;i<16000;i++)view.setInt16(44+i*2,Math.round(Math.sin(i*Math.PI*440/8000)*3276),true)
  const file={kind:'bytes-v1',name:'升级前保留的原录音.wav',type:'audio/wav',lastModified:1700000000000,bytes}
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('hoooho-smart-record-drafts',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
  await new Promise<void>((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put({text:'',files:[file],pendingVoice:file,occurredAt:'',timeUnknown:true,requestId:crypto.randomUUID(),updatedAt:Date.now()},`home-smart:visit-test:${memberId}:new`);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})
  db.close();return `data:audio/wav;base64,${btoa(String.fromCharCode(...new Uint8Array(bytes)))}`
 },memberId)
}
