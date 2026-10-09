import { useEffect, useRef, useState } from 'react'
import { MessageSquare, Send } from 'lucide-react'
import { Link } from 'react-router-dom'
import { HohoButton, HohoInput, HohoSection, StatusNotice } from '../../components/design-system'
import { useAppStore } from '../../store/useAppStore'
import { userInitial } from '../../features/ai-nurse/userInitial'
import { ApiRequestError } from '../../services/apiClient'
import { productHelpService, type HelpSession } from '../../features/help/api'
import { getArticle } from '../../features/help/search'
import { makeFeedbackState } from '../../features/feedback/navigation'

export function HelpChat({ active, onOpenArticle }: {active:boolean; onOpenArticle:(id:string)=>void}) {
  const token=useAppStore(s=>s.authToken)??'',name=useAppStore(s=>s.accountProfile?.nickname??s.authUser?.nickname)
  const [session,setSession]=useState<HelpSession|null>(null),[draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[pending,setPending]=useState('')
  const lock=useRef(false),alive=useRef(true),request=useRef<{text:string;id:string}|null>(null),input=useRef<HTMLInputElement>(null),ratingRetry=useRef<{turnId:string;solved:boolean}|null>(null),tail=useRef<HTMLDivElement>(null)
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
  const load=async(fresh=false)=>{if(!token||lock.current)return;lock.current=true;setBusy(true);setError('');try{const next=await productHelpService.start(token,fresh);if(alive.current){setSession(next);if(fresh){setDraft('');request.current=null;ratingRetry.current=null}}}catch(e){if(alive.current)setError(e instanceof Error?e.message:'帮助对话未加载，请重试')}finally{lock.current=false;if(alive.current)setBusy(false)}}
  useEffect(()=>{if(active&&token&&!session&&!lock.current)void load()},[active,token])
  async function send(value=draft){const text=value.trim();if(!session||!text||lock.current||!token)return;lock.current=true;ratingRetry.current=null;setBusy(true);setError('');setPending(text);if(request.current?.text!==text)request.current={text,id:crypto.randomUUID()};
    try{const next=await productHelpService.turn(token,session.id,{text,version:session.version,requestId:request.current.id});if(alive.current){setSession(next);setDraft('');request.current=null}}
    catch(e){if(alive.current){setDraft(text);setError(e instanceof Error?e.message:'回复暂时不可用，问题已保留，可重试');if(e instanceof ApiRequestError&&e.status===409){try{const latest=await productHelpService.get(token,session.id);if(alive.current)setSession(latest)}catch{/* keep current conversation and input */}}}}
    finally{lock.current=false;if(alive.current){setBusy(false);setPending('')}}
  }
  async function rate(turnId:string,solved:boolean){if(!session||lock.current)return;lock.current=true;setBusy(true);setError('');ratingRetry.current={turnId,solved};try{const next=await productHelpService.rate(token,session.id,{version:session.version,turnId,solved});if(alive.current){setSession(next);ratingRetry.current=null}}catch(e){if(alive.current){setError(e instanceof Error?e.message:'反馈未保存，请重试');if(e instanceof ApiRequestError&&e.status===409){try{const latest=await productHelpService.get(token,session.id);if(alive.current)setSession(latest)}catch{/* preserve the selected rating for retry */}}}}finally{lock.current=false;if(alive.current)setBusy(false)}}
  const latest=session?.turns.at(-1),rated=latest&&session?.ratings.find(r=>r.turnId===latest.id)
  useEffect(()=>{if(active&&(session?.turns.length??0)>1)tail.current?.scrollIntoView({block:'nearest',behavior:'instant'})},[active,latest?.id])
  return <section hidden={!active} aria-label="智能帮助对话" className="help-chat">
    <div className="help-chat-heading"><span className="help-role-avatar"><MessageSquare aria-hidden size={20}/></span><div><h2 className="hoho-text-card-title">Hoooho 产品经理</h2><p className="hoho-text-caption">AI 助手 · 帮你解决使用问题</p></div><HohoButton variant="text" size="small" disabled={busy||!session} onClick={()=>void load(true)}>新对话</HohoButton></div>
    {!token&&<StatusNotice title="暂时无法建立对话">操作帮助与用户手册仍可查看。<Link to="/login">前往登录</Link></StatusNotice>}
    <div className="help-chat-turns" aria-label="对话内容">{session?.turns.map(turn=><div key={turn.id} className="help-chat-turn" data-role={turn.role}><span className="help-role-avatar" aria-hidden>{turn.role==='user'?userInitial(name):<MessageSquare size={18}/>}</span><div className="help-chat-bubble"><p className="hoho-text-caption">{turn.role==='user'?'你':'Hoooho 产品经理'}</p><p className="hoho-text-body">{turn.text}</p>{(turn.articleIds?.length??0)>0&&<div className="help-chat-sources">{turn.articleIds?.map(id=>{const article=getArticle(id);return article?<HohoButton key={id} variant="text" fullWidth onClick={()=>onOpenArticle(id)}>{article.title}</HohoButton>:null})}</div>}</div></div>)}{pending&&<div className="help-chat-turn" data-role="user"><span className="help-role-avatar" aria-hidden>{userInitial(name)}</span><div className="help-chat-bubble"><p className="hoho-text-body">{pending}</p></div></div>}</div>
    {busy&&<p role="status" className="hoho-text-caption">{session?'正在回复…':'正在加载对话…'}</p>}
    {session?.notice&&<p role="status" className="hoho-text-caption">{session.notice}</p>}
    {latest?.role==='assistant'&&(latest.choices?.length??0)>0&&<div className="help-choice-list">{latest.choices?.map(choice=><HohoButton key={choice} disabled={busy} variant="secondary" onClick={()=>void send(choice)}>{choice}</HohoButton>)}</div>}
    {latest?.role==='assistant'&&latest.askResolved&&!rated&&<HohoSection title="这次的办法帮到你了吗？"><div className="help-footer-actions"><HohoButton disabled={busy} variant="secondary" onClick={()=>void rate(latest.id,true)}>解决了</HohoButton><HohoButton disabled={busy} variant="secondary" onClick={()=>void rate(latest.id,false)}>还没解决</HohoButton></div></HohoSection>}
    {error&&<StatusNotice title="暂时没有完成" tone="error">{error}<div className="help-footer-actions"><HohoButton disabled={busy} variant="secondary" onClick={()=>ratingRetry.current?void rate(ratingRetry.current.turnId,ratingRetry.current.solved):session&&draft.trim()?void send():void load()}>重试</HohoButton><HohoButton variant="text" onClick={()=>input.current?.focus()}>继续补充</HohoButton></div></StatusNotice>}
    {session&&<form className="help-chat-composer" onSubmit={e=>{e.preventDefault();void send()}}><HohoInput ref={input} label="描述遇到的问题" id="help-chat-input" placeholder="告诉我卡在哪一步…" value={draft} maxLength={2000} disabled={busy} onChange={e=>setDraft(e.target.value)}/><HohoButton type="submit" disabled={busy||!draft.trim()} aria-label="发送问题"><Send size={17}/>发送</HohoButton></form>}
    <div ref={tail}/>
    <p className="hoho-text-caption">请勿发送密码、验证码或完整病历。帮助不会自动读取健康记录。</p>
    <Link to="/feedback?page=帮助中心" state={makeFeedbackState('/help?view=chat','帮助中心',window.scrollY)} className="help-text-action">问题仍未解决？反馈产品问题</Link>
  </section>
}
