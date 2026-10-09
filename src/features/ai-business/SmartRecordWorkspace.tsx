import { useEffect, useRef, useState } from 'react'
import { Camera, Keyboard, Mic, X } from 'lucide-react'
import fieldLabels from '../../../shared/ai-business-field-labels.json'
import { BottomSheetSurface, HohoButton, StatusNotice } from '../../components/design-system'
import { useAppStore } from '../../store/useAppStore'
import { localDateTimeValue, localDateTimeToIso } from '../../utils/healthOccurredAt'
import { caseService } from '../case-continuity/api'
import type { CasesData } from '../case-continuity/types'
import { captureDraft, type CaptureDraft } from './captureDraft'
import { fileDataUrl } from './CaseCaptureWorkspace'
import { isKeyRecordField, recordCategoryLabels, retainSmartRecordEdits, type SmartRecordDraft, type SmartRecordItem } from './smartRecordTypes'
import { useSmartRecordVoice } from './useSmartRecordVoice'
import './caseCapture.css'

type EditableItem=SmartRecordItem & {categoryChanged?:boolean;timeChanged?:boolean}
const labels:Record<string,string>=fieldLabels
export function SmartRecordWorkspace({memberId,token,eventId,onClose,onSaved,onCaptured,conversational=false,initialText=''}:{memberId:string;token:string;eventId?:string;onClose:()=>void;onSaved?:(message:string)=>void;onCaptured?:(eventId:string)=>void;conversational?:boolean;initialText?:string}) {
  const accountId=useAppStore(s=>s.authUser?.id??'guest'),key=`${conversational?'home-smart':'smart'}:${accountId}:${memberId}:${eventId??'new'}`
  const [local,setLocal]=useState<CaptureDraft>(()=>({text:initialText,files:[],occurredAt:localDateTimeValue(),timeUnknown:false,requestId:crypto.randomUUID(),eventId}))
  const current=useRef(local),credentials=useRef(token);credentials.current=token
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState(''),[cases,setCases]=useState<CasesData|null>(null),[caseError,setCaseError]=useState('')
  const mounted=useRef(true),pending=useRef(false),writes=useRef<Promise<unknown>>(Promise.resolve()),abort=useRef<AbortController|null>(null),camera=useRef<HTMLInputElement>(null),album=useRef<HTMLInputElement>(null)
  const [keyboard,setKeyboard]=useState(false),[savedEvent,setSavedEvent]=useState(''),[following,setFollowing]=useState(false)
  const textInput=useRef<HTMLTextAreaElement>(null)
  const persist=async(next:CaptureDraft)=>{current.current=next;if(mounted.current)setLocal(next);const write=writes.current.catch(()=>undefined).then(()=>captureDraft(key,next));writes.current=write;try{await write}catch(e){if(mounted.current)setError('本机草稿保存失败，请保持页面打开后重试');throw e}}
  const change=(patch:Partial<CaptureDraft>)=>void persist({...current.current,...patch}).catch(()=>undefined)
  const loadCases=()=>{setCaseError('');void caseService.list(memberId,credentials.current).then(data=>{if(mounted.current)setCases(data)}).catch(()=>{if(mounted.current)setCaseError('情况列表未加载，请重试')})}
  useEffect(()=>{mounted.current=true;void captureDraft(key).then(saved=>{if(mounted.current){if(saved){current.current=saved;setLocal(saved)}setReady(true)}}).catch(()=>{if(mounted.current)setError('草稿读取失败，请重新打开后重试')});loadCases();return()=>{mounted.current=false;abort.current?.abort()}},[key])
  const url=`/api/members/${encodeURIComponent(memberId)}/ai-drafts`
  async function request<T>(path:string,method:string,input?:unknown):Promise<T>{
    const controller=new AbortController();abort.current=controller;const timer=setTimeout(()=>controller.abort(),90000)
    try{const response=await fetch(path,{method,headers:{Authorization:`Bearer ${credentials.current}`,'Content-Type':'application/json'},signal:controller.signal,body:input===undefined?undefined:JSON.stringify(input)});const value=await response.json();if(!response.ok)throw new Error(value.error?.message??'操作未完成，请重试');if(!mounted.current)throw new DOMException('Closed','AbortError');return value as T}finally{clearTimeout(timer)}
  }
  async function prepare(input=current.current){
    if(pending.current||!ready||(!input.text.trim()&&!input.files.some(f=>!f.type.startsWith('audio/'))))return
    pending.current=true;setBusy(true);setError('');setStatus('正在整理成饮食、症状、睡眠等记录…')
    let retained=input.smartReview
    try{
      const occurredAt=localDateTimeToIso(input.occurredAt)
      if(!occurredAt||Date.parse(occurredAt)>Date.now())throw new Error('发生时间不能晚于现在')
      const files=await Promise.all(input.files.filter(f=>!f.type.startsWith('audio/')).map(async f=>({name:f.name,mimeType:f.type,dataUrl:await fileDataUrl(f)})))
      // Allocate and persist the draft ID before generation, so an interrupted
      // response can always be recovered by exact account/member/draft identity.
      const voiceFiles=await Promise.all(input.files.filter(f=>f.type.startsWith('audio/')).map(async f=>({name:f.name,mimeType:f.type,dataUrl:await fileDataUrl(f)})))
      const base={text:input.text,task:'record',eventId:input.eventId||null,smartRecord:true,confirmOccurrenceTime:conversational,followUp:!conversational,selectedOccurredAt:occurredAt,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone}
      retained=await request<SmartRecordDraft>(url,'POST',{...base,id:retained?.id,version:retained?.version,files,voiceFiles,deferRecognition:true})
      await persist({...current.current,smartReview:retained,aiDraftId:retained.id})
      const review=retainSmartRecordEdits(await request<SmartRecordDraft>(url,'POST',{...base,id:retained.id,version:retained.version}),input.smartReview)
      await persist({...current.current,smartReview:review,aiDraftId:review.id})
      if(mounted.current)setStatus(`已整理 ${review.items.length} 条，请核对关键内容`)
    }catch(e){
      if(mounted.current){if(retained)try{const restored=retainSmartRecordEdits(await request<SmartRecordDraft>(`${url}/${retained.id}`,'GET'),input.smartReview);await persist({...current.current,smartReview:restored})}catch{/* The exact local draft remains retryable. */}setError(e instanceof Error&&e.name!=='AbortError'?e.message:'整理已中断，原话和草稿保留，可重试');setStatus('')}
    }finally{pending.current=false;if(mounted.current)setBusy(false)}
  }
  const voice=useSmartRecordVoice({memberId,token,pendingVoice:local.pendingVoice,onRecorded:async file=>{await persist({...current.current,pendingVoice:file,files:[...current.current.files,file]})},onTranscript:async transcript=>{
    const text=[current.current.text,transcript].filter(Boolean).join('\n')
    if(text.length>5000)throw new Error('文字超过5000字，录音保留，请分段记录')
    const next={...current.current,text,pendingVoice:undefined};await persist(next);await prepare(next)
  }})
  const review=local.smartReview,canSave=review?.state==='ready'&&review.inputText===local.text&&!local.pendingVoice&&(!conversational||review.items.every(item=>!!item.timeText||item.timeChanged))
  const editItem=(id:string,update:(item:EditableItem)=>EditableItem)=>{if(!review)return;change({smartReview:{...review,items:review.items.map(item=>item.id===id?update(item):item)}})}
  const pickFiles=(files:FileList|null)=>{if(!files?.length)return;const next=[...current.current.files,...Array.from(files)];if(next.length>12||next.reduce((sum,f)=>sum+f.size,0)>15*1024*1024){setError('最多12份原件，总大小15 MB');return}change({files:next,smartReview:review?{...review,state:'changed'}:undefined})}
  async function save(){
    if(pending.current||!canSave||!review)return
    pending.current=true;setBusy(true);setError('');setStatus('正在保存…');let saved=review
    try{
      await writes.current
      for(const item of review.items as EditableItem[]){
        if(item.categoryChanged)saved=await request<SmartRecordDraft>(`${url}/${saved.id}`,'PATCH',{version:saved.version,itemId:item.id,category:item.category})
        if(item.timeChanged)saved=await request<SmartRecordDraft>(`${url}/${saved.id}`,'PATCH',{version:saved.version,itemId:item.id,field:'time',value:item.timeText})
        for(const field of item.fields.filter(f=>f.editedBy==='user'))saved=await request<SmartRecordDraft>(`${url}/${saved.id}`,'PATCH',{version:saved.version,itemId:item.id,field:field.name,value:field.value})
      }
      // Persist the acknowledged version before the save request. A lost save
      // response is retried against the same draft and server idempotency key.
      await persist({...current.current,smartReview:saved})
      saved=await request<SmartRecordDraft>(`${url}/${saved.id}/save`,'POST',{version:saved.version,confirmed:true})
      await writes.current;await captureDraft(key,null)
      if(mounted.current){setStatus(`已保存 ${saved.result?.count??0} 条记录，原话已保留`);onSaved?.(`已保存 ${saved.result?.count??0} 条记录，原话已保留`);if(onCaptured&&saved.result?.records[0])onCaptured(saved.result.records[0].eventId);else if(conversational)setSavedEvent(saved.result?.records[0]?.eventId??'');else onClose()}
    }catch(e){if(mounted.current){
      // Fetch only this draft. Never restore another context's latest draft.
      try{const retained=await request<SmartRecordDraft>(`${url}/${saved.id}`,'GET');if(retained.state==='saved'){await writes.current;await captureDraft(key,null);onSaved?.(`已保存 ${retained.result?.count??0} 条记录，原话已保留`);if(onCaptured&&retained.result?.records[0])onCaptured(retained.result.records[0].eventId);else if(conversational)setSavedEvent(retained.result?.records[0]?.eventId??'');else onClose();return}await persist({...current.current,smartReview:{...review,version:retained.version}})}catch{/* Keep user edits and raw input locally. */}
      setError(e instanceof Error?e.message:'保存未完成，草稿保留，可重试');setStatus('')
    }}finally{pending.current=false;if(mounted.current)setBusy(false)}
  }
  const fieldInput=(item:SmartRecordItem,field:SmartRecordItem['fields'][number])=><label key={field.name}>{labels[field.name]??field.name}<input value={field.value} disabled={busy||voice.busy} onChange={e=>editItem(item.id,i=>({...i,fields:i.fields.map(f=>f.name===field.name?{...f,value:e.target.value,editedBy:'user'}:f)}))}/></label>
  return <BottomSheetSurface open viewportAware size="workspace" className="smart-record-dialog" title="智能记录" label="智能记录" onClose={()=>{voice.stop();onClose()}} footer={<footer className="case-input-tools">{savedEvent?<HohoButton fullWidth onClick={onClose}>完成</HohoButton>:<><div><button className="case-camera" aria-label="键盘输入" onClick={()=>{setKeyboard(true);requestAnimationFrame(()=>textInput.current?.focus())}}><Keyboard size={23}/><span>键盘</span></button><button className="case-camera" aria-label="拍照" disabled={!ready||busy||voice.busy} onClick={()=>camera.current?.click()}><Camera size={23}/><span>拍照</span></button><button className={`case-hold-voice${voice.busy?' is-listening':''}`} disabled={!ready||busy||!!local.pendingVoice||voice.state==='transcribing'} onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);void voice.start()}} onPointerUp={voice.stop} onPointerCancel={voice.stop} onKeyDown={e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();void voice.start()}if(e.key==='Escape')voice.discard()}} onKeyUp={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();voice.stop()}}}><Mic size={20}/>{voice.state==='listening'?'正在录音…':'按住说话'}</button></div><p>松手自动整理 · 核对后保存</p>{!savedEvent&&review?.items.length?<HohoButton fullWidth loading={busy} disabled={busy||voice.busy||!canSave||!review.items.length||!!review.documentWarnings?.length||!!review.unmappedRows?.length||review.sources?.some(s=>s.status==='uncertain')} onClick={()=>void save()}>确认保存 {review.items.length} 条</HohoButton>:null}</>}</footer>}>
    <div className="case-capture-body">
      {!ready&&<p role="status">正在恢复当前孩子的草稿…</p>}
      {conversational&&<><div className="smart-nurse-message"><img src="/nurse-triage/attention.0e839af8d0.webp" alt="值班护士"/><div><strong>值班护士</strong><p>{savedEvent?'已经记好了，原话与原件保留。需要继续观察时，可以选择跟进。':review?.items.length?`整理出 ${review.items.length} 条记录，请一起核对。`:'吃了什么、睡得怎样、有什么症状，都可以和我说说。现在的事、过去的情况都可以记。'}</p></div></div>{local.text&&<div className="smart-parent-message"><span aria-label="记录人">{useAppStore.getState().authUser?.nickname?.slice(0,1)||'我'}</span><p>{local.text}</p></div>}</>}
      {savedEvent&&<HohoButton variant="secondary" disabled={following} onClick={()=>{setFollowing(true);void caseService.archive(memberId,credentials.current,savedEvent,false).then(()=>{if(mounted.current){setStatus('已加入正在跟进');onSaved?.('已加入正在跟进')}}).catch(()=>{if(mounted.current)setError('跟进未保存，记录仍保留，请重试')}).finally(()=>{if(mounted.current)setFollowing(false)})}}>继续跟进这次情况（选填）</HohoButton>}
      {!savedEvent&&<details className="case-supplements" open={keyboard||!conversational&&!review?.items.length}><summary>原话（可修改）</summary><label className="case-narrative"><strong>说说刚才发生了什么</strong><textarea ref={textInput} aria-label="原始记录内容" value={local.text} maxLength={5000} placeholder="例如：吃了半碗粥，脸颊有点红，午睡睡了一个小时。" disabled={!ready||busy||voice.busy} onChange={e=>change({text:e.target.value})}/></label></details>}
      {local.pendingVoice&&<StatusNotice title="录音已保留"><HohoButton variant="secondary" disabled={busy||voice.busy} onClick={voice.retry}>重试语音识别</HohoButton><HohoButton variant="text" disabled={busy||voice.busy} onClick={()=>change({pendingVoice:undefined})}>改用文字，保留录音</HohoButton></StatusNotice>}
      {(error||voice.error)&&<StatusNotice tone="error" title="暂未完成">{error||voice.error}。原话与草稿保留。</StatusNotice>}
      {(status||voice.busy)&&<p role="status">{voice.state==='transcribing'?'正在识别录音，完成后自动整理…':voice.state==='requesting'?'正在开启麦克风…':voice.state==='listening'?'正在录音，松手后自动整理':status}</p>}
      {!savedEvent&&<HohoButton variant="secondary" disabled={!ready||busy||voice.busy||!!local.pendingVoice||(!local.text.trim()&&!local.files.some(f=>!f.type.startsWith('audio/')))} onClick={()=>void prepare()}>{error||review?.state==='failed'?'重试整理':review?'重新整理':'整理这段话'}</HohoButton>}
      {review?.state==='failed'&&<p>本次整理未完成。可重试，或保留原话继续编辑。</p>}
      {!savedEvent&&!!review?.items.length&&<section className="smart-record-review" aria-label="核对关键内容"><h2>核对关键内容</h2>{review.items.map(item=><section className="smart-record-item" key={item.id}>
        <h3>{recordCategoryLabels[item.category]??'其他'} · {item.title}</h3>
        {conversational&&(!item.timeText||item.timeChanged)&&<div className="smart-nurse-message"><img src="/nurse-triage/attention.0e839af8d0.webp" alt="护士"/><div><p>这件事大约发生在什么时候？也可以写“昨天”“上个月”，不记得可以保留不确定。</p><input aria-label={`确认${item.title}的发生时间`} placeholder="例如：刚才、昨天、上个月（不确定）" value={item.timeText??''} disabled={busy||voice.busy} onChange={e=>editItem(item.id,i=>({...i,timeText:e.target.value,timeChanged:true}))}/><HohoButton variant="text" onClick={()=>editItem(item.id,i=>({...i,timeText:'刚才',timeChanged:true}))}>就是刚才</HohoButton><HohoButton variant="text" onClick={()=>editItem(item.id,i=>({...i,timeText:'不记得',timeChanged:true}))}>不记得，保留不确定</HohoButton></div></div>}
        {item.fields.filter(f=>isKeyRecordField(item.category,f.name)).map(f=>fieldInput(item,f))}
        <details><summary>时间、分类与其他内容</summary><label>记录类型<select value={item.category} disabled={busy||voice.busy} onChange={e=>editItem(item.id,i=>({...i,category:e.target.value,categoryChanged:true}))}>{Object.entries(recordCategoryLabels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><label>发生时间<input value={item.timeText??''} placeholder={item.time.defaulted?'默认当前记录时间':'不确定可留空'} disabled={busy||voice.busy} onChange={e=>editItem(item.id,i=>({...i,timeText:e.target.value,timeChanged:true}))}/></label>{item.fields.filter(f=>!isKeyRecordField(item.category,f.name)).map(f=>fieldInput(item,f))}</details>
      </section>)}<details><summary>查看完整原话</summary><p className="smart-record-original">{review.inputText}</p></details></section>}
      {!!review?.unmappedRows?.length&&<StatusNotice tone="error" title="部分内容还未整理完整">{review.unmappedRows.map((row,i)=><p key={i}>{row.text}</p>)}请核对原话后重试整理。</StatusNotice>}
      {!!review?.documentWarnings?.length&&<StatusNotice tone="error" title="资料需要完整核对">请使用健康档案的智能记录核对原件页码，当前草稿保留。</StatusNotice>}
      {!savedEvent&&<details className="case-supplements"><summary>原件、时间与记录归属（选填）</summary>{!conversational&&<label>默认发生时间<input type="datetime-local" value={local.occurredAt} max={localDateTimeValue()} disabled={busy||voice.busy} onChange={e=>change({occurredAt:e.target.value,smartReview:review?{...review,state:'changed'}:undefined})}/></label>}<label>记录放在哪里<select aria-label="记录归属" value={local.eventId??''} disabled={busy||voice.busy||!!eventId} onChange={e=>change({eventId:e.target.value,smartReview:review?{...review,state:'changed'}:undefined})}><option value="">{conversational?'独立记录（不自动跟进）':'新的一次情况'}</option>{cases?.active.map(c=><option value={c.event.id} key={c.event.id}>{c.event.title}</option>)}</select></label>{caseError&&<p>{caseError}<HohoButton variant="text" onClick={loadCases}>重试</HohoButton></p>}<HohoButton variant="text" disabled={busy||voice.busy} onClick={()=>album.current?.click()}>上传图片或资料</HohoButton>{local.files.map((file,i)=><span key={`${file.name}:${i}`}>{file.name}<button aria-label={`移除原件${i+1}`} disabled={busy||voice.busy} onClick={()=>change({files:local.files.filter((_,index)=>index!==i),smartReview:review?{...review,state:'changed'}:undefined,pendingVoice:local.pendingVoice===file?undefined:local.pendingVoice})}><X size={16}/></button></span>)}</details>}
    </div>

    <input type="file" ref={camera} accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={e=>{pickFiles(e.target.files);e.currentTarget.value=''}}/><input type="file" ref={album} accept="image/jpeg,image/png,image/webp,application/pdf" multiple hidden onChange={e=>{pickFiles(e.target.files);e.currentTarget.value=''}}/>
  </BottomSheetSurface>
}
