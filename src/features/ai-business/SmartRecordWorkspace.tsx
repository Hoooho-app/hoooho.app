import {ContinuousRecordCard,type ContinuousCard} from './ContinuousRecordCard'
import {startAITiming} from '../../services/aiTiming'
import {hasVisibleConversationText} from '../../../shared/conversation-input.mjs'
import { Fragment, useEffect, useRef, useState } from 'react'
import { ArrowDown, Check, Mic, Search, Stethoscope, X } from 'lucide-react'
import { useBlocker, useNavigate } from 'react-router-dom'
import { dismissSavedRecordGuide,savedRecordUrl, savedRecordGuides, type SavedRecordGuide } from './savedRecordGuide'
import { BottomSheetSurface, HohoButton, DialogueComposer, Typography } from '../../components/design-system'
import { useAppStore } from '../../store/useAppStore'
import { localDateTimeValue, localDateTimeToIso } from '../../utils/healthOccurredAt'
import { appendCaptureTurn,beginCaptureFinalization,captureDraft, checkpointCaptureDraft, fileIdentity, hasCaptureContent, pendingCaptureCancellations, retainedCaptureDrafts, type CaptureDraft, type CaptureTurn } from './captureDraft'
import {ProfessionalRecordSummary} from './ProfessionalRecordSummary'
import {completedFrontSaveReplyIds,recordOperationTurn,restoreFrontContext, restoreFrontFile, type FrontContext} from './frontDeskRecord'
import {confirmRawSaveTarget,frontHasOriginalFiles,frontOriginalsConfirmed,rawSaveTargetMatches} from './frontOriginalSave'
import {RecordMedia} from './RecordMedia'
import {FrontDeskVideoRecorder} from './FrontDeskVideoRecorder'
import { fileDataUrl } from './CaseCaptureWorkspace'
import { retainSmartRecordEdits, type SmartRecordDraft } from './smartRecordTypes'
import { useSmartRecordVoice } from './useSmartRecordVoice'
import { NurseMessage } from '../ai-nurse/NurseMessage'
import { SmartRecordReview } from './SmartRecordReview'
import { getLocalDateKey } from '../../utils/localCalendarDate'
import { journalOccurrenceAt } from '../../../shared/journal-occurrence.mjs'
import {apiRequest,ApiRequestError} from '../../services/apiClient'
import {mapWithConcurrency} from '../../services/concurrentTasks'
import { WebPageHeader } from '../../components/common'
import { useVisibleViewport } from '../../hooks/useVisibleViewport'
import './caseCapture.css'
import {RecognitionProgress} from './RecognitionProgress'
import {recognitionUrl,recognitionActive,recognitionCommand,uploadRecognitionFile,uploadRecognitionAudio,waitForRecognitionJob,type RecognitionJob} from './recognitionJobs'
import {caseService} from '../case-continuity/api'
import {CaseMergePrompt} from '../case-continuity/CaseMergePrompt'
import { MainAppHeader } from '../../components/navigation'
import { RecordEntryActions } from '../../pages/HealthEvents/RecordEntryActions'
import type { JournalCategory, DietRecordKind } from '../../types/journal'
import { FrontDeskProcessing } from '../../pages/NurseStation/FrontDeskProcessing'
import { FrontDeskWelcome } from '../../pages/NurseStation/FrontDeskWelcome'
import { ConversationMenu } from '../../pages/NurseStation/ConversationMenu'
import '../../pages/NurseStation/conversationHome.css'
import { conversationTime, showConversationTime } from '../../pages/NurseStation/conversationTime'

export function SmartRecordWorkspace({memberId,token,eventId,eventTitle,onClose,onSaved,onCaptured,conversational=false,page=false,followupReturn=false,initialText='',home=false}:{memberId:string;token:string;eventId?:string;eventTitle?:string;onClose:()=>void;onSaved?:(message:string)=>void;onCaptured?:(eventId:string)=>void;conversational?:boolean;page?:boolean;followupReturn?:boolean;initialText?:string;home?:boolean}) {
  const viewport=useVisibleViewport()
  const navigate=useNavigate()
  const accountId=useAppStore(s=>s.authUser?.id??'guest'),key=`${conversational?'home-smart':'smart'}:${accountId}:${memberId}:${eventId??'new'}`
  const [local,setLocal]=useState<CaptureDraft>(()=>({text:initialText,files:[],occurredAt:localDateTimeValue(),timeUnknown:false,requestId:crypto.randomUUID(),eventId}))
  const operationTimings=useRef(new Map<string,ReturnType<typeof startAITiming>>())
  useEffect(()=>()=>{for(const timing of operationTimings.current.values())timing.finish('cancelled');operationTimings.current.clear()},[key])
  const current=useRef(local),credentials=useRef(token);credentials.current=token
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('')
  const [progressError,setProgressError]=useState('')
  const [originalsNeedReview,setOriginalsNeedReview]=useState(false)
  const mounted=useRef(true),pending=useRef(false),sendLock=useRef(false),writes=useRef<Promise<unknown>>(Promise.resolve()),abort=useRef<AbortController|null>(null),camera=useRef<HTMLInputElement>(null),album=useRef<HTMLInputElement>(null)
  const videoCamera=useRef<HTMLInputElement>(null),filePicker=useRef<HTMLInputElement>(null)
  const [incomingVideo,setIncomingVideo]=useState<{id:string;file:File;origin:'capture'|'library'}>()
  useEffect(()=>setIncomingVideo(undefined),[accountId,memberId])
  const memberName=useAppStore(s=>s.members.find(member=>member.id===memberId)?.name)
  const greeting=eventTitle ? `继续补充“${eventTitle}”的进展。有什么变化、做过什么处理，都可以和我说说。` : page?`我是今天的值班护士。${memberName||'孩子'}今天怎么样？有什么需要我帮你记下来的吗？` : '吃了什么、睡得怎样、有什么症状，都可以和我说说。现在、过去的情况都可以记。'
  const [dialogueBusy,setDialogueBusy]=useState(false)
  const [localStage,setLocalStage]=useState(''),[commandBusy,setCommandBusy]=useState(false)
  const job=local.recognitionSnapshot,jobBusy=recognitionActive(job)
  const lastSeq=useRef(0),workEpoch=useRef(0),uploadAbort=useRef<AbortController|null>(null),commandLock=useRef(false)
  const queue=useRef<Promise<unknown>>(Promise.resolve()),queueSize=useRef(0),hiddenTurns=useRef(new Set<string>()),scrollBody=useRef<HTMLDivElement>(null),visibleMedia=useRef(new Map<string,File>())
  const [completed,setCompleted]=useState(false)
  const [cardSnapshot,setContinuousCard]=useState<ContinuousCard|null>(null),[recordOpen,setRecordOpen]=useState(false),[checklistOpen,setChecklistOpen]=useState(false),[cardBusy,setCardBusy]=useState(false)
  const continuousCard=cardSnapshot?.contextId===local.frontContextId?cardSnapshot:null
  const cardScope=useRef(0)
  useEffect(()=>{cardScope.current++;setContinuousCard(null);setRecordOpen(false);setChecklistOpen(false)},[key])
  const [trackingEvent,setTrackingEvent]=useState<string|null>(null)
  const trackingLock=useRef(false)
  const openingRecord=useRef(false)
  const recordDestination=useRef<{url:string;identity:string}>()
  const rawFinalizing=useRef(false),liveVoicePreview=useRef(new Map<string,string>())
  const completedGuideIds=useRef(new Set<string>())
  const presentedDraft=useRef<{id:string;version:number}>()
  const subjectConfirming=useRef(false)
  local.files.forEach(file=>visibleMedia.current.set(fileIdentity(file),file))
  const frontUrl=`/api/members/${encodeURIComponent(memberId)}/front-desk-record`
  const recorderName=useAppStore(s=>s.accountProfile?.nickname||s.authUser?.nickname||s.profile?.nickname)
  const [stage,setStage]=useState<'conversation'|'review'>('conversation')
  const [resumeChoices,setResumeChoices]=useState<{key:string;draft:CaptureDraft}[]|null>(null)
  const switchingDraft=useRef(false)
  const [exitOpen,setExitOpen]=useState(false),[exiting,setExiting]=useState(false),[exitError,setExitError]=useState('')
  const leaving=useRef(false),allowLeave=useRef(false),voiceBusy=useRef(false),initialization=useRef<Promise<void>>(Promise.resolve())
  const unfinished=!completed&&(hasCaptureContent(local)||Boolean(local.conversationTurns?.some(t=>t.role!=='assistant'&&t.status&&t.status!=='completed')))
  const blocker=useBlocker(({currentLocation,nextLocation})=>{
    const entry=nextLocation.state
    const internalRecord=home&&nextLocation.pathname==='/health-events'&&entry?.frontDeskReturn===true&&entry?.calendarIdentity===`${accountId}:${memberId}`&&['symptom','diet','sleep','elimination','medication','visit'].includes(entry?.nurseRecordEntry)
    const savedRecord=recordDestination.current?.url===`${nextLocation.pathname}${nextLocation.search}`&&recordDestination.current.identity===`${accountId}:${memberId}`&&current.current.returningFromRecord===true&&memberId===useAppStore.getState().currentMemberId&&accountId===(useAppStore.getState().authUser?.id??'guest')
    return !internalRecord&&!savedRecord&&!allowLeave.current&&(unfinished||voiceBusy.current)&&(currentLocation.pathname!==nextLocation.pathname||currentLocation.search!==nextLocation.search)
  })
  useEffect(()=>{if(blocker.state==='blocked')setExitOpen(true)},[blocker.state])
  const freshDraft=():CaptureDraft=>({text:initialText,files:[],occurredAt:localDateTimeValue(),timeUnknown:false,requestId:crypto.randomUUID(),eventId})
  const returning=useRef(false),followScroll=useRef(true),scrollOpened=useRef(false),followingUntil=useRef(0)
  const [showJump,setShowJump]=useState(false)
  const updateJump=()=>{
    const element=scrollBody.current
    if(!home||!element)return
    const near=element.scrollHeight-element.scrollTop-element.clientHeight<80
    if(performance.now()>=followingUntil.current||near)followScroll.current=near
    // A floating shortcut must never occupy the saved record's action area.
    const bounds=element.getBoundingClientRect()
    const actionsAtBottom=[...element.querySelectorAll('.smart-record-saved-actions')].some(actions=>{const rect=actions.getBoundingClientRect();return rect.top<bounds.bottom&&rect.bottom>bounds.bottom-80})
    setShowJump(!near&&!actionsAtBottom&&Boolean(current.current.conversationTurns?.length))
  }
  useEffect(()=>{
    if(!home||!ready||stage!=='conversation')return
    const element=scrollBody.current
    if(!element)return
    const observer=new ResizeObserver(updateJump)
    observer.observe(element)
    const conversation=element.querySelector('.nurse-conversation')
    if(conversation)observer.observe(conversation)
    const frame=requestAnimationFrame(updateJump)
    return()=>{observer.disconnect();cancelAnimationFrame(frame)}
  },[home,ready,stage,key,local.savedGuides,local.recognitionSnapshot?.seq])
  const persist=async(value:CaptureDraft)=>{const next={...value,updatedAt:Date.now()};current.current=next;checkpointCaptureDraft(key,next);if(mounted.current)setLocal(next);const write=writes.current.catch(()=>undefined).then(()=>captureDraft(key,next));writes.current=write;try{await write}catch(e){if(mounted.current)setError('本机草稿保存失败，请保持页面打开后重试');throw e}}
  const change=(patch:Partial<CaptureDraft>)=>void persist({...current.current,...patch}).catch(()=>undefined)
  useEffect(()=>{
    let active=true;mounted.current=true
    const openingTask=(async()=>{
      let cancellationPending=false
      for(const pending of await pendingCaptureCancellations(key)){const command=pending.draft.pendingRecognitionCommand,id=pending.draft.recognitionJobId;if(!command||!id)continue;try{await recognitionCommand(memberId,credentials.current,id,'discard',command.id);await captureDraft(pending.key,null)}catch{cancellationPending=true}}
      if(cancellationPending)setError('本机草稿已清除；服务端取消尚未确认，联网后会继续同步')
      let saved=await captureDraft(key)
      const retained=conversational&&!eventId?await retainedCaptureDrafts(key):[]
      if(!active)return
      if(page&&!eventId){
        // Timestamp ordering repairs old retained drafts without presenting a
        // recovery choice. An older checkpoint cannot supersede a newer draft.
        saved=[...(saved?[saved]:[]),...retained.map(c=>c.draft)].filter(d=>!d.archivedConversation&&d.smartReview?.state!=='saved').sort((a,b)=>(b.updatedAt??0)-(a.updatedAt??0))[0]??null
        const opening=saved??current.current
        returning.current=Boolean(opening.returningFromRecord)
        hiddenTurns.current=new Set()
        current.current=opening;setLocal(opening);setReady(true)
        if(saved&&!saved.frontContextId&&(saved.text.trim()||saved.files.some(f=>!f.type.startsWith('audio/')))){
          try{const media=await Promise.all(saved.files.filter(f=>f!==saved?.pendingVoice).map(async f=>({name:f.name,mimeType:f.type,lastModified:f.lastModified,dataUrl:await fileDataUrl(f)})));const migrated=await request<FrontContext|null>(frontUrl,'POST',{kind:'legacy',requestId:saved.requestId,updatedAt:saved.updatedAt,turns:saved.conversationTurns??(saved.text?[{text:saved.text}]:[]),files:media.filter(f=>!f.mimeType.startsWith('audio/')),voiceFiles:media.filter(f=>f.mimeType.startsWith('audio/')),draftId:saved.smartReview?.id});if(!active)return;if(migrated)saved=restoreFrontContext(migrated,saved)}catch{/* Unreadable legacy originals remain in the local recovery draft. */}
        }
        for(const choice of retained.filter(c=>!c.draft.archivedConversation&&c.draft.requestId!==opening.requestId&&!c.draft.frontContextId)){
          if(!active)return
          try{const draft=choice.draft,media=await Promise.all(draft.files.filter(f=>f!==draft.pendingVoice).map(async f=>({name:f.name,mimeType:f.type,lastModified:f.lastModified,dataUrl:await fileDataUrl(f)})));const acknowledged=await request<FrontContext|null>(frontUrl,'POST',{kind:'legacy',requestId:draft.requestId,updatedAt:draft.updatedAt??Number(choice.key.split(':retained:')[1]?.split(':')[0]),turns:draft.conversationTurns??(draft.text?[{text:draft.text}]:[]),files:media.filter(f=>!f.mimeType.startsWith('audio/')),voiceFiles:media.filter(f=>f.mimeType.startsWith('audio/')),draftId:draft.smartReview?.id});if(acknowledged&&!draft.pendingVoice&&!draft.conversationInput?.trim())await captureDraft(choice.key,null)}catch{/* A failed migration retains this exact older draft and its byte originals. */}
        }
        try{const server=cancellationPending?null:await request<FrontContext|null>(frontUrl,'GET');if(!active)return;if(server)for(const message of [...server.previousMessages??[],...server.messages])for(const original of [...message.files??[],...message.voices??[]]){const file=restoreFrontFile(original);visibleMedia.current.set(fileIdentity(file),file)}if(server&&(!saved?.frontContextId||Date.parse(server.updatedAt)>(saved.updatedAt??0)))saved=restoreFrontContext(server,saved??freshDraft())}catch{/* Local recovery remains usable while the server is unavailable. */}
        // Start talking immediately from local recovery. A late history read
        // must never replace text, media or a new intent entered since opening.
        if(current.current!==opening)return
        hiddenTurns.current=new Set()
        if(saved){saved={...saved,conversationTurns:saved.conversationTurns?.map(t=>t.status==='pending'&&!saved?.recognitionJobId?{...t,status:'failed',error:'上次提交中断，请重试原消息'}:t)};current.current=saved;setLocal(saved)}
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
  useEffect(()=>{
    if(!page||!ready||stage!=='conversation')return
    const element=scrollBody.current,restore=returning.current
    if(element&&(restore||followScroll.current||!scrollOpened.current)){
      const emptyHome=home&&!local.conversationTurns?.length&&!local.savedGuides?.length
      followingUntil.current=performance.now()+450
      element.scrollTo({top:restore?local.returnScrollTop??0:emptyHome?0:element.scrollHeight,behavior:home&&!restore&&scrollOpened.current&&!emptyHome?'smooth':'auto'})
      scrollOpened.current=true
      if(restore&&home){followScroll.current=element.scrollHeight-element.scrollTop-element.clientHeight<80;setShowJump(!followScroll.current)}
    }
    if(restore){returning.current=false;change({returningFromRecord:false})}
  },[page,ready,stage,local.conversationTurns?.length,local.savedGuides?.length,dialogueBusy,home?local.recognitionSnapshot?.seq:undefined,viewport.height,home])

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
  function assertWork(epoch:number){if(epoch!==workEpoch.current||leaving.current||!mounted.current||memberId!==useAppStore.getState().currentMemberId||accountId!==(useAppStore.getState().authUser?.id??'guest'))throw new DOMException('Closed','AbortError')}
  async function uploadFiles(files:File[],epoch:number,signal:AbortSignal,audio?:File){
    const sources=[...files.map(file=>({file,identity:fileIdentity(file),asr:false})),...(audio?[{file:audio,identity:`asr:${fileIdentity(audio)}`,asr:true}]:[])]
    const ids=await mapWithConcurrency(sources,2,async source=>{
      assertWork(epoch)
      let id=current.current.recognitionAssets?.[source.identity]
      if(!id){
        if(source.asr)setLocalStage('converting')
        id=await(source.asr?uploadRecognitionAudio(memberId,credentials.current,source.file,signal):uploadRecognitionFile(memberId,credentials.current,source.file,signal))
        assertWork(epoch)
        await persist({...current.current,recognitionAssets:{...current.current.recognitionAssets,[source.identity]:id}})
      }
      return id
    },signal)
    return {assetIds:ids.slice(0,files.length),asrAssetId:audio?ids[files.length]:undefined}
  }
  async function enqueue(input:CaptureDraft,turn?:CaptureTurn){
    if(!ready||leaving.current)return
    setError('');setLocalStage('uploading')
    const epoch=workEpoch.current,controller=new AbortController();uploadAbort.current=controller
    const id=current.current.recognitionJobId??crypto.randomUUID()
    operationTimings.current.get(id)?.finish('cancelled');operationTimings.current.set(id,startAITiming('smart-record',credentials.current,id))
    await persist({...current.current,recognitionJobId:id})
    try{
      const files=turn?input.files.filter(f=>turn.fileKeys?.includes(fileIdentity(f))):input.files
      const audio=turn?.kind==='voice'?files.find(f=>f.type.startsWith('audio/')):undefined
      const {assetIds,asrAssetId}=await uploadFiles(files,epoch,controller.signal,audio&&!turn?.text?audio:undefined);assertWork(epoch)
      const occurredAt=input.capturedAt??new Date().toISOString()
      if(Date.parse(occurredAt)>Date.now())throw new Error('发生时间不能晚于现在')
      const body={id,mode:page&&!eventId?'front':'record',scopeKey:page&&!eventId?'front':`record:${eventId??'new'}`,input:{id:turn?.id??crypto.randomUUID(),kind:turn?.kind??'text',...(turn?.continuationId?{contextId:turn.continuationId}:{}),text:turn?.text??input.text,inputAt:turn?.at??Date.now(),assetIds,asrAssetId,...(turn?.answerTo?{answerTo:turn.answerTo}:{}),...(turn?.presentedDraft?{presentedDraft:turn.presentedDraft}:{}),...(turn?.expectedContextVersion!==undefined?{expectedContextVersion:turn.expectedContextVersion}:{})},options:{continuousRecord:home,initialText:(!page||eventId)&&!current.current.recognitionSnapshot?(turn?.text&&input.text.endsWith(turn.text)?input.text.slice(0,-turn.text.length).trim():input.text):undefined,task:'record',semanticVersion:page&&!eventId?3:1,eventId:input.eventId||null,smartRecord:true,frontDeskRecord:page,confirmOccurrenceTime:false,followUp:home?Boolean(input.followUpEnabled):page||!conversational,selectedOccurredAt:occurredAt,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,id:input.smartReview?.id,version:input.smartReview?.version}}
      assertWork(epoch)
      const accepted=await request<RecognitionJob>(recognitionUrl(memberId),'POST',body)
      assertWork(epoch)
      await persist({...current.current,recognitionSnapshot:accepted,pendingVoice:current.current.pendingVoice,...(!page||eventId?{smartReview:current.current.smartReview?{...current.current.smartReview,state:'changed'}:undefined}:{})})
    }catch(e){
      if(epoch!==workEpoch.current||leaving.current||!mounted.current)return
      // A lost acknowledgement does not prove that creation failed. Read the
      // same stable identity before presenting a retry; never create another job.
      try{const accepted=await request<RecognitionJob>(`${recognitionUrl(memberId)}/${id}`,'GET');assertWork(epoch);await persist({...current.current,recognitionSnapshot:accepted});return}catch{/* Original bytes and immutable message ID stay local. */}
      if(epoch!==workEpoch.current||leaving.current||!mounted.current)return
      if(turn)await persist({...current.current,conversationTurns:current.current.conversationTurns?.map(t=>t.id===turn.id?{...t,status:'failed',error:e instanceof Error?e.message:'上传未完成'}:t)})
      operationTimings.current.get(id)?.finish(controller.signal.aborted?'cancelled':'failed');operationTimings.current.delete(id)
      setError(e instanceof Error?e.message:'提交结果尚未确认，原内容保留，请重试')
    }finally{if(mounted.current)setLocalStage('')}
  }
  async function prepare(input=current.current){
    if(pending.current||!ready||input.pendingVoice||(!input.text.trim()&&!input.files.some(f=>!f.type.startsWith('audio/'))))return
    await enqueue(input)
  }
  async function submitTurn(turn:CaptureTurn){
    if(home){followScroll.current=true;setShowJump(false);setHomeNotice('')}
    queueSize.current++;setDialogueBusy(true)
    const task=queue.current.catch(()=>undefined).then(()=>mounted.current&&!leaving.current?enqueue(current.current,turn):undefined).finally(()=>{queueSize.current--;if(mounted.current)setDialogueBusy(queueSize.current>0)})
    queue.current=task;await task
  }
  async function taskCommand(type:'pause'|'resume'|'retry'|'use_text'){
    if(commandLock.current||!current.current.recognitionJobId)return
    const epoch=workEpoch.current,id=current.current.recognitionJobId
    commandLock.current=true;setCommandBusy(true);setError('')
    try{const snapshot=await recognitionCommand(memberId,credentials.current,id,type);assertWork(epoch);if(current.current.recognitionJobId!==id||snapshot.seq<(current.current.recognitionSnapshot?.seq??0)||snapshot.inputRevision<(current.current.recognitionSnapshot?.inputRevision??0))return;await persist({...current.current,recognitionSnapshot:snapshot})}catch{if(epoch===workEpoch.current&&mounted.current&&!leaving.current&&current.current.recognitionJobId===id&&memberId===useAppStore.getState().currentMemberId&&accountId===(useAppStore.getState().authUser?.id??'guest'))setError('操作尚未确认，原内容保留，请重试')}finally{commandLock.current=false;if(mounted.current)setCommandBusy(false)}
  }
  useEffect(()=>{
    if(!ready||!local.recognitionJobId)return
    lastSeq.current=0
    let active=true,polling=false,timer:ReturnType<typeof setTimeout>|undefined,controller:AbortController|undefined;const id=local.recognitionJobId
    const poll=async()=>{
      if(!active||document.hidden||polling)return
      polling=true;controller=new AbortController()
      let failed=false
      try{
        const snapshot=await waitForRecognitionJob(memberId,credentials.current,id,current.current.recognitionSnapshot,controller.signal)
        if(!active||current.current.recognitionJobId!==id||leaving.current||memberId!==useAppStore.getState().currentMemberId||accountId!==(useAppStore.getState().authUser?.id??'guest'))return
        const returnedContext=snapshot.frontDesk?.context
        if(returnedContext&&returnedContext.id===current.current.frontContextId&&(returnedContext.version??0)<(current.current.frontContextVersion??0)){await persist({...current.current,recognitionSnapshot:{...snapshot,frontDesk:undefined,review:null}});lastSeq.current=snapshot.seq;return}
        if(snapshot.seq>lastSeq.current&&snapshot.seq>=(current.current.recognitionSnapshot?.seq??0)&&snapshot.inputRevision>=(current.current.recognitionSnapshot?.inputRevision??0)){
          let next={...current.current,recognitionSnapshot:snapshot}
          if(snapshot.inputStates)next={...next,conversationTurns:next.conversationTurns?.map(turn=>{const input=snapshot.inputStates?.find(i=>i.id===turn.id);return input?{...turn,text:input.text,status:input.status}:turn})}
          if(snapshot.transcript){const transcript=snapshot.transcript;next={...next,conversationTurns:next.conversationTurns?.map(t=>t.id===transcript.inputId?{...t,text:transcript.text,status:'pending'}:t),pendingVoice:next.pendingVoice&&voiceId(next.pendingVoice)===transcript.inputId?undefined:next.pendingVoice}}
          const finalRevision=snapshot.resultRevision===snapshot.inputRevision&&['ready','needs_review'].includes(snapshot.state)
          const failedFrontContext=Boolean(snapshot.frontDesk&&snapshot.state==='failed')
          if(snapshot.frontDesk&&(home||finalRevision||failedFrontContext)){
            const provided=snapshot.frontDesk.context
            const complete=(!snapshot.review||provided.review?.id===snapshot.review.id&&provided.review?.version===snapshot.review.version)&&[...provided.previousMessages??[],...provided.messages].every(message=>[...message.files??[],...message.voices??[]].every(file=>typeof file.dataUrl==='string'))
            const context=complete?provided:await request<FrontContext>(`${frontUrl}/contexts/${provided.id}`,'GET')
            if(!active||current.current.recognitionJobId!==id||leaving.current||memberId!==useAppStore.getState().currentMemberId||accountId!==(useAppStore.getState().authUser?.id??'guest')||snapshot.seq<(current.current.recognitionSnapshot?.seq??0)||snapshot.inputRevision<(current.current.recognitionSnapshot?.inputRevision??0))return
            [...context.previousMessages??[],...context.messages].flatMap(message=>[...message.files??[],...message.voices??[]]).map(restoreFrontFile).forEach(file=>visibleMedia.current.set(fileIdentity(file),file))
            const restored=restoreFrontContext(failedFrontContext?{...context,resultKind:'partial',understanding:{...context.understanding,recordChanges:[]}}:context,current.current),old=(current.current.conversationTurns??[]).filter(t=>!restored.conversationTurns?.some(s=>s.id===t.id))
            const ownVoice=restored.pendingVoice&&snapshot.inputStates?.some(input=>input.id===voiceId(restored.pendingVoice!)&&input.status==='completed')
            next={...restored,...(ownVoice?{pendingVoice:undefined}:{}),recognitionSnapshot:snapshot,conversationTurns:[...old,...restored.conversationTurns??[]]}
          }else if(snapshot.review&&finalRevision){
            next={...next,recognitionSnapshot:snapshot,text:snapshot.review.inputText,smartReview:retainSmartRecordEdits(snapshot.review,current.current.smartReview),aiDraftId:snapshot.review.id,conversationTurns:next.conversationTurns}
          }
          if(snapshot.review?.state==='ready'&&finalRevision&&!page&&snapshot.review.items.length)setStage('review')
          const saved=snapshot.operationReceipt?.state==='saved'?snapshot.operationReceipt.savedDraft:undefined
          const operation=recordOperationTurn(snapshot.operationReceipt)
          if(operation&&!next.conversationTurns?.some(turn=>turn.operationResult?.operationId===operation.operationResult?.operationId))next={...next,conversationTurns:[...next.conversationTurns??[],operation]}
          const guides=saved?.state==='saved'?savedRecordGuides(saved,memberId,memberName):[]
          const appended=guides.filter(guide=>!next.savedGuides?.some(old=>old.id===guide.id))
          if(appended.length){next={...next,savedGuides:[...next.savedGuides??[],...appended]};if(next.smartReview?.id===saved!.id&&next.smartReview.version<=saved!.version)next={...next,smartReview:undefined,aiDraftId:undefined}}
          if(active&&!leaving.current&&memberId===useAppStore.getState().currentMemberId&&accountId===(useAppStore.getState().authUser?.id??'guest')&&snapshot.seq>=(current.current.recognitionSnapshot?.seq??0)){await persist(next);if(appended.length){onSaved?.(`已保存 ${saved?.result?.count??0} 条记录`);window.dispatchEvent(new Event('hoooho-data-changed'))}lastSeq.current=snapshot.seq;if(['ready','needs_review','failed','discarded','paused'].includes(snapshot.state)){operationTimings.current.get(id)?.finish(snapshot.state==='needs_review'?'needs_review':snapshot.state==='ready'?'ready':snapshot.state==='failed'?'failed':'cancelled');operationTimings.current.delete(id)}}
        }
        setProgressError('')
      }catch{failed=true;if(active&&!leaving.current&&!controller?.signal.aborted)setProgressError('暂时无法获取处理进度，原内容仍保留；连接恢复后会继续查询')}
      finally{polling=false;if(active&&!document.hidden&&(failed||recognitionActive(current.current.recognitionSnapshot)))timer=setTimeout(()=>void poll(),failed?1000:0)}
    }
    const visibility=()=>{if(document.hidden){if(timer)clearTimeout(timer);controller?.abort()}else void poll()}
    document.addEventListener('visibilitychange',visibility);void poll()
    return()=>{active=false;if(timer)clearTimeout(timer);controller?.abort();document.removeEventListener('visibilitychange',visibility)}
  },[ready,key,local.recognitionJobId,local.recognitionSnapshot?.state])
  async function discardTurn(turn:CaptureTurn){try{await request(`${frontUrl}/messages/${encodeURIComponent(turn.id)}`,'DELETE');const remaining=current.current.conversationTurns?.filter(t=>t.id!==turn.id)??[];await persist({...current.current,conversationTurns:remaining,files:current.current.files.filter(file=>!turn.fileKeys?.includes(fileIdentity(file))||remaining.some(t=>t.fileKeys?.includes(fileIdentity(file))))})}catch(e){setError(e instanceof Error?e.message:'移除未完成，请重试')}}
  function questionTarget(){
    const value=current.current
    if(value.conversationTurns?.some(turn=>turn.role==='user'&&turn.status==='pending'&&turn.answerTo?.questionId===value.nursingInterview?.question?.id))return undefined
    return value.frontContextId&&value.nursingInterview?.status==='asking'&&value.nursingInterview.question?{contextId:value.frontContextId,questionId:value.nursingInterview.question.id}:undefined
  }
  function turnIntent(){if(home&&continuousCard)return {presentedDraft:{id:continuousCard.contextId,version:continuousCard.version},expectedContextVersion:continuousCard.version};return {...(presentedDraft.current?{presentedDraft:{...presentedDraft.current}}:{}),...(current.current.frontContextVersion!==undefined?{expectedContextVersion:current.current.frontContextVersion}:{})}}
  useEffect(()=>{
    const candidate=local.smartReview
    const edited=Boolean(candidate?.deletedItemIds?.length||candidate?.items.some(item=>item.userAdded||item.titleChanged||item.categoryChanged||item.categoriesChanged||item.timeChanged||item.fields.some(field=>field.editedBy==='user')))
    if(!candidate?.items.length||candidate.state!=='ready'||edited){presentedDraft.current=undefined;return}
    const answering=local.nursingInterview?.status==='asking'&&local.nursingInterview.question
    if(!completed&&(stage==='review'||!jobBusy&&!localStage&&!dialogueBusy&&!answering))presentedDraft.current={id:candidate.id,version:candidate.version}
  },[local.smartReview,local.nursingInterview,stage,completed,jobBusy,localStage,dialogueBusy])
  const voiceId=(file:File)=>`voice:${file.lastModified}:${file.size}`
  const voice=useSmartRecordVoice({memberId,token,livePreview:home,autoTranscribe:false,onFinalizationStart:()=>beginCaptureFinalization(key),pendingVoice:local.pendingVoice,pendingTranscript:local.voiceTranscript,onRecorded:async (file,previewText)=>{
    if(previewText)liveVoicePreview.current.set(voiceId(file),previewText)
    const turn:CaptureTurn={continuationId:home?current.current.frontContextId:current.current.resumeContextId,answerTo:questionTarget(),...turnIntent(),id:voiceId(file),text:'',at:file.lastModified,kind:'voice',role:'user',fileKeys:[fileIdentity(file)],status:'pending'}
    setLocalStage('uploading')
    await persist({...current.current,rawSaveTarget:undefined,...(!page||eventId?{smartReview:current.current.smartReview?{...current.current.smartReview,state:'changed'}:undefined}:{}),capturedAt:current.current.capturedAt??new Date().toISOString(),pendingVoice:file,files:[...current.current.files,file],conversationTurns:[...current.current.conversationTurns??[],turn]})
    if(!leaving.current)void submitTurn(turn).catch(()=>undefined)
  },onTranscript:async()=>undefined})
  useEffect(()=>{
    if(!home||voice.state!=='listening'||!followScroll.current)return
    const frame=requestAnimationFrame(()=>scrollBody.current?.scrollTo({top:scrollBody.current.scrollHeight,behavior:'auto'}))
    return()=>cancelAnimationFrame(frame)
  },[home,voice.state,voice.liveText])
  voiceBusy.current=voice.busy
  async function sendText(answer?:string){if(sendLock.current||pending.current||voice.state==='listening'||voice.state==='requesting')return;sendLock.current=true;try{const text=(answer??current.current.conversationInput)?.trim();if(!text||!hasVisibleConversationText(text))return;setLocalStage('uploading');if(page&&!eventId){const turn:CaptureTurn={continuationId:home?current.current.frontContextId:current.current.resumeContextId,answerTo:questionTarget(),...turnIntent(),id:crypto.randomUUID(),text,at:Date.now(),kind:'text',role:'user',status:'pending'};await persist({...current.current,rawSaveTarget:undefined,...(!page||eventId?{smartReview:current.current.smartReview?{...current.current.smartReview,state:'changed'}:undefined}:{}),capturedAt:current.current.capturedAt??new Date().toISOString(),conversationInput:answer===undefined?'':current.current.conversationInput,conversationTurns:[...current.current.conversationTurns??[],turn]});void submitTurn(turn).catch(()=>undefined)}else{const turn:CaptureTurn={continuationId:home?current.current.frontContextId:current.current.resumeContextId,answerTo:questionTarget(),...turnIntent(),id:crypto.randomUUID(),text,at:Date.now(),kind:'text',role:'user',status:'pending'},next=appendCaptureTurn({...current.current,capturedAt:current.current.capturedAt??new Date().toISOString()},text,turn.id);await persist({...next,conversationTurns:next.conversationTurns?.map(t=>t.id===turn.id?turn:t)});void submitTurn(turn).catch(()=>undefined)}}catch(e){setError(e instanceof Error?e.message:'内容暂未保存，请再试一次')}finally{sendLock.current=false}}
  const review=local.smartReview
  const rawContext=job?.frontDesk?.context
  const rawContextMatches=Boolean(rawContext&&rawContext.id===local.frontContextId&&rawContext.version===local.frontContextVersion&&!rawContext.saved&&rawContext.messages.some(message=>message.kind!=='assistant'&&message.status!=='discarded')&&!local.conversationTurns?.some(turn=>turn.role!=='assistant'&&['pending','transcribing'].includes(turn.status??'')&&!rawContext.messages.some(message=>message.id===turn.id)))
  const subjectPending=Boolean(review?.subjectConfirmed===false||review?.items.some(item=>item.subjectConfirmed===false))
  const subjectCanConfirm=!review?.frontSubject||['unknown','current'].includes(review.frontSubject.kind)
  const rawSubject=local.frontSubject??rawContext?.subject
  const rawSubjectConfirmed=!page||Boolean(eventId)||Boolean(rawContextMatches&&frontOriginalsConfirmed(rawContext,memberId))
  const rawIntentMatches=rawSaveTargetMatches(local.rawSaveTarget,rawContext,memberId)
  const rawReceiptRecovery=Boolean(local.rawSaveTarget?.state==='requested'&&local.rawSaveTarget.memberId===memberId&&local.rawSaveTarget.contextId===rawContext?.id&&rawContext.saved&&local.rawSaveTarget.originalsVersion===(rawContext.originalsVersion??0))
  const rawCanOffer=!jobBusy&&!localStage&&(page&&!eventId
    ?rawContextMatches&&(job?.state==='failed'||!review?.items.length&&['ready','needs_review'].includes(job?.state??'')&&frontHasOriginalFiles(rawContext))
    :job?.state==='failed'&&Boolean(hasVisibleConversationText(local.text)||local.files.length||job.inputStates?.some(input=>hasVisibleConversationText(input.text??''))))
  const contextSubjectPending=page&&!eventId&&rawContextMatches&&rawIntentMatches&&!rawSubjectConfirmed
  const contextSubjectCanConfirm=!rawSubject||['unknown','current'].includes(rawSubject.kind)
  const canSave=review?.state==='ready'&&review.inputText===local.text&&!subjectPending&&!local.pendingVoice&&!jobBusy&&!job?.unresolvedInputs?.length&&!localStage&&(!job||job.resultRevision===job.inputRevision&&['ready','needs_review'].includes(job.state))
  async function confirmSubject(){
    const before=current.current.smartReview,epoch=workEpoch.current,contextId=current.current.frontContextId,contextVersion=current.current.frontContextVersion
    const beforeContext=current.current.recognitionSnapshot?.frontDesk?.context,contextMessages=beforeContext?.messages
    const confirmDraft=before?.state==='ready'&&before.items.length&&(!page||Boolean(eventId)||!contextId||contextVersion===undefined)
    if(subjectConfirming.current||pending.current||busy||jobBusy||localStage||confirmDraft&&before.frontSubject&&!['unknown','current'].includes(before.frontSubject.kind)||!confirmDraft&&(!contextId||contextVersion===undefined||!contextSubjectCanConfirm))return
    subjectConfirming.current=true;pending.current=true;setBusy(true);setError('')
    try{
      if(confirmDraft){
        const confirmed=await request<SmartRecordDraft>(`${url}/${before.id}`,'PATCH',{version:before.version,subjectConfirmed:true})
        assertWork(epoch)
        if(current.current.smartReview?.id!==before.id||current.current.smartReview.version!==before.version)return
        await persist({...current.current,smartReview:retainSmartRecordEdits(confirmed,current.current.smartReview)})
      }else{
        const confirmed=await request<FrontContext>(`${frontUrl}/contexts/${contextId}`,'POST',{action:'confirm_subject',expectedVersion:contextVersion})
        assertWork(epoch)
        if(current.current.frontContextId!==contextId||current.current.frontContextVersion!==contextVersion)return
        const restored=restoreFrontContext(confirmed,current.current),snapshot=current.current.recognitionSnapshot,front=snapshot?.frontDesk
        restored.rawSaveTarget=confirmRawSaveTarget(current.current.rawSaveTarget,beforeContext,confirmed,memberId)
        if(snapshot&&front&&front.context.id===contextId)restored.recognitionSnapshot={...snapshot,frontDesk:{...front,context:confirmed}}
        await persist(restored)
      }
    }catch(e){
      if(!confirmDraft&&contextId&&contextVersion!==undefined&&e instanceof ApiRequestError&&e.code==='FRONT_CONTEXT_CHANGED'){
        try{
          const confirmed=await request<FrontContext>(`${frontUrl}/contexts/${contextId}`,'GET')
          assertWork(epoch)
          const identities=(messages:FrontContext['messages'])=>JSON.stringify(messages.map(message=>[message.id,message.kind,message.text,message.status]))
          const subject=confirmed.subject??confirmed.frontSubject
          if(confirmed.id===contextId&&!confirmed.saved&&(confirmed.version??0)>contextVersion&&subject?.kind==='current'&&subject.memberId===memberId&&subject.confirmed===true&&(!current.current.rawSaveTarget||frontOriginalsConfirmed(confirmed,memberId))&&contextMessages&&identities(confirmed.messages)===identities(contextMessages)&&current.current.frontContextId===contextId&&current.current.frontContextVersion===contextVersion){
            const restored=restoreFrontContext(confirmed,current.current),snapshot=current.current.recognitionSnapshot,front=snapshot?.frontDesk
            restored.rawSaveTarget=confirmRawSaveTarget(current.current.rawSaveTarget,beforeContext,confirmed,memberId)
            if(snapshot&&front&&front.context.id===contextId)restored.recognitionSnapshot={...snapshot,frontDesk:{...front,context:confirmed}}
            await persist(restored);return
          }
        }catch{/* Only an exact confirmed context can repair a lost acknowledgement. */}
      }
      if(mounted.current&&epoch===workEpoch.current)setError(e instanceof Error?e.message:'记录对象尚未确认，原内容仍保留，请重试')
    }
    finally{subjectConfirming.current=false;pending.current=false;if(mounted.current)setBusy(false)}
  }
  const subjectConfirmation=subjectPending&&review?.items.length||contextSubjectPending?((contextSubjectPending?contextSubjectCanConfirm:subjectCanConfirm)?<HohoButton variant="text" size="small" disabled={busy||jobBusy||voice.busy||!!localStage||dialogueBusy} onClick={()=>void confirmSubject()}>这是{memberName||'当前孩子'}的记录</HohoButton>:<p className="hoho-text-caption" role="status">这份资料的对象与当前成员不一致，请切换到对应成员后继续。</p>):null
  const pickFiles=(files:FileList|null,origin:'capture'|'library'='library')=>{
    if(!files?.length)return
    const selected=Array.from(files).map(file=>{
      if(file.type)return file
      const extension=file.name.split('.').pop()?.toLowerCase(),mime:Record<string,string>={pdf:'application/pdf',mp4:'video/mp4',mov:'video/quicktime',webm:'video/webm',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',heic:'image/heic',heif:'image/heif'}
      return mime[extension??'']?new File([file],file.name,{type:mime[extension!],lastModified:file.lastModified}):file
    })
    const videos=selected.filter(file=>file.type.startsWith('video/'))
    if(home&&videos.length){
      if(selected.length!==1||!['video/mp4','video/quicktime','video/webm'].includes(videos[0].type)){setError('请单独选择一段 MP4、MOV 或 WebM 视频');return}
      if(videos[0].size>100*1024*1024){setError('视频超过100MB，请裁剪后重新选择');return}
      setError('');setIncomingVideo({id:crypto.randomUUID(),file:videos[0],origin});return
    }
    if(selected.some(file=>!['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'].includes(file.type))){setError('请选择照片、PDF 文件或 MP4、MOV、WebM 视频');return}
    const next=[...current.current.files,...selected]
    if(next.length>12||next.reduce((sum,f)=>sum+f.size,0)>15*1024*1024){setError('最多12份原件，总大小15 MB');return}
    setLocalStage('uploading')
    const turn:CaptureTurn={continuationId:home?current.current.frontContextId:current.current.resumeContextId,answerTo:questionTarget(),...turnIntent(),id:crypto.randomUUID(),text:'',at:Date.now(),kind:'image',role:'user',fileKeys:selected.map(fileIdentity),status:'pending'}
    void persist({...current.current,rawSaveTarget:undefined,...(!page||eventId?{smartReview:current.current.smartReview?{...current.current.smartReview,state:'changed'}:undefined}:{}),files:next,conversationTurns:[...current.current.conversationTurns??[],turn]}).then(()=>submitTurn(turn)).catch(()=>undefined)
  }
  async function acknowledgeSave(saved:SmartRecordDraft){
    const guides=savedRecordGuides(saved,memberId,memberName)
    if(!guides.length)throw new Error('保存结果尚未确认，请重试原草稿')
    await acknowledgeGuides(guides,saved.result?.count??0,saved.id)
  }
  async function acknowledgeGuides(guides:SavedRecordGuide[],count:number,draftId?:string,raw=false){
    if(followupReturn&&eventId)guides=guides.map(guide=>({...guide,text:'已保存，可在症状跟进的变化过程查看。'}))
    completedGuideIds.current=new Set(guides.map(guide=>guide.id))
    await writes.current
    const savedContextId=current.current.frontContextId
    if(draftId&&page&&!eventId&&savedContextId)await request(`${frontUrl}/contexts/${savedContextId}`,'POST',{draftId})
    if(page||conversational){
      if(home){followScroll.current=true;followingUntil.current=performance.now()+450;setShowJump(false)}
      await persist({...current.current,rawSaveTarget:undefined,nursingInterview:undefined,followUpEnabled:false,text:'',files:raw?[]:current.current.files.filter(file=>file===current.current.pendingVoice),...(raw?{pendingVoice:undefined,rawSavedGuide:undefined}:{}),smartReview:undefined,aiDraftId:undefined,recognitionJobId:undefined,recognitionSnapshot:undefined,recognitionAssets:undefined,...(eventId?{conversationTurns:[],capturedAt:undefined}:{}),savedGuides:[...(current.current.savedGuides??[]),...guides.filter(guide=>!current.current.savedGuides?.some(old=>old.id===guide.id))]})
      hiddenTurns.current.clear()
      setStage('conversation');setStatus('');setCompleted(!home)
    }else await captureDraft(key,null)
    onSaved?.(`已保存 ${count} 条记录`)
    if(onCaptured&&guides[0])onCaptured(guides[0].eventId)
    else if(!conversational&&!page)onClose()
  }
  async function finishRawSave(source:CaptureDraft,guide:SavedRecordGuide){
    const jobId=source.recognitionJobId
    if(jobId){const command={id:`raw-save:${jobId}`,type:'discard' as const},commandKey=`${key}:cancel:${jobId}`;await captureDraft(commandKey,{...freshDraft(),text:'',files:[],recognitionJobId:jobId,pendingRecognitionCommand:command});try{await recognitionCommand(memberId,credentials.current,jobId,'discard',command.id);await captureDraft(commandKey,null)}catch{/* Next open retries the durable cancellation. */}}
    await acknowledgeGuides([guide],1,undefined,true)
  }
  useEffect(()=>{
    const guide=local.rawSavedGuide
    if(!ready||!guide||rawFinalizing.current||completed)return
    rawFinalizing.current=true;pending.current=true;setBusy(true)
    void finishRawSave(current.current,guide).catch(()=>setError('原话已保存，点击查看即可打开。')).finally(()=>{rawFinalizing.current=false;pending.current=false;if(mounted.current)setBusy(false)})
  },[ready,local.rawSavedGuide?.id])
  async function saveOriginal(){
    if(!ready||pending.current||busy||jobBusy||localStage||voice.busy)return
    const originalSource=current.current,context=originalSource.recognitionSnapshot?.frontDesk?.context,target=originalSource.rawSaveTarget
    if(page&&!eventId&&!originalSource.rawSavedGuide){
      if(!rawSaveTargetMatches(target,context,memberId)&&!rawReceiptRecovery){
        if(!rawCanOffer||!context?.version)return
        await persist({...originalSource,rawSaveTarget:{memberId,contextId:context.id,contextVersion:context.version,originalsVersion:context.originalsVersion??0,state:'requested'}});return
      }
      if(!rawSubjectConfirmed&&!rawReceiptRecovery)return
      if(target?.state==='failed'){await persist({...originalSource,rawSaveTarget:{...target,state:'requested'}});return}
    }
    pending.current=true;setBusy(true);setError('')
    const source=current.current,jobId=source.recognitionJobId
    let guide=source.rawSavedGuide
    try{
      await writes.current.catch(()=>undefined)
      if(!guide){
        let savedContext:FrontContext|undefined
        if(page&&!eventId){
          const target=source.rawSaveTarget
          if(!target||target.memberId!==memberId)throw new Error('请先确认这份记录属于谁。')
          await persist({...current.current,rawSaveTarget:{...target,state:'saving'}})
          const result=await request<{savedDraft:SmartRecordDraft;context:FrontContext}>(`${frontUrl}/contexts/${target.contextId}`,'POST',{action:'save_original',expectedVersion:target.contextVersion,confirmed:true})
          guide=savedRecordGuides(result.savedDraft,memberId,memberName)[0]
          if(result.savedDraft.state!=='saved'||!guide)throw new Error('保存结果尚未确认，原件仍保留，请重试')
          savedContext=result.context
        }else{
          const inputs=source.recognitionSnapshot?.inputStates?.map(input=>input.text).filter(Boolean)??[]
          const text=[source.text,...inputs.filter(text=>!source.text.includes(text))].filter(Boolean).join('\n'),files=source.files
          const result=await caseService.capture(memberId,credentials.current,{requestId:`raw:${jobId??source.requestId}`,followUp:Boolean(eventId),text,files:await Promise.all(files.map(async file=>({name:file.name,mimeType:file.type,dataUrl:await fileDataUrl(file)}))),occurredAt:source.capturedAt??new Date().toISOString(),timeUnknown:true,identity:files.some(file=>!file.type.startsWith('audio/'))?'pending':'parent',...(eventId?{eventId}:{}),journal:{categories:['other'],timePrecision:'unknown'}})
          guide={id:`raw:${result.recordId}`,memberId,eventId:result.eventId,recordId:result.recordId,category:'other',text:'原话已保存，可在健康随记查看。',at:Date.now()}
        }
        // Formal-save acknowledgement is checkpointed before any cancellation
        // or source cleanup. Reopening finalizes this result, never saves twice.
        rawFinalizing.current=true
        await persist({...source,...(savedContext?{frontContextId:savedContext.id,frontContextVersion:savedContext.version,frontSubject:savedContext.subject}:{}),rawSavedGuide:guide,...(savedContext?{conversationTurns:source.conversationTurns?.map(turn=>{const accepted=savedContext.operationReceipts?.some(receipt=>receipt.state==='saved'&&receipt.type==='save_original'&&receipt.savedDraft.state==='saved'&&receipt.recordIds.includes(guide!.recordId)&&receipt.sourceMessageIds?.includes(turn.id));return accepted&&turn.role!=='assistant'&&turn.status==='failed'?{...turn,status:'completed' as const}:turn})}:{})})
      }
      await finishRawSave(source,guide)
    }catch(e){if(!guide&&source.rawSaveTarget&&current.current.rawSaveTarget?.contextId===source.rawSaveTarget.contextId)await persist({...current.current,rawSaveTarget:{...source.rawSaveTarget,state:'failed'}}).catch(()=>undefined);if(mounted.current)setError(guide?'原话已保存，点击查看即可打开。':e instanceof Error?e.message:'原话未保存，内容仍保留，请重试')}
    finally{rawFinalizing.current=false;pending.current=false;if(mounted.current)setBusy(false)}
  }
  useEffect(()=>{
    if(local.rawSaveTarget?.state==='requested'&&(rawIntentMatches&&rawSubjectConfirmed||rawReceiptRecovery)&&!busy&&!jobBusy&&!localStage&&!voice.busy&&!pending.current)void saveOriginal()
  },[ready,local.rawSaveTarget,rawIntentMatches,rawSubjectConfirmed,rawReceiptRecovery,busy,jobBusy,localStage,voice.busy])
  async function viewSavedRecord(guide:SavedRecordGuide){
    if(openingRecord.current||pending.current||guide.memberId!==useAppStore.getState().currentMemberId)return
    const epoch=workEpoch.current
    openingRecord.current=true;pending.current=true;setBusy(true);setStatus('正在打开记录…');setError('')
    let checkpointed=false
    try{
      await initialization.current
      if(voice.state==='listening'||voice.state==='requesting')voice.stop()
      // Recorder finalization registers a durable byte write synchronously.
      // Await that write and all queued edits before permitting this exact route.
      await captureDraft(key);await writes.current;assertWork(epoch)
      await persist({...current.current,returningFromRecord:true,returnScrollTop:scrollBody.current?.scrollTop??0})
      checkpointed=true;assertWork(epoch)
      const records=await request<{id:string;occurredAt:string;journal?:Parameters<typeof journalOccurrenceAt>[0] & {timePrecision?:string}}[]>(`/api/events/${encodeURIComponent(guide.eventId)}/records`,'GET')
      const record=records.find(item=>item.id===guide.recordId)
      if(!record)throw new Error('记录暂不可访问')
      assertWork(epoch)
      let destination:string
      if(followupReturn&&eventId){
        const params=new URLSearchParams({memberId,eventId,recordId:guide.recordId})
        destination=`/cases?${params}`
      }else if(guide.sectionId&&guide.entryId)destination=savedRecordUrl(guide)
      else{
        const day=record.journal?.timePrecision==='unknown'?null:getLocalDateKey(journalOccurrenceAt(record.journal,record.occurredAt))
        const params=new URLSearchParams({memberId,eventId:guide.eventId,recordId:guide.recordId,view:'month',...(day?{day,month:day.slice(0,7)}:{})})
        destination=`/health-events?${params}`
      }
      recordDestination.current={url:destination,identity:`${accountId}:${memberId}`}
      navigate(destination,{state:{calendarIdentity:`${accountId}:${memberId}`,frontDeskReturn:true}})
    }catch{recordDestination.current=undefined;if(mounted.current&&epoch===workEpoch.current)setError(checkpointed?'这条记录已不存在或暂不可访问':'当前对话尚未保存在本机，请重试查看记录')}
    finally{openingRecord.current=false;pending.current=false;if(mounted.current){setBusy(false);setStatus('')}}
  }
  function downloadRecord(turn:CaptureTurn){
    const result=turn.operationResult
    if(memberId!==useAppStore.getState().currentMemberId||accountId!==(useAppStore.getState().authUser?.id??'guest')||result?.state!=='completed'||result.type!=='export'||!result.fileName||!result.text)return
    const href=URL.createObjectURL(new Blob([result.text],{type:'text/plain;charset=utf-8'})),link=document.createElement('a')
    link.href=href;link.download=result.fileName;link.click();setTimeout(()=>URL.revokeObjectURL(href),1000)
  }
  async function save(){
    if(pending.current||!canSave||!review||jobBusy)return
    pending.current=true;setBusy(true);setError('');setStatus('正在保存…');let saved=review
    try{
      await writes.current
      const changes:Record<string,unknown>[]=[]
      if(home)changes.push({followUp:false})
      for(const itemId of review.deletedItemIds??[])changes.push({deleteItem:itemId})
      for(const item of review.items){
        if(item.userAdded){changes.push({addItem:{id:item.id,category:item.category,text:item.fields[0].value,title:item.title,timeText:item.timeText,subjectConfirmation:item.manualSubjectConfirmation}});continue}
        if(item.titleChanged)changes.push({itemId:item.id,field:'title',value:item.title})
        if(item.categoryChanged)changes.push({itemId:item.id,category:item.category})
        if(item.categoriesChanged)changes.push({itemId:item.id,visibilityCategories:item.visibilityCategories})
        if(item.timeChanged)changes.push({itemId:item.id,field:'time',value:item.timeText})
        for(const field of item.fields.filter(f=>f.editedBy==='user'))changes.push({itemId:item.id,field:field.name,value:field.value})
      }
      if(changes.length)saved=await request<SmartRecordDraft>(`${url}/${saved.id}`,'PATCH',{version:saved.version,changes})
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
  const conversationFooter=<DialogueComposer variant={home?'conversation':'default'} initialTyping={Boolean(local.conversationInput?.trim())} placeholder={home?'说说你的情况…':undefined} expandedFeedback liveTranscript={home?voice.liveText:undefined} liveStatus={voice.liveUnavailable?'实时文字暂不可用，松开后完整转写':'正在听你说'} feedbackHint={home?(voice.liveUnavailable?'录音继续，松开后整理':'边说边显示文字，松开后整理'):'松开后显示文字'} discardOnBlur={!page} directPhoto={page} text={local.conversationInput??''} onTextChange={conversationInput=>change({conversationInput})} maxLength={5000} disabled={!ready||pending.current||completed||!!resumeChoices||exitOpen||!!local.rawSavedGuide} voiceDisabled={!!local.rawSavedGuide} allowTextWhileProcessing audioLevel={voice.audioLevel} requesting={voice.state==='requesting'} listening={voice.state==='listening'} processing={voice.state==='transcribing'} onStart={()=>{void voice.start()}} onStop={voice.stop} onDiscard={voice.discard} onPhoto={source=>({camera,album,video:videoCamera,file:filePicker}[source]).current?.click()} onSend={()=>void sendText()}/>
  const saveBlocked=busy||jobBusy||!!localStage||voice.busy||!canSave||!review?.items.length||!!review.documentWarnings?.length||!!review.unmappedRows?.length||review.sources?.some(s=>s.status==='uncertain')
  const reviewFooter=<div className="smart-record-review-footer">
    {subjectConfirmation}
    {!!saveBlocked&&!busy&&Boolean(review?.items.length)&&<p role="status">{review?.inputText!==local.text||review?.state!=='ready'?'内容有更新，请返回对话重新整理后再保存。':subjectPending?'请先确认这份记录属于谁。':local.pendingVoice?'录音仍需处理，请返回对话。':review?.documentWarnings?.length||review?.unmappedRows?.length||review?.sources?.some(s=>s.status==='uncertain')?'有资料尚需核对，请返回对话查看提示。':'请先确认每条记录的发生时间；不记得也可以填写。'}</p>}
    <HohoButton fullWidth loading={busy} disabled={!!saveBlocked} onClick={()=>void save()}>保存</HohoButton>
    {!page&&<HohoButton fullWidth variant="text" disabled={busy} onClick={()=>setStage('conversation')}>返回对话继续补充</HohoButton>}
  </div>
  const footer=resumeChoices||(completed&&!home)?undefined:stage==='review'?reviewFooter:conversationFooter
  async function enableSavedFollowup(guide:SavedRecordGuide){
    if(trackingLock.current||guide.memberId!==useAppStore.getState().currentMemberId)return
    trackingLock.current=true;setTrackingEvent(guide.eventId);setError('')
    try{
      await caseService.enableTracking(guide.memberId,credentials.current,guide.eventId,guide.recordId)
      if(!mounted.current||guide.memberId!==useAppStore.getState().currentMemberId||accountId!==useAppStore.getState().authUser?.id)return
      await persist({...current.current,savedGuides:current.current.savedGuides?.map(saved=>saved.eventId===guide.eventId?{...saved,followUpEnabled:true}:saved)})
    }catch{if(mounted.current)setError('跟进尚未确认，请重试。已保存的记录仍然保留。')}
    finally{trackingLock.current=false;if(mounted.current)setTrackingEvent(null)}
  }
  const savedBubble=(guide:SavedRecordGuide)=><NurseMessage conversation={home} key={guide.id} role="assistant"><div className="smart-record-saved" data-save-id={guide.id}><p><Check size={18} aria-hidden="true"/>{guide.text.replace('已保存，可在健康日历查看。','已记好，可在健康随记查看。')}</p>{!guide.dismissed&&<><div className="smart-record-saved-actions"><HohoButton disabled={busy} onClick={()=>void viewSavedRecord(guide)}>查看记录</HohoButton><HohoButton variant="secondary" disabled={busy} onClick={()=>change({savedGuides:dismissSavedRecordGuide(current.current.savedGuides??[],guide.id)})}>知道了</HohoButton></div>{!home&&guide.category==='symptom'&&(guide.followUpEnabled?<span className="hoho-text-caption" role="status">症状跟进已启用</span>:<HohoButton variant="text" size="small" disabled={busy||trackingEvent!==null} loading={trackingEvent===guide.eventId} onClick={()=>void enableSavedFollowup(guide)}>启用症状跟进</HohoButton>)}</>}</div></NurseMessage>
  const visibleTurns:(CaptureTurn & {savedGuide?:SavedRecordGuide})[]=[...(local.conversationTurns??(local.text?[{id:'legacy',text:local.text}]:[])),...(local.savedGuides??[]).filter(guide=>guide.memberId===memberId).map(guide=>({id:guide.id,text:'',at:guide.at,savedGuide:guide}))]
  const recordActions=(turn?:CaptureTurn)=>{
    if(home)return null
    const stale=Boolean(turn&&turn.id!==(job?.frontDesk?.replyId??local.conversationTurns?.filter(item=>item.role==='assistant').at(-1)?.id))
    if(completed||stale||jobBusy||localStage||dialogueBusy)return null
    const count=review?.items.length??0
    const interview=local.nursingInterview
    const answering=interview?.status==='asking'&&interview.question
    const answerDisabled=!ready||busy||voice.busy||dialogueBusy||jobBusy||Boolean(localStage)
    const disabled=answerDisabled||!canSave||Boolean(turn?.reviewId&&turn.reviewId!==review?.id)
    if(!count&&!interview?.question?.options.length)return null
    if(answering&&interview.question!.options.length){
      const options=interview.question!.options,unknown=options.find(option=>option.label==='没注意')
      const choices=home&&options.length>4?[...options.filter(option=>option!==unknown).slice(0,3),unknown??options[3]]:options
      return <div className="smart-record-actions"><div className="smart-interview-options" aria-label="回答当前问题">{choices.map(option=><HohoButton key={option.value} variant="secondary" disabled={answerDisabled} onClick={()=>void sendText(option.value)}>{option.label}</HohoButton>)}</div></div>
    }
    const finish=()=>count&&canSave&&!saveBlocked?void save():void sendText('先按已经说过的情况记录，不再追问。')
    return <div className="smart-record-actions">
      {count>0&&<div className="smart-record-summary-list">{review!.items.map(item=><ProfessionalRecordSummary key={item.id} item={item} document={home}/>)}</div>}
      {subjectConfirmation}
      {count>0?<div className="smart-record-action-buttons" aria-label="记录操作">
        <HohoButton fullWidth variant="secondary" disabled={answerDisabled||Boolean(saveBlocked)} loading={busy} onClick={()=>void save()}>立即保存</HohoButton>
        <HohoButton fullWidth variant="secondary" disabled={disabled} onClick={()=>setStage('review')}>核对记录</HohoButton>
      </div>:<HohoButton fullWidth variant="secondary" disabled={answerDisabled} loading={busy} onClick={finish}>先记下来</HohoButton>}
    </div>
  }
  const [homeNotice,setHomeNotice]=useState('')
  const newConversation=async()=>{
    if(!ready||busy||dialogueBusy||jobBusy||localStage||voice.busy||pending.current)return
    pending.current=true;setBusy(true);setError('');workEpoch.current++;uploadAbort.current?.abort()
    try{
      await initialization.current;await writes.current
      const previous=current.current
      if(hasCaptureContent(previous)||previous.conversationTurns?.length)await captureDraft(`${key}:retained:${Date.now()}:${previous.requestId}`,{...previous,archivedConversation:true})
      // Closing a session preserves server originals and formal records.
      await request(frontUrl,'DELETE')
      await persist(freshDraft())
      hiddenTurns.current.clear();liveVoicePreview.current.clear();completedGuideIds.current.clear();setShowJump(false);setCompleted(false);setStage('conversation');setOriginalsNeedReview(false);voice.clearError();setStatus('');setHomeNotice('已开始新对话，之前的内容可在右上角的「之前对话」中查看。');followScroll.current=true;scrollOpened.current=false
    }catch{setError('新对话尚未建立，原内容仍然保留，请重试。')}
    finally{pending.current=false;setBusy(false)}
  }
  const shareProduct=async()=>{
    try{
      const data={title:'Hoooho · 护护',text:'孩子的情况，随手记清楚。',url:new URL('/nurse-station',window.location.origin).href}
      if(navigator.share)await navigator.share(data)
      else{await navigator.clipboard.writeText(data.url);setHomeNotice('护护的产品链接已复制。')}
    }catch(e){if(!(e instanceof DOMException&&e.name==='AbortError'))setHomeNotice('暂时无法分享，请复制浏览器中的产品地址。')}
  }
  async function openHistory(){
    if(!ready||busy||dialogueBusy||jobBusy||localStage||voice.busy||pending.current)return
    await writes.current
    allowLeave.current=true;navigate('/conversation-history')
  }
  const homeActions=<><HohoButton variant="text" size="icon" aria-label="快速查找" onClick={()=>navigate('/quick-search')}><Search size={22} strokeWidth={1.8} aria-hidden="true" /></HohoButton><ConversationMenu disabled={!ready||busy||dialogueBusy||jobBusy||!!localStage||voice.busy||!!resumeChoices} onNew={()=>void newConversation()} onHistory={()=>void openHistory()} onShare={()=>void shareProduct()} onAbout={()=>navigate('/about')}/></>
  async function openRecordEntry(category:JournalCategory,kind?:DietRecordKind){
    if(openingRecord.current)return
    openingRecord.current=true
    try{
      await persist({...current.current,returningFromRecord:true,returnScrollTop:scrollBody.current?.scrollTop??0})
      if(!mounted.current||voiceBusy.current||accountId!==useAppStore.getState().authUser?.id||memberId!==useAppStore.getState().currentMemberId)return
      navigate('/health-events',{state:{nurseRecordEntry:category,nurseRecordDietKind:kind,calendarIdentity:`${accountId}:${memberId}`,frontDeskReturn:true}})
    }catch{if(mounted.current)setError('当前内容暂未保存，请重试记录入口。')}
    finally{openingRecord.current=false}
  }
  const homeShortcuts=<RecordEntryActions conversation disabled={!ready||busy||voice.busy} identity={`${accountId}:${memberId}`} onSmartRecord={()=>undefined} onRecord={(category,kind)=>void openRecordEntry(category,kind)}/>
  const savedOperationReply=Boolean(job?.frontDesk&&completedFrontSaveReplyIds(job.frontDesk.context).has(job.frontDesk.replyId))
  const timeline=visibleTurns.filter(turn=>!turn.completedOperation).filter(turn=>completed?Boolean(turn.savedGuide&&completedGuideIds.current.has(turn.savedGuide.id)):Boolean((home||page&&!eventId)&&turn.savedGuide)||!turn.savedGuide&&(home||turn.id!==job?.frontDesk?.replyId)&&(!page||!hiddenTurns.current.has(turn.id))).sort((a,b)=>(a.at??0)-(b.at??0))
  useEffect(()=>{
    if(!home)return
    if(!local.frontContextId){setContinuousCard(null);return}
    const contextId=local.frontContextId,scope=++cardScope.current
    let active=true
    void request<ContinuousCard>(`${frontUrl}/contexts/${contextId}`,'POST',{action:'current_card'}).then(card=>{
      if(active&&scope===cardScope.current&&current.current.frontContextId===contextId&&card.version>=(current.current.frontContextVersion??0))setContinuousCard(card)
    }).catch(()=>undefined)
    return()=>{active=false}
  },[home,key,local.frontContextId,local.frontContextVersion,local.recognitionSnapshot?.seq])
  async function cardAction(action:string,input:Record<string,unknown>={}){
    const card=continuousCard,epoch=workEpoch.current
    if(!card||cardBusy)throw Error('请稍后重试')
    setCardBusy(true);setError('')
    try{
      const url=`${frontUrl}/contexts/${card.contextId}`
      let result:ContinuousCard
      try{result=await request<ContinuousCard>(url,'POST',{action,expectedVersion:card.version,...input})}
      catch(error){
        if(action!=='save_current'||!(error instanceof ApiRequestError)||error.code!=='FRONT_CONTEXT_CHANGED')throw error
        const latest=await request<ContinuousCard>(url,'POST',{action:'current_card'})
        assertWork(epoch)
        // A dialogue checkpoint may advance the version without changing any
        // evidence. Retry only that same acknowledged content, never new input
        // or a newer manual revision, and never blindly retry a storage error.
        if(current.current.frontContextId!==card.contextId||latest.sourceSignature!==card.sourceSignature||latest.editRevision!==card.editRevision)throw error
        result=await request<ContinuousCard>(url,'POST',{action,expectedVersion:latest.version,...input})
      }
      assertWork(epoch)
      if(current.current.frontContextId!==result.contextId)throw Error('记录对象或事项已有变化')
      if(result.version<(current.current.frontContextVersion??0))throw Error('记录单已有更新，请查看最新内容')
      setContinuousCard(result)
      await persist({...current.current,frontContextVersion:result.version})
      return result
    }finally{if(mounted.current)setCardBusy(false)}
  }
  async function saveCurrentCard(){try{await cardAction('save_current',{confirmed:true});window.dispatchEvent(new Event('hoooho-data-changed'));onSaved?.('已记录')}catch(e){setError(e instanceof Error?e.message:'保存未完成，内容仍保留')}}
  async function editCurrentCard(input:{text:string;title:string;occurredAt:string;expectedVersion:number}){
    const result=await cardAction('edit_current',input)
    const feedback=result.feedback??{id:`edit-feedback:${result.contextId}:${result.version}`,text:'内容已修改'}
    await persist({...current.current,nursingInterview:undefined,...(result.recognitionJob?{recognitionJobId:result.recognitionJob.id,recognitionSnapshot:result.recognitionJob}:{}),conversationTurns:[...(current.current.conversationTurns??[]).filter(turn=>turn.id!==feedback.id),{...feedback,role:'assistant',at:Date.now(),status:'completed',contextId:result.contextId}]})
  }
  async function viewCurrentCard(){
    const saved=continuousCard?.saved
    if(!saved||!saved.available){setError('这条记录已删除或暂不可访问');return}
    await viewSavedRecord({id:`continuous:${saved.recordId}`,memberId,eventId:saved.eventId,recordId:saved.recordId,category:saved.category,...saved.profileEntries?.[0],text:'已记录',at:Date.parse(saved.at)})
  }
  async function openChecklist(){
    if(!continuousCard){setHomeNotice('先说说需要记录的情况。');return}
    if(continuousCard.checklist?.version===continuousCard.evidenceVersion){setChecklistOpen(true);return}
    try{await cardAction('visit_checklist');setChecklistOpen(true)}catch(e){setError(e instanceof Error?e.message:'清单未生成，请重试')}
  }
  const currentCardDisabled=cardBusy||Boolean(continuousCard&&continuousCard.version<(local.frontContextVersion??0))
  const currentCardProps=continuousCard?{card:continuousCard,editDraft:local.frontCardEdit,onEditDraft:(frontCardEdit:import('./ContinuousRecordCard').ContinuousCardEdit|undefined)=>change({frontCardEdit}),disabled:currentCardDisabled,onEdit:editCurrentCard,onSave:()=>void saveCurrentCard(),onView:()=>void viewCurrentCard()}:null
  const topEntries=home&&<nav className="front-desk-top-entries" aria-label="当前记录入口"><button type="button" onClick={()=>continuousCard?setRecordOpen(true):setHomeNotice('先说说需要记录的情况。')}>症状记录单</button><button type="button" disabled={cardBusy} onClick={()=>void openChecklist()}>{continuousCard?.checklist?'就诊清单':'一键整理'}</button></nav>
  const processingLabel=localStage==='uploading'?'接收中':localStage==='converting'||job?.stage==='converting'||job?.stage==='transcribing'?'转写中':job?.stage==='reading'?'读图中':['organizing','publishing'].includes(job?.stage??'')?'整理中':'理解中'
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
    </div> : stage==='review'&&review ? <SmartRecordReview review={review} memberId={memberId} memberName={memberName||'当前成员'} disabled={busy||voice.busy} error={error} onChange={smartReview=>change({smartReview})}/> : <div className="nurse-conversation" aria-label="本次对话">
      {!page&&<p className="hoho-text-caption">记录对象：{memberName || '当前孩子'}{eventTitle ? ` · 正在补充：${eventTitle}` : ''}</p>}
      {!completed&&!home&&<NurseMessage role="assistant"><p>{greeting}</p></NurseMessage>}
      {timeline.map((turn,index)=><Fragment key={turn.id}>
        {home&&showConversationTime(turn.at,timeline[index-1]?.at)&&<time className="conversation-time" dateTime={conversationTime(turn.at)!.iso}>{conversationTime(turn.at)!.label}</time>}
        {turn.savedGuide?savedBubble(turn.savedGuide):<NurseMessage conversation={home} messageId={turn.id} key={turn.id} role={turn.role??'user'} recorderName={recorderName}>{turn.text||liveVoicePreview.current.get(turn.id)?<p>{turn.text||liveVoicePreview.current.get(turn.id)}</p>:home&&turn.kind==='voice'?<div className="front-desk-voice-original"><Mic size={18} aria-hidden="true"/><span>{turn.status==='failed'?'语音消息':turn.status==='completed'?'语音记录':'语音 · 正在转写'}</span></div>:null}{turn.operationResult?.type==='export'&&<HohoButton variant="text" size="small" onClick={()=>downloadRecord(turn)}>下载记录</HohoButton>}{turn.role==='assistant'&&!turn.operationResult&&recordActions(turn)}{turn.fileKeys?.map(id=>visibleMedia.current.get(id)).filter((f):f is File=>!!f&&!f.type.startsWith('audio/')).map(file=><RecordMedia key={fileIdentity(file)} file={file}/>)}{turn.status==='transcribing'&&<p role="status">正在识别语音…</p>}{turn.status==='pending'&&!job&&<p role="status">正在提交这条消息…</p>}{turn.status==='failed'&&<>{home?<p role="alert">{turn.error||job?.error?.message||'这次没接上回复，可以继续补充或保存记录。'}</p>:<p role="alert">{turn.kind==='image'?(turn.errorCode==='FRONT_IMAGE_PROCESSING_FAILED'||turn.errorCode==='FILE_READ_FAILED'?'图片处理失败':'图片对话未完成'):turn.kind==='voice'?'转写文字的对话发送未完成':'文字对话发送未完成'}：{turn.error||'连接中断'}。原内容已保留。</p>}<HohoButton variant="secondary" disabled={dialogueBusy||busy} onClick={()=>void submitTurn({...turn,status:'pending',error:undefined}).catch(()=>undefined)}>重试这条消息</HohoButton><HohoButton variant="secondary" disabled={dialogueBusy||busy} onClick={()=>void discardTurn(turn)}>移除这条未成功的消息</HohoButton>{!job&&<HohoButton variant="secondary" disabled={dialogueBusy||busy||!rawSubjectConfirmed} onClick={()=>void saveOriginal()}>先保存原话</HohoButton>}</>}</NurseMessage>}
      </Fragment>)}
      {!job&&(!page||eventId)&&!!local.files.filter(f=>!f.type.startsWith('audio/')).length&&<NurseMessage conversation={home} role="user" recorderName={recorderName}>{local.files.filter(f=>!f.type.startsWith('audio/')).map((file,i)=><div key={`${file.name}:${i}`} className="dialogue-file"><span>{file.name}</span><HohoButton variant="text" aria-label={`移除图片${i+1}`} disabled={busy||voice.busy} onClick={()=>change({files:local.files.filter(f=>f!==file),smartReview:review?{...review,state:'changed'}:undefined})}><X size={16}/></HohoButton></div>)}</NurseMessage>}
      {local.rawSavedGuide&&<NurseMessage conversation={home} role="assistant"><p>{local.rawSavedGuide.text}</p><HohoButton onClick={()=>void viewSavedRecord(local.rawSavedGuide!)}>查看记录</HohoButton></NurseMessage>}
      {home&&local.conversationTurns?.some(turn=>turn.role==='user'&&turn.status==='pending'&&!local.conversationTurns?.some(reply=>reply.id===`${turn.id}:reply`))&&<NurseMessage conversation role="assistant"><p>收到</p></NurseMessage>}
      {home&&!recordOpen&&continuousCard&&continuousCard.recordable!==false&&<ContinuousRecordCard card={continuousCard} editDraft={local.frontCardEdit} onEditDraft={frontCardEdit=>change({frontCardEdit})} disabled={currentCardDisabled} onEdit={editCurrentCard} onSave={()=>void saveCurrentCard()} onView={()=>void viewCurrentCard()}/>}
      {!home&&!local.rawSavedGuide&&!completed&&!savedOperationReply&&(job||localStage)&&!(home&&(jobBusy||localStage))&&<NurseMessage conversation={home} role="assistant">{jobBusy||!!localStage?<FrontDeskProcessing statusText={processingLabel}/>:job?.frontDesk?.context.messages.find(m=>m.id===job.frontDesk?.replyId)?.text&&<p>{job.frontDesk.context.messages.find(m=>m.id===job.frontDesk?.replyId)?.text}</p>}{contextSubjectPending&&!review?.items.length&&subjectConfirmation}{(!review?.items.length||!['ready','needs_review'].includes(job?.state??'')||!!job?.unresolvedInputs?.length)&&<RecognitionProgress overview onSaveOriginal={rawCanOffer?()=>void saveOriginal():undefined} saveOriginalLabel={frontHasOriginalFiles(rawContext)?'保存原件':'先保存原话'} job={job} localStage={localStage} onCommand={type=>void taskCommand(type)} commandBusy={commandBusy||busy}/>}
      {!jobBusy&&!localStage&&recordActions()}</NurseMessage>}
      {!home&&(!ready||voice.state==='listening'||voice.state==='requesting'||busy)&&!jobBusy&&!localStage&&<NurseMessage conversation={home} role="assistant"><p role="status">{!ready?'我在找回刚才的内容，请稍等。':voice.state==='listening'?'我在听，松开后整理这一段。':voice.state==='requesting'?'正在打开麦克风。':status||'正在保存…'}</p></NurseMessage>}
      {(error||progressError||voice.error)&&<NurseMessage conversation={home} role="assistant"><p role="alert">{error||progressError||voice.error}。你刚才的内容还在，可以再试一次。</p></NurseMessage>}
      {home&&!!job?.unresolvedInputs?.filter(input=>!['FRONT_CONTEXT_CHANGED','FRONT_RECORD_CHANGED'].includes(input.code)).length&&!jobBusy&&<NurseMessage conversation role="assistant"><p>{job.unresolvedInputs.map(input=>input.message).join('；')}</p><HohoButton variant="text" disabled={commandBusy} onClick={()=>void taskCommand('retry')}>{job.unresolvedInputs.every(input=>/ASR|VOICE|AUDIO|TRANSCRI/.test(input.code))?'重试未完成的转写':job.unresolvedInputs.every(input=>/MEDIA|FILE|PDF|IMAGE/.test(input.code))?'重试未完成的附件':'重试未完成的回应'}</HohoButton></NurseMessage>}
      {originalsNeedReview&&<NurseMessage conversation={home} role="assistant"><p>有语音原件无法读取或格式不一致。文字和其他资料还在；可以明确移除问题原件后整理文字，也可以重新录音。</p>{local.files.filter(file=>file.type.startsWith('audio/')).map(file=><HohoButton key={`${file.name}:${file.lastModified}`} variant="text" disabled={busy||voice.busy} onClick={()=>{change({files:current.current.files.filter(f=>f!==file),pendingVoice:current.current.pendingVoice===file?undefined:current.current.pendingVoice,smartReview:review?{...review,state:'changed'}:undefined});setOriginalsNeedReview(false);setError('')}}>移除语音原件：{file.name}</HohoButton>)}</NurseMessage>}
      {local.pendingVoice&&(!home||!job)&&!localStage&&!jobBusy&&<NurseMessage conversation={home} role="assistant"><p>{voice.unreadable?'这份录音已经无法读取，可以移除后重新录音。你说过的文字仍然保留。':'这段录音还在，要我再听一次吗？'}</p>{voice.unreadable?<HohoButton variant="text" disabled={busy||voice.busy} onClick={()=>void persist({...current.current,pendingVoice:undefined,files:current.current.files.filter(file=>file!==current.current.pendingVoice)}).then(()=>{voice.clearError();setError('')}).catch(()=>undefined)}>移除无法读取的录音</HohoButton>:<HohoButton variant="text" disabled={busy||voice.busy} onClick={()=>{const file=current.current.pendingVoice;if(file)void submitTurn({...turnIntent(),id:voiceId(file),text:'',at:file.lastModified,kind:'voice',role:'user',fileKeys:[fileIdentity(file)],status:'pending'})}}>再试一次</HohoButton>}{!voice.unreadable&&<HohoButton variant="text" disabled={busy||voice.busy} onClick={()=>change({pendingVoice:undefined})}>继续用文字补充</HohoButton>}</NurseMessage>}
      {!job&&!page&&!local.conversationTurns?.some(turn=>turn.role==='assistant')&&!!review?.items.length&&<NurseMessage conversation={home} role="assistant">{recordActions()}</NurseMessage>}
      {error&&review?.state==='failed'&&<HohoButton variant="text" disabled={busy||voice.busy||dialogueBusy} onClick={()=>void (job?taskCommand('retry'):prepare())}>重试</HohoButton>}
      {!home&&!!review?.unmappedRows?.length&&<NurseMessage conversation={home} role="assistant"><p>还有这些内容没有整理完整，请补充或更正后让我再试一次：{review.unmappedRows.map(row=>row.text).join('；')}</p></NurseMessage>}
      {!home&&(!!review?.documentWarnings?.length||review?.sources?.some(s=>s.status==='uncertain'))&&<NurseMessage conversation={home} role="assistant"><p>有些资料需要逐页核对，请到健康档案的智能记录继续核对，你的内容会保留。</p></NurseMessage>}


    </div>}
    {completed&&<CaseMergePrompt key={`${accountId}:${memberId}`} focusIds={(local.savedGuides??[]).filter(g=>completedGuideIds.current.has(g.id)).map(g=>g.eventId)}/>}
    {home&&<FrontDeskVideoRecorder key={`${accountId}:${memberId}`} accountId={accountId} memberId={memberId} token={token} incoming={incomingVideo} onIncomingConsumed={id=>setIncomingVideo(value=>value?.id===id?undefined:value)} onSavedGuide={async guide=>{
      if(!mounted.current||useAppStore.getState().authUser?.id!==accountId||useAppStore.getState().currentMemberId!==memberId)throw new Error('记录对象已切换，保存结果保留')
      await persist({...current.current,savedGuides:[...(current.current.savedGuides??[]).filter(item=>item.id!==guide.id),guide]});setError('')
    }}/>}
    {home&&<><input type="file" ref={videoCamera} aria-label="拍摄视频" accept="video/mp4,video/quicktime,video/webm" capture="environment" hidden onChange={e=>{pickFiles(e.target.files,'capture');e.currentTarget.value=''}}/>
    <input type="file" ref={filePicker} aria-label="选择附件文件" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,video/mp4,video/quicktime,video/webm,.pdf,.mp4,.mov,.webm" hidden onChange={e=>{pickFiles(e.target.files);e.currentTarget.value=''}}/></>}
    <input type="file" ref={camera} accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={e=>{pickFiles(e.target.files,'capture');e.currentTarget.value=''}}/>
    <input type="file" ref={album} aria-label="从相册选择" accept={page?'image/jpeg,image/png,image/webp,image/heic,image/heif':'image/jpeg,image/png,image/webp'} hidden multiple onChange={e=>{pickFiles(e.target.files);e.currentTarget.value=''}}/>
  </>
  const close=()=>{if(exiting)return;if(unfinished||voice.busy){voice.stop();setExitError('');setExitOpen(true)}else{allowLeave.current=true;onClose()}}
  const cancelExit=()=>{if(exiting)return;setExitOpen(false);setExitError('');if(blocker.state==='blocked')blocker.reset()}
  const finishExit=async(keepDraft:boolean)=>{
    if(leaving.current)return
    leaving.current=true;workEpoch.current++;uploadAbort.current?.abort();setExiting(true);setExitError('')
    try{
      voice.stop()
      // Wait for raw recording bytes, queued replies and every draft write.
      await initialization.current
      await captureDraft(key)
      await writes.current
      if(keepDraft)await persist(current.current)
      else{
        if(current.current.recognitionJobId){
          const id=current.current.recognitionJobId,command={id:crypto.randomUUID(),type:'discard' as const},commandKey=`${key}:cancel:${id}`
          await captureDraft(commandKey,{...freshDraft(),text:'',files:[],recognitionJobId:id,pendingRecognitionCommand:command})
          try{await recognitionCommand(memberId,credentials.current,id,'discard',command.id);await captureDraft(commandKey,null)}catch{onSaved?.('本机草稿已清除，服务端取消尚未确认，联网后会继续同步')}
        }else if(page&&!eventId)await request(frontUrl,'DELETE')
        for(const retained of await retainedCaptureDrafts(key))await captureDraft(retained.key,null)
        await captureDraft(key,null)
      }
      allowLeave.current=true
      if(blocker.state==='blocked')blocker.proceed();else onClose()
    }catch{leaving.current=false;setExiting(false);setExitError(keepDraft?'草稿保存失败，请重试。当前内容仍在。':'退出未完成，请重试。当前内容仍在。')}
  }
  const exitDialog=<BottomSheetSurface open={exitOpen} viewportAware label="退出智能记录" title="保存这次草稿吗？" onClose={cancelExit} footer={<><HohoButton fullWidth loading={exiting} onClick={()=>void finishExit(true)}>保存草稿并退出</HohoButton><HohoButton fullWidth variant="secondary" disabled={exiting} onClick={()=>void finishExit(false)}>不保存并退出</HohoButton></>}><p>保存后，下次可以接着记录；不保存，下次将重新开始。</p>{exitError&&<p role="alert">{exitError}</p>}</BottomSheetSurface>
  return <>{page||stage==='review' ? <section className={`smart-record-page smart-record-dialog${home?' smart-record-home':''}`} aria-label={stage==='review'?'核对记录':'智能记录'} style={{top:viewport.top,height:viewport.height}}>{home&&stage==='conversation'?<MainAppHeader conversation title="前台" showInstallApp={false} action={homeActions}/>:<WebPageHeader title={stage==='review'?'核对记录':'智能记录'} onBack={()=>stage==='review'?setStage('conversation'):close()}/>}{topEntries}<div ref={scrollBody} onWheel={()=>{if(home)followingUntil.current=0}} onTouchStart={()=>{if(home)followingUntil.current=0}} onScroll={updateJump} className="smart-record-page__body">{home&&stage==='conversation'&&<FrontDeskWelcome memberName={memberName||'当前对象'}/>}{homeNotice&&<p className="front-desk-notice" role="status">{homeNotice}</p>}{body}</div>{home&&showJump&&<div className="front-desk-jump-wrap"><HohoButton size="icon" aria-label="回到最新消息" onClick={()=>{followScroll.current=true;followingUntil.current=performance.now()+450;setShowJump(false);scrollBody.current?.scrollTo({top:scrollBody.current.scrollHeight,behavior:'smooth'})}}><ArrowDown size={20} aria-hidden="true"/></HohoButton></div>}{footer&&<footer className="smart-record-page__footer">{home&&stage==='conversation'&&homeShortcuts}{footer}</footer>}</section> : <BottomSheetSurface open viewportAware size="workspace" className="smart-record-dialog nurse-conversation-sheet" layerClassName="symptom-input-layer" leading={<Stethoscope size={21} aria-hidden="true"/>} dismissText="收起" title="智能记录" label="智能记录" onClose={close} footer={footer}>{body}</BottomSheetSurface>}{exitDialog}{home&&recordOpen&&currentCardProps&&<BottomSheetSurface open viewportAware label="症状记录单" title="症状记录单" onClose={()=>setRecordOpen(false)}><ContinuousRecordCard key={continuousCard!.contextId} {...currentCardProps}/></BottomSheetSurface>}{home&&checklistOpen&&<BottomSheetSurface open viewportAware label="就诊清单" title="就诊清单" onClose={()=>setChecklistOpen(false)}><p className="front-desk-checklist">{continuousCard?.checklist?.text}</p></BottomSheetSurface>}</>
}
