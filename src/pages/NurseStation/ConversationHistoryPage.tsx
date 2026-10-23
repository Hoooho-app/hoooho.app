import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { MainAppHeader } from '../../components/navigation'
import { WebPageHeader } from '../../components/common'
import { HohoButton, StatusNotice } from '../../components/design-system'
import { useAppStore } from '../../store/useAppStore'
import { apiRequest } from '../../services/apiClient'
import { retainedCaptureDrafts, type CaptureDraft } from '../../features/ai-business/captureDraft'
import { restoreFrontFile, type FrontContext } from '../../features/ai-business/frontDeskRecord'
import { RecordMedia } from '../../features/ai-business/RecordMedia'
import { SmartRecordReview } from '../../features/ai-business/SmartRecordReview'
import { NurseMessage } from '../../features/ai-nurse/NurseMessage'
import './conversationHome.css'
import { conversationTime } from './conversationTime'

interface Summary { id: string; title: string; preview: string; updatedAt: string; saved: boolean; closed: boolean; messageCount: number }
interface History { items: Summary[]; hasMore: boolean; nextOffset: number }

export function ConversationHistoryPage() {
  const memberId=useAppStore(s=>s.currentMemberId),accountId=useAppStore(s=>s.authUser?.id??'guest'),token=useAppStore(s=>s.authToken)??''
  const name=useAppStore(s=>s.members.find(m=>m.id===memberId)?.name??'当前孩子')
  const navigate=useNavigate(),{contextId}=useParams(),[params]=useSearchParams(),localKey=params.get('draft')
  const [copied,setCopied]=useState(false)
  const [query,setQuery]=useState(''),[result,setResult]=useState<History|null>(null),[detail,setDetail]=useState<FrontContext|null>(null)
  const [drafts,setDrafts]=useState<{key:string;draft:CaptureDraft}[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[reload,setReload]=useState(0)
  useEffect(()=>{let active=true;setDrafts([]);void retainedCaptureDrafts(`home-smart:${accountId}:${memberId}:new`).then(items=>{if(active)setDrafts(items)}).catch(()=>undefined);return()=>{active=false}},[accountId,memberId])
  useEffect(()=>{
    const controller=new AbortController();setResult(null);setDetail(null);setError('');setLoading(true)
    if(localKey){setLoading(false);return()=>controller.abort()}
    const timer=window.setTimeout(()=>{
      const base=`/api/members/${encodeURIComponent(memberId)}/front-desk-record`
      void apiRequest<History&FrontContext>(contextId?`${base}/contexts/${encodeURIComponent(contextId)}`:`${base}/history?q=${encodeURIComponent(query)}`,{token,signal:controller.signal}).then(value=>{if(controller.signal.aborted)return;if(contextId)setDetail(value);else setResult(value)}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'对话暂时没有加载成功')}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    },contextId?0:200)
    return()=>{window.clearTimeout(timer);controller.abort()}
  },[accountId,memberId,token,query,contextId,localKey,reload])
  const queryRef=useRef(query);queryRef.current=query
  const local=localKey?drafts.find(d=>d.key===localKey)?.draft:undefined
  const localItems=drafts.filter(d=>(!d.draft.frontContextId||d.draft.conversationInput?.trim()||d.draft.pendingVoice||(d.draft.archivedConversation&&(d.draft.smartReview||d.draft.files.length||d.draft.text.trim())))&&[d.draft.text,d.draft.conversationInput,...(d.draft.conversationTurns??[]).map(t=>t.text)].join(' ').includes(query))
  const more=async()=>{
    if(!result||loading)return
    setLoading(true);setError('')
    const identity={accountId,memberId}
    try{const next=await apiRequest<History>(`/api/members/${encodeURIComponent(memberId)}/front-desk-record/history?q=${encodeURIComponent(query)}&offset=${result.nextOffset}`,{token});if(useAppStore.getState().currentMemberId===identity.memberId&&useAppStore.getState().authUser?.id===identity.accountId&&queryRef.current===query)setResult(old=>old?{...next,items:[...old.items,...next.items]}:next)}catch{setError('更多对话未加载，请重试。')}finally{setLoading(false)}
  }
  useEffect(()=>setCopied(false),[contextId,localKey])
  const copyOriginal=async()=>{
    const turns=(local?.conversationTurns??[]).filter(t=>t.role!=='assistant'&&t.text).map(t=>t.text)
    const text=[...(turns.length?turns:[local?.text]),local?.conversationInput].filter(Boolean).join('\n')
    try{await navigator.clipboard.writeText(text);setCopied(true)}catch{setError('复制未完成，可以长按选择原文。')}
  }
  const isDetail=Boolean(contextId||localKey)
  return <main className="app-shell conversation-history-page">{isDetail?<WebPageHeader title="对话记录" onBack={()=>navigate('/conversation-history',{replace:true})}/>:<MainAppHeader title="对话记录" conversation/>}<div className="conversation-history-content">
    <p className="conversation-history-caption">{name} · {isDetail?'原始对话内容':'按最近更新排列'}</p>
    {!isDetail&&<label><span className="sr-only">搜索对话记录</span><input type="search" aria-label="搜索对话记录" maxLength={100} value={query} placeholder="搜索聊过的内容" onChange={e=>setQuery(e.target.value)}/></label>}
    {error&&<StatusNotice tone="error" title="对话没有加载成功">{error}<HohoButton variant="text" onClick={()=>setReload(n=>n+1)}>重新加载</HohoButton></StatusNotice>}
    {loading&&!result&&<p role="status">正在读取对话…</p>}
    {isDetail?<>{localKey&&!local&&!loading?<p>这份本机草稿已不存在。</p>:null}{local?<div className="nurse-conversation">{(local.conversationTurns??[]).map(turn=><NurseMessage conversation key={turn.id} role={turn.role??'user'}>{conversationTime(turn.at)&&<time className="conversation-history-caption" dateTime={conversationTime(turn.at)!.iso}>{conversationTime(turn.at)!.label}</time>}<p>{turn.text}</p></NurseMessage>)}{!local.conversationTurns?.length&&local.text&&<NurseMessage conversation role="user"><p>{local.text}</p></NurseMessage>}{local.conversationInput?.trim()&&<NurseMessage conversation role="user"><p>{local.conversationInput}</p><p className="conversation-history-caption">尚未发送的本机草稿</p></NurseMessage>}{local.files.map((file,i)=><RecordMedia key={i} file={file}/>)}</div>:detail?<div className="nurse-conversation">{detail.messages.filter(m=>m.status!=='discarded').map(message=><NurseMessage conversation key={message.id} role={message.kind==='assistant'?'assistant':'user'}>{conversationTime(message.inputAt??message.at)&&<time className="conversation-history-caption" dateTime={conversationTime(message.inputAt??message.at)!.iso}>{conversationTime(message.inputAt??message.at)!.label}</time>}{message.text&&<p>{message.text}</p>}{[...message.files??[],...message.voices??[]].map((file,i)=><RecordMedia key={i} file={restoreFrontFile(file)}/>)}</NurseMessage>)}</div>:!loading&&!error&&!localKey?<p>未找到这次对话。</p>:null}<>{local?.smartReview&&<section><h2>原草稿的核对内容</h2><SmartRecordReview review={local.smartReview} disabled error="" onChange={()=>undefined}/></section>}{local&&(local.text||local.conversationInput||local.conversationTurns?.some(t=>t.role!=='assistant'&&t.text))&&<HohoButton onClick={()=>void copyOriginal()}>{copied?'原文已复制':'复制原始文字'}</HohoButton>}<HohoButton variant="secondary" onClick={()=>navigate('/nurse-station')}>回到当前对话</HohoButton></></>:<>
      <ul className="conversation-history-list">{localItems.map(item=><li key={item.key}><button onClick={()=>navigate(`/conversation-history?draft=${encodeURIComponent(item.key)}`)}><strong>{item.draft.conversationInput||item.draft.text||item.draft.conversationTurns?.find(t=>t.role!=='assistant'&&t.text)?.text||'未发送的资料'}</strong><span>本机草稿 · {new Date(item.draft.updatedAt??0).toLocaleString('zh-CN')}</span></button></li>)}{result?.items.map(item=><li key={item.id}><button onClick={()=>navigate(`/conversation-history/${encodeURIComponent(item.id)}`)}><strong>{item.title}</strong><span>{item.preview}</span><span><time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleString('zh-CN')}</time> · {item.saved?'已保存记录':item.closed?'已结束对话':'对话内容保留'}</span></button></li>)}</ul>
      {!loading&&!error&&!result?.items.length&&!localItems.length&&<p className="conversation-history-caption">{query?'没有找到相关对话，换个词试试。':'还没有对话记录，从今天这一句开始。'}</p>}
      {result?.hasMore&&<HohoButton variant="text" loading={loading} onClick={()=>void more()}>加载更多</HohoButton>}
    </>}
  </div></main>
}
