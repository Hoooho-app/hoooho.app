import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BottomSheetSurface, HohoButton } from '../../components/design-system'
import type { VisitPhoto, VisitPhotoDetail, VisitSheet, VisitSource } from '../../types/visitSheet'
import type { VisitSheetUpdate } from '../../services/visitSheets'
import { useReportPhotoDraft } from './useReportPhotoDraft'
import { reportTime } from './ReportChapter'
import { Play } from 'lucide-react'

export async function readPhoto(source: VisitSource, token: string, signal?: AbortSignal) {
  const resourcePath=source.contentPath && /^\/api\/members\/[^/]+\/visit-sheet\/resources\/[a-f0-9]{24}$/.test(source.contentPath) ? source.contentPath : `/api/events/${encodeURIComponent(source.eventId!)}/attachments/${encodeURIComponent(source.attachmentId!)}/content`
  const timeout=AbortSignal.timeout(source.mimeType?.startsWith('video/')?120000:30000)
  const response = await fetch(resourcePath, {headers:{Authorization:`Bearer ${token}`},signal:signal ? AbortSignal.any([signal,timeout]) : timeout,cache:'no-store'})
  if (!response.ok) throw new Error(response.status === 404 ? '照片已失效或原件不可用' : [401,403].includes(response.status) ? '照片权限已失效，请重新登录核验' : '照片读取失败，请重试')
  const blob = await response.blob()
  if (!/^(?:image\/(png|jpeg|webp|gif)|video\/(mp4|webm|quicktime))$/i.test(blob.type)) throw new Error('此附件不是可安全内嵌的影像；原件未附')
  return blob
}
export function PhotoImage({source,token,onOpen}:{source:VisitSource;token:string;onOpen?:()=>void}) {
  const [url,setUrl]=useState(''),[error,setError]=useState(''),[attempt,setAttempt]=useState(0)
  useEffect(()=>{
    const controller=new AbortController();let objectUrl=''
    setUrl('');setError('')
    void readPhoto(source,token,controller.signal).then(blob=>{if(!controller.signal.aborted){objectUrl=URL.createObjectURL(blob);setUrl(objectUrl)}}).catch(e=>{if(!controller.signal.aborted)setError(/abort|fetch|timeout|timed out/i.test(e.message)?'照片读取超时或连接中断，请重试':e.message)})
    return()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl)}
  },[source.id,source.updatedAt,token,attempt])
  return error ? <div role="alert"><p>{error}</p><HohoButton variant="text" onClick={()=>setAttempt(n=>n+1)}>重试照片</HohoButton></div> : url ? <button className="visit-photo-image" onClick={onOpen} disabled={!onOpen} aria-label={`查看原图：${source.title}`}><img src={url} alt={source.title} onError={()=>setError('图片解码失败，请重试原件')}/></button> : <p role="status">正在读取照片…</p>
}
export function PhotoCaption({photo,compact=false}:{photo:VisitPhoto;compact?:boolean}) {
  const complete=<><strong>{photo.location}</strong><br/>{photo.timeKind} {reportTime(photo.capturedAt || photo.uploadedAt)}<br/>{photo.title}</>
  return <figcaption>{compact?<><strong>{/未提供|未知|未关联/.test(photo.location)?'相关记录照片':photo.location}</strong><br/>{photo.capturedAt?`${photo.timeKind} ${reportTime(photo.capturedAt)}`:'拍摄时间未知'}<details><summary>照片资料</summary>{complete}</details></>:complete}</figcaption>
}
export function ReportPhotos({report,token,onChoose,onOpen}:{report:VisitSheet;token:string;onChoose:()=>void;onOpen:(id:string)=>void}) {
  const photos=(report.selectedPhotoIds??[]).flatMap(id=>report.photos?.find(p=>p.sourceId===id)??[])
  if(!photos.length)return null
  return <section className="visit-photos" aria-label="本次影像"><div className="visit-section-actions"><h3>本次影像</h3><small>{photos.filter(p=>!p.mimeType.startsWith('video/')).length}张照片 · {photos.filter(p=>p.mimeType.startsWith('video/')).length}段视频</small><button onClick={onChoose}>调整</button></div>
    <div className="visit-photo-grid">{photos.map((p,i)=><figure key={p.sourceId}><div className="visit-reading-media-thumb"><span className="visit-reading-media-number">{String(i+1).padStart(2,'0')}</span>{p.mimeType.startsWith('video/')?<button className="visit-video-thumb" aria-label={`查看视频 ${i+1}`} onClick={()=>onOpen(p.sourceId)}><Play size={19}/>{typeof p.duration==='number'&&<span className="visit-video-duration">{String(Math.floor(p.duration/60)).padStart(2,'0')}:{String(Math.floor(p.duration%60)).padStart(2,'0')}</span>}</button>:<PhotoImage source={report.sources.find(s=>s.id===p.sourceId)!} token={token} onOpen={()=>onOpen(p.sourceId)}/>}</div><figcaption>{p.mimeType.startsWith('video/')?'视频':'照片'} {String(i+1).padStart(2,'0')}</figcaption></figure>)}</div>
  </section>
}
export function PhotoPicker({report,memberId,token,onClose,onSave,working,error}:{report:VisitSheet;memberId:string;token:string;onClose:()=>void;onSave:(changes:Partial<VisitSheetUpdate>)=>Promise<boolean>;working:boolean;error:string}) {
  const [ids,setIds]=useState(report.selectedPhotoIds??[]),[discard,setDiscard]=useState(false),[details,setDetails]=useState<Record<string,VisitPhotoDetail>>({}),[existing,setExisting]=useState(false)
  const draft=useReportPhotoDraft(memberId,token),input=useRef<HTMLInputElement>(null)
  const dirty=JSON.stringify(ids)!==JSON.stringify(report.selectedPhotoIds??[])||Object.keys(details).length>0||draft.photos.length>0
  const close=()=>dirty?setDiscard(true):onClose()
  const change=(id:string,value:VisitPhotoDetail)=>setDetails(d=>({...d,[id]:{...d[id],...value}}))
  const save=()=>draft.save(photoDraft=>onSave({selectedPhotoIds:[...ids,...photoDraft.photoIds.map(id=>`draft:${id}`)],photoDetails:details,...(photoDraft.photoIds.length?{photoDraft}:{})}))
  return <BottomSheetSurface open label="添加 / 调整影像" title="添加 / 调整影像" size="workspace" onClose={()=>{if(!working)close()}} footer={<HohoButton fullWidth loading={working} disabled={draft.photos.some(p=>p.status!=='uploaded')} onClick={()=>void save()}>保存影像选择</HohoButton>}>
    <p>照片由家长选择关联本主题，不代表医学关联。保存后可刷新读取；原附件不会因取消展示而删除。</p>
    <fieldset disabled={working} className="visit-photo-edit-fields"><div className="visit-image-toolbar"><HohoButton variant="secondary" disabled={working} onClick={()=>input.current?.click()}>从相册添加</HohoButton><HohoButton variant="secondary" onClick={()=>setExisting(v=>!v)}>选择已有记录</HohoButton></div><input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm" multiple aria-label="选择要上传的影像" className="visit-file-input" onChange={e=>{draft.choose(e.target.files);e.target.value=''}}/>
    {draft.notice&&<p role="status">{draft.notice}</p>}
    {draft.photos.map(p=><div className="visit-photo-choice" key={p.localId}>{p.file.type.startsWith('video/')||/\.(mp4|mov|webm)$/i.test(p.file.name)?<video src={p.url} controls playsInline preload="metadata" aria-label="待保存视频"/>:<img src={p.url} alt={p.file.name}/>}<p>{p.file.name} · {p.status==='uploaded'?'上传完成，待保存':p.status==='uploading'?'处理中 / 上传中':'上传失败'}</p>{p.error&&<p role="alert">{p.error}</p>}{p.status==='failed'&&<HohoButton onClick={()=>draft.retry(p.localId)}>重试上传</HohoButton>}<HohoButton variant="text" disabled={working} onClick={()=>draft.remove(p.localId)}>取消这张照片</HohoButton>{p.serverId&&<PhotoMetadata value={details[`draft:${p.serverId}`]??{}} onChange={value=>change(`draft:${p.serverId}`,value)}/>}</div>)}
    {(report.photos??[]).filter(p=>existing||report.selectedPhotoIds?.includes(p.sourceId)||ids.includes(p.sourceId)).map(p=><div className="visit-photo-choice" key={p.sourceId}><label><input type="checkbox" checked={ids.includes(p.sourceId)} onChange={e=>setIds(e.target.checked?[...ids,p.sourceId]:ids.filter(id=>id!==p.sourceId))}/>{p.title}</label><PhotoCaption photo={p}/>{p.mimeType.startsWith('video/')?<small>视频原件 · 在本次影像中点击播放</small>:<PhotoImage source={report.sources.find(s=>s.id===p.sourceId)!} token={token}/>}<PhotoMetadata value={{label:p.title,location:p.location,capturedAt:p.capturedAt,capturePrecision:p.capturePrecision??(p.capturedAt?.length===10?'day':p.capturedAt?'exact':'unknown'),...details[p.sourceId]}} onChange={value=>change(p.sourceId,value)}/></div>)}
    {existing&&!report.photos?.length&&<p>暂无已有照片，可从相册添加。</p>}</fieldset>{error&&<p role="alert">尚未确认保存：{error}</p>}
    {discard&&<div role="alert"><p>照片或说明尚未保存</p><HohoButton onClick={()=>setDiscard(false)}>继续选择</HohoButton><HohoButton variant="text" onClick={onClose}>放弃修改</HohoButton></div>}
  </BottomSheetSurface>
}
function PhotoMetadata({value,onChange}:{value:VisitPhotoDetail;onChange:(value:VisitPhotoDetail)=>void}){
  return <details className="visit-photo-metadata"><summary>编辑照片说明</summary><p className="visit-muted">保存为报告内的家长说明，不改写原始附件。仅改说明不会改变已有拍摄时刻。</p><label>照片说明<input maxLength={200} value={value.label??''} onChange={e=>onChange({label:e.target.value})}/></label><label>部位 / 对象<input maxLength={200} value={value.location??''} onChange={e=>onChange({location:e.target.value})}/></label><p>当前拍摄时间：{value.capturedAt?reportTime(value.capturedAt):'未知'}</p><label>补充 / 改为拍摄日期<input type="date" value={value.capturePrecision==='day'?value.capturedAt??'':''} onChange={e=>onChange({capturedAt:e.target.value||null,capturePrecision:e.target.value?'day':'unknown'})}/></label><button className="visit-text-action" onClick={()=>onChange({capturedAt:null,capturePrecision:'unknown'})}>设为拍摄时间未知</button></details>
}
export function PhotoViewer({report,token,id,onClose}:{report:VisitSheet;token:string;id:string;onClose:()=>void}) {
  const photos=(report.selectedPhotoIds??[]).flatMap(id=>report.photos?.find(p=>p.sourceId===id)??[]),[index,setIndex]=useState(Math.max(0,photos.findIndex(p=>p.sourceId===id))),[zoom,setZoom]=useState(1)
  const viewport=useRef<HTMLDivElement>(null),drag=useRef<{x:number;y:number;left:number;top:number}|null>(null),p=photos[index]
  if(p?.mimeType.startsWith('video/'))return <BottomSheetSurface open label="视频原件" title="本次影像" size="workspace" onClose={onClose}><VideoOriginal source={report.sources.find(s=>s.id===p.sourceId)!} token={token}/><PhotoCaption photo={p}/><small>视频不自动播放，不据影像作诊断。</small><div className="visit-image-toolbar"><HohoButton disabled={index===0} onClick={()=>setIndex(index-1)}>上一个影像</HohoButton><span>{index+1} / {photos.length}</span><HohoButton disabled={index===photos.length-1} onClick={()=>setIndex(index+1)}>下一个影像</HohoButton></div></BottomSheetSurface>
  return <BottomSheetSurface open label="照片原图" title="完整原图" size="workspace" onClose={onClose}>
    <p>完整比例起始显示。放大后可拖动或滚动查看边缘；照片本身不作病情判断。</p>
    <div className="visit-image-toolbar"><HohoButton variant="secondary" onClick={()=>setZoom(z=>Math.min(4,z+0.5))}>放大</HohoButton><HohoButton variant="secondary" onClick={()=>{setZoom(1);viewport.current?.scrollTo(0,0)}}>还原完整比例</HohoButton></div>
    <div className="visit-image-viewport" data-zoomed={zoom>1} ref={viewport} style={{touchAction:zoom>1?'none':'pan-y'}} onPointerDown={e=>{if(zoom<=1)return;const el=e.currentTarget;drag.current={x:e.clientX,y:e.clientY,left:el.scrollLeft,top:el.scrollTop};el.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(!drag.current)return;e.currentTarget.scrollLeft=drag.current.left+drag.current.x-e.clientX;e.currentTarget.scrollTop=drag.current.top+drag.current.y-e.clientY}} onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}}>
      <div style={{width:`${zoom*100}%`}}><PhotoImage key={p.sourceId} source={report.sources.find(s=>s.id===p.sourceId)!} token={token}/></div>
    </div><PhotoCaption photo={p}/><div className="visit-image-toolbar"><HohoButton variant="text" disabled={index===0} onClick={()=>{setIndex(index-1);setZoom(1)}}>上一张照片</HohoButton><span>{index+1} / {photos.length}</span><HohoButton variant="text" disabled={index===photos.length-1} onClick={()=>{setIndex(index+1);setZoom(1)}}>下一张照片</HohoButton></div>
  </BottomSheetSurface>
}
function VideoOriginal({source,token}:{source:VisitSource;token:string}){
  const [url,setUrl]=useState(''),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),player=useRef<HTMLVideoElement>(null)
  useLayoutEffect(()=>{const element=player.current;return()=>{element?.pause();element?.removeAttribute('src');element?.load()}},[url])
  useEffect(()=>{const controller=new AbortController();let objectUrl='';setUrl('');setError('');void readPhoto(source,token,controller.signal).then(blob=>{if(controller.signal.aborted)return;objectUrl=URL.createObjectURL(blob);setUrl(objectUrl)}).catch(e=>{if(!controller.signal.aborted)setError(/abort|fetch|timeout/i.test(e.message)?'视频读取中断，请重试':e.message)});return()=>{controller.abort();player.current?.pause();if(objectUrl)URL.revokeObjectURL(objectUrl)}},[source.id,token,attempt])
  return <>{url&&<video ref={player} className="visit-media-player" controls playsInline preload="metadata" src={url} aria-label="视频原件播放" onError={()=>setError('当前浏览器无法播放该原件，可下载后使用系统播放器查看')}/>} {!url&&!error&&<p role="status">正在读取视频原件…</p>}{error&&<p role="alert">{error}</p>}{error&&<HohoButton onClick={()=>setAttempt(n=>n+1)}>重试视频</HohoButton>}{url&&<a href={url} download={source.title}>下载视频原件</a>}</>
}
