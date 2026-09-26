import { useEffect, useRef, useState } from 'react'
import { BottomSheetSurface, HohoButton } from '../../components/design-system'
import type { VisitPhoto, VisitSheet, VisitSource } from '../../types/visitSheet'
import { reportTime } from './ReportChapter'

export async function readPhoto(source: VisitSource, token: string, signal?: AbortSignal) {
  const resourcePath=source.contentPath && /^\/api\/members\/[^/]+\/visit-sheet\/resources\/[a-f0-9]{24}$/.test(source.contentPath) ? source.contentPath : `/api/events/${encodeURIComponent(source.eventId!)}/attachments/${encodeURIComponent(source.attachmentId!)}/content`
  const response = await fetch(resourcePath, {headers:{Authorization:`Bearer ${token}`},signal:signal ? AbortSignal.any([signal,AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),cache:'no-store'})
  if (!response.ok) throw new Error(response.status === 404 ? '照片已失效或原件不可用' : [401,403].includes(response.status) ? '照片权限已失效，请重新登录核验' : '照片读取失败，请重试')
  const blob = await response.blob()
  if (!/^image\/(png|jpeg|webp|gif)$/i.test(blob.type)) throw new Error('此附件不是可安全内嵌的图片；原图未附')
  return blob
}
export function PhotoImage({source,token,onOpen}:{source:VisitSource;token:string;onOpen?:()=>void}) {
  const [url,setUrl]=useState(''),[error,setError]=useState(''),[attempt,setAttempt]=useState(0)
  useEffect(()=>{
    const controller=new AbortController();let objectUrl=''
    setUrl('');setError('')
    void readPhoto(source,token,controller.signal).then(blob=>{if(!controller.signal.aborted){objectUrl=URL.createObjectURL(blob);setUrl(objectUrl)}}).catch(e=>{if(!controller.signal.aborted)setError(e.message)})
    return()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl)}
  },[source.id,source.updatedAt,token,attempt])
  return error ? <div role="alert"><p>{error}</p><HohoButton variant="text" onClick={()=>setAttempt(n=>n+1)}>重试照片</HohoButton></div> : url ? <button className="visit-photo-image" onClick={onOpen} disabled={!onOpen} aria-label={`查看原图：${source.title}`}><img src={url} alt={source.title} onError={()=>setError('图片解码失败，请重试原件')}/></button> : <p role="status">正在读取照片…</p>
}
export function PhotoCaption({photo}:{photo:VisitPhoto}) {
  return <figcaption><strong>{photo.location}</strong><br/>{photo.timeKind} {reportTime(photo.capturedAt || photo.uploadedAt)}<br/>{photo.title}</figcaption>
}
export function ReportPhotos({report,token,onChoose,onOpen}:{report:VisitSheet;token:string;onChoose:()=>void;onOpen:(id:string)=>void}) {
  const photos=(report.photos??[]).filter(p=>report.selectedPhotoIds?.includes(p.sourceId))
  return <section className="visit-photos" aria-label="近期相关照片"><div className="visit-section-actions"><h3>近期相关照片</h3><button onClick={onChoose}>调整照片</button></div>
    {photos.length ? <><div className="visit-photo-grid">{photos.map(p=><figure key={p.sourceId}><PhotoImage source={report.sources.find(s=>s.id===p.sourceId)!} token={token} onOpen={()=>onOpen(p.sourceId)}/><PhotoCaption photo={p}/></figure>)}</div><p className="visit-muted">照片按关联记录呈现；不据此判断病情轻重或治疗前后。</p></> : <p className="visit-muted">{report.photoCandidates?.length ? '本次未展示照片。原附件仍保留。' : '没有与这项主诉明确关联的照片。'}</p>}
  </section>
}
export function PhotoPicker({report,token,onClose,onSave,working,error}:{report:VisitSheet;token:string;onClose:()=>void;onSave:(ids:string[])=>Promise<boolean>;working:boolean;error:string}) {
  const [ids,setIds]=useState(report.selectedPhotoIds??[]),[discard,setDiscard]=useState(false)
  const close=()=>JSON.stringify(ids)!==JSON.stringify(report.selectedPhotoIds??[]) ? setDiscard(true) : onClose()
  return <BottomSheetSurface open label="调整照片" title="本次展示照片" size="workspace" onClose={()=>{if(!working)close()}} footer={<HohoButton fullWidth loading={working} onClick={()=>void onSave(ids)}>保存展示选择</HohoButton>}>
    <p>仅改变本主题的展示，不删除原附件。导出时可另行核对包含范围。</p>
    {(report.photos??[]).filter(p=>report.photoCandidates?.includes(p.sourceId)).map(p=><div className="visit-photo-choice" key={p.sourceId}><label><input type="checkbox" checked={ids.includes(p.sourceId)} onChange={e=>setIds(e.target.checked?[...ids,p.sourceId]:ids.filter(id=>id!==p.sourceId))}/>{p.title}</label><PhotoCaption photo={p}/><PhotoImage source={report.sources.find(s=>s.id===p.sourceId)!} token={token}/></div>)}
    {!report.photoCandidates?.length&&<p>暂无明确关联的可选照片。</p>}{error&&<p role="alert">尚未保存：{error}</p>}
    {discard&&<div role="alert"><p>展示选择尚未保存</p><HohoButton onClick={()=>setDiscard(false)}>继续选择</HohoButton><HohoButton variant="text" onClick={onClose}>放弃修改</HohoButton></div>}
  </BottomSheetSurface>
}
export function PhotoViewer({report,token,id,onClose}:{report:VisitSheet;token:string;id:string;onClose:()=>void}) {
  const photos=(report.photos??[]).filter(p=>report.selectedPhotoIds?.includes(p.sourceId)),[index,setIndex]=useState(Math.max(0,photos.findIndex(p=>p.sourceId===id))),[zoom,setZoom]=useState(1)
  const viewport=useRef<HTMLDivElement>(null),drag=useRef<{x:number;y:number;left:number;top:number}|null>(null),p=photos[index]
  return <BottomSheetSurface open label="照片原图" title="完整原图" size="workspace" onClose={onClose}>
    <p>完整比例起始显示。放大后可拖动或滚动查看边缘；照片本身不作病情判断。</p>
    <div className="visit-image-toolbar"><HohoButton variant="secondary" onClick={()=>setZoom(z=>Math.min(4,z+0.5))}>放大</HohoButton><HohoButton variant="secondary" onClick={()=>{setZoom(1);viewport.current?.scrollTo(0,0)}}>还原完整比例</HohoButton></div>
    <div className="visit-image-viewport" data-zoomed={zoom>1} ref={viewport} style={{touchAction:zoom>1?'none':'pan-y'}} onPointerDown={e=>{if(zoom<=1)return;const el=e.currentTarget;drag.current={x:e.clientX,y:e.clientY,left:el.scrollLeft,top:el.scrollTop};el.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(!drag.current)return;e.currentTarget.scrollLeft=drag.current.left+drag.current.x-e.clientX;e.currentTarget.scrollTop=drag.current.top+drag.current.y-e.clientY}} onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}}>
      <div style={{width:`${zoom*100}%`}}><PhotoImage key={p.sourceId} source={report.sources.find(s=>s.id===p.sourceId)!} token={token}/></div>
    </div><PhotoCaption photo={p}/><div className="visit-image-toolbar"><HohoButton variant="text" disabled={index===0} onClick={()=>{setIndex(index-1);setZoom(1)}}>上一张照片</HohoButton><span>{index+1} / {photos.length}</span><HohoButton variant="text" disabled={index===photos.length-1} onClick={()=>{setIndex(index+1);setZoom(1)}}>下一张照片</HohoButton></div>
  </BottomSheetSurface>
}
