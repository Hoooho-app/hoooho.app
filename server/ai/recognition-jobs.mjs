import {buildFrontDeskFactSources} from './business/front-desk-source-context.mjs'
import {factMessages} from './business/front-desk-semantics.mjs'
import {QuickRecordPhotoService} from '../events/quick-record-photo-service.mjs'
import {reuseRecognitionPhoto} from './recognition-asset-reuse.mjs'
import {withAITrace,traceMetadata,linkedAISignal} from './providers/telemetry.mjs'
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { open, readFile, rename, unlink } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { accountTransaction, withStorageLock } from '../auth/storage/transaction.mjs'
import {registerRecognitionInstance} from './recognition-lifecycle.mjs'
import { fail, fingerprint } from './business/contract.mjs'
import {hasConversationInput} from '../../shared/conversation-input.mjs'
import {frontRecordVersion} from './front-desk-record-targets.mjs'
import fieldLabels from '../../shared/ai-business-field-labels.json' with {type:'json'}

const validId=value=>typeof value==='string'&&/^[A-Za-z0-9:_-]{1,180}$/.test(value)
const unresolved=j=>Object.keys(j.inputErrors??{}).filter(id=>!(j.excludedInputs??[]).includes(id))
const waiting=j=>['queued','running','publishing'].includes(j.state)
const cleanName=value=>String(value||'原件').replace(/[\\/\x00-\x1f]/g,'').slice(0,120)
const snapshotText=snapshot=>snapshot.items.map(item=>[item.title,`发生时间：${item.timeText??'未明确'}`,...item.fields.map(field=>`${fieldLabels[field.name]??'记录'}：${field.value}\n${(field.sources??[]).map(ref=>`来源${snapshot.sources?.find(source=>source.id===ref.sourceId)?.name?`（${snapshot.sources.find(source=>source.id===ref.sourceId).name} 第${ref.page}页）`:''}：「${ref.quote}」`).join('\n')}`)].join('\n')).join('\n\n')
const publicFrontMessage=({originalFiles,mediaPreparation,...message})=>({...message,originalFileCount:originalFiles?.length??message.originalFileCount??0,files:(message.files??[]).map(({dataUrl,...file})=>file),voices:(message.voices??[]).map(({dataUrl,...file})=>file)})
const publicJob=j=>{if(!j)return null;const result=Object.fromEntries(Object.entries(j).filter(([key])=>!['accountId','memberId','inputs','options','owner','leaseUntil','transcripts','cursor','digest','commandIds','draftVersion','outbox','activeMs','baseText'].includes(key)));if(j.frontDesk)result.frontDesk={...j.frontDesk,context:{...j.frontDesk.context,review:j.review??j.frontDesk.context.review,messages:j.frontDesk.context.messages.map(publicFrontMessage)}};result.inputStates=(j.inputs??[]).map((item,index)=>({id:item.id,status:j.inputErrors?.[item.id]?'failed':index<(j.cursor??0)?'completed':'pending',text:j.transcripts?.[item.id]??item.text}));result.unresolvedInputs=unresolved(j).map(id=>({id,...j.inputErrors[id]}));return result}
const mediaTypes=/^(?:application\/pdf|image\/(?:jpeg|png|webp|heic|heif)|audio\/(?:wav|webm|mp4|ogg)(?:;\s*codecs=(?:"[a-z0-9., _-]+"|[a-z0-9.,_-]+))?)$/i

// One SQLite WAL database on the existing persistent volume. It stores task
// metadata/checkpoints; originals are private, immutable binary files. No
// supplier call is held in a SQLite/JSON transaction.
export class RecognitionJobs {
  constructor({dataDirectory,events,business,frontDesk,audio,photos,now=()=>Date.now(),logger=console,autoStart=true}) {
    this.photos=photos??new QuickRecordPhotoService({dataDirectory})
    this.events=events;this.business=business;this.front=frontDesk;this.audio=audio;this.now=now;this.logger=logger
    this.directory=path.join(dataDirectory,'recognition-originals');mkdirSync(this.directory,{recursive:true,mode:0o700})
    this.db=new DatabaseSync(path.join(dataDirectory,'recognition-jobs.sqlite'))
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,account_id TEXT NOT NULL,member_id TEXT NOT NULL,document TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS jobs_owner ON jobs(account_id,member_id);
      CREATE INDEX IF NOT EXISTS jobs_state ON jobs(json_extract(document,'$.state'));
      CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY,account_id TEXT NOT NULL,member_id TEXT NOT NULL,document TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(job_id TEXT NOT NULL,seq INTEGER NOT NULL,document TEXT NOT NULL,PRIMARY KEY(job_id,seq));
      CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY,job_id TEXT NOT NULL,document TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS outbox(job_id TEXT PRIMARY KEY,document TEXT NOT NULL);`)
    const limit=Number(process.env.AI_MAX_CONCURRENT_CALLS??2);this.maxConcurrentJobs=Number.isInteger(limit)&&limit>=1&&limit<=10?limit:2
    this.owner=randomUUID();this.active=new Map();this.waiters=new Map();this.closed=false;this.unregister=registerRecognitionInstance(dataDirectory,this)
    if(this.front){this.front.onManualEdit=(...args)=>this.organizeContext(...args);this.front.onGenerate=(...args)=>this.organizeContext(...args,true)}
    if(autoStart){this.timer=setInterval(()=>this.kick(),1000);this.timer.unref();queueMicrotask(()=>this.kick())}
  }
  raw(id){const row=this.db.prepare('SELECT document FROM jobs WHERE id=?').get(id);return row?JSON.parse(row.document):null}
  all(){return this.db.prepare('SELECT document FROM jobs').all().map(r=>JSON.parse(r.document))}
  put(j,event=true){j.seq=(j.seq??0)+1;j.updatedAt=new Date(this.now()).toISOString();this.db.prepare('INSERT INTO jobs VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document').run(j.id,j.accountId,j.memberId,JSON.stringify(j));if(event){this.db.prepare('INSERT INTO events VALUES(?,?,?)').run(j.id,j.seq,JSON.stringify({state:j.state,stage:j.stage,inputRevision:j.inputRevision,resultRevision:j.resultRevision,at:j.updatedAt}));queueMicrotask(()=>{for(const notify of this.waiters.get(j.id)??[])notify()})}return j}
  transaction(operation){this.db.exec('BEGIN IMMEDIATE');try{const value=operation();this.db.exec('COMMIT');return value}catch(error){this.db.exec('ROLLBACK');throw error}}
  async scope(accountId,memberId){await this.events.assertMemberOwnership(accountId,memberId)}
  owned(accountId,memberId,id){const j=this.raw(id);if(!j||j.accountId!==accountId||j.memberId!==memberId)throw fail('未找到这次识别任务',404,'RECOGNITION_NOT_FOUND');return j}
  waitForUpdate(accountId,memberId,id,afterSeq,waitMs,signal){
    signal?.throwIfAborted()
    return new Promise((resolve,reject)=>{
      let finished=false,timer,checkTimer
      const listeners=this.waiters.get(id)??new Set()
      const finish=error=>{if(finished)return;finished=true;clearTimeout(timer);clearInterval(checkTimer);listeners.delete(check);if(!listeners.size)this.waiters.delete(id);signal?.removeEventListener('abort',aborted);error?reject(error):resolve()}
      const aborted=()=>finish(signal.reason??new DOMException('Request stopped','AbortError'))
      const check=()=>{try{if(this.closed)return finish();const j=this.owned(accountId,memberId,id);if(j.seq>afterSeq||!waiting(j))finish()}catch(error){finish(error)}}
      // Register before re-reading: a completion between the initial GET and
      // this subscription must be observed immediately, never after a timeout.
      listeners.add(check);this.waiters.set(id,listeners)
      timer=setTimeout(()=>finish(),waitMs)
      // Another process or owner-lifecycle cleanup can update the same WAL.
      // These checks read metadata only; they do not retry supplier work.
      checkTimer=setInterval(check,500)
      signal?.addEventListener('abort',aborted,{once:true})
      if(signal?.aborted)aborted();else check()
    })
  }
  async get(accountId,memberId,id,{afterSeq,waitMs=0,signal}={}){await this.scope(accountId,memberId);this.owned(accountId,memberId,id)
    if(afterSeq!==undefined){if(!Number.isSafeInteger(afterSeq)||afterSeq<0||!Number.isFinite(waitMs)||waitMs<0)throw fail('识别任务等待参数无效',422,'RECOGNITION_WAIT_INVALID');if(waitMs>0){await this.waitForUpdate(accountId,memberId,id,afterSeq,Math.min(25000,waitMs),signal);await this.scope(accountId,memberId)}}
    signal?.throwIfAborted();return publicJob(await this.refreshReview(accountId,memberId,id,signal))}
  async refreshReview(accountId,memberId,id,signal){
    // Only the brief ownership/draft snapshot and SQLite cache update hold the
    // storage barrier. Long polling and supplier work never hold this lock.
    return withStorageLock(async()=>{
      signal?.throwIfAborted();await this.scope(accountId,memberId)
      const before=this.owned(accountId,memberId,id)
      if(!before.draftId||!['ready','needs_review'].includes(before.state))return before
      const review=await this.business.read(accountId,memberId,before.draftId).catch(error=>{if(error.code==='AI_DRAFT_NOT_FOUND')return null;throw error})
      signal?.throwIfAborted()
      return this.transaction(()=>{
        const current=this.owned(accountId,memberId,id)
        if(current.seq!==before.seq||current.draftId!==before.draftId||current.inputRevision!==before.inputRevision||current.resultRevision!==before.resultRevision||!['ready','needs_review'].includes(current.state))return current
        if(!review)return this.put({...current,state:'failed',stage:'failed',review:null,error:{code:'AI_DRAFT_NOT_FOUND',message:'整理草稿已到期，原件仍保留，可重新整理'}})
        const frontDesk=current.frontDesk?{...current.frontDesk,context:{...current.frontDesk.context,review}}:current.frontDesk
        if(JSON.stringify(current.review)===JSON.stringify(review)&&(!frontDesk||JSON.stringify(current.frontDesk.context.review)===JSON.stringify(review)))return current
        // A new sequence is necessary even when the input revision did not
        // change: clients use seq to decide whether to apply edited draft data.
        return this.put({...current,review,draftVersion:review.version,frontDesk})
      })
    })
  }
  async latest(accountId,memberId,scopeKey='front'){await this.scope(accountId,memberId);const j=this.all().filter(j=>j.accountId===accountId&&j.memberId===memberId&&j.scopeKey===scopeKey&&j.state!=='discarded').sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];return j?publicJob(await this.refreshReview(accountId,memberId,j.id)):null}
  async upload(accountId,memberId,{buffer,mimeType,name,lastModified=0},{signal,beforeCommit}={}){
    signal?.throwIfAborted()
    await this.scope(accountId,memberId)
    if(!mediaTypes.test(mimeType??'')||!buffer?.length||buffer.length>15*1024*1024)throw fail('原件格式无效或超过15 MB',415,'RECOGNITION_ASSET_INVALID')
    const hash=createHash('sha256').update(buffer).digest('hex'),id=createHash('sha256').update(JSON.stringify([accountId,memberId,hash,mimeType])).digest('hex')
    const existing=this.db.prepare('SELECT document FROM assets WHERE id=?').get(id)
    if(existing){signal?.throwIfAborted();await beforeCommit?.();return this.assetPublic(JSON.parse(existing.document))}
    const file=path.join(this.directory,id),temporary=`${file}.${randomUUID()}.tmp`,handle=await open(temporary,'wx',0o600)
    try{await handle.writeFile(buffer);await handle.sync()}finally{await handle.close()}
    let renamed=false,committed=false
    try{return await withStorageLock(async()=>{
      signal?.throwIfAborted();await this.scope(accountId,memberId);await beforeCommit?.();signal?.throwIfAborted()
      const duplicate=this.db.prepare('SELECT document FROM assets WHERE id=?').get(id);if(duplicate){await unlink(temporary);return this.assetPublic(JSON.parse(duplicate.document))}
      await rename(temporary,file);renamed=true;const directory=await open(this.directory,'r');try{await directory.sync()}catch(error){if(process.platform!=='win32'||!['EPERM','EINVAL','EISDIR'].includes(error.code))throw error}finally{await directory.close()}
      signal?.throwIfAborted()
      const asset={id,accountId,memberId,hash,mimeType,name:cleanName(name),lastModified:Number.isFinite(lastModified)?lastModified:0,bytes:buffer.length,createdAt:new Date(this.now()).toISOString()}
      this.db.prepare('INSERT OR IGNORE INTO assets VALUES(?,?,?,?)').run(id,accountId,memberId,JSON.stringify(asset));committed=true;return this.assetPublic(asset)
    })}catch(error){await unlink(temporary).catch(()=>undefined);if(renamed&&!committed)await unlink(file).catch(()=>undefined);throw error}
  }

  assetPublic({id,hash,mimeType,name,lastModified,bytes}){return {id,hash,mimeType,name,lastModified,bytes}}
  asset(accountId,memberId,id){const row=typeof id==='string'?this.db.prepare('SELECT document FROM assets WHERE id=?').get(id):null,asset=row?JSON.parse(row.document):null;if(!asset||asset.accountId!==accountId||asset.memberId!==memberId)throw fail('原件不属于当前人物',404,'RECOGNITION_ASSET_NOT_FOUND');return asset}
  async materialize(j,ids=[]){return Promise.all(ids.map(async id=>{const a=this.asset(j.accountId,j.memberId,id),buffer=await readFile(path.join(this.directory,a.id));if(createHash('sha256').update(buffer).digest('hex')!==a.hash)throw fail('原件校验失败，请重新上传',503,'RECOGNITION_ASSET_CORRUPT');return {...this.assetPublic(a),dataUrl:`data:${a.mimeType};base64,${buffer.toString('base64')}`}}))}
  async submit(accountId,memberId,input){
    await this.scope(accountId,memberId)
    if(!validId(input.id)||!validId(input.input?.id)||!['front','record','structured','transcription'].includes(input.mode)||!['text','voice','image'].includes(input.input.kind)||typeof input.input.text!=='string'||input.input.text.length>15000)throw fail('识别任务内容无效',422,'RECOGNITION_INVALID')
    const item={id:input.input.id,kind:input.input.kind,text:input.input.text,inputAt:Number.isFinite(input.input.inputAt)?Math.min(input.input.inputAt,this.now()):this.now(),assetIds:input.input.assetIds??[],asrAssetId:input.input.asrAssetId??null}
    if(input.input.presentedDraft!==undefined){const draft=input.input.presentedDraft;if(!draft||!validId(draft.id)||!Number.isSafeInteger(draft.version)||draft.version<1)throw fail('已展示草稿标识无效',422);item.presentedDraft={id:draft.id,version:draft.version}}
    if(input.input.expectedContextVersion!==undefined){if(!Number.isSafeInteger(input.input.expectedContextVersion)||input.input.expectedContextVersion<1)throw fail('对话版本无效',422);item.expectedContextVersion=input.input.expectedContextVersion}
    if(input.input.contextId!==undefined){
      if(input.mode!=='front'||!validId(input.input.contextId))throw fail('对话归属无效',422,'RECOGNITION_CONTEXT_INVALID')
      item.contextId=input.input.contextId
    }
    if(input.input.answerTo!==undefined){
      const target=input.input.answerTo
      if(input.mode!=='front'||!target||!validId(target.contextId)||!validId(target.questionId))throw fail('问题归属无效',422,'RECOGNITION_ANSWER_INVALID')
      item.answerTo={contextId:target.contextId,questionId:target.questionId}
    }
    if(!Array.isArray(item.assetIds)||item.assetIds.length>12)throw fail('原件最多12份',413)
    const originals=item.assetIds.map(id=>this.asset(accountId,memberId,id));if(originals.reduce((n,a)=>n+a.bytes,0)>15*1024*1024)throw fail('原件总大小不能超过15 MB',413)
    if(item.asrAssetId){const a=this.asset(accountId,memberId,item.asrAssetId);if(a.mimeType!=='audio/wav')throw fail('转写音频格式无效',415)}
    if(!hasConversationInput({text:item.text,assetIds:item.assetIds}))throw fail('请先输入内容或上传原件')
    const options=input.options??{};if(input.mode==='front')item.protocolVersion=options.semanticVersion===3?3:options.semanticVersion===2?2:1;if(JSON.stringify(options).length>10000)throw fail('任务参数过长')
    const j=await withStorageLock(async()=>{await this.scope(accountId,memberId);return this.transaction(()=>{
      let job=this.raw(input.id)
      if(job&&(job.accountId!==accountId||job.memberId!==memberId))throw fail('未找到这次识别任务',404,'RECOGNITION_NOT_FOUND')
      if(job?.state==='discarded')throw fail('这次任务已取消，请开始新的记录',409,'RECOGNITION_DISCARDED')
      if(job&&(job.mode!==input.mode||job.scopeKey!==(input.scopeKey??input.mode)))throw fail('任务范围已变化',409,'RECOGNITION_SCOPE_CONFLICT')
      const previous=job?.inputs.find(i=>i.id===item.id)
      if(previous){if(fingerprint({...previous,...(input.mode==='front'?{protocolVersion:previous.protocolVersion??1}:{}),inputAt:0})!==fingerprint({...item,inputAt:0}))throw fail('消息标识已使用，请重试原消息',409,'RECOGNITION_INPUT_CONFLICT');return job}
      if(job?.inputs.length>=60)throw fail('本次对话较长，请先保存后开始新记录',413)
      const at=new Date(this.now()).toISOString()
      job??={id:input.id,accountId,memberId,mode:input.mode,scopeKey:input.scopeKey??input.mode,state:'queued',stage:'queued',seq:0,inputRevision:0,resultRevision:0,cursor:0,inputs:[],transcripts:{},baseText:options.initialText??'',options,createdAt:at,cancelEpoch:0,commandIds:[],activeMs:0}
      const ids=new Set([...job.inputs.flatMap(i=>i.assetIds),...item.assetIds]);if(ids.size>12||[...ids].reduce((n,id)=>n+this.asset(accountId,memberId,id).bytes,0)>15*1024*1024)throw fail('本次原件最多12份，总大小15 MB',413)
      job.inputs.push(item);job.organizationRetries=0;job.inputRevision++;job.processingStartedAt=at;job.options=options;job.error=null;job.review=null;job.activeMs=0
      if(job.state==='publishing'){this.db.prepare('DELETE FROM outbox WHERE job_id=?').run(job.id);job.state='queued';job.stage='queued'}
      if(!['running','publishing','paused'].includes(job.state)){job.state='queued';job.stage='queued'}
      return this.put(job)
    })})
    const active=this.active.get(JSON.stringify([accountId,memberId]));if(active?.id===j.id&&(active.stage==='organizing'||j.options.continuousRecord&&['preparing','reading','publishing'].includes(active.stage)))active.controller.abort(new DOMException('New input','AbortError'))
    this.kick();return publicJob(j)
  }
  async organizeContext(accountId,memberId,contextId,version,generationRequested=false){
    const job=await withStorageLock(async()=>{
      await this.scope(accountId,memberId)
      const context=await this.front.snapshot(accountId,memberId,contextId)
      if(!context?.continuousRecord||context.closedAt||context.version!==version)throw fail('记录单已有更新',409,'FRONT_CONTEXT_CHANGED')
      const source=generationRequested?[...context.messages].reverse().find(message=>message.kind!=='assistant'&&message.status==='completed'&&!message.retracted):context.messages.find(message=>message.id===context.cardEdit?.messageId&&message.manualCardEdit)
      if(!source)throw fail('未找到修改来源',409,'FRONT_CONTEXT_CHANGED')
      return this.transaction(()=>{
        const id=`${generationRequested?'generate':'organize'}:${contextId}:${version}`,existing=this.raw(id)
        if(existing)return this.owned(accountId,memberId,id)
        for(const old of this.all().filter(j=>j.accountId===accountId&&j.memberId===memberId&&j.scopeKey==='front'&&waiting(j))){this.put({...old,state:'paused',stage:'paused',cancelEpoch:old.cancelEpoch+1,owner:null,leaseUntil:0});this.db.prepare('DELETE FROM outbox WHERE job_id=?').run(old.id)}
        const at=new Date(this.now()).toISOString()
        // The edit's source is already accepted. Skip dialogue and ASR, then
        // reuse the existing version-fenced organization/publishing worker.
        return this.put({id,accountId,memberId,mode:'front',scopeKey:'front',state:'queued',stage:'queued',seq:0,inputRevision:1,resultRevision:0,cursor:1,inputs:[{id:source.id,kind:'text',text:source.text,inputAt:source.inputAt,assetIds:[],contextId}],contextId,frontDesk:{messageId:source.id,replyId:generationRequested?`${source.id}:reply`:`${source.id}:feedback`,context:{...context,messages:context.messages.map(publicFrontMessage)}},transcripts:{},options:{continuousRecord:true,generationRequested,semanticVersion:3,followUp:false},createdAt:at,processingStartedAt:at,cancelEpoch:0,commandIds:[],activeMs:0})
      })
    })
    const active=this.active.get(JSON.stringify([accountId,memberId]));if(active&&active.id!==job.id)active.controller.abort()
    this.kick();return publicJob(job)
  }
  async command(accountId,memberId,id,input){
    await this.scope(accountId,memberId)
    if(!validId(input.id)||!['pause','resume','retry','discard','use_text'].includes(input.type))throw fail('任务操作无效')
    // Expiry is resolved on an explicit command, never by retrying a GET.
    const before=this.raw(id);let expired=false;if(before?.draftId&&input.type==='retry')try{await this.business.get(accountId,memberId,before.draftId)}catch(error){if(error.code==='AI_DRAFT_NOT_FOUND')expired=true;else throw error}
    const result=await withStorageLock(async()=>{await this.scope(accountId,memberId);return this.transaction(()=>{
      let j=this.raw(id);if(!j&&input.type==='discard'){j={id,accountId,memberId,mode:'front',scopeKey:'front',state:'discarded',stage:'discarded',inputRevision:0,resultRevision:0,cancelEpoch:1,inputs:[],commandIds:[input.id],createdAt:new Date(this.now()).toISOString()};return this.put(j)}j=this.owned(accountId,memberId,id);if(j.commandIds.includes(input.id))return j
      if(j.state==='discarded')return j
      if(expired&&['ready','needs_review','failed'].includes(j.state)&&j.draftId===before.draftId){j.state='failed';j.draftId=null;j.draftVersion=null;j.options={...j.options,id:undefined,version:undefined};this.db.prepare('DELETE FROM outbox WHERE job_id=?').run(id)}
      if(input.type==='use_text'){if(j.state!=='needs_review'||!j.review)throw fail('请先完成可用文字的整理',409);j.excludedInputs=[...new Set([...(j.excludedInputs??[]),...unresolved(j)])];j.state='ready';j.stage='ready'}
      else if(input.type==='pause'||input.type==='discard'){j.state=input.type==='pause'?'paused':'discarded';j.stage=j.state;j.cancelEpoch++;j.leaseUntil=0;j.owner=null}
      else {if(!['paused','failed','needs_review'].includes(j.state))return j;if(input.type==='retry'&&unresolved(j).length){j.retryInputIds=unresolved(j);j.cursor=Math.min(...unresolved(j).map(id=>j.inputs.findIndex(i=>i.id===id)));j.inputErrors={}}const outbox=this.db.prepare('SELECT document FROM outbox WHERE job_id=?').get(j.id);j.state=outbox&&JSON.parse(outbox.document).revision===j.inputRevision?'publishing':'queued';j.stage=j.state;j.error=null;j.activeMs=0;j.processingStartedAt=new Date(this.now()).toISOString()}
      j.commandIds=[...j.commandIds,input.id].slice(-200);return this.put(j)
    })})
    const active=this.active.get(JSON.stringify([accountId,memberId]));if(active?.id===id&&['pause','discard'].includes(input.type))active.controller.abort()
    if(input.type==='discard'){
      // The durable tombstone above is the authoritative cancellation ACK.
      // Never delete already saved records or conversation evidence.
      if(result.mode==='front')await this.front.closeMessages(accountId,memberId,result.inputs.map(i=>i.id))
      if(result.draftId)await this.business.cancel(accountId,memberId,result.draftId).catch(()=>undefined)
    }
    this.kick();return publicJob(result)
  }
  assertCurrent(draft){
    if(!draft.recognitionBinding)return
    const {jobId,revision}=draft.recognitionBinding,j=this.raw(jobId)
    if(!j||j.state!=='ready'&&j.state!=='needs_review'&&!(draft.manualOriginal&&j.state==='failed')||unresolved(j).length>0||j.inputRevision!==revision||(!draft.manualOriginal&&j.resultRevision!==revision)||j.draftId!==draft.id)throw fail('内容已有更新或尚未完成，请重新核对后保存',409,'RECOGNITION_REVISION_CONFLICT')
  }
  kick(){
    if(this.closed)return
    for(const j of this.db.prepare("SELECT document FROM jobs WHERE json_extract(document,'$.state') IN ('queued','running','publishing')").all().map(row=>JSON.parse(row.document))){
      const key=JSON.stringify([j.accountId,j.memberId])
      if(j.state==='running'&&j.leaseUntil<this.now()&&!this.active.has(key)){j.state='paused';j.stage='paused';j.owner=null;j.error={code:'RECOGNITION_INTERRUPTED',message:'处理曾中断，已完成的步骤保留；继续前请确认重试'};this.put(j)}
      if(j.state==='publishing'&&!this.active.has(key)){
        const claimed=this.transaction(()=>{
          const current=this.raw(j.id)
          if(current?.state!=='publishing'||current.owner&&current.owner!==this.owner&&current.leaseUntil>this.now())return null
          return this.put({...current,owner:this.owner,leaseUntil:this.now()+15000,cancelEpoch:current.cancelEpoch+(current.owner&&current.owner!==this.owner?1:0)})
        })
        if(!claimed)continue
        this.active.set(key,{id:j.id,controller:new AbortController()});void withAITrace({traceId:j.id,operation:'recognition-job'},()=>this.publish(j.id)).catch(error=>this.publicationFailed(j.id,error)).finally(()=>this.active.delete(key));continue
      }
      if(j.state!=='queued'||this.active.has(key))continue
      const controller=new AbortController(),active={id:j.id,controller,stage:'queued'};this.active.set(key,active)
      void withAITrace({traceId:j.id,operation:'recognition-job'},()=>this.run(j.id,active)).catch(error=>this.logger.warn('[Hoooho recognition] worker failed',{code:error.code??'RECOGNITION_WORKER_FAILED'})).finally(()=>{this.active.delete(key);if(active.claimed)this.kick()})
    }
  }
  guard(id,epoch,signal){signal.throwIfAborted();const j=this.raw(id);if(!j||j.cancelEpoch!==epoch||j.owner!==this.owner||j.leaseUntil<this.now()||!['running','publishing'].includes(j.state))throw new DOMException('Task stopped','AbortError');return j}
  async updateActive(id,epoch,signal,patch){return withStorageLock(()=>{const j=this.guard(id,epoch,signal);return this.put({...j,...patch})})}
  async run(id,active){
    let j=this.transaction(()=>{const job=this.raw(id),running=this.all().filter(other=>other.id!==id&&['running','publishing'].includes(other.state)&&other.leaseUntil>this.now());if(job.state!=='queued'||running.length>=this.maxConcurrentJobs||running.some(other=>other.accountId===job.accountId&&other.memberId===job.memberId))return null;job.state='running';job.owner=this.owner;job.leaseUntil=this.now()+15000;return this.put(job)})
    if(!j)return
    active.claimed=true
    const epoch=j.cancelEpoch,started=this.now(),budget=j.inputs.some(i=>i.kind==='image')?300000:120000,signal=AbortSignal.any([active.controller.signal,AbortSignal.timeout(Math.max(1,budget-j.activeMs))])
    const heartbeat=setInterval(()=>{const current=this.raw(id);if(current?.owner===this.owner&&current.cancelEpoch===epoch&&['running','publishing'].includes(current.state)){current.leaseUntil=this.now()+15000;this.put(current,false)}},5000);heartbeat.unref()
    const phase=async patch=>{active.stage=patch.stage;const current=await this.updateActive(id,epoch,signal,{stage:patch.stage,progress:patch.total===undefined?null:{completed:patch.completed,total:patch.total,reused:!!patch.reused}});return current}
    try{
      await this.scope(j.accountId,j.memberId)
      // Conversation selection is ordered. Only its final current context is
      // extracted after all already-accepted messages have been answered.
      while((j=this.guard(id,epoch,signal)).cursor<j.inputRevision){
        const item=j.inputs[j.cursor],media=await this.materialize(j,item.assetIds),files=media.filter(a=>!a.mimeType.startsWith('audio/')),voiceFiles=media.filter(a=>a.mimeType.startsWith('audio/'))
        let text=item.text
        if(item.kind==='voice'&&!text){
          if(j.transcripts[item.id])text=j.transcripts[item.id]
          else {
            await phase({stage:'transcribing'})
            const attempt=randomUUID()
            this.db.prepare('INSERT INTO attempts VALUES(?,?,?)').run(attempt,id,JSON.stringify({stage:'transcribing',revision:j.cursor+1,state:'calling',startedAt:new Date(this.now()).toISOString()}))
            let result,problem
            try{
              if(!item.asrAssetId)throw fail('录音原件已保留，请重新转码后重试',422,'RECOGNITION_AUDIO_REQUIRED')
              const [wav]=await this.materialize(j,[item.asrAssetId]);result=await this.audio.transcribe(wav,j.accountId,signal)
              this.guard(id,epoch,signal)
              if(!hasConversationInput({text:result.transcript}))problem={code:'ASR_EMPTY_TRANSCRIPT',message:'这段录音没有可确认的文字，原音仍保留'}
            }catch(error){this.guard(id,epoch,signal);problem={code:error.code??'ASR_UNAVAILABLE',message:'这段录音尚未转写，原音仍保留'}}
            if(problem){
              this.db.prepare('UPDATE attempts SET document=? WHERE id=?').run(JSON.stringify({stage:'transcribing',revision:j.cursor+1,state:'failed',code:problem.code}),attempt)
              await this.updateActive(id,epoch,signal,{inputErrors:{...this.raw(id).inputErrors,[item.id]:problem},...(!files.length?{cursor:j.cursor+1}:{})})
              if(!files.length){
                if(j.mode==='front'&&item.protocolVersion!==2)await this.front.submit(j.accountId,j.memberId,{id:item.id,protocolVersion:item.protocolVersion??1,kind:item.kind,text:'',inputAt:item.inputAt,files:[],voiceFiles,...(item.contextId?{contextId:item.contextId}:{}),...(item.answerTo?{answerTo:item.answerTo}:{}),...(item.presentedDraft?{presentedDraft:item.presentedDraft}:{}),...(item.expectedContextVersion?{expectedContextVersion:item.expectedContextVersion}:{})},signal,{continuousRecord:j.options.continuousRecord===true,inputProblem:problem})
                continue
              }
              text=''
            }else{
              text=result.transcript
              await this.updateActive(id,epoch,signal,{transcripts:{...this.raw(id).transcripts,[item.id]:text},transcript:{inputId:item.id,text}})
              this.db.prepare('UPDATE attempts SET document=? WHERE id=?').run(JSON.stringify({stage:'transcribing',revision:j.cursor+1,state:'completed',requestId:result.requestId??null}),attempt)
            }
          }
        }
        if(j.mode==='front'){
          await phase({stage:'responding'})
          const result=await this.front.submit(j.accountId,j.memberId,{id:item.id,protocolVersion:item.protocolVersion??1,kind:item.kind,text,inputAt:item.inputAt,files,voiceFiles,...(j.retryInputIds?.includes(item.id)?{retryMedia:true}:{}),...(item.contextId?{contextId:item.contextId}:{}),...(item.answerTo?{answerTo:item.answerTo}:{}),...(item.presentedDraft?{presentedDraft:item.presentedDraft}:{}),...(item.expectedContextVersion?{expectedContextVersion:item.expectedContextVersion}:{})},signal,{continuousRecord:j.options.continuousRecord===true,onAccepted:async result=>{await this.updateActive(id,epoch,signal,{frontDesk:{...result,context:{...result.context,review:undefined,messages:result.context.messages.map(publicFrontMessage)}},contextId:result.context.id})},deferCandidateFeedback:true,transcriptionVerified:item.kind==='voice'&&Boolean(this.raw(id).transcripts[item.id]),retryTranscription:item.kind==='voice'&&j.retryInputIds?.includes(item.id)&&hasConversationInput({text})})
          await this.updateActive(id,epoch,signal,{frontDesk:{...result,context:{...result.context,review:undefined,messages:result.context.messages.map(publicFrontMessage)}},contextId:result.context.id,...(result.context.mediaProblems?.length?{inputErrors:{...this.raw(id).inputErrors,[item.id]:{code:'FRONT_MEDIA_PARTIAL',message:result.context.mediaProblems.map(problem=>problem.name+'：'+problem.message).join('；')}}}:{})})
        }
        await this.updateActive(id,epoch,signal,{cursor:j.cursor+1})
      }
      j=this.guard(id,epoch,signal);const revision=j.inputRevision
      if(j.mode==='transcription'){if(unresolved(j).length)throw fail('录音尚未转写，原件保留，请重试',422,'RECOGNITION_INPUT_PENDING');await this.updateActive(id,epoch,signal,{state:'ready',stage:'ready',resultKind:'transcription',resultRevision:revision,owner:null,leaseUntil:0});return}
      if(j.mode==='front'&&!j.contextId)throw fail('这段录音尚未转写，原件仍保留，可以重试或继续文字输入',422,'RECOGNITION_INPUT_PENDING')
      let input
      if(j.mode==='front'){
        const context=(await this.front.snapshot(j.accountId,j.memberId,j.contextId));this.guard(id,epoch,signal)
        if(context.continuousRecord&&context.interview?.status==='asking'&&!context.understanding?.recordChangesPending&&!j.options.generationRequested&&!context.cardEdit&&context.actionPlan?.type==='none'){
          // A follow-up answer needs one dialogue call, not full extraction and
          // professional-summary generation on every turn. Explicit generation
          // queues that existing pipeline separately, with the same version fence.
          await this.updateActive(id,epoch,signal,{state:unresolved(j).length?'needs_review':'ready',stage:'ready',resultKind:context.resultKind,resultRevision:revision,review:null,draftId:null,frontDesk:{...j.frontDesk,context},owner:null,leaseUntil:0});return
        }
        if(['save','save_original','readback','cancel','stop','query','export','delete','update'].includes(context.actionPlan?.type)){
          await this.executeFrontAction(j,context,epoch,signal,revision);return
        }
        if(context.saved||['conversation','no_change'].includes(context.resultKind)){
          const review=context.saved?null:context.review??null
          if(review?.state==='ready')await this.business.bindRecognition(j.accountId,j.memberId,review.id,{jobId:id,revision},signal)
          await this.updateActive(id,epoch,signal,{state:unresolved(j).length?'needs_review':'ready',stage:'ready',resultKind:context.saved?'saved':context.resultKind,resultRevision:revision,review,draftId:review?.id??null,frontDesk:{...j.frontDesk,context},owner:null,leaseUntil:0})
          return
        }
        if(context.decision?.organize===false){
          // A courtesy/explanation adds no facts. Keep only the server snapshot's
          // exact same ready review and rebind its save guard to this revision.
          const retained=context.decision.intent==='interaction'&&context.interview?.status==='ready'&&context.review?.state==='ready'?context.review:null
          await withStorageLock(async()=>{
            const current=this.guard(id,epoch,signal)
            if(current.inputRevision!==revision){this.put({...current,state:'queued',stage:'queued',owner:null,leaseUntil:0});return}
            if(retained)await this.business.bindRecognition(j.accountId,j.memberId,retained.id,{jobId:id,revision},signal)
            this.guard(id,epoch,signal)
            this.put({...current,state:'ready',stage:'ready',review:retained,draftId:retained?.id??null,draftVersion:retained?.version??null,resultRevision:revision,owner:null,leaseUntil:0})
          });return
        }
        let previousReview=context.review
        if(!previousReview&&context.draftId){
          try{const draft=await this.business.get(j.accountId,j.memberId,context.draftId);if(draft.frontContextId===context.id&&draft.state!=='saved')previousReview={id:draft.id,version:draft.version}}catch(error){if(error.code!=='AI_DRAFT_NOT_FOUND')throw error}
          this.guard(id,epoch,signal)
        }
        const ledger=Boolean(context.understanding&&!context.understanding.recordChangesPending)
        const turns=ledger?context.messages.filter(message=>message.kind!=='assistant'&&message.status==='completed'):factMessages(context.messages)
        const allowedSources=ledger?new Set([...(context.facts??[]).filter(fact=>fact.status==='active').flatMap(fact=>fact.sources.map(ref=>ref.messageId)),...buildFrontDeskFactSources({facts:context.facts,messages:turns}).flatMap(source=>(source.originalReferences??[]).map(ref=>ref.messageId))]):null
        const originals=allowedSources?turns.filter(turn=>allowedSources.has(turn.id)):turns
        input={...j.options,text:turns.map(message=>message.text).filter(Boolean).join('\n'),files:originals.flatMap(message=>message.files??[]),voiceFiles:originals.flatMap(message=>message.voices??[]),id:previousReview?.id,version:previousReview?.version,smartRecord:true,frontDeskRecord:true,semanticVersion:ledger?(this.business.model?.sourceReferences===true?2:1):context.semanticVersion??1,frontContextId:context.id,continuousRecord:context.continuousRecord===true,selectedOccurredAt:context.firstDescribedAt??j.options.selectedOccurredAt}
      }else{
        // Structured submissions are full snapshots; previous revisions remain
        // immutable inputs and are never concatenated into new health facts.
        const latest=j.inputs.at(-1),media=await this.materialize(j,j.mode==='record'?[...new Set(j.inputs.flatMap(i=>i.assetIds))]:latest.assetIds)
        input={...j.options,text:j.mode==='record'?[j.baseText,...j.inputs.map(i=>i.text||j.transcripts[i.id]||'')].filter(Boolean).join('\n'):latest.text||j.transcripts[latest.id]||'',files:media.filter(a=>!a.mimeType.startsWith('audio/')),voiceFiles:media.filter(a=>a.mimeType.startsWith('audio/')),id:j.draftId??j.options.id,version:j.draftVersion??j.options.version}
        if(j.mode==='structured'&&!latest.assetIds.length&&input.id){delete input.files;delete input.voiceFiles}
        if(input.id){const previous=await this.business.get(j.accountId,j.memberId,input.id);input.version=previous.version}
      }
      await phase({stage:input.files?.length?'preparing':'organizing'})
      let review=await this.business.prepare(j.accountId,j.memberId,{...input,deferRecognition:true},signal)
      await this.updateActive(id,epoch,signal,{draftId:review.id,draftVersion:review.version})
      await this.business.bindRecognition(j.accountId,j.memberId,review.id,{jobId:id,revision},signal)
      const {files:inputFiles,voiceFiles:inputVoices,...generation}=input
      review=await this.business.prepare(j.accountId,j.memberId,{...generation,id:review.id,version:review.version,deferRecognition:false},signal,phase)
      this.guard(id,epoch,signal)
      if(this.raw(id).inputRevision!==revision)throw new DOMException('New input','AbortError')
      const outbox={revision,review,draftId:review.id,contextId:j.contextId??null,resultKey:`${id}:${revision}:${review.id}:${review.version}`}
      await withStorageLock(()=>this.transaction(()=>{const current=this.guard(id,epoch,signal);this.db.prepare('INSERT OR REPLACE INTO outbox VALUES(?,?)').run(id,JSON.stringify(outbox));this.put({...current,state:'publishing',stage:'publishing',resultKey:outbox.resultKey})}))
      await this.publish(id)
    }catch(error){
      await withStorageLock(async()=>{let current=this.raw(id);if(!current||current.cancelEpoch!==epoch||current.owner!==this.owner||current.state==='discarded')return
        const input=current.inputs[current.cursor]??current.inputs.at(-1)
        const staleContinuous=current.options.continuousRecord&&['FRONT_CONTEXT_CHANGED','FRONT_RECORD_CHANGED'].includes(error.code)
        const protectedContextId=input?.contextId??current.frontDesk?.context?.id
        const accepted=staleContinuous&&protectedContextId?await this.front.snapshot(current.accountId,current.memberId,protectedContextId).catch(()=>null):current.mode==='front'&&this.front.contextForMessage&&input?await this.front.contextForMessage(current.accountId,current.memberId,input.id).catch(()=>null):null
        current=this.raw(id);if(!current||current.cancelEpoch!==epoch||current.owner!==this.owner||current.state==='discarded')return
        if(current.inputRevision>j.inputRevision||active.controller.signal.aborted&&current.state==='running'){current.state='queued';current.stage='queued';current.error=null}
        else {if(staleContinuous&&input)current.inputErrors={...current.inputErrors,[input.id]:{code:error.code,message:'这段旧回应未覆盖刚才的修改'}};current.state='failed';current.stage='failed';current.error={code:error.code??(signal.aborted?'RECOGNITION_TIMEOUT':'RECOGNITION_FAILED'),message:error.status&&error.status<500?error.message:signal.aborted?'处理时间较长，原件和已完成步骤保留，可以重试':'这一步未完成，原件和已完成步骤保留，可以重试'}
          if(current.options.continuousRecord&&current.cursor>=current.inputs.length&&(current.organizationRetries??0)<2&&(!error.status||error.status>=500)&&!['FRONT_CONTEXT_CHANGED','FRONT_RECORD_CHANGED','AI_DRAFT_VERSION_CONFLICT'].includes(error.code)){current.organizationRetries=(current.organizationRetries??0)+1;current.state='queued';current.stage='queued';current.error=null}
          if(accepted){current.contextId=accepted.id;current.frontDesk={messageId:input.id,replyId:`${input.id}:reply`,context:{...accepted,messages:accepted.messages.map(publicFrontMessage)}}}
        }
        current.owner=null;current.leaseUntil=0;this.put(current)
      })
    }finally{clearInterval(heartbeat);const current=this.raw(id);this.logger.info?.('[Hoooho recognition] task completed',{...traceMetadata(),requestId:fingerprint(id).slice(0,24),revision:current?.inputRevision??null,state:current?.state??'removed',elapsedMs:this.now()-started});if(current){current.activeMs=['ready','needs_review'].includes(current.state)?0:(current.activeMs??0)+this.now()-started;this.put(current,false)}}
  }
  async executeFrontAction(job,context,epoch,signal,revision){
    const plan=context.actionPlan,id=job.id
    // The model proposes an action. Only this owner/version fenced service
    // operation may turn it into a genuine receipt.
    return accountTransaction(this.business.directory,async()=>{
      const current=this.guard(id,epoch,signal)
      if(current.inputRevision!==revision||current.inputs.at(-1)?.id!==plan.sourceMessageId)throw fail('操作对应的消息已变化',409,'RECOGNITION_REVISION_CONFLICT')
      const fresh=await this.front.snapshot(job.accountId,job.memberId,context.id)
      if(!fresh||fresh.closedAt||fresh.version!==plan.executionContextVersion||fresh.actionPlan?.operationId!==plan.operationId)throw fail('对话版本已有变化，请重新核对',409,'FRONT_RECORD_CHANGED')
      if(fresh.continuousRecord&&['save','save_original'].includes(plan.type)&&plan.targetId===fresh.id){
        await this.front.continuous(job.accountId,job.memberId,fresh.id,{action:'save_current',expectedVersion:fresh.version,confirmed:true})
        await this.front.store.update(data=>({...data,messages:data.messages.map(message=>message.id===`${plan.sourceMessageId}:reply`&&message.accountId===job.accountId&&message.memberId===job.memberId?{...message,text:'已记录'}:message)}))
        const context=await this.front.snapshot(job.accountId,job.memberId,fresh.id)
        this.put({...current,state:'ready',stage:'ready',resultKind:'saved',resultRevision:revision,frontDesk:{...current.frontDesk,context},owner:null,leaseUntil:0,error:null})
        return
      }
      if(['cancel','stop'].includes(plan.type)){
        // Stop optional interview without deleting either candidate or input.
        await this.front.store.update(data=>({...data,contexts:data.contexts.map(c=>c.id===context.id?{...c,optionalQuestionsStopped:true,interview:c.interview?{...c.interview,status:'ready',question:null,stage:'ready',nextQuestion:null}:c.interview}:c)}))
        const stopped=await this.front.snapshot(job.accountId,job.memberId,context.id)
        this.put({...current,state:unresolved(current).length?'needs_review':'ready',stage:'ready',resultKind:'no_change',resultRevision:revision,review:stopped.review??null,draftId:stopped.review?.id??null,frontDesk:{...current.frontDesk,context:stopped},owner:null,leaseUntil:0})
        if(stopped.review?.state==='ready')await this.business.bindRecognition(job.accountId,job.memberId,stopped.review.id,{jobId:id,revision},signal)
        return
      }
      if(plan.targetKind==='record'){
        const record=await this.business.records.getOwnedRecord(job.accountId,plan.targetId),event=await this.business.events.get(job.accountId,record.eventId)
        if(event.memberId!==job.memberId||frontRecordVersion(record)!==plan.targetVersion)throw fail('这条记录已变化或暂不可访问',409,'FRONT_RECORD_TARGET_CHANGED')
        const p=record.aiProvenance,snapshot={inputText:record.content,items:p?[{title:event.title,timeText:p.timeText??null,fields:p.fields??[]}]:[{title:event.title,timeText:record.journal?.timePrecision==='unknown'?null:record.occurredAt,fields:[{name:'conclusion',value:record.content,sources:[]}]}],sources:p?.sources??[]}
        let receipt
        if(plan.type==='delete'){
          await this.business.records.delete(job.accountId,record.id)
          receipt={operationId:plan.operationId,type:'delete',targetId:record.id,targetVersion:plan.targetVersion,state:'completed',text:'这条记录已删除。',snapshot:{inputText:'',items:[]}}
        }else if(plan.type==='query'||plan.type==='export')receipt={operationId:plan.operationId,type:plan.type,targetId:record.id,targetVersion:plan.targetVersion,state:'completed',snapshot,...(plan.type==='export'?{fileName:'护护记录.txt',text:snapshotText(snapshot)}:{})}
        else throw fail('请在这条记录详情中核对修改后保存',409,'FRONT_RECORD_EDIT_REVIEW_REQUIRED')
        await this.front.store.update(data=>({...data,contexts:data.contexts.map(c=>c.id===context.id?{...c,operationReceipts:[...(c.operationReceipts??[]).filter(r=>r.operationId!==receipt.operationId),receipt].slice(-50)}:c)}))
        this.put({...current,state:'ready',stage:'ready',resultKind:'no_change',resultRevision:revision,review:null,draftId:null,operationReceipt:receipt,frontDesk:{...current.frontDesk,context:await this.front.snapshot(job.accountId,job.memberId,context.id)},owner:null,leaseUntil:0})
        return
      }
      if(plan.type==='delete'||plan.type==='update')throw fail('请先在草稿预览中核对要修改的内容',409,'FRONT_DRAFT_EDIT_REVIEW_REQUIRED')
      let draft=await this.business.read(job.accountId,job.memberId,plan.targetId)
      if(plan.type==='query'||plan.type==='export'){
        if(draft.version!==plan.targetVersion)throw fail('目标记录已有变化',409,'AI_DRAFT_VERSION_CONFLICT')
        // Exact snapshot, no record creation or model-generated export claims.
        const snapshot={inputText:draft.items.flatMap(item=>item.fields.map(field=>field.value)).join('\n'),items:draft.items,sources:draft.sources}
        const receipt={operationId:plan.operationId,type:plan.type,targetId:draft.id,targetVersion:draft.version,state:'completed',snapshot,...(plan.type==='export'?{fileName:'护护记录.txt',text:snapshotText(snapshot)}:{})}
        this.put({...current,state:'ready',stage:'ready',resultKind:'no_change',resultRevision:revision,review:draft,draftId:draft.id,operationReceipt:receipt,frontDesk:{...current.frontDesk,context:fresh},owner:null,leaseUntil:0})
        await this.business.bindRecognition(job.accountId,job.memberId,draft.id,{jobId:id,revision},signal)
        return
      }
      if(draft.state!=='saved'){
        if(draft.version!==plan.targetVersion||unresolved(current).length)throw fail('记录版本已变化或仍有未完成输入，请先核对',409,'RECOGNITION_REVISION_CONFLICT')
        if(plan.itemIds?.length&& (plan.itemIds.length!==draft.items.length||draft.items.some(item=>!plan.itemIds.includes(item.id))))throw fail('请在草稿中选择并核对需要保存的内容',409,'FRONT_SAVE_SELECTION_REQUIRED')
        await this.business.bindRecognition(job.accountId,job.memberId,draft.id,{jobId:id,revision},signal)
        // Save's existing transaction rechecks this durable revision at both
        // ends. New input cannot slip in while the storage barrier is held.
        this.put({...current,state:'ready',stage:'ready',resultRevision:revision,review:draft,draftId:draft.id})
        draft=await this.business[plan.type==='save_original'?'saveOriginal':'save'](job.accountId,job.memberId,draft.id,{version:plan.targetVersion,confirmed:true})
      }
      if(!draft.result?.records?.length)throw fail('保存结果尚未确认，请重试',409,'FRONT_SAVE_RECEIPT_MISSING')
      await this.front.checkpoint(job.accountId,job.memberId,context.id,{draftId:draft.id},()=>{const latest=this.raw(id);signal.throwIfAborted();if(latest.cancelEpoch!==epoch||latest.inputRevision!==revision)throw fail('本次操作已变化',409)})
      const receipt={operationId:plan.operationId,type:plan.type,targetId:draft.id,targetVersion:plan.targetVersion,confirmedVersion:plan.targetVersion,state:'saved',savedDraft:draft,recordIds:draft.result.records.map(record=>record.recordId)}
      await this.front.store.update(data=>({...data,contexts:data.contexts.map(c=>c.id===context.id?{...c,operationReceipts:[...(c.operationReceipts??[]).filter(r=>r.operationId!==receipt.operationId),receipt]}:c)}))
      const savedContext=await this.front.snapshot(job.accountId,job.memberId,context.id)
      this.put({...this.raw(id),state:'ready',stage:'ready',resultKind:'saved',resultRevision:revision,review:draft,draftId:draft.id,operationReceipt:receipt,frontDesk:{...current.frontDesk,context:savedContext},owner:null,leaseUntil:0,error:null})
    })
  }
  async publish(id){
    const row=this.db.prepare('SELECT document FROM outbox WHERE job_id=?').get(id);if(!row)return
    const outbox=JSON.parse(row.document),j=this.raw(id);if(j.state!=='publishing'||j.owner!==this.owner)return
    const assertOwner=()=>{const current=this.raw(id);if(current?.state!=='publishing'||current.owner!==this.owner||current.cancelEpoch!==j.cancelEpoch||current.inputRevision!==outbox.revision)throw fail('任务已变化',409,'RECOGNITION_REVISION_CONFLICT')}
    const heartbeat=setInterval(()=>{const current=this.raw(id);if(current?.state==='publishing'&&current.owner===this.owner&&current.cancelEpoch===j.cancelEpoch)this.put({...current,leaseUntil:this.now()+15000},false)},5000);heartbeat.unref()
    try{
    if(j.inputRevision!==outbox.revision){await withStorageLock(()=>{const current=this.raw(id);if(current.state==='publishing'&&current.owner===this.owner){this.db.prepare('DELETE FROM outbox WHERE job_id=?').run(id);this.put({...current,state:'queued',stage:'queued',owner:null,leaseUntil:0})}});return}
    const review=await this.business.read(j.accountId,j.memberId,outbox.draftId)
    if(review.id!==outbox.review.id||review.version!==outbox.review.version||review.state!=='ready')throw fail('整理结果已有变化，请重新核对',409)
    let frontDesk=j.frontDesk
    if(j.mode==='front'&&outbox.contextId){
      await this.front.checkpoint(j.accountId,j.memberId,outbox.contextId,{draftId:review.id},assertOwner)
      // Include the published context so clients can consume the ready response
      // directly. Public serialization below strips private original bytes.
      const context=await this.front.snapshot(j.accountId,j.memberId,outbox.contextId)
      if(context?.continuousRecord){assertOwner();await this.front.enrichContinuous(j.accountId,j.memberId,outbox.contextId)}
      const fresh=context?.continuousRecord?await this.front.snapshot(j.accountId,j.memberId,outbox.contextId):context
      if(fresh)frontDesk={...frontDesk,context:{...fresh,review,messages:fresh.messages.map(publicFrontMessage)}}
    }
    await withStorageLock(()=>this.transaction(()=>{const latest=this.raw(id);if(latest.state!=='publishing'||latest.owner!==this.owner||latest.inputRevision!==outbox.revision||latest.cancelEpoch!==j.cancelEpoch)return
      const needsReview=!!(unresolved(latest).length||review.documentWarnings?.length||review.unmappedRows?.length||review.sources?.some(s=>s.status==='uncertain'))
      this.put({...latest,state:needsReview?'needs_review':'ready',stage:'ready',resultKind:needsReview?'partial':review.items.length?'candidates':'no_change',review,frontDesk,resultRevision:outbox.revision,draftVersion:review.version,owner:null,leaseUntil:0,error:null})
      this.db.prepare('DELETE FROM outbox WHERE job_id=?').run(id)
    }))
    }finally{clearInterval(heartbeat)}
  }
  publicationFailed(id,error){const j=this.raw(id);if(j?.state==='publishing'&&j.owner===this.owner)this.put({...j,state:'failed',stage:'failed',owner:null,leaseUntil:0,error:{code:error.code??'RECOGNITION_PUBLISH_FAILED',message:'整理结果尚未完成核对，原件和结果已保留，请重试'}})}
  async close(){this.closed=true;for(const listeners of this.waiters.values())for(const notify of [...listeners])notify();this.unregister();clearInterval(this.timer);for(const a of this.active.values()){const j=this.raw(a.id);if(j&&['running','publishing'].includes(j.state)){j.state='paused';j.stage='paused';j.cancelEpoch++;j.owner=null;j.leaseUntil=0;this.put(j)}a.controller.abort()}await Promise.allSettled([])}
}

export const recognitionRoute=pathname=>/^\/api\/members\/([^/]+)\/recognition-(jobs|assets)(?:\/([^/]+))?(?:\/(commands))?$/.exec(pathname)
export async function recognitionApi(service,accountId,request,pathname,readJson){
  const match=recognitionRoute(pathname);if(!match)return null
  const [,encodedMember,resource,encodedId,action]=match,memberId=decodeURIComponent(encodedMember),id=encodedId?decodeURIComponent(encodedId):null
  if(resource==='assets'&&!id&&request.method==='POST'){
    await service.scope(accountId,memberId)
    if(/^application\/json(?:;|$)/i.test(request.headers['content-type']??''))return {status:201,data:await reuseRecognitionPhoto(service,service.photos,accountId,memberId,await readJson(2000),linkedAISignal())}
    const chunks=[];let size=0;for await(const chunk of request){size+=chunk.length;if(size>15*1024*1024)throw fail('原件不能超过15 MB',413);chunks.push(chunk)}
    const params=new URL(request.url,'http://localhost').searchParams
    return {status:201,data:await service.upload(accountId,memberId,{buffer:Buffer.concat(chunks),mimeType:request.headers['content-type'],name:params.get('name'),lastModified:Number(params.get('lastModified')??0)},{signal:linkedAISignal()})}
  }
  if(resource==='jobs'){
    if(!id&&request.method==='POST')return {status:202,data:await service.submit(accountId,memberId,await readJson(100000))}
    if(!id&&request.method==='GET')return {data:await service.latest(accountId,memberId,new URL(request.url,'http://localhost').searchParams.get('scope')??'front')}
    if(id&&!action&&request.method==='GET'){
      const params=new URL(request.url,'http://localhost').searchParams,controller=new AbortController(),aborted=()=>controller.abort()
      request.once('aborted',aborted);request.socket?.once('close',aborted)
      // IncomingMessage may close normally as soon as its GET body is consumed.
      // Only an incomplete request close means cancellation here.
      const closed=()=>{if(!request.complete)aborted()};request.once('close',closed)
      try{return {data:await service.get(accountId,memberId,id,{afterSeq:params.has('afterSeq')?Number(params.get('afterSeq')):undefined,waitMs:params.has('waitMs')?Number(params.get('waitMs')):0,signal:controller.signal})}}
      finally{request.removeListener('aborted',aborted);request.removeListener('close',closed);request.socket?.removeListener('close',aborted)}
    }
    if(id&&action&&request.method==='POST')return {data:await service.command(accountId,memberId,id,await readJson(2000))}
  }
  throw fail('请求方法不支持',405,'METHOD_NOT_ALLOWED')
}
