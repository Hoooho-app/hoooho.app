import { useEffect, useRef, useState } from 'react'
import { Check, Stethoscope, X } from 'lucide-react'
import { useBlocker, useNavigate } from 'react-router-dom'
import { savedRecordGuides, type SavedRecordGuide } from './savedRecordGuide'
import { BottomSheetSurface, HohoButton, DialogueComposer, Typography } from '../../components/design-system'
import { useAppStore } from '../../store/useAppStore'
import { localDateTimeValue, localDateTimeToIso } from '../../utils/healthOccurredAt'
import { appendCaptureTurn,beginCaptureFinalization,captureDraft, checkpointCaptureDraft, fileIdentity, hasCaptureContent, retainedCaptureDrafts, type CaptureDraft, type CaptureTurn } from './captureDraft'
import {restoreFrontContext, restoreFrontFile, type FrontContext} from './frontDeskRecord'
import {RecordMedia} from './RecordMedia'
import { fileDataUrl } from './CaseCaptureWorkspace'
import { retainSmartRecordEdits, type SmartRecordDraft } from './smartRecordTypes'
import { useSmartRecordVoice } from './useSmartRecordVoice'
import { NurseMessage } from '../ai-nurse/NurseMessage'
import { SmartRecordReview } from './SmartRecordReview'
import { getLocalDateKey } from '../../utils/localCalendarDate'
import { journalOccurrenceAt } from '../../../shared/journal-occurrence.mjs'
import {apiRequest} from '../../services/apiClient'
import { WebPageHeader } from '../../components/common'
import { useVisibleViewport } from '../../hooks/useVisibleViewport'
import './caseCapture.css'

export function SmartRecordWorkspace({memberId,token,eventId,eventTitle,onClose,onSaved,onCaptured,conversational=false,page=false,initialText=''}:{memberId:string;token:string;eventId?:string;eventTitle?:string;onClose:()=>void;onSaved?:(message:string)=>void;onCaptured?:(eventId:string)=>void;conversational?:boolean;page?:boolean;initialText?:string}) {
  const viewport=useVisibleViewport()
  const navigate=useNavigate()
  const accountId=useAppStore(s=>s.authUser?.id??'guest'),key=`${conversational?'home-smart':'smart'}:${accountId}:${memberId}:${eventId??'new'}`
  const [local,setLocal]=useState<CaptureDraft>(()=>({text:initialText,files:[],occurredAt:localDateTimeValue(),timeUnknown:false,requestId:crypto.randomUUID(),eventId}))
  const current=useRef(local),credentials=useRef(token);credentials.current=token
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('')
  const [originalsNeedReview,setOriginalsNeedReview]=useState(false)
  const mounted=useRef(true),pending=useRef(false),sendLock=useRef(false),writes=useRef<Promise<unknown>>(Promise.resolve()),abort=useRef<AbortController|null>(null),camera=useRef<HTMLInputElement>(null),album=useRef<HTMLInputElement>(null)
  const memberName=useAppStore(s=>s.members.find(member=>member.id===memberId)?.name)
  const greeting=eventTitle ? `继续补充“${eventTitle}”的进展。有什么变化、做过什么处理，都可以和我说说。` : page?`我是今天的值班护士。${memberName||'孩子'}今天怎么样？有什么需要我帮你记下来的吗？` : '吃了什么、睡得怎样、有什么症状，都可以和我说说。现在、过去的情况都可以记。'
  const [dialogueBusy,setDialogueBusy]=useState(false)
  const queue=useRef<Promise<unknown>>(Promise.resolve()),queueSize=useRef(0),hiddenTurns=useRef(new Set<string>()),scrollBody=useRef<HTMLDivElement>(null),visibleMedia=useRef(new Map<string,File>())
  const [completed,setCompleted]=useState(false)
  const completedGuideIds=useRef(new Set<string>())
  local.files.forEach(file=>visibleMedia.current.set(fileIdentity(file),file))
  const frontUrl=`/api/members/${encodeURIComponent(memberId)}/front-desk-record`
  const recorderName=useAppStore(s=>s.accountProfile?.nickname||s.authUser?.nickname||s.profile?.nickname)
  const [stage,setStage]=useState<'conversation'|'review'>('conversation')
  const [resumeChoices,setResumeChoices]=useState<{key:string;draft:CaptureDraft}[]|null>(null)
  const switchingDraft=useRef(false)
  const [exitOpen,setExitOpen]=useState(false),[exiting,setExiting]=useState(false),[exitError,setExitError]=useState('')
  const leaving=useRef(false),allowLeave=useRef(false),voiceBusy=useRef(false),initialization=useRef<Promise<void>>(Promise.resolve())
  const unfinished=!completed&&(hasCaptureContent(local)||Boolean(local.conversationTurns?.some(t=>t.role!=='assistant'&&t.status&&t.status!=='completed')))
  const blocker=useBlocker(({currentLocation,nextLocation})=>!allowLeave.current&&(unfinished||voiceBusy.current)&&(currentLocation.pathname!==nextLocation.pathname||currentLocation.search!==nextLocation.search))
  useEffect(()=>{if(blocker.state==='blocked')setExitOpen(true)},[blocker.state])
  const freshDraft=():CaptureDraft=>({text:initialText,files:[],occurredAt:localDateTimeValue(),timeUnknown:false,requestId:crypto.randomUUID(),eventId})
  const returning=useRef(false)
  const persist=async(value:CaptureDraft)=>{const next={...value,updatedAt:Date.now()};current.current=next;checkpointCaptureDraft(key,next);if(mounted.current)setLocal(next);const write=writes.current.catch(()=>undefined).then(()=>captureDraft(key,next));writes.current=write;try{await write}catch(e){if(mounted.current)setError('本机草稿保存失败，请保持页面打开后重试');throw e}}
  const change=(patch:Partial<CaptureDraft>)=>void persist({...current.current,...patch}).catch(()=>undefined)
  useEffect(()=>{
    let active=true;mounted.current=true
    const openingTask=(async()=>{
      let saved=await captureDraft(key)
      const retained=conversational&&!eventId?await retainedCaptureDrafts(key):[]
      if(!active)return
      if(page&&!eventId){
        // Timestamp ordering repairs old retained drafts without presenting a
        // recovery choice. An older checkpoint cannot supersede a newer draft.
        saved=[...(saved?[saved]:[]),...retained.map(c=>c.draft)].filter(d=>d.smartReview?.state!=='saved').sort((a,b)=>(b.updatedAt??0)-(a.updatedAt??0))[0]??null
        const opening=saved??current.current
        returning.current=Boolean(opening.returningFromRecord)
        hiddenTurns.current=new Set()
        current.current=opening;setLocal(opening);setReady(true)
        if(saved&&!saved.frontContextId&&(saved.text.trim()||saved.files.some(f=>!f.type.startsWith('audio/')))){
          try{const media=await Promise.all(saved.files.filter(f=>f!==saved?.pendingVoice).map(async f=>({name:f.name,mimeType:f.type,lastModified:f.lastModified,dataUrl:await fileDataUrl(f)})));const migrated=await request<FrontContext|null>(frontUrl,'POST',{kind:'legacy',requestId:saved.requestId,updatedAt:saved.updatedAt,turns:saved.conversationTurns??(saved.text?[{text:saved.text}]:[]),files:media.filter(f=>!f.mimeType.startsWith('audio/')),voiceFiles:media.filter(f=>f.mimeType.startsWith('audio/')),draftId:saved.smartReview?.id});if(!active)return;if(migrated)saved=restoreFrontContext(migrated,saved)}catch{/* Unreadable legacy originals remain in the local recovery draft. */}
        }
        for(const choice of retained.filter(c=>c.draft.requestId!==opening.requestId&&!c.draft.frontContextId)){
          if(!active)return
          try{const draft=choice.draft,media=await Promise.all(draft.files.filter(f=>f!==draft.pendingVoice).map(async f=>({name:f.name,mimeType:f.type,lastModified:f.lastModified,dataUrl:await fileDataUrl(f)})));const acknowledged=await request<FrontContext|null>(frontUrl,'POST',{kind:'legacy',requestId:draft.requestId,updatedAt:draft.updatedAt??Number(choice.key.split(':retained:')[1]?.split(':')[0]),turns:draft.conversationTurns??(draft.text?[{text:draft.text}]:[]),files:media.filter(f=>!f.mimeType.startsWith('audio/')),voiceFiles:media.filter(f=>f.mimeType.startsWith('audio/')),draftId:draft.smartReview?.id});if(acknowledged&&!draft.pendingVoice&&!draft.conversationInput?.trim())await captureDraft(choice.key,null)}catch{/* A failed migration retains this exact older draft and its byte originals. */}
        }
        try{const server=await request<FrontContext|null>(frontUrl,'GET');if(!active)return;if(server&&(!saved?.frontContextId||Date.parse(server.updatedAt)>(saved.updatedAt??0)))saved=restoreFrontContext(server,saved??freshDraft())}catch{/* Local recovery remains usable while the server is unavailable. */}
        // Start talking immediately from local recovery. A late history read
        // must never replace text, media or a new intent entered since opening.
        if(current.current!==opening)return
        hiddenTurns.current=new Set()
        if(saved){saved={...saved,conversationTurns:saved.conversationTurns?.map(t=>t.status==='pending'?{...t,status:'failed',error:'上次提交中断，请重试原消息'}:t)};current.current=saved;setLocal(saved)}
        setReady(true);return
      }
      if(saved&&saved.smartReview?.state!=='saved'){current.current=saved;setLocal(saved)}
      if(conversational&&!eventId){
        const choices=[...(hasCaptureContent(saved)&&saved?.smartReview?.state!=='saved'?[{key,draft:saved!}]:[]),...retained].filter((choice,index,all)=>all.findIndex(item=>item.draft.requestId===choice.draft.requestId)===index)
        if(choices.length)setResumeChoices(choices)
      }else if(saved?.smartReview?.items.length)setStage('review')
      setReady(true)
    })()
    initialization.current=openingTask
    void openingTask.catch(()=>{if(active)setError('草稿读取失败，请重新打开后重试')})
    return()=>{active=false;mounted.current=false;abort.current?.abort()}
  },[key])
  useEffect(()=>{if(page&&ready&&stage==='conversation'){const restore=returning.current;scrollBody.current?.scrollTo({top:restore?local.returnScrollTop??0:scrollBody.current.scrollHeight,behavior:'auto'});if(restore){returning.current=false;change({returningFromRecord:false})}}},[page,ready,stage,local.conversationTurns?.length,local.savedGuides?.length,dialogueBusy,viewport.height])
  async function chooseDraft(choice?:{key:string;draft:CaptureDraft}){
    if(switchingDraft.current||busy||!resumeChoices)return
    switchingDraft.current=true
    setBusy(true);setError('')
    try{
      await writes.current
      // Park the active draft before replacing it. A failure keeps the choice
      // screen open and never discards the original text, files or edits.
      if(hasCaptureContent(current.current)&&(!choice||choice.key!==key)){
        await captureDraft(`${key}:retained:${Date.now()}:${current.current.requestId}`,current.current)
      }
      const next=choice?.draft??freshDraft()
      await persist(next)
      if(choice&&choice.key!==key)await captureDraft(choice.key,null)
      if(mounted.current){setResumeChoices(null);setStage(next.smartReview?.items.length?'review':'conversation')}
    }catch{if(mounted.current)setError('草稿切换未完成，原内容已保留，请重试')}
    finally{switchingDraft.current=false;if(mounted.current)setBusy(false)}
  }
  const url=`/api/members/${encodeURIComponent(memberId)}/ai-drafts`
  async function request<T>(path:string,method:'GET'|'POST'|'PATCH'|'DELETE',input?:unknown):Promise<T>{
    const controller=new AbortController();abort.current=controller;const timer=setTimeout(()=>controller.abort(),90000)
    try{const value=await apiRequest<T>(path,{method,token:credentials.current,signal:controller.signal,body:input});if(!mounted.current)throw new DOMException('Closed','AbortError');return value}finally{clearTimeout(timer)}
  }
  useEffect(()=>{
    const saved=current.current.smartReview
    if(!ready||resumeChoices||saved?.state!=='ready')return
    let active=true
    // Refresh only the exact retained draft; keep local edits and offline input.
    void request<SmartRecordDraft>(`${url}/${saved.id}`,'GET').then(restored=>{
      if(active&&mounted.current&&!pending.current&&current.current.smartReview===saved&&restored.state==='ready'){
        void persist({...current.current,smartReview:retainSmartRecordEdits(restored,saved)}).catch(()=>undefined)
      }
    }).catch(()=>undefined)
    return()=>{active=false}
  },[ready,key,local.smartReview?.id,Boolean(resumeChoices)])
  async function prepare(input=current.current,fromDialogue=false,replyId?:string){
    if(pending.current||(!fromDialogue&&queueSize.current)||!ready||input.pendingVoice||(!input.text.trim()&&!input.files.some(f=>!f.type.startsWith('audio/'))))return
    pending.current=true;setBusy(true);setError('');setStatus('正在整理成饮食、症状、睡眠等记录…')
    let retained=input.smartReview
    try{
      const occurredAt=input.capturedAt??(input.smartReview?localDateTimeToIso(input.occurredAt):new Date().toISOString())
      if(!occurredAt||Date.parse(occurredAt)>Date.now())throw new Error('发生时间不能晚于现在')
      if(!input.capturedAt){input={...input,capturedAt:occurredAt};await persist(input)}
      const files=await Promise.all(input.files.filter(f=>!f.type.startsWith('audio/')).map(async f=>({name:f.name,mimeType:f.type,dataUrl:await fileDataUrl(f)})))
      // Allocate and persist the draft ID before generation, so an interrupted
      // response can always be recovered by exact account/member/draft identity.
      const voiceFiles=await Promise.all(input.files.filter(f=>f.type.startsWith('audio/')).map(async f=>({name:f.name,mimeType:f.type,dataUrl:await fileDataUrl(f)})))
      const base={text:input.text,task:'record',eventId:input.eventId||null,smartRecord:true,frontDeskRecord:page,confirmOccurrenceTime:false,followUp:page||!conversational,selectedOccurredAt:occurredAt,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone}
      retained=await request<SmartRecordDraft>(url,'POST',{...base,id:retained?.id,version:retained?.version,files,voiceFiles,deferRecognition:true})
      await persist({...current.current,smartReview:retained,aiDraftId:retained.id})
      if(page&&!eventId&&current.current.frontContextId)await request(`${frontUrl}/contexts/${current.current.frontContextId}`,'POST',{draftId:retained.id})
      const review=retainSmartRecordEdits(await request<SmartRecordDraft>(url,'POST',{...base,id:retained.id,version:retained.version}),input.smartReview)
      await persist({...current.current,smartReview:review,aiDraftId:review.id,...(replyId?{conversationTurns:current.current.conversationTurns?.map(turn=>turn.id===replyId?{...turn,reviewId:review.id,recordCount:review.items.length}:turn)}:{})})
      if(page&&eventId)await persist({...current.current,conversationTurns:[...(current.current.conversationTurns??[]),{id:`${review.id}:${review.version}:reply`,role:'assistant',text:'已整理。',at:Date.now(),reviewId:review.id,recordCount:review.items.length}]})
      if(mounted.current){setStatus(`已整理 ${review.items.length} 条，请核对关键内容`);if(review.items.length&&!page)setStage('review')}
    }catch(e){
      if(mounted.current&&e&&typeof e==='object'&&'code' in e&&String(e.code).startsWith('VOICE_ORIGINAL_'))setOriginalsNeedReview(true)
      if(mounted.current){if(retained)try{const restored=retainSmartRecordEdits(await request<SmartRecordDraft>(`${url}/${retained.id}`,'GET'),input.smartReview);await persist({...current.current,smartReview:restored})}catch{/* The exact local draft remains retryable. */}setError(e instanceof Error&&e.name!=='AbortError'?e.message:'整理已中断，原话和草稿保留，可重试');setStatus('')}
    }finally{pending.current=false;if(mounted.current)setBusy(false)}
  }
  async function submitTurn(turn:CaptureTurn){
    queueSize.current++;setDialogueBusy(true)
    const task=queue.current.catch(()=>undefined).then(async()=>{
      if(!mounted.current)return
      const files=current.current.files.filter(f=>turn.fileKeys?.includes(fileIdentity(f)))
      try{
        const serialized=await Promise.all(files.map(async f=>({name:f.name,mimeType:f.type,lastModified:f.lastModified,dataUrl:await fileDataUrl(f)})))
        const result=await request<{context:FrontContext;replyId:string}>(frontUrl,'POST',{id:turn.id,kind:turn.kind??'text',text:turn.text,inputAt:turn.at,files:serialized.filter(f=>!f.mimeType.startsWith('audio/')),voiceFiles:serialized.filter(f=>f.mimeType.startsWith('audio/'))})
        result.context.messages.forEach(message=>hiddenTurns.current.delete(message.id))
        // Saved sources remain visible in their original bubbles without
        // becoming inputs for another formal record.
        result.context.messages.flatMap(message=>[...message.files??[],...message.voices??[]]).map(restoreFrontFile).forEach(file=>visibleMedia.current.set(fileIdentity(file),file))
        const restored=restoreFrontContext(result.context,current.current)
        // Keep the visible input boundaries from this visit across topic changes.
        const old=(current.current.conversationTurns??[]).filter(t=>!hiddenTurns.current.has(t.id)&&!restored.conversationTurns?.some(s=>s.id===t.id))
        const next={...restored,conversationTurns:[...old,...restored.conversationTurns??[]]}
        await persist(next);setError('')
        await prepare(next,true,result.replyId)
      }catch(e){if(mounted.current){const message=e instanceof Error?e.message:'护士对话暂不可用',code=e&&typeof e==='object'&&'code' in e?String(e.code):'FRONT_RECORD_UNAVAILABLE';await persist({...current.current,conversationTurns:current.current.conversationTurns?.map(t=>t.id===turn.id?{...t,status:'failed',error:message,errorCode:code}:t)});setError('')}}
    }).finally(()=>{queueSize.current--;if(mounted.current)setDialogueBusy(queueSize.current>0)})
    queue.current=task;await task
  }
  async function discardTurn(turn:CaptureTurn){try{await request(`${frontUrl}/messages/${encodeURIComponent(turn.id)}`,'DELETE');const remaining=current.current.conversationTurns?.filter(t=>t.id!==turn.id)??[];await persist({...current.current,conversationTurns:remaining,files:current.current.files.filter(file=>!turn.fileKeys?.includes(fileIdentity(file))||remaining.some(t=>t.fileKeys?.includes(fileIdentity(file))))})}catch(e){setError(e instanceof Error?e.message:'移除未完成，请重试')}}
  const voiceId=(file:File)=>`voice:${file.lastModified}:${file.size}`
  const voice=useSmartRecordVoice({memberId,token,onFinalizationStart:()=>beginCaptureFinalization(key),pendingVoice:local.pendingVoice,pendingTranscript:local.voiceTranscript,onRecorded:async file=>{await persist({...current.current,capturedAt:current.current.capturedAt??new Date().toISOString(),pendingVoice:file,voiceTranscript:undefined,files:[...current.current.files,file],...(page&&!eventId?{conversationTurns:[...current.current.conversationTurns??[],{id:voiceId(file),text:'',at:file.lastModified,kind:'voice',role:'user',fileKeys:[fileIdentity(file)],status:'transcribing'} as CaptureTurn]}:{})})},onTranscript:async (transcript,file)=>{
    if(leaving.current)return
    if(page&&!eventId){const turn:CaptureTurn={id:voiceId(file),text:transcript,at:file.lastModified,kind:'voice',role:'user',fileKeys:[fileIdentity(file)],status:'pending'},turns=current.current.conversationTurns??[];await persist({...current.current,pendingVoice:undefined,voiceTranscript:transcript,conversationTurns:turns.some(t=>t.id===turn.id)?turns.map(t=>t.id===turn.id?turn:t):[...turns,turn]});void submitTurn(turn).catch(()=>undefined)}else{const next=appendCaptureTurn(current.current,transcript,`voice:${file.name}:${file.lastModified}`);await persist(next);await prepare(next)}
  }})
  voiceBusy.current=voice.busy
  async function sendText(){if(sendLock.current||pending.current||((!page||eventId)&&(voice.busy||current.current.pendingVoice)))return;sendLock.current=true;try{const text=current.current.conversationInput?.trim();if(!text)return;if(page&&!eventId){const turn:CaptureTurn={id:crypto.randomUUID(),text,at:Date.now(),kind:'text',role:'user',status:'pending'};await persist({...current.current,capturedAt:current.current.capturedAt??new Date().toISOString(),conversationInput:'',conversationTurns:[...current.current.conversationTurns??[],turn]});void submitTurn(turn).catch(()=>undefined)}else{const next=appendCaptureTurn({...current.current,capturedAt:current.current.capturedAt??new Date().toISOString()},text);await persist(next);await prepare(next)}}catch(e){setError(e instanceof Error?e.message:'内容暂未保存，请再试一次')}finally{sendLock.current=false}}
  const review=local.smartReview,canSave=review?.state==='ready'&&review.inputText===local.text&&!local.pendingVoice
  const pickFiles=(files:FileList|null)=>{if(!files?.length)return;const selected=Array.from(files),next=[...current.current.files,...selected];if(next.length>12||next.reduce((sum,f)=>sum+f.size,0)>15*1024*1024){setError('最多12份原件，总大小15 MB');return}if(page&&!eventId){const turn:CaptureTurn={id:crypto.randomUUID(),text:'',at:Date.now(),kind:'image',role:'user',fileKeys:selected.map(fileIdentity),status:'pending'};void persist({...current.current,files:next,conversationTurns:[...current.current.conversationTurns??[],turn]}).then(()=>submitTurn(turn)).catch(()=>undefined)}else change({files:next,smartReview:review?{...review,state:'changed'}:undefined})}
  async function acknowledgeSave(saved:SmartRecordDraft){
    const guides=savedRecordGuides(saved,memberId)
    if(!guides.length)throw new Error('保存结果尚未确认，请重试原草稿')
    completedGuideIds.current=new Set(guides.map(guide=>guide.id))
    await writes.current
    if(page||conversational){
      await persist({...current.current,text:'',files:current.current.files.filter(file=>file===current.current.pendingVoice),smartReview:undefined,aiDraftId:undefined,...(eventId?{conversationTurns:[],capturedAt:undefined}:{}),savedGuides:[...(current.current.savedGuides??[]),...guides.filter(guide=>!current.current.savedGuides?.some(old=>old.id===guide.id))]})
      hiddenTurns.current.clear()
      setStage('conversation');setStatus('');setCompleted(true)
      if(page&&!eventId&&current.current.frontContextId)void request(`${frontUrl}/contexts/${current.current.frontContextId}`,'POST',{draftId:saved.id}).catch(()=>undefined)
    }else await captureDraft(key,null)
    onSaved?.(`已保存 ${saved.result?.count??0} 条记录`)
    if(onCaptured&&saved.result?.records[0])onCaptured(saved.result.records[0].eventId)
    else if(!conversational&&!page)onClose()
  }
  async function viewSavedRecord(guide:SavedRecordGuide){
    if(guide.memberId!==useAppStore.getState().currentMemberId)return
    setError('')
    try{
      await persist({...current.current,returningFromRecord:true,returnScrollTop:scrollBody.current?.scrollTop??0})
      const records=await request<{id:string;occurredAt:string;journal?:Parameters<typeof journalOccurrenceAt>[0] & {timePrecision?:string}}[]>(`/api/events/${encodeURIComponent(guide.eventId)}/records`,'GET')
      const record=records.find(item=>item.id===guide.recordId)
      if(!record)throw new Error('记录暂不可访问')
      if(guide.memberId!==useAppStore.getState().currentMemberId)return
      const day=record.journal?.timePrecision==='unknown'?null:getLocalDateKey(journalOccurrenceAt(record.journal,record.occurredAt))
      const params=new URLSearchParams({memberId,eventId:guide.eventId,recordId:guide.recordId,view:'month',...(day?{day,month:day.slice(0,7)}:{})})
      navigate(`/health-events?${params}`,{state:{calendarIdentity:`${accountId}:${memberId}`}})
    }catch{if(mounted.current)setError('这条记录已不存在或暂不可访问')}
  }
  async function save(){
    if(pending.current||!canSave||!review)return
    pending.current=true;setBusy(true);setError('');setStatus('正在保存…');let saved=review
    try{
      await writes.current
      for(const itemId of review.deletedItemIds??[])saved=await request<SmartRecordDraft>(`${url}/${saved.id}`,'PATCH',{version:saved.version,deleteItem:itemId})
      for(const item of review.items){
        if(item.userAdded){saved=await request<SmartRecordDraft>(`${url}/${saved.id}`,'PATCH',{version:saved.version,addItem:{id:item.id,category:item.category,text:item.fields[0].value,title:item.title,timeText:item.timeText}});continue}
        if(item.titleChanged)saved=await request<SmartRecordDraft>(`${url}/${saved.id}`,'PATCH',{version:saved.version,itemId:item.id,field:'title',value:item.title})
        if(item.categoryChanged)saved=await request<SmartRecordDraft>(`${url}/${saved.id}`,'PATCH',{version:saved.version,itemId:item.id,category:item.category})
        if(item.categoriesChanged)saved=await request<SmartRecordDraft>(`${url}/${saved.id}`,'PATCH',{version:saved.version,itemId:item.id,visibilityCategories:item.visibilityCategories})
        if(item.timeChanged)saved=await request<SmartRecordDraft>(`${url}/${saved.id}`,'PATCH',{version:saved.version,itemId:item.id,field:'time',value:item.timeText})
        for(const field of item.fields.filter(f=>f.editedBy==='user'))saved=await request<SmartRecordDraft>(`${url}/${saved.id}`,'PATCH',{version:saved.version,itemId:item.id,field:field.name,value:field.value})
      }
      // Persist the acknowledged version before the save request. A lost save
      // response is retried against the same draft and server idempotency key.
      await persist({...current.current,smartReview:saved})
      saved=await request<SmartRecordDraft>(`${url}/${saved.id}/save`,'POST',{version:saved.version,confirmed:true})
      await acknowledgeSave(saved)
    }catch(e){if(mounted.current){
      // Fetch only this draft. Never restore another context's latest draft.
      try{const retained=await request<SmartRecordDraft>(`${url}/${saved.id}`,'GET');if(retained.state==='saved'){await acknowledgeSave(retained);return}await persist({...current.current,smartReview:{...review,version:retained.version}})}catch{/* Keep user edits and raw input locally. */}
      setError(e instanceof Error?e.message:'保存未完成，草稿保留，可重试');setStatus('')
    }}finally{pending.current=false;if(mounted.current)setBusy(false)}
  }
  const conversationFooter=<DialogueComposer discardOnBlur={!page} directPhoto={page} text={local.conversationInput??''} onTextChange={conversationInput=>change({conversationInput})} maxLength={5000} disabled={!ready||busy||completed||!!resumeChoices||exitOpen} voiceDisabled={!!local.pendingVoice} allowTextWhileProcessing={page} audioLevel={voice.audioLevel} listening={voice.state==='listening'} processing={voice.state==='transcribing'} onStart={()=>{void voice.start()}} onStop={voice.stop} onDiscard={voice.discard} onPhoto={source=>(source==='camera'?camera:album).current?.click()} onSend={()=>void sendText()}/>
  const saveBlocked=busy||voice.busy||!canSave||!review?.items.length||!!review.documentWarnings?.length||!!review.unmappedRows?.length||review.sources?.some(s=>s.status==='uncertain')
  const reviewFooter=<div className="smart-record-review-footer">
    {!!saveBlocked&&!busy&&Boolean(review?.items.length)&&<p role="status">{review?.inputText!==local.text||review?.state!=='ready'?'内容有更新，请返回对话重新整理后再保存。':local.pendingVoice?'录音仍需处理，请返回对话。':review?.documentWarnings?.length||review?.unmappedRows?.length||review?.sources?.some(s=>s.status==='uncertain')?'有资料尚需核对，请返回对话查看提示。':'请先确认每条记录的发生时间；不记得也可以填写。'}</p>}
    <HohoButton fullWidth loading={busy} disabled={!!saveBlocked} onClick={()=>void save()}>保存</HohoButton>
    {!page&&<HohoButton fullWidth variant="text" disabled={busy} onClick={()=>setStage('conversation')}>返回对话继续补充</HohoButton>}
  </div>
  const footer=resumeChoices||completed?undefined:stage==='review'?reviewFooter:conversationFooter
  const savedBubble=(guide:SavedRecordGuide)=><NurseMessage key={guide.id} role="assistant"><div className="smart-record-saved" data-save-id={guide.id}><p><Check size={18} aria-hidden="true"/>{guide.text}</p>{!guide.dismissed&&<div className="smart-record-saved-actions"><HohoButton disabled={busy} onClick={()=>void viewSavedRecord(guide)}>查看</HohoButton></div>}</div></NurseMessage>
  const visibleTurns:(CaptureTurn & {savedGuide?:SavedRecordGuide})[]=[...(local.conversationTurns??(local.text?[{id:'legacy',text:local.text}]:[])),...(local.savedGuides??[]).filter(guide=>guide.memberId===memberId).map(guide=>({id:guide.id,text:'',at:guide.at,savedGuide:guide}))]
  const recordActions=(turn?:CaptureTurn)=>{
    const stale=Boolean(turn&&turn.id!==local.conversationTurns?.filter(item=>item.role==='assistant').at(-1)?.id)
    const count=stale?turn?.recordCount??0:review?.items.length??0
    if(!count||completed)return null
    const disabled=stale||busy||voice.busy||dialogueBusy||!canSave||Boolean(turn?.reviewId&&turn.reviewId!==review?.id)
    return <div className="smart-record-actions"><HohoButton variant="secondary" disabled={disabled} onClick={()=>setStage('review')}>核对 {count} 条记录</HohoButton><HohoButton disabled={disabled||Boolean(saveBlocked)} loading={!stale&&busy} onClick={()=>void save()}>直接记录</HohoButton></div>
  }
  const body=<>
    {resumeChoices ? <div className="smart-record-resume">
      <Typography variant="sectionTitle">上次还有未保存的草稿</Typography>
      <Typography variant="body">可以继续核对，也可以开始新的记录。原对话、录音和填写内容都会保留。</Typography>
      {resumeChoices.map((choice,index)=><section key={choice.key} className="smart-record-resume-choice">
        <p>{choice.draft.smartReview?.items.map(item=>item.title).join('、')||choice.draft.text||choice.draft.conversationInput||'录音与图片草稿'}</p>
        <HohoButton fullWidth loading={busy} onClick={()=>void chooseDraft(choice)}>{index===0?'继续上次记录':'继续这份草稿'}</HohoButton>
      </section>)}
      <HohoButton fullWidth variant="secondary" disabled={busy} onClick={()=>void chooseDraft()}>开始新的记录</HohoButton>
      {error&&<p role="alert">{error}</p>}
    </div> : stage==='review'&&review ? <SmartRecordReview review={review} disabled={busy||voice.busy} error={error} onChange={smartReview=>change({smartReview})}/> : <div className="nurse-conversation" aria-label="本次对话">
      {!page&&<p className="hoho-text-caption">记录对象：{memberName || '当前孩子'}{eventTitle ? ` · 正在补充：${eventTitle}` : ''}</p>}
      {!completed&&<NurseMessage role="assistant"><p>{greeting}</p></NurseMessage>}
      {visibleTurns.filter(turn=>completed?Boolean(turn.savedGuide&&completedGuideIds.current.has(turn.savedGuide.id)):!turn.savedGuide&&(!page||!hiddenTurns.current.has(turn.id))).sort((a,b)=>(a.at??0)-(b.at??0)).map(turn=>turn.savedGuide?savedBubble(turn.savedGuide):<NurseMessage key={turn.id} role={turn.role??'user'} recorderName={recorderName}>{turn.text&&<p>{turn.text}</p>}{turn.role==='assistant'&&recordActions(turn)}{turn.fileKeys?.map(id=>visibleMedia.current.get(id)).filter((f):f is File=>!!f).map(file=><RecordMedia key={fileIdentity(file)} file={file}/>)}{turn.status==='transcribing'&&<p role="status">录音已保留，正在识别…</p>}{turn.status==='pending'&&<p role="status">正在提交这条消息…</p>}{turn.status==='failed'&&<><p role="alert">{turn.kind==='image'?(turn.errorCode==='FRONT_IMAGE_PROCESSING_FAILED'||turn.errorCode==='FILE_READ_FAILED'?'图片处理失败':'图片对话未完成'):turn.kind==='voice'?'转写文字的对话发送未完成':'文字对话发送未完成'}：{turn.error||'连接中断'}。原内容已保留。</p><HohoButton variant="secondary" disabled={dialogueBusy||busy} onClick={()=>void submitTurn({...turn,status:'pending',error:undefined}).catch(()=>undefined)}>重试这条消息</HohoButton><HohoButton variant="secondary" disabled={dialogueBusy||busy} onClick={()=>void discardTurn(turn)}>移除这条未成功的消息</HohoButton></>}</NurseMessage>)}
      {(!page||eventId)&&!!local.files.filter(f=>!f.type.startsWith('audio/')).length&&<NurseMessage role="user" recorderName={recorderName}>{local.files.filter(f=>!f.type.startsWith('audio/')).map((file,i)=><div key={`${file.name}:${i}`} className="dialogue-file"><span>{file.name}</span><HohoButton variant="text" aria-label={`移除图片${i+1}`} disabled={busy||voice.busy} onClick={()=>change({files:local.files.filter(f=>f!==file),smartReview:review?{...review,state:'changed'}:undefined})}><X size={16}/></HohoButton></div>)}</NurseMessage>}
      {(!ready||busy||voice.busy||dialogueBusy)&&<NurseMessage role="assistant"><p role="status">{!ready?'我在找回刚才的内容，请稍等。':voice.state==='listening'?'我在听，松手后就帮你记录。':voice.state==='requesting'?'正在打开麦克风。':voice.state==='transcribing'?'我在听这段录音，请稍等。':dialogueBusy?'我在看你刚才提交的内容，请稍等。':status||'我在整理，请稍等。'}</p></NurseMessage>}
      {(error||voice.error)&&<NurseMessage role="assistant"><p role="alert">{error||voice.error}。你刚才的内容还在，可以再试一次。</p></NurseMessage>}
      {originalsNeedReview&&<NurseMessage role="assistant"><p>有语音原件无法读取或格式不一致。文字和其他资料还在；可以明确移除问题原件后整理文字，也可以重新录音。</p>{local.files.filter(file=>file.type.startsWith('audio/')).map(file=><HohoButton key={`${file.name}:${file.lastModified}`} variant="text" disabled={busy||voice.busy} onClick={()=>{change({files:current.current.files.filter(f=>f!==file),pendingVoice:current.current.pendingVoice===file?undefined:current.current.pendingVoice,smartReview:review?{...review,state:'changed'}:undefined});setOriginalsNeedReview(false);setError('')}}>移除语音原件：{file.name}</HohoButton>)}</NurseMessage>}
      {local.pendingVoice&&<NurseMessage role="assistant"><p>{voice.unreadable?'这份录音已经无法读取，可以移除后重新录音。你说过的文字仍然保留。':'这段录音还在，要我再听一次吗？'}</p>{voice.unreadable?<HohoButton variant="text" disabled={busy||voice.busy} onClick={()=>void persist({...current.current,pendingVoice:undefined,files:current.current.files.filter(file=>file!==current.current.pendingVoice)}).then(()=>{voice.clearError();setError('')}).catch(()=>undefined)}>移除无法读取的录音</HohoButton>:<HohoButton variant="text" disabled={busy||voice.busy} onClick={voice.retry}>再试一次</HohoButton>}{!voice.unreadable&&<HohoButton variant="text" disabled={busy||voice.busy} onClick={()=>change({pendingVoice:undefined})}>继续用文字补充</HohoButton>}</NurseMessage>}
      {!page&&!!review?.items.length&&<NurseMessage role="assistant">{recordActions()}</NurseMessage>}
      {error&&review?.state==='failed'&&<HohoButton variant="text" disabled={busy||voice.busy||dialogueBusy} onClick={()=>void prepare(current.current,false,current.current.conversationTurns?.filter(turn=>turn.role==='assistant').at(-1)?.id)}>重试</HohoButton>}
      {!!review?.unmappedRows?.length&&<NurseMessage role="assistant"><p>还有这些内容没有整理完整，请补充或更正后让我再试一次：{review.unmappedRows.map(row=>row.text).join('；')}</p></NurseMessage>}
      {(!!review?.documentWarnings?.length||review?.sources?.some(s=>s.status==='uncertain'))&&<NurseMessage role="assistant"><p>有些资料需要逐页核对，请到健康档案的智能记录继续核对，你的内容会保留。</p></NurseMessage>}


    </div>}
    <input type="file" ref={camera} accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={e=>{pickFiles(e.target.files);e.currentTarget.value=''}}/>
    <input type="file" ref={album} aria-label="从相册选择" accept={page?'image/jpeg,image/png,image/webp,image/heic,image/heif':'image/jpeg,image/png,image/webp'} hidden multiple onChange={e=>{pickFiles(e.target.files);e.currentTarget.value=''}}/>
  </>
  const close=()=>{if(exiting||busy)return;if(unfinished||voice.busy){voice.stop();setExitError('');setExitOpen(true)}else{allowLeave.current=true;onClose()}}
  const cancelExit=()=>{if(exiting)return;setExitOpen(false);setExitError('');if(blocker.state==='blocked')blocker.reset()}
  const finishExit=async(keepDraft:boolean)=>{
    if(leaving.current)return
    leaving.current=true;setExiting(true);setExitError('')
    try{
      voice.stop()
      // Wait for raw recording bytes, queued replies and every draft write.
      await initialization.current
      await captureDraft(key)
      await queue.current
      await writes.current
      if(keepDraft)await persist(current.current)
      else{
        if(page&&!eventId)await request(frontUrl,'DELETE')
        for(const retained of await retainedCaptureDrafts(key))await captureDraft(retained.key,null)
        await captureDraft(key,null)
      }
      allowLeave.current=true
      if(blocker.state==='blocked')blocker.proceed();else onClose()
    }catch{leaving.current=false;setExiting(false);setExitError(keepDraft?'草稿保存失败，请重试。当前内容仍在。':'退出未完成，请重试。当前内容仍在。')}
  }
  const exitDialog=<BottomSheetSurface open={exitOpen} viewportAware label="退出智能记录" title="保存这次草稿吗？" onClose={cancelExit} footer={<><HohoButton fullWidth loading={exiting} disabled={busy||dialogueBusy} onClick={()=>void finishExit(true)}>保存草稿并退出</HohoButton><HohoButton fullWidth variant="secondary" disabled={exiting||busy||dialogueBusy} onClick={()=>void finishExit(false)}>不保存并退出</HohoButton></>}><p>保存后，下次可以接着记录；不保存，下次将重新开始。</p>{exitError&&<p role="alert">{exitError}</p>}</BottomSheetSurface>
  return <>{page||stage==='review' ? <section className="smart-record-page smart-record-dialog" aria-label={stage==='review'?'核对记录':'智能记录'} style={{top:viewport.top,height:viewport.height}}><WebPageHeader title={stage==='review'?'核对记录':'智能记录'} onBack={()=>stage==='review'&&!busy?setStage('conversation'):close()}/><div ref={scrollBody} className="smart-record-page__body">{body}</div>{footer&&<footer className="smart-record-page__footer">{footer}</footer>}</section> : <BottomSheetSurface open viewportAware size="workspace" className="smart-record-dialog nurse-conversation-sheet" layerClassName="symptom-input-layer" leading={<Stethoscope size={21} aria-hidden="true"/>} dismissText="收起" title="智能记录" label="智能记录" onClose={close} footer={footer}>{body}</BottomSheetSurface>}{exitDialog}</>
}
