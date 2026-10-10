import { useEffect, useRef, useState } from 'react'
import { Stethoscope, X } from 'lucide-react'
import fieldLabels from '../../../shared/ai-business-field-labels.json'
import { BottomSheetSurface, HohoButton, DialogueComposer } from '../../components/design-system'
import { useAppStore } from '../../store/useAppStore'
import { localDateTimeValue, localDateTimeToIso } from '../../utils/healthOccurredAt'
import { caseService } from '../case-continuity/api'
import { appendCaptureTurn,captureDraft, type CaptureDraft } from './captureDraft'
import { fileDataUrl } from './CaseCaptureWorkspace'
import { isKeyRecordField, recordCategoryLabels, retainSmartRecordEdits, type SmartRecordDraft, type SmartRecordItem } from './smartRecordTypes'
import { useSmartRecordVoice } from './useSmartRecordVoice'
import { NurseMessage } from '../ai-nurse/NurseMessage'
import {useDialogueSpeech} from '../ai-nurse/useDialogueSpeech'
import {apiRequest} from '../../services/apiClient'
import './caseCapture.css'

type EditableItem=SmartRecordItem & {categoryChanged?:boolean;timeChanged?:boolean}
const labels:Record<string,string>=fieldLabels
export function SmartRecordWorkspace({memberId,token,eventId,eventTitle,onClose,onSaved,onCaptured,conversational=false,initialText=''}:{memberId:string;token:string;eventId?:string;eventTitle?:string;onClose:()=>void;onSaved?:(message:string)=>void;onCaptured?:(eventId:string)=>void;conversational?:boolean;initialText?:string}) {
  const accountId=useAppStore(s=>s.authUser?.id??'guest'),key=`${conversational?'home-smart':'smart'}:${accountId}:${memberId}:${eventId??'new'}`
  const [local,setLocal]=useState<CaptureDraft>(()=>({text:initialText,files:[],occurredAt:localDateTimeValue(),timeUnknown:false,requestId:crypto.randomUUID(),eventId}))
  const current=useRef(local),credentials=useRef(token);credentials.current=token
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('')
  const mounted=useRef(true),pending=useRef(false),sendLock=useRef(false),writes=useRef<Promise<unknown>>(Promise.resolve()),abort=useRef<AbortController|null>(null),camera=useRef<HTMLInputElement>(null),album=useRef<HTMLInputElement>(null)
  const memberName=useAppStore(s=>s.members.find(member=>member.id===memberId)?.name)
  const speech=useDialogueSpeech(),greeting=eventTitle ? `继续补充“${eventTitle}”的进展。有什么变化、做过什么处理，都可以和我说说。` : '吃了什么、睡得怎样、有什么症状，都可以和我说说。现在、过去的情况都可以记。'
  const recorderName=useAppStore(s=>s.accountProfile?.nickname||s.authUser?.nickname||s.profile?.nickname)
  const [savedEvent,setSavedEvent]=useState(''),[following,setFollowing]=useState(false),[separateTimes,setSeparateTimes]=useState(false)
  const persist=async(next:CaptureDraft)=>{current.current=next;if(mounted.current)setLocal(next);const write=writes.current.catch(()=>undefined).then(()=>captureDraft(key,next));writes.current=write;try{await write}catch(e){if(mounted.current)setError('本机草稿保存失败，请保持页面打开后重试');throw e}}
  const change=(patch:Partial<CaptureDraft>)=>void persist({...current.current,...patch}).catch(()=>undefined)
  useEffect(()=>{mounted.current=true;void captureDraft(key).then(saved=>{if(mounted.current){if(saved){current.current=saved;setLocal(saved)}setReady(true)}}).catch(()=>{if(mounted.current)setError('草稿读取失败，请重新打开后重试')});return()=>{mounted.current=false;abort.current?.abort()}},[key])
  const url=`/api/members/${encodeURIComponent(memberId)}/ai-drafts`
  async function request<T>(path:string,method:'GET'|'POST'|'PATCH',input?:unknown):Promise<T>{
    const controller=new AbortController();abort.current=controller;const timer=setTimeout(()=>controller.abort(),90000)
    try{const value=await apiRequest<T>(path,{method,token:credentials.current,signal:controller.signal,body:input});if(!mounted.current)throw new DOMException('Closed','AbortError');return value}finally{clearTimeout(timer)}
  }
  useEffect(()=>{
    const saved=current.current.smartReview
    if(!ready||saved?.state!=='ready')return
    let active=true
    // Refresh only the exact retained draft; keep local edits and offline input.
    void request<SmartRecordDraft>(`${url}/${saved.id}`,'GET').then(restored=>{
      if(active&&mounted.current&&!pending.current&&current.current.smartReview===saved&&restored.state==='ready'){
        void persist({...current.current,smartReview:retainSmartRecordEdits(restored,saved)}).catch(()=>undefined)
      }
    }).catch(()=>undefined)
    return()=>{active=false}
  },[ready,key])
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
      if(mounted.current)speech.speak(`我整理了 ${review.items.length} 条，请看看有没有需要改的地方，核对后就能保存。`,`${review.id}:${review.version}`)
      if(mounted.current)setStatus(`已整理 ${review.items.length} 条，请核对关键内容`)
    }catch(e){
      if(mounted.current){if(retained)try{const restored=retainSmartRecordEdits(await request<SmartRecordDraft>(`${url}/${retained.id}`,'GET'),input.smartReview);await persist({...current.current,smartReview:restored})}catch{/* The exact local draft remains retryable. */}setError(e instanceof Error&&e.name!=='AbortError'?e.message:'整理已中断，原话和草稿保留，可重试');setStatus('')}
    }finally{pending.current=false;if(mounted.current)setBusy(false)}
  }
  const voice=useSmartRecordVoice({memberId,token,pendingVoice:local.pendingVoice,onRecorded:async file=>{await persist({...current.current,pendingVoice:file,files:[...current.current.files,file]})},onTranscript:async (transcript,file)=>{
    const next=appendCaptureTurn(current.current,transcript,`voice:${file.name}:${file.lastModified}`);await persist(next);await prepare(next)
  }})
  async function sendText(){if(sendLock.current||pending.current)return;speech.activate();sendLock.current=true;try{const text=current.current.conversationInput?.trim();if(!text)return;const next=appendCaptureTurn(current.current,text);await persist(next);await prepare(next)}catch(e){setError(e instanceof Error?e.message:'内容暂未保存，请再试一次')}finally{sendLock.current=false}}
  useEffect(()=>{if(ready&&!local.text)speech.speak(greeting,`${key}:greeting`)},[ready])
  const review=local.smartReview,canSave=review?.state==='ready'&&review.inputText===local.text&&!local.pendingVoice&&(!conversational||review.items.every(item=>!!item.timeText||item.timeChanged))
  useEffect(()=>setSeparateTimes(false),[review?.id])
  const sharedTime = !separateTimes && Boolean(review && review.items.length > 1 && review.items[0].time.resolvedStart && review.items.every(item => item.time.resolvedStart === review.items[0].time.resolvedStart && item.time.precision === review.items[0].time.precision && item.timeText === review.items[0].timeText))
  const editSharedTime = (value: string) => { if(review) change({smartReview:{...review,items:review.items.map(item=>({...item,timeText:value,timeChanged:true}))}}) }
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
  const footer=<DialogueComposer text={local.conversationInput??''} onTextChange={conversationInput=>change({conversationInput})} maxLength={5000} disabled={!ready||busy||!!savedEvent} voiceDisabled={!!local.pendingVoice} listening={voice.state==='listening'} processing={voice.state==='transcribing'} onStart={()=>{speech.activate();void voice.start()}} onStop={voice.stop} onDiscard={voice.discard} onPhoto={source=>(source==='camera'?camera:album).current?.click()} onSend={()=>void sendText()}/>
  const saveBlocked=busy||voice.busy||!canSave||!review?.items.length||!!review.documentWarnings?.length||!!review.unmappedRows?.length||review.sources?.some(s=>s.status==='uncertain')
  return <BottomSheetSurface open viewportAware size="workspace" className="smart-record-dialog nurse-conversation-sheet" layerClassName="symptom-input-layer" leading={<Stethoscope size={21} aria-hidden="true"/>} dismissText="收起" title="智能记录" label="智能记录" onClose={()=>{voice.stop();onClose()}} footer={footer}>
    <div className="nurse-conversation" aria-label="本次对话">
      <p className="hoho-text-caption">记录对象：{memberName || '当前孩子'}{eventTitle ? ` · 正在补充：${eventTitle}` : ''}</p>
      <NurseMessage role="assistant" onRead={speech.supported?()=>speech.read(greeting,`${key}:greeting`):undefined} reading={speech.readingId===`${key}:greeting`}><p>{greeting}</p></NurseMessage>
      {(local.conversationTurns??(local.text?[{id:'legacy',text:local.text}]:[])).map(turn=><NurseMessage key={turn.id} role="user" recorderName={recorderName}><p>{turn.text}</p></NurseMessage>)}
      {!!local.files.filter(f=>!f.type.startsWith('audio/')).length&&<NurseMessage role="user" recorderName={recorderName}>{local.files.filter(f=>!f.type.startsWith('audio/')).map((file,i)=><div key={`${file.name}:${i}`} className="dialogue-file"><span>{file.name}</span><HohoButton variant="text" aria-label={`移除图片${i+1}`} disabled={busy||voice.busy} onClick={()=>change({files:local.files.filter(f=>f!==file),smartReview:review?{...review,state:'changed'}:undefined})}><X size={16}/></HohoButton></div>)}</NurseMessage>}
      {(!ready||busy||voice.busy)&&<NurseMessage role="assistant"><p role="status">{!ready?'我在找回刚才的内容，请稍等。':voice.state==='listening'?'我在听，松手后就帮你记录。':voice.state==='requesting'?'正在打开麦克风。':voice.state==='transcribing'?'我在听这段录音，请稍等。':status||'我在整理，请稍等。'}</p></NurseMessage>}
      {(error||voice.error)&&<NurseMessage role="assistant"><p role="alert">{error||voice.error}。你刚才的内容还在，可以再试一次。</p></NurseMessage>}
      {local.pendingVoice&&<NurseMessage role="assistant"><p>{voice.unreadable?'这份录音已经无法读取，可以移除后重新录音。你说过的文字仍然保留。':'这段录音还在，要我再听一次吗？'}</p>{voice.unreadable?<HohoButton variant="text" disabled={busy||voice.busy} onClick={()=>void persist({...current.current,pendingVoice:undefined,files:current.current.files.filter(file=>file!==current.current.pendingVoice)}).then(()=>{voice.clearError();setError('')}).catch(()=>undefined)}>移除无法读取的录音</HohoButton>:<HohoButton variant="text" disabled={busy||voice.busy} onClick={voice.retry}>再试一次</HohoButton>}{!voice.unreadable&&<HohoButton variant="text" disabled={busy||voice.busy} onClick={()=>change({pendingVoice:undefined})}>继续用文字补充</HohoButton>}</NurseMessage>}
      {!savedEvent&&!busy&&(local.text.trim()||local.files.some(f=>!f.type.startsWith('audio/')))&&<NurseMessage role="assistant"><p>{review?.items.length?'还想补充或修改吗？补充后我可以重新整理。':'要我把刚才说的整理成记录吗？'}</p><HohoButton variant="text" disabled={!ready||voice.busy||!!local.pendingVoice} onClick={()=>void prepare()}>{error||review?.state==='failed'?'再试一次':review?'重新整理':'帮我整理'}</HohoButton></NurseMessage>}
      {!savedEvent&&!!review?.items.length&&<NurseMessage role="assistant" onRead={speech.supported?()=>speech.read(`我整理了 ${review.items.length} 条，请看看有没有需要改的地方，核对后就能保存。`,`${review.id}:${review.version}`):undefined} reading={speech.readingId===`${review.id}:${review.version}`}><p>我整理了 {review.items.length} 条，请看看有没有需要改的地方，核对后就能保存。</p>{sharedTime&&<div className="dialogue-review-item"><label>这{review.items.length}条记录识别为同一时间，可一起核对<input aria-label="统一核对发生时间" value={review.items[0].timeText??''} disabled={busy||voice.busy} onChange={e=>editSharedTime(e.target.value)}/></label><HohoButton variant="text" disabled={busy||voice.busy} onClick={()=>editSharedTime('刚才')}>都是刚才</HohoButton><HohoButton variant="text" disabled={busy||voice.busy} onClick={()=>editSharedTime('不记得')}>都不记得</HohoButton><HohoButton variant="text" disabled={busy||voice.busy} onClick={()=>setSeparateTimes(true)}>分别核对时间</HohoButton></div>}<div className="dialogue-review">{review.items.map(item=><div key={item.id} className="dialogue-review-item"><strong>{recordCategoryLabels[item.category]??'其他'} · {item.title}</strong>{item.fields.filter(f=>isKeyRecordField(item.category,f.name)).map(f=>fieldInput(item,f))}
        {!sharedTime&&<><label>这件事大约是什么时候？<input aria-label={`确认${item.title}的发生时间`} placeholder="刚才、昨天、上个月；不记得也可以说" value={item.timeText??''} disabled={busy||voice.busy} onChange={e=>editItem(item.id,i=>({...i,timeText:e.target.value,timeChanged:true}))}/></label>
        <HohoButton variant="text" disabled={busy||voice.busy} onClick={()=>editItem(item.id,i=>({...i,timeText:'刚才',timeChanged:true}))}>就是刚才</HohoButton><HohoButton variant="text" disabled={busy||voice.busy} onClick={()=>editItem(item.id,i=>({...i,timeText:'不记得',timeChanged:true}))}>不记得</HohoButton></>}
      </div>)}</div><HohoButton loading={busy} disabled={!!saveBlocked} onClick={()=>void save()}>确认保存</HohoButton></NurseMessage>}
      {!!review?.unmappedRows?.length&&<NurseMessage role="assistant"><p>还有这些内容没有整理完整，请补充或更正后让我再试一次：{review.unmappedRows.map(row=>row.text).join('；')}</p></NurseMessage>}
      {(!!review?.documentWarnings?.length||review?.sources?.some(s=>s.status==='uncertain'))&&<NurseMessage role="assistant"><p>有些资料需要逐页核对，请到健康档案的智能记录继续核对，你的内容会保留。</p></NurseMessage>}
      {savedEvent&&<NurseMessage role="assistant"><p>已经记好了。要继续跟进这次情况吗？</p><HohoButton variant="text" disabled={following} onClick={()=>{setFollowing(true);void caseService.archive(memberId,credentials.current,savedEvent,false).then(()=>{if(mounted.current){setStatus('已加入正在跟进');onSaved?.('已加入正在跟进')}}).catch(()=>{if(mounted.current)setError('跟进未保存，请再试一次')}).finally(()=>{if(mounted.current)setFollowing(false)})}}>继续跟进</HohoButton><HohoButton variant="text" onClick={onClose}>完成</HohoButton></NurseMessage>}
    </div>
    <input type="file" ref={camera} accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={e=>{pickFiles(e.target.files);e.currentTarget.value=''}}/>
    <input type="file" ref={album} aria-label="从相册选择" accept="image/jpeg,image/png,image/webp" hidden multiple onChange={e=>{pickFiles(e.target.files);e.currentTarget.value=''}}/>
  </BottomSheetSurface>
}
