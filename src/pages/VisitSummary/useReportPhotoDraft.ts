import { useEffect, useRef, useState } from 'react'
import { prepareHealthImage } from '../../features/health-attachments/prepareHealthImage'
import { quickRecordService } from '../../services/quickRecords'

type Photo = {localId:string;file:File;url:string;serverId?:string;status:'uploading'|'uploaded'|'failed';error?:string}
export function useReportPhotoDraft(memberId:string,token:string) {
  const [photos,setPhotos]=useState<Photo[]>([]),[notice,setNotice]=useState('')
  const ref=useRef({active:true,draftId:crypto.randomUUID(),photos:[] as Photo[],saving:false})
  const cleanup=(session:typeof ref.current)=>{if(session.photos.length)void quickRecordService.cancelPhotos(session.draftId,memberId,token).catch(()=>undefined)}
  useEffect(()=>{
    const session={active:true,draftId:crypto.randomUUID(),photos:[] as Photo[],saving:false};ref.current=session
    return()=>{session.active=false;session.photos.forEach(p=>URL.revokeObjectURL(p.url));if(!session.saving)cleanup(session)}
  },[memberId,token])
  const publish=(session:typeof ref.current)=>{if(session.active&&ref.current===session)setPhotos([...session.photos])}
  const upload=async(photo:Photo,session:typeof ref.current)=>{
    // Capture member, draft and panel identity BEFORE asynchronous compression.
    photo.status='uploading';photo.error=undefined;publish(session)
    try{
      const prepared=await prepareHealthImage(photo.file)
      if(!session.active||!session.photos.includes(photo))return
      const saved=await quickRecordService.uploadPhoto(session.draftId,{memberId,...prepared,sortOrder:session.photos.indexOf(photo)},token)
      if(!session.active||!session.photos.includes(photo)){
        await quickRecordService.deletePhoto(session.draftId,saved.id,memberId,token).catch(()=>undefined)
        return
      }
      photo.serverId=saved.id;photo.status='uploaded';publish(session)
    }catch(e){if(session.active&&session.photos.includes(photo)){photo.status='failed';photo.error=e instanceof Error&&!/abort|fetch/i.test(e.message)?e.message:'上传未完成，请重试或取消';publish(session)}}
  }
  return {
    photos,notice,
    choose(files:FileList|null){if(!files)return;const session=ref.current,remaining=10-session.photos.length;setNotice(files.length>remaining?'每次最多添加 10 张照片':'');const added=Array.from(files).slice(0,remaining).map(file=>({localId:crypto.randomUUID(),file,url:URL.createObjectURL(file),status:'uploading' as const}));session.photos.push(...added);publish(session);for(const p of added)void upload(p,session)},
    retry(id:string){const p=ref.current.photos.find(p=>p.localId===id);if(p&&p.status==='failed')void upload(p,ref.current)},
    remove(id:string){const session=ref.current,p=session.photos.find(p=>p.localId===id);if(!p)return;session.photos=session.photos.filter(p=>p.localId!==id);URL.revokeObjectURL(p.url);publish(session);if(p.serverId)void quickRecordService.deletePhoto(session.draftId,p.serverId,memberId,token).catch(()=>setNotice('草稿清理未确认；未保存照片不会进入报告，并会自动过期'))},
    async save<T>(operation:(draft:{draftId:string;photoIds:string[]})=>Promise<T>){const session=ref.current;session.saving=true;try{return await operation({draftId:session.draftId,photoIds:session.photos.map(p=>p.serverId!)})}finally{session.saving=false;if(!session.active)cleanup(session)}}
  }
}
