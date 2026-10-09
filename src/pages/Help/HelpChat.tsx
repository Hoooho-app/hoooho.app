import { useEffect, useRef, useState } from 'react'
import { MessageSquare, Send } from 'lucide-react'
import { Link } from 'react-router-dom'
import { HohoButton, DialogueComposer } from '../../components/design-system'
import { useAppStore } from '../../store/useAppStore'
import { userInitial } from '../../features/ai-nurse/userInitial'
import { ApiRequestError } from '../../services/apiClient'
import { productHelpService, type HelpSession } from '../../features/help/api'
import { getArticle } from '../../features/help/search'
import { NurseMessage } from '../../features/ai-nurse/NurseMessage'
import { useDialogueVoice } from '../../features/ai-business/useDialogueVoice'
import { processFeedbackImage } from '../../features/feedback/imageProcessing'
import { makeFeedbackState } from '../../features/feedback/navigation'

export function HelpChat({ active, onOpenArticle }: {active:boolean; onOpenArticle:(id:string)=>void}) {
  const token=useAppStore(s=>s.authToken)??'',name=useAppStore(s=>s.accountProfile?.nickname??s.authUser?.nickname)
  const [session,setSession]=useState<HelpSession|null>(null),[draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[pending,setPending]=useState('')
  const lock=useRef(false),alive=useRef(true),request=useRef<{text:string;id:string;image?:string}|null>(null),camera=useRef<HTMLInputElement>(null),ratingRetry=useRef<{turnId:string;solved:boolean}|null>(null),tail=useRef<HTMLDivElement>(null)
  const accountId=useAppStore(s=>s.authUser?.id??'guest')
  const [image,setImage]=useState<string>(),[photoBusy,setPhotoBusy]=useState(false)
  const voice=useDialogueVoice(`help-voice:${accountId}`,token,async text=>{setDraft(text);await send(text)})
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
  const load=async(fresh=false)=>{if(!token||lock.current)return;lock.current=true;setBusy(true);setError('');try{const next=await productHelpService.start(token,fresh);if(alive.current){setSession(next);if(fresh){setDraft('');setImage(undefined);request.current=null;ratingRetry.current=null}}}catch(e){if(alive.current)setError(e instanceof Error?e.message:'帮助对话未加载，请重试')}finally{lock.current=false;if(alive.current)setBusy(false)}}
  useEffect(()=>{if(active&&token&&!session&&!lock.current)void load()},[active,token])
  async function send(value=draft){const text=value.trim()||(image?'请帮我看看这张截图里的使用问题。':'');if(!session||!text||lock.current||!token)return;lock.current=true;ratingRetry.current=null;setBusy(true);setError('');setPending(text);if(request.current?.text!==text||request.current?.image!==image)request.current={text,id:crypto.randomUUID(),image};
    try{const next=await productHelpService.turn(token,session.id,{text,version:session.version,requestId:request.current.id,image:request.current.image});if(alive.current){setSession(next);setDraft('');request.current=null}}
    catch(e){if(alive.current){setDraft(text);setError(e instanceof Error?e.message:'回复暂时不可用，问题已保留，可重试');if(e instanceof ApiRequestError&&e.status===409){try{const latest=await productHelpService.get(token,session.id);if(alive.current)setSession(latest)}catch{/* keep current conversation and input */}}}}
    finally{lock.current=false;if(alive.current){setBusy(false);setPending('')}}
  }
  async function rate(turnId:string,solved:boolean){if(!session||lock.current)return;lock.current=true;setBusy(true);setError('');ratingRetry.current={turnId,solved};try{const next=await productHelpService.rate(token,session.id,{version:session.version,turnId,solved});if(alive.current){setSession(next);ratingRetry.current=null}}catch(e){if(alive.current){setError(e instanceof Error?e.message:'反馈未保存，请重试');if(e instanceof ApiRequestError&&e.status===409){try{const latest=await productHelpService.get(token,session.id);if(alive.current)setSession(latest)}catch{/* preserve the selected rating for retry */}}}}finally{lock.current=false;if(alive.current)setBusy(false)}}
  const latest=session?.turns.at(-1),rated=latest&&session?.ratings.find(r=>r.turnId===latest.id)
  useEffect(()=>{if(active&&(session?.turns.length??0)>1)tail.current?.scrollIntoView({block:'nearest',behavior:'instant'})},[active,latest?.id])
  const productBubble={assistantName:'Hoooho 产品经理',assistantAvatar:<MessageSquare size={18}/>}
  return <section hidden={!active} aria-label="智能帮助对话" className="help-chat">
    <div className="help-chat-heading"><span className="help-role-avatar"><MessageSquare aria-hidden size={20}/></span><div><h2 className="hoho-text-card-title">Hoooho 产品经理</h2><p className="hoho-text-caption">AI 助手 · 帮你解决使用问题</p></div><HohoButton variant="text" size="small" disabled={busy||!session||voice.busy||photoBusy} onClick={()=>void load(true)}>新对话</HohoButton></div>
    <div className="nurse-conversation" aria-label="对话内容">
      {!token&&<NurseMessage role="assistant" {...productBubble}><p>登录后就能继续对话，操作帮助与用户手册也可以直接查看。</p><Link to="/login">前往登录</Link></NurseMessage>}
      {session?.turns.map(turn=><NurseMessage key={turn.id} role={turn.role} recorderName={name} {...productBubble}><p>{turn.text}</p>{turn.imageAttached&&<p>附了一张图片。</p>}{turn.articleIds?.map(id=>{const article=getArticle(id);return article?<HohoButton key={id} variant="text" onClick={()=>onOpenArticle(id)}>{article.title}</HohoButton>:null})}
        {turn.id===latest?.id&&turn.choices?.map(choice=><HohoButton key={choice} disabled={busy||voice.busy} variant="text" onClick={()=>void send(choice)}>{choice}</HohoButton>)}
        {turn.id===latest?.id&&turn.askResolved&&!rated&&<><p>这次的办法帮到你了吗？</p><HohoButton disabled={busy} variant="text" onClick={()=>void rate(turn.id,true)}>解决了</HohoButton><HohoButton disabled={busy} variant="text" onClick={()=>void rate(turn.id,false)}>还没解决</HohoButton></>}
      </NurseMessage>)}
      {image&&<NurseMessage role="user" recorderName={name}><img className="dialogue-image" src={image} alt="本次截图"/><HohoButton variant="text" disabled={busy} onClick={()=>setImage(undefined)}>移除图片</HohoButton><HohoButton disabled={busy||photoBusy} onClick={()=>void send()}>发送图片</HohoButton></NurseMessage>}
      {pending&&<NurseMessage role="user" recorderName={name}><p>{pending}</p></NurseMessage>}
      {(busy||voice.busy||photoBusy)&&<NurseMessage role="assistant" {...productBubble}><p role="status">{voice.state==='listening'?'我在听，松手后就能发送。':voice.busy?'我在听这段录音，请稍等。':photoBusy?'我在准备这张图片。':session?'让我看看这个问题。':'我在找回刚才的对话。'}</p></NurseMessage>}
      {session?.notice&&<NurseMessage role="assistant" {...productBubble}><p>{session.notice}</p></NurseMessage>}
      {(error||voice.error)&&<NurseMessage role="assistant" {...productBubble}><p role="alert">{error||voice.error}</p><HohoButton disabled={busy||voice.busy} variant="text" onClick={()=>voice.pendingVoice?voice.retry():ratingRetry.current?void rate(ratingRetry.current.turnId,ratingRetry.current.solved):session&&draft.trim()?void send():void load()}>再试一次</HohoButton></NurseMessage>}
      {voice.pendingVoice&&!voice.error&&<NurseMessage role="assistant" {...productBubble}><p>这段录音还在，要我再听一次吗？</p><HohoButton disabled={busy||voice.busy} variant="text" onClick={voice.retry}>再试一次</HohoButton></NurseMessage>}
    </div>
    {session&&<div className="dialogue-page-footer"><DialogueComposer text={draft} onTextChange={setDraft} onSend={()=>void send()} maxLength={2000} placeholder="告诉我卡在哪一步…" disabled={busy||photoBusy||!token} voiceDisabled={!!voice.pendingVoice} listening={voice.state==='listening'} processing={voice.state==='transcribing'} onStart={()=>void voice.start()} onStop={voice.stop} onDiscard={voice.discard} onPhoto={()=>camera.current?.click()}/></div>}
    <input type="file" ref={camera} hidden accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" onChange={e=>{const file=e.target.files?.[0];e.currentTarget.value='';if(!file)return;setPhotoBusy(true);void processFeedbackImage(file).then(result=>{if(alive.current)setImage(result.dataUrl??undefined)}).catch(e=>{if(alive.current)setError(e.message)}).finally(()=>{if(alive.current)setPhotoBusy(false)})}}/>
    <div ref={tail}/>
    <Link to="/feedback?page=帮助中心" state={makeFeedbackState('/help?view=chat','帮助中心',window.scrollY)} className="help-text-action">反馈产品问题</Link>
  </section>
}
