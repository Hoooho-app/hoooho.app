import { BookOpen, CalendarCheck, CircleHelp, FileText, Leaf, MessageSquare, NotebookPen, Users } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { WebPageHeader } from '../../components/common'
import { HohoButton, HohoInput, HohoSection, HohoSegmentedControl, HohoSurfaceRow } from '../../components/design-system'
import { MainAppHeader } from '../../components/navigation'
import { useAppStore } from '../../store/useAppStore'
import { getArticle, searchHelpArticles } from '../../features/help/search'
import type { HelpArticle } from '../../features/help/types'
import { HELP_MODULES, USER_MANUAL } from '../../../shared/help-center.mjs'
import { HelpChat } from './HelpChat'
import './helpCenter.css'

const moduleIcons={family:Users,record:NotebookPen,allergy:Leaf,follow:CalendarCheck,visit:FileText,trouble:CircleHelp}
const tabs=[{value:'help',label:'帮助'},{value:'manual',label:'用户手册'}] as const
type Tab='help'|'manual'
function ArticleRow({article,onOpen}:{article:HelpArticle;onOpen:(id:string)=>void}){return <HohoSurfaceRow className="help-center-row" title={article.title} description={article.summary} onActivate={()=>onOpen(article.id)}/>}

export function HelpCenterPage(){
  const [params,setParams]=useSearchParams(),accountId=useAppStore(s=>s.authUser?.id??'anonymous')
  const tab:Tab=params.get('tab')==='manual'?'manual':'help',article=getArticle(params.get('article')??''),manual=USER_MANUAL.find(m=>m.id===params.get('manual'))
  const module=HELP_MODULES.find(m=>m.id===params.get('module')),chat=params.get('view')==='chat',query=params.get('q')??''
  const savedPaths=useRef<Record<Tab,string>>({help:'',manual:'tab=manual'})
  const content=useRef<HTMLDivElement>(null)
  const update=(values:Record<string,string>,replace=false)=>setParams(values,{replace})
  const articleOrigin=useRef('')
  const openArticle=(id:string)=>{if(tab==='help'&&!article)articleOrigin.current=params.toString();update({article:id})}
  const switchTab=(next:Tab)=>{if(next===tab)return;savedPaths.current[tab]=params.toString();setParams(new URLSearchParams(savedPaths.current[next]))}
  const openManual=(id:string)=>{savedPaths.current.help=params.toString();update({tab:'manual',manual:id})}
  const results=query.trim()?searchHelpArticles(query,{limit:12}):[]
  const nested=tab==='manual'?Boolean(manual):Boolean(article||module||chat)
  const home=()=>update(tab==='manual'?{tab:'manual'}:{})
  const back=()=>{if(tab==='help'&&article&&articleOrigin.current){setParams(new URLSearchParams(articleOrigin.current));articleOrigin.current=''}else home()}
  useEffect(()=>{savedPaths.current[tab]=params.toString()},[params,tab])
  useLayoutEffect(()=>{if(content.current)content.current.scrollTop=0},[tab,article?.id,manual?.id,module?.id,chat])
  return <main className="app-shell help-center help-center-v2 pb-0">{nested?<WebPageHeader title="帮助中心" onBack={back}/>:<MainAppHeader compact title="帮助中心"/>}
    <div className="help-center-tabs"><HohoSegmentedControl label="帮助中心栏目" options={tabs} value={tab} onChange={switchTab}/></div>
    <div className="help-content" ref={content}>
      {tab==='manual'?manual?<article className="help-detail"><p className="help-query-label">用户手册 · {HELP_MODULES.find(m=>m.id===manual.module)?.label}</p><h2>{manual.title}</h2><p className="help-conclusion">{manual.brief}</p>{[['为什么设计这个功能',manual.purpose],['什么时候用',manual.scene],['一个例子',manual.example],['你能得到什么',manual.output]].map(([title,text])=><HohoSection title={title} key={title}><p className="hoho-text-body">{text}</p></HohoSection>)}<HohoButton fullWidth onClick={()=>{savedPaths.current.manual=params.toString();openArticle(manual.helpArticleId)}}>查看操作帮助</HohoButton></article>:<>
        <HohoSection title="认识 Hoooho 的功能" description="了解每个功能的用途，找到适合你的使用场景。"><p className="hoho-text-body">先留住实际情况，再跟进变化，最后把资料整理好。Hoooho 帮你完成就诊前的准备。</p></HohoSection>
        {HELP_MODULES.filter(m=>m.id!=='trouble').map(m=><HohoSection key={m.id} title={m.label}><div className="help-list">{USER_MANUAL.filter(item=>item.module===m.id).map(item=><HohoSurfaceRow className="help-center-row" key={item.id} title={item.title} description={item.brief} onActivate={()=>openManual(item.id)}/>)}</div></HohoSection>)}
      </>:!chat&&<>
        {article?<article className="help-detail"><p className="help-query-label">帮助 · {article.category}</p><h2>{article.title}</h2><p className="help-conclusion">{article.conclusion}</p><h3>怎么做</h3><ol>{article.steps.map(step=><li key={step}>{step}</li>)}</ol>{article.result&&<HohoSection title="完成后在哪里看"><p className="hoho-text-body">{article.result}</p></HohoSection>}<div className="help-footer-actions">{article.actions?.map(action=><Link key={action.label} to={action.to}>{action.label}</Link>)}</div>
          <HohoSection title="你可能还需要"><div className="help-list">{article.relatedArticleIds?.map(id=>{const a=getArticle(id);return a?<ArticleRow article={a} key={id} onOpen={openArticle}/>:null})}{USER_MANUAL.find(m=>m.helpArticleId===article.id)&&<HohoSurfaceRow title="了解这个功能的用途" leading={<BookOpen size={18}/>} onActivate={()=>openManual(USER_MANUAL.find(m=>m.helpArticleId===article.id)!.id)}/>}<HohoSurfaceRow title="还是不清楚？问产品经理" onActivate={()=>update({view:'chat'})}/></div></HohoSection>
        </article>:module?<HohoSection title={module.label} description={module.description}><div className="help-list">{module.articleIds.map(id=>{const a=getArticle(id);return a?<ArticleRow article={a} key={id} onOpen={openArticle}/>:null})}{module.id==='trouble'&&<>{['email-code-missing','privacy-data','page-load-failed'].map(id=><ArticleRow article={getArticle(id)!} key={id} onOpen={openArticle}/>)}</>}</div></HohoSection>:<>
          <HohoSection title="有什么可以帮你？" description="找操作方法，或解决遇到的问题。"><HohoInput label="搜索教程和问题" type="search" id="help-query" placeholder="你想做什么，或遇到了什么问题？" value={query} onChange={e=>update({q:e.target.value},true)}/></HohoSection>
          <section className="help-smart-entry"><div className="help-chat-heading"><span className="help-role-avatar"><MessageSquare aria-hidden size={20}/></span><div><h2 className="hoho-text-card-title">Hoooho 产品经理</h2><p className="hoho-text-caption">AI 助手 · 智能帮助</p></div></div><p className="hoho-text-body">不知道该找哪篇？告诉我卡在哪一步，我陪你一起找到解决方法。</p><HohoButton fullWidth onClick={()=>update({view:'chat'})}>和产品经理聊聊</HohoButton></section>
          {query.trim()?<HohoSection title={`搜索结果 · ${results.length} 篇`}><div className="help-list">{results.map(({article:a})=><ArticleRow key={a.id} article={a} onOpen={openArticle}/>)}</div>{!results.length&&<p className="hoho-text-body">暂时没有找到相关内容。试试“录音”“配料表”或“情况单”，也可以问产品经理。</p>}<HohoButton variant="text" onClick={()=>update({},true)}>清空搜索</HohoButton></HohoSection>:<>
            <HohoSection title="第一次使用" description="从这三步开始"><div className="help-list">{[['add','添加孩子'],['smart','完成第一条记录'],['summary','整理就医资料']].map(([id,title],i)=><HohoSurfaceRow key={id} title={title} leading={<span className="help-step-number">{i+1}</span>} onActivate={()=>openArticle(id)}/>)}</div></HohoSection>
            <HohoSection title="按你要做的事查找"><div className="help-category-grid">{HELP_MODULES.map(m=>{const Icon=moduleIcons[m.id as keyof typeof moduleIcons];return <button type="button" key={m.id} onClick={()=>update({module:m.id})}><Icon aria-hidden size={20}/><span><strong>{m.label}</strong><small>{m.description}</small></span></button>})}</div></HohoSection>
            <HohoSection title="常见问题"><div className="help-list">{['mic','upload','find'].map(id=><ArticleRow key={id} article={getArticle(id)!} onOpen={openArticle}/>)}</div></HohoSection>
          </>}
        </>}
      </>}
      <HelpChat key={accountId} active={tab==='help'&&chat} onOpenArticle={openArticle}/>
      {nested&&<HohoButton variant="text" onClick={home}>返回{tab==='manual'?'用户手册':'帮助'}首页</HohoButton>}
      <p className="hoho-text-caption help-center-boundary">Hoooho 用于记录和整理信息，不提供医疗诊断。</p>
    </div>
  </main>
}
