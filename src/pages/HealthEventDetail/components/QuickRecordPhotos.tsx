import { CompleteImage } from '../../../components/common/CompleteImage'
import { createPortal } from 'react-dom'
import {useAppStore} from '../../../store/useAppStore'
import './QuickRecordPhotos.css'
import {localMediaDraft} from '../../../features/health-attachments/localMediaDraft'
import type { MediaReview } from '../../../services/quickRecords'
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ImagePlus, LoaderCircle, RotateCcw, X } from 'lucide-react'
import { prepareHealthImage } from '../../../features/health-attachments/prepareHealthImage'
import { useDialogFocus } from '../../../hooks/useDialogFocus'
import { usePageScrollLock } from '../../../hooks/usePageScrollLock'
import { quickRecordService, type QuickRecordPhotoDto } from '../../../services/quickRecords'


export type QuickRecordPhotoStatus = 'uploading' | 'uploaded' | 'failed'
export interface QuickRecordPhotoItem {
  localId: string
  serverId?: string
  file?: File
  name: string
  mimeType?: string
  previewUrl: string
  posterUrl?: string
  size?: number
  duration?: number
  origin?: 'capture' | 'library'
  review?: MediaReview
  previewError?: string
  reviewFetchError?: string
  status: QuickRecordPhotoStatus
  error?: string
}

export interface QuickRecordPhotoPayload { draftId: string; photoIds: string[] }

export const QUICK_RECORD_PHOTO_LIMIT = 10
export const remainingPhotoCapacity = (count: number, limit = QUICK_RECORD_PHOTO_LIMIT) => Math.max(0, limit - count)
export const hasUnreadyPhotos = (photos: readonly QuickRecordPhotoItem[]) => photos.some((photo) => photo.status !== 'uploaded')

async function localVideoInfo(url:string):Promise<{duration?:number;posterUrl?:string}> {
  return new Promise(resolve=>{const video=document.createElement('video');let settled=false;const finish=(result:{duration?:number;posterUrl?:string})=>{if(settled)return;settled=true;clearTimeout(timer);video.pause();video.removeAttribute('src');video.load();resolve(result)};const timer=setTimeout(()=>finish({}),7000);video.muted=true;video.playsInline=true;video.preload='auto';video.onloadeddata=()=>{try{const canvas=document.createElement('canvas');canvas.width=240;canvas.height=Math.max(1,Math.round(video.videoHeight*240/video.videoWidth));canvas.getContext('2d')?.drawImage(video,0,0,canvas.width,canvas.height);canvas.toBlob(blob=>finish({duration:Number.isFinite(video.duration)?video.duration:undefined,posterUrl:blob?URL.createObjectURL(blob):undefined}),'image/jpeg',.75)}catch{finish({duration:Number.isFinite(video.duration)?video.duration:undefined})}};video.onerror=()=>finish({});video.src=url})
}

const draftStorageKey = (memberId: string, namespace = 'default') => `hoooho-quick-record-photo-draft:${namespace}:${memberId}`

export function useQuickRecordPhotos(memberId?: string, token?: string, limit = QUICK_RECORD_PHOTO_LIMIT, namespace = 'default', allowVideos = false) {
  const [photos, setPhotos] = useState<QuickRecordPhotoItem[]>([])
  const accountId=useAppStore(s=>s.authUser?.id??'unauthenticated')
  const localScope=`${accountId}:${memberId}:${namespace}`
  const scopeRef=useRef(localScope)
  const [notice, setNotice] = useState('')
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const photosRef = useRef(photos)
  const draftIdRef = useRef('')
  const uploadQueue = useRef(Promise.resolve())
  const live = useRef(true)
  const uploadVersionsRef = useRef(new Map<string, number>())
  const removedIds=useRef(new Set<string>())
  const hydrationGeneration=useRef(0)
  photosRef.current = photos

  useEffect(()=>{if(scopeRef.current!==localScope){photosRef.current.forEach(p=>{URL.revokeObjectURL(p.previewUrl);if(p.posterUrl)URL.revokeObjectURL(p.posterUrl)});photosRef.current=[];setPhotos([]);uploadVersionsRef.current.clear();draftIdRef.current='';scopeRef.current=localScope;setPreviewIndex(null)}},[localScope])
  const ensureDraftId = () => {
    if (draftIdRef.current) return draftIdRef.current
    const existing = memberId ? sessionStorage.getItem(draftStorageKey(memberId, namespace)) : ''
    draftIdRef.current = existing || crypto.randomUUID().replaceAll('-', '')
    if (memberId) sessionStorage.setItem(draftStorageKey(memberId, namespace), draftIdRef.current)
    return draftIdRef.current
  }

  useEffect(() => {
    if (!memberId || !token) return
    const stored = sessionStorage.getItem(draftStorageKey(memberId, namespace))
    if ((!stored&&!allowVideos) || photosRef.current.length) return
    draftIdRef.current = stored||ensureDraftId()
    const hydrationDraft=draftIdRef.current,hydrationTurn=hydrationGeneration.current
    let active = true
    void quickRecordService.listPhotos(hydrationDraft, memberId, token).then(async (saved) => {
      const hydrated = await Promise.all(saved.map(async (photo) => {
        let blob: Blob
        if(allowVideos)try{blob=await quickRecordService.mediaPreview(hydrationDraft,photo.id,memberId,token)}catch{blob=await quickRecordService.readPhoto(hydrationDraft,photo.id,memberId,token)}
        else blob=await quickRecordService.readPhoto(hydrationDraft,photo.id,memberId,token)
        let posterUrl: string | undefined
        if(allowVideos&&photo.mimeType.startsWith('video/'))try{posterUrl=URL.createObjectURL(await quickRecordService.mediaPreview(hydrationDraft,photo.id,memberId,token,true))}catch{/* identifiable video fallback remains */}
        return { localId: photo.uploadId??photo.id, serverId: photo.id, name: photo.name, mimeType: photo.mimeType, size:photo.binarySize,duration:photo.duration,review:photo.review,previewUrl: URL.createObjectURL(blob), posterUrl, status: 'uploaded' as const }
      }))
      const pending=allowVideos?(await localMediaDraft.list(localScope).catch(()=>[])).filter(p=>!saved.some(s=>s.uploadId===p.localId)):[]
      const restored=pending.map(p=>({localId:p.localId,file:p.file,name:p.file.name,mimeType:p.file.type,size:p.file.size,origin:p.origin,previewUrl:URL.createObjectURL(p.file),status:'failed' as const,error:'上次上传未完成，原件已在本机恢复，请重试上传'}))
      if (active&&hydrationGeneration.current===hydrationTurn) setPhotos(current=>{const candidates=[...hydrated,...restored];const added=candidates.filter(p=>!removedIds.current.has(p.localId)&&!('serverId' in p&&removedIds.current.has(p.serverId!))&&!current.some(c=>c.localId===p.localId||('serverId' in p&&p.serverId===c.serverId)));candidates.filter(p=>!added.includes(p)).forEach(p=>{URL.revokeObjectURL(p.previewUrl);if('posterUrl' in p&&p.posterUrl)URL.revokeObjectURL(p.posterUrl)});const next=[...current,...added];photosRef.current=next;return next})
      else [...hydrated,...restored].forEach((photo) => {URL.revokeObjectURL(photo.previewUrl);if('posterUrl' in photo&&photo.posterUrl)URL.revokeObjectURL(photo.posterUrl)})
    }).catch(() => { if (active) setNotice(allowVideos ? '资料草稿暂时无法恢复，请稍后重试' : '照片草稿暂时无法恢复，请稍后重试') })
    return () => { active = false }
  }, [memberId, namespace, token, localScope])

  useEffect(() => { live.current=true; return () => { live.current=false;photosRef.current.forEach((photo) => {URL.revokeObjectURL(photo.previewUrl);if(photo.posterUrl)URL.revokeObjectURL(photo.posterUrl)}) } }, [])

  const uploadItem = async (item: QuickRecordPhotoItem, sortOrder: number, version: number) => {
    if (!item.file || !memberId || !token || !live.current || uploadVersionsRef.current.get(item.localId)!==version) return
    const uploadDraft=ensureDraftId()
    try {
      if(allowVideos && item.file.size > (item.mimeType?.startsWith('video/') ? 100 : 25)*1024*1024)throw new Error(item.mimeType?.startsWith('video/')?'视频超过100MB，请在相册裁剪后重选':'照片超过25MB，请缩小后重选')
      const saved = allowVideos ? await quickRecordService.uploadMedia(uploadDraft,item.file,memberId,token,sortOrder,item.origin??'library',item.localId) : await quickRecordService.uploadPhoto(ensureDraftId(), { memberId, ...await prepareHealthImage(item.file), sortOrder }, token)
      if (!live.current || uploadVersionsRef.current.get(item.localId) !== version) {if(!allowVideos||saved.uploadId===item.localId)void quickRecordService.deletePhoto(uploadDraft,saved.id,memberId,token).catch(()=>undefined);return}
      let previewUrl=item.previewUrl,posterUrl:string|undefined
      if(allowVideos){try{previewUrl=URL.createObjectURL(await quickRecordService.mediaPreview(uploadDraft,saved.id,memberId,token));if(saved.mimeType.startsWith('video/'))posterUrl=URL.createObjectURL(await quickRecordService.mediaPreview(uploadDraft,saved.id,memberId,token,true))}catch{/* original/fallback remains visible */}}
      if (!live.current || uploadVersionsRef.current.get(item.localId) !== version) {URL.revokeObjectURL(previewUrl);if(posterUrl)URL.revokeObjectURL(posterUrl);return}
      if(previewUrl!==item.previewUrl)URL.revokeObjectURL(item.previewUrl)
      if(allowVideos)void localMediaDraft.remove(localScope,item.localId).catch(()=>undefined)
      setPhotos((current) => {
        const next = current.map((photo): QuickRecordPhotoItem => photo.localId === item.localId
          ? { ...photo, serverId: saved.id, mimeType:saved.mimeType, previewUrl, posterUrl:posterUrl??photo.posterUrl, duration:saved.duration,size:saved.binarySize, status: 'uploaded', error: undefined, review:allowVideos?saved.review:undefined }
          : photo)
        photosRef.current = next
        return next
      })
    } catch (reason) {
      if (!live.current || uploadVersionsRef.current.get(item.localId) !== version) return
      setPhotos((current) => {
        const next = current.map((photo): QuickRecordPhotoItem => photo.localId === item.localId
          ? { ...photo, status: 'failed', error: reason instanceof Error ? reason.message : '上传失败，请重试' }
          : photo)
        photosRef.current = next
        return next
      })
    }
  }

  const beginUpload = (item: QuickRecordPhotoItem, sortOrder: number) => {
    const version = (uploadVersionsRef.current.get(item.localId) ?? 0) + 1
    uploadVersionsRef.current.set(item.localId, version)
    uploadQueue.current = uploadQueue.current.then(async()=>{if(allowVideos&&item.file){await localMediaDraft.put({key:localScope+':'+item.localId,scope:localScope,localId:item.localId,file:item.file,origin:item.origin??'library',createdAt:Date.now()}).catch(()=>setNotice('当前浏览器无法保留本地原件，刷新后未上传文件需重选'));if(uploadVersionsRef.current.get(item.localId)!==version){await localMediaDraft.remove(localScope,item.localId).catch(()=>undefined);return}}await uploadItem(item,sortOrder,version)})
  }

  const chooseFiles = (files: FileList | null, origin: 'capture' | 'library' = 'library') => {
    if (!files?.length) return []
    const available = remainingPhotoCapacity(photosRef.current.length, limit)
    const selected = Array.from(files).slice(0, available)
    if (files.length > available) setNotice(allowVideos ? `最多上传${limit}份资料` : limit === QUICK_RECORD_PHOTO_LIMIT ? '最多上传10张照片' : `最多上传${limit}张照片`)
    else setNotice('')
    const additions = selected.map((file): QuickRecordPhotoItem => ({
      localId: crypto.randomUUID(), file, origin, size:file.size, name: file.name, mimeType: file.type || (/\.(mp4|mov|webm)$/i.test(file.name)?'video/'+(/\.mov$/i.test(file.name)?'quicktime':/\.webm$/i.test(file.name)?'webm':'mp4'):''), previewUrl: URL.createObjectURL(file), status: 'uploading'
    }))
    const previousCount = photosRef.current.length
    const next = [...photosRef.current, ...additions]
    photosRef.current = next
    setPhotos(next)
    additions.forEach((item, index) => {ensureDraftId();beginUpload(item, previousCount + index)})
    if(allowVideos)additions.filter(item=>item.mimeType?.startsWith('video/')).forEach(item=>void localVideoInfo(item.previewUrl).then(info=>{if(!live.current||!photosRef.current.some(p=>p.localId===item.localId)){if(info.posterUrl)URL.revokeObjectURL(info.posterUrl);return}setPhotos(current=>current.map(p=>{if(p.localId!==item.localId)return p;if(p.posterUrl){if(info.posterUrl)URL.revokeObjectURL(info.posterUrl);return p}return {...p,...info}}))}))
    return additions.map((item) => item.localId)
  }

  const retry = (localId: string) => {
    const item = photosRef.current.find((photo) => photo.localId === localId)
    if (!item || item.status !== 'failed') return
    const next = photosRef.current.map((photo): QuickRecordPhotoItem => photo.localId === localId ? { ...photo, status: 'uploading', error: undefined } : photo)
    photosRef.current = next
    setPhotos(next)
    beginUpload(item, photosRef.current.findIndex((photo) => photo.localId === localId))
  }

  const remove = (localId: string) => {
    const item = photosRef.current.find((photo) => photo.localId === localId)
    if (!item) return
    removedIds.current.add(item.localId);if(item.serverId)removedIds.current.add(item.serverId)
    if(allowVideos)void localMediaDraft.remove(localScope,item.localId).catch(()=>undefined)
    uploadVersionsRef.current.set(localId, (uploadVersionsRef.current.get(localId) ?? 0) + 1)
    URL.revokeObjectURL(item.previewUrl);if(item.posterUrl)URL.revokeObjectURL(item.posterUrl)
    const next = photosRef.current.filter((photo) => photo.localId !== localId)
    photosRef.current = next
    setPhotos(next)
    setPreviewIndex(null)
    if (item.serverId && !next.some(p=>p.serverId===item.serverId) && memberId && token && draftIdRef.current) void quickRecordService.deletePhoto(draftIdRef.current, item.serverId, memberId, token).catch(() => undefined)
  }

  const clearLocal = () => {
    hydrationGeneration.current++
    photosRef.current.forEach((photo) => {URL.revokeObjectURL(photo.previewUrl);if(photo.posterUrl)URL.revokeObjectURL(photo.posterUrl);if(allowVideos)void localMediaDraft.remove(localScope,photo.localId).catch(()=>undefined)})
    uploadVersionsRef.current.clear()
    photosRef.current = []
    setPhotos([])
    setPreviewIndex(null)
    setNotice('')
    if (memberId) sessionStorage.removeItem(draftStorageKey(memberId, namespace))
    draftIdRef.current = ''
  }

  const cancel = () => {
    const draftId = draftIdRef.current
    clearLocal()
    if (draftId && memberId && token) void quickRecordService.cancelPhotos(draftId, memberId, token).catch(() => undefined)
  }

  const payload = (): QuickRecordPhotoPayload => ({
    draftId: draftIdRef.current,
    photoIds: [...new Set(photosRef.current.filter((photo) => photo.status === 'uploaded' && photo.serverId).map((photo) => photo.serverId!))]
  })

  useEffect(()=>{if(!allowVideos||!memberId||!token)return;let active=true;const tick=async()=>{for(const item of photosRef.current.filter(p=>p.status==='uploaded'&&p.serverId&&(!p.review||[p.review.audio?.status,p.review.vision?.status].includes('processing')))){try{const review=await quickRecordService.mediaReview(ensureDraftId(),item.serverId!,memberId,token);if(active&&live.current)setPhotos(current=>current.map(p=>p.localId===item.localId?{...p,review:review??p.review,reviewFetchError:undefined}:p))}catch{if(active&&live.current)setPhotos(current=>current.map(p=>p.localId===item.localId?{...p,reviewFetchError:'状态更新失败，已有结果保留；请重试加载'}:p))}}};const timer=window.setInterval(()=>void tick(),2000);void tick();return()=>{active=false;clearInterval(timer)}},[allowVideos,memberId,token])
  const refreshReview=async(localId:string)=>{const item=photosRef.current.find(p=>p.localId===localId);if(!item?.serverId||!memberId||!token)return;const scope=localScope;try{const review=await quickRecordService.mediaReview(ensureDraftId(),item.serverId,memberId,token);if(live.current&&scopeRef.current===scope)setPhotos(current=>current.map(p=>p.localId===localId?{...p,review:review??p.review,reviewFetchError:undefined}:p))}catch{if(live.current&&scopeRef.current===scope)setPhotos(current=>current.map(p=>p.localId===localId?{...p,reviewFetchError:'状态更新失败，已有结果保留；请重试加载'}:p))}}
  const retryReview=async(localId:string,part:string)=>{const item=photosRef.current.find(p=>p.localId===localId);if(!item?.serverId||!memberId||!token)return;try{const review=await quickRecordService.mediaReview(ensureDraftId(),item.serverId,memberId,token,part);if(live.current)setPhotos(current=>current.map(p=>p.localId===localId?{...p,review:review??undefined}:p))}catch(e){setNotice(e instanceof Error?e.message:'整理重试失败')}}
  const confirmReview=async(localId:string,text:string)=>{const item=photosRef.current.find(p=>p.localId===localId);if(!item?.serverId||!memberId||!token)throw new Error('资料尚未上传');const scope=localScope;const review=await quickRecordService.confirmMedia(ensureDraftId(),item.serverId,memberId,token,text);if(!live.current||scopeRef.current!==scope||!photosRef.current.some(p=>p.localId===localId))throw new Error('资料已移除或人物已切换，未应用到正文');if(live.current)setPhotos(current=>current.map(p=>p.localId===localId?{...p,review}:p))}
  return { refreshReview,retryReview,confirmReview,allowVideos, photos, notice, previewIndex, setPreviewIndex, chooseFiles, retry, remove, cancel, clearAfterSave: clearLocal, payload, blocked: hasUnreadyPhotos(photos) }
}

export function QuickRecordPhotos({ model, limit = QUICK_RECORD_PHOTO_LIMIT, showAddButton = true, onApply }: { model: ReturnType<typeof useQuickRecordPhotos>; limit?: number; showAddButton?: boolean; onApply?: (text:string,id:string)=>void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const lightboxRef = useRef<HTMLDivElement>(null)
  const { photos, notice, previewIndex } = model
  const selected = previewIndex === null ? null : photos[previewIndex] ?? null
  useDialogFocus(Boolean(selected), lightboxRef)
  usePageScrollLock(Boolean(selected))
  useEffect(()=>{if(!selected)return;const panels=Array.from(document.querySelectorAll<HTMLElement>('.symptom-record-scroll'));const values=panels.map(p=>({p,scroll:p.scrollTop,overflow:p.style.overflow}));values.forEach(({p})=>p.style.overflow='hidden');return()=>values.forEach(({p,scroll,overflow})=>{p.style.overflow=overflow;p.scrollTop=scroll})},[Boolean(selected)])
  useEffect(() => {
    if (!selected) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') model.setPreviewIndex(null) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [model, selected])
  return <>
    <div className="quick-record-photos" data-empty={photos.length === 0}>
      <div className="quick-record-photos__heading"><strong>{model.allowVideos ? '已添加资料' : '上传照片'}</strong><span>{photos.length}/{limit}</span></div>
      <div className="quick-record-photos__rail">
        {photos.map((photo, index) => <div className="quick-record-photo" data-status={photo.status} key={photo.localId}>
          <button aria-label={`查看${photo.mimeType?.startsWith('video/') ? '视频' : '照片'} ${index + 1}`} className="quick-record-photo__preview" onClick={() => model.setPreviewIndex(index)} type="button">{photo.mimeType?.startsWith('video/') ? photo.posterUrl ? <span className="media-video-thumb"><MediaImage url={photo.posterUrl} name="视频封面"/><span>▶ {photo.duration?`${Math.round(photo.duration)}秒`:"视频"}</span></span> : <span className="media-fallback">▶ 视频<br/>{photo.duration?`${Math.round(photo.duration)}秒`:photo.name}<br/>{photo.size?`${(photo.size/1024/1024).toFixed(1)}MB`:''}</span> : <MediaImage url={photo.previewUrl} name={photo.name} />}</button>
          {photo.status === 'uploading' && <span aria-label="上传中" className="quick-record-photo__status"><LoaderCircle className="is-spinning" size={17} /></span>}
          {!model.allowVideos && photo.status === 'failed' && <div className="quick-record-photo__failed"><span>上传失败</span><button aria-label={`重试上传 ${photo.name}`} onClick={() => model.retry(photo.localId)} type="button"><RotateCcw size={14} />重试</button><button aria-label={`移除上传失败的照片 ${photo.name}`} onClick={() => model.remove(photo.localId)} type="button"><X size={14} />移除</button></div>}
          {photo.status !== 'failed' && <button aria-label={`删除${photo.mimeType?.startsWith('video/') ? '视频' : '照片'} ${index + 1}`} className="quick-record-photo__delete" onClick={() => model.remove(photo.localId)} type="button"><X size={13} /></button>}
        </div>)}
        {showAddButton && photos.length < limit && <button aria-label={photos.length ? '继续上传照片' : '上传照片'} className="quick-record-photo-add" onClick={() => inputRef.current?.click()} type="button"><ImagePlus aria-hidden="true" size={25} strokeWidth={1.7} /></button>}
      </div>
      {showAddButton && <input ref={inputRef} accept="image/jpeg,image/png,image/webp" hidden multiple onChange={(event) => { model.chooseFiles(event.target.files); event.currentTarget.value = '' }} type="file" />}
      {model.allowVideos && <div className="media-item-details">{photos.map((p,i)=><MediaItemDetails key={p.localId} item={p} index={i} model={model} onApply={onApply} />)}</div>}
      {notice && <p className="quick-record-photo-notice" role="status">{notice}</p>}
      {!model.allowVideos && model.blocked && <p className="quick-record-photo-error" role="alert">{photos.some((photo) => photo.status === 'failed') ? (model.allowVideos ? '有资料上传失败，请重试或移除' : '有照片上传失败，请重试或移除') : (model.allowVideos ? '资料上传中，请稍候' : '照片上传中，请稍候')}</p>}
    </div>
    {selected && createPortal(<div aria-label={selected.mimeType?.startsWith('video/') ? '视频预览' : '照片预览'} aria-modal="true" className="quick-record-photo-lightbox" ref={lightboxRef} role="dialog" tabIndex={-1}>
      <button aria-label="关闭大图预览" className="quick-record-photo-lightbox__close" onClick={() => model.setPreviewIndex(null)} type="button"><X size={25} /></button>
      {photos.length > 1 && <button aria-label={model.allowVideos?'上一份资料':'上一张照片'} className="quick-record-photo-lightbox__previous" onClick={() => model.setPreviewIndex((previewIndex! - 1 + photos.length) % photos.length)} type="button"><ChevronLeft size={30} /></button>}
      {selected.mimeType?.startsWith('video/') ? <MediaPlayer key={selected.localId} url={selected.previewUrl} /> : <MediaImage key={selected.localId} url={selected.previewUrl} name={`照片 ${previewIndex! + 1}`} />}
      {photos.length > 1 && <button aria-label={model.allowVideos?'下一份资料':'下一张照片'} className="quick-record-photo-lightbox__next" onClick={() => model.setPreviewIndex((previewIndex! + 1) % photos.length)} type="button"><ChevronRight size={30} /></button>}
      <span>{previewIndex! + 1}/{photos.length}</span>
    </div>,document.body)}
  </>
}

function MediaImage({url,name}:{url:string;name:string}){const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[url]);return failed?<span className="media-fallback" role="status">{name} · 图片预览不可用，原件与上传状态请见资料列表</span>:<CompleteImage alt={name} src={url} onError={()=>setFailed(true)} />}
function MediaPlayer({url}:{url:string}){const ref=useRef<HTMLVideoElement>(null),[state,setState]=useState('loading');useEffect(()=>{const video=ref.current;return()=>{video?.pause();video?.removeAttribute('src');video?.load()}},[]);return <div className="media-player">{state==='loading'&&<p role="status">正在加载视频…</p>}{state==='error'&&<p role="alert">视频无法播放或格式不兼容，请重新选择H.264 MP4。原件仍保留。</p>}<video ref={ref} controls playsInline preload="metadata" onLoadedData={()=>setState('ready')} onError={()=>setState('error')} src={url}/></div>}
function MediaItemDetails({item,index,model,onApply}:{item:QuickRecordPhotoItem;index:number;model:ReturnType<typeof useQuickRecordPhotos>;onApply?: (text:string,id:string)=>void}){
 const review=item.review,[text,setText]=useState(''),[edited,setEdited]=useState(false),[error,setError]=useState(''),[applying,setApplying]=useState(false)
 const suggestion=[review?.audio?.text?`家长描述（原件0–${Math.round(review.audio.range?.[1]??0)}秒）：${review.audio.text}`:'',...(review?.vision?.observations??[]).map(o=>`画面可见${o.seconds===null?'':`（${o.seconds}秒采样）`}：${o.text}`)].filter(Boolean).join('\n')
 useEffect(()=>{if(!edited)setText(suggestion.slice(0,1000))},[suggestion,edited])
 const labels:Record<string,string>={processing:'正在整理',needs_confirmation:'待核对',failed:'整理失败',no_audio:'没有音轨',no_speech:'未转写到语言',empty:'没有足够可见信息',not_applicable:'不适用'}
 return <section className="media-item-detail"><strong>{index+1}. {item.name}</strong><p>{item.status==='uploading'?'正在上传并准备兼容预览':item.status==='uploaded'?'原件已上传':'上传失败'}{item.duration?` · ${Math.round(item.duration)}秒`:''} · {((item.size??0)/1024/1024).toFixed(1)}MB</p>{item.error&&<p role="alert">{item.error}</p>}{item.status==='failed'&&<button aria-label={`重试上传 ${item.name}`} type="button" onClick={()=>model.retry(item.localId)}>重试上传</button>}<button aria-label={`移除资料 ${item.name}`} type="button" onClick={()=>model.remove(item.localId)}>移除资料</button>
 {item.reviewFetchError&&<><p role="alert">{item.reviewFetchError}</p><button type="button" onClick={()=>void model.refreshReview(item.localId)}>重试加载整理状态</button></>}
 {review&&<><p>原件参考日期：{review.referenceDate??'未知，相对时间待确认'}</p><p>口述：{labels[review.audio?.status??'']??'尚未整理'} {review.audio?.message}</p><p>画面：{labels[review.vision?.status??'']??'尚未整理'} {review.vision?.message}</p>{review.sound?.message&&<p>{review.sound.message}</p>}{review.audio?.status==='failed'&&<button type="button" onClick={()=>void model.retryReview(item.localId,'audio')}>重试口述转写</button>}{review.vision?.status==='failed'&&<button type="button" onClick={()=>void model.retryReview(item.localId,'vision')}>重试画面整理</button>}{review.vision?.questions?.map((q,i)=><p key={i}>待确认：{q}</p>)}{suggestion&&onApply&&<><label>资料草稿（核对后应用）<textarea aria-label={`资料草稿 ${index+1}`} maxLength={1000} value={text} onChange={e=>{setEdited(true);setText(e.target.value)}} /></label><p>相对时间、人物与来源差异需核对，不会自动改变发生时间或部位。</p><button type="button" disabled={applying||!text.trim()} onClick={async()=>{setApplying(true);try{await model.confirmReview(item.localId,text);onApply(text,item.serverId??item.localId);setError('')}catch(e){setError(e instanceof Error?e.message:'核对保存失败')}finally{setApplying(false)}}}>{review.confirmedText?'再次应用已核对内容':'核对并补充正文'}</button>{error&&<p role="alert">{error}</p>}</>}</>}{item.status==='uploaded'&&!review&&<button type="button" onClick={()=>void model.retryReview(item.localId,'all')}>开始整理资料</button>}</section>
}
