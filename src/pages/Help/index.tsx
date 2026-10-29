import { BookOpen, MessageSquare, ChevronRight, ChevronDown, FileText, Search, UserRound, Mic } from '../../components/icons'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { WebPageHeader } from '../../components/common'
import { HohoButton, HohoInput, HohoSection, HohoSegmentedControl, HohoSurfaceRow, HohoSpotlightGuide } from '../../components/design-system'
import { useAppStore } from '../../store/useAppStore'
import { getArticle, searchHelpArticles } from '../../features/help/search'
import { PUBLISHED_HELP_ARTICLES } from '../../features/help/articles'
import { beginHelpGuide, clearHelpLessonReceipt, helpLessonRecordUrl, helpLessonUrl, readHelpLessonReceipt, readHelpGuideState, writeHelpGuideState } from '../../features/help/guidedRecord'
import { HelpIllustration } from '../../features/help/HelpIllustration'
import { helpTourUrl } from '../../features/help/pageTours'
import { helpReturnOptions, readHelpOrigin } from '../../features/help/navigation'
import type { HelpArticle } from '../../features/help/types'
import { HELP_MODULES, USER_MANUAL } from '../../../shared/help-center.mjs'
import { HelpChat } from './HelpChat'
import './helpCenter.css'

const tabs = [{ value: 'tutorials', label: '使用教程' }, { value: 'product', label: '产品说明' }, { value: 'faq', label: '常见问题' }] as const
type Tab = typeof tabs[number]['value']
function ArticleRow({ article, onOpen }: { article: HelpArticle; onOpen: (id: string) => void }) {
  return <HohoSurfaceRow className="help-center-row" title={article.title} description={article.summary} onActivate={() => onOpen(article.id)}/>
}
export function HelpCenterPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [, refreshGuide] = useState(0)
  const accountId = useAppStore(s => s.authUser?.id ?? '')
  const memberId = useAppStore(s => s.currentMemberId)
  const member = useAppStore(s => s.members.find(m => m.id === s.currentMemberId))
  const rawTab = params.get('tab')
  const tab: Tab = rawTab === 'product' || rawTab === 'manual' ? 'product' : rawTab === 'faq' ? 'faq' : 'tutorials'
  const legacyManual = USER_MANUAL.find(item => item.id === params.get('manual'))
  const legacyArticles: Record<string, string> = { family: 'add', profile: 'profile', growth: 'growth', symptom: 'symptom', daily: 'daily', allergy: 'allergy', summary: 'summary' }
  const articleId = params.get('article') ?? legacyManual?.articleId ?? legacyArticles[params.get('manual') ?? ''] ?? ''
  const article = getArticle(articleId)
  const module = HELP_MODULES.find(item => item.id === params.get('module'))
  const chat = params.get('view') === 'chat'
  const query = params.get('q') ?? ''
  const nested = Boolean(article || module || chat || params.has('article') || params.has('manual') || params.has('module'))
  const content = useRef<HTMLDivElement>(null)
  const articleOrigin = useRef('')
  const savedPaths = useRef<Partial<Record<Tab, string>>>({})
  const origin = readHelpOrigin(location.state, accountId, memberId)
  const helpState = origin ? { helpOrigin: origin } : null
  const update = (values: Record<string, string>, replace = false) => setParams(values, { replace, state: helpState })
  const home = () => update({ ...(tab !== 'tutorials' ? { tab } : {}), ...(query ? { q: query } : {}) })
  const openArticle = (id: string) => {
    articleOrigin.current = params.toString()
    update({ ...(tab !== 'tutorials' ? { tab } : {}), article: id })
  }
  const back = () => {
    if (article && articleOrigin.current) { setParams(new URLSearchParams(articleOrigin.current), { state: helpState }); articleOrigin.current = '' }
    else home()
  }
  const switchTab = (next: Tab) => {
    if (next === tab) return
    savedPaths.current[tab] = params.toString()
    const nextParams = new URLSearchParams(savedPaths.current[next] ?? (next === 'tutorials' ? '' : 'tab=' + next))
    if (query) nextParams.set('q', query)
    else nextParams.delete('q')
    setParams(nextParams, { state: helpState })
  }
  const results = query.trim() ? searchHelpArticles(query, { limit: 18 }) : []
  const dailyReceipts = article?.id === 'daily' ? (['diet', 'elimination'] as const).map(lesson => ({ lesson, receipt: readHelpLessonReceipt(accountId, memberId, lesson) })).filter(item => item.receipt).sort((a,b) => Date.parse(b.receipt!.savedAt) - Date.parse(a.receipt!.savedAt)) : []
  const receiptLesson = dailyReceipts[0]?.lesson ?? article?.lesson
  const receipt = receiptLesson ? readHelpLessonReceipt(accountId, memberId, receiptLesson) : null
  const guide = receiptLesson ? readHelpGuideState(accountId, memberId, receiptLesson) : null
  const startLesson = (lesson = article?.lesson) => {
    if (!lesson) return
    if (article?.id === 'daily') { clearHelpLessonReceipt(accountId, memberId, 'diet'); clearHelpLessonReceipt(accountId, memberId, 'elimination') }
    else clearHelpLessonReceipt(accountId, memberId, lesson)
    beginHelpGuide(accountId, memberId, lesson, true)
    navigate(helpLessonUrl(lesson), { state: { ...helpState, helpTutorialReturn: true } })
  }
  const viewSaved = () => {
    if (!receipt || !receiptLesson) return
    writeHelpGuideState(accountId, memberId, receiptLesson, { step: 0, paused: false, phase: 'viewed' })
    navigate(helpLessonRecordUrl(memberId, receipt))
  }
  const pauseResult = () => {
    if (!receiptLesson || !guide) return
    writeHelpGuideState(accountId, memberId, receiptLesson, { ...guide, paused: true })
    refreshGuide(value => value + 1)
  }
  useEffect(() => { if (!article && !chat) articleOrigin.current = '' }, [article, chat])
  useLayoutEffect(() => { if (content.current) content.current.scrollTop = 0 }, [tab, article?.id, module?.id, chat, query])
  const rows = (ids: string[]) => <div className="help-list">{ids.map(id => { const item = getArticle(id); return item ? <ArticleRow key={id} article={item} onOpen={openArticle}/> : null })}</div>
  const productHelp = article?.kind === 'product' ? USER_MANUAL.find(item => item.articleId === article.id)?.helpArticleId : null
  return <main className="app-shell help-center help-center-v2 pb-0">
    {nested ? <WebPageHeader title="帮助中心" onBack={back}/> : <WebPageHeader title="帮助中心" onBack={() => navigate(origin?.path ?? '/nurse-station', helpReturnOptions(origin))}/> }
    <div className="help-center-tabs"><HohoSegmentedControl label="帮助中心栏目" options={tabs} value={tab} onChange={switchTab}/></div>
    <div className="help-content" ref={content}>
      {!nested && <div className="help-search"><HohoInput label="搜索教程和问题" type="search" id="help-query" placeholder="想做什么，或卡在哪一步？" value={query} onChange={e => update({ ...(tab !== 'tutorials' ? { tab } : {}), ...(e.target.value ? { q: e.target.value } : {}) }, true)}/></div>}
      {!chat && (article ? <article className="help-detail">
        <p className="help-query-label">{article.kind === 'product' ? '产品说明' : article.kind === 'faq' ? '常见问题' : '使用教程'}</p>
        <h2 className="help-detail-title">{article.title}</h2>
        <p className="help-conclusion">{article.conclusion}</p>
        <HelpIllustration article={article}/>
        {article.lesson && <section className="help-lesson" aria-label="跟着记录">
          {receipt ? <>
            <p className="hoho-text-card-title">这次记录已保存</p>
            <p className="hoho-text-body">打开刚才的记录，核对内容。以后可以从健康日历按发生日期找回。</p>
            <HohoButton data-help-target="saved-record-view" fullWidth onClick={viewSaved}>查看刚才的记录</HohoButton>
            <HohoButton variant="text" onClick={() => startLesson(receiptLesson)}>再记一条</HohoButton>
            {article.id === 'daily' && <HohoButton variant="text" onClick={() => startLesson(receiptLesson === 'elimination' ? 'diet' : 'elimination')}>{receiptLesson === 'elimination' ? '改记喂养与饮食' : '改记一次排便'}</HohoButton>}
          </> : <>
            <p className="hoho-text-card-title">跟着做，记下自己的实际情况</p>
            <p className="hoho-text-body">{member ? '当前孩子：' + member.name + '。' : '开始后先确认孩子。'}示例只作说明，不会自动写入档案。</p>
            <HohoButton fullWidth onClick={() => startLesson()}>{article.lesson === 'sleep' ? '跟着记一次睡眠' : '跟着记一条'}</HohoButton>
            {article.id === 'daily' && <HohoButton variant="secondary" fullWidth onClick={() => startLesson('elimination')}>跟着记一次排便</HohoButton>}
          </>}
        </section>}
        {!article.lesson && helpTourUrl(article.id) && <HohoButton fullWidth onClick={() => navigate(helpTourUrl(article.id)!, { state: { ...helpState, helpTourStart: crypto.randomUUID() } })}>打开页面，跟着操作</HohoButton>}
        <h3 className="hoho-text-card-title">{article.kind === 'product' ? '了解更多' : '怎么做'}</h3>
        <ol className="help-steps">{article.steps.map(step => <li key={step}>{step}</li>)}</ol>
        {article.result && <HohoSection title="完成后在哪里看"><p className="hoho-text-body">{article.result}</p></HohoSection>}
        {productHelp && <HohoButton fullWidth variant="secondary" onClick={() => openArticle(productHelp)}>看看怎么做</HohoButton>}
        {!article.lesson && article.actions?.length ? <div className="help-footer-actions">{article.actions.map(action => <Link key={action.label} to={action.to}>{action.label}</Link>)}</div> : null}
        {article.relatedArticleIds?.length ? <HohoSection title="你可能还需要">{rows(article.relatedArticleIds)}</HohoSection> : null}
      </article> : module ? <HohoSection title={module.label} description={module.description}>{rows(module.articleIds)}</HohoSection> : nested ? <HohoSection title="看看当前可以怎么用"><p className="hoho-text-body">这篇旧说明已更新，请从当前教程查找操作方法。</p><HohoButton onClick={home}>查看当前教程</HohoButton></HohoSection> : query.trim() ? <HohoSection title={'搜索结果 · ' + results.length + ' 篇'}>{rows(results.map(result => result.article.id))}{!results.length && <p className="hoho-text-body">暂时没有找到相关内容。试试“手动记录”“睡眠”或“导出”，也可以问使用助手。</p>}<HohoButton variant="text" onClick={() => update(tab === 'tutorials' ? {} : { tab }, true)}>清空搜索</HohoButton></HohoSection> : tab === 'tutorials' ? <>
        <div className="help-intro"><span className="help-eyebrow">从这里开始</span><h2>先记好一件小事</h2><p>不用记住步骤。读一眼图解，<br/>再让护护指着页面，陪你做一遍。</p></div>
        <div className="help-featured" aria-label="入门教程">
          {['symptom', 'sleep'].map((id, i) => { const item = getArticle(id)!; return <button key={id} className="help-feature-card" onClick={() => openArticle(id)} type="button"><HelpIllustration article={item} compact/><span className="help-feature-copy"><small>入门 {i + 1}</small><strong>{id === 'sleep' ? '记一次睡眠' : '手动记一件事'}</strong><span>{id === 'sleep' ? '入睡、醒来，跨夜也能补记' : '写情况、核对时间，再保存'}</span><b>看图解 · 跟着做 <ChevronRight size={15}/></b></span></button> })}
        </div>
        <div className="help-more-heading"><h2 className="hoho-text-section-title">接下来想做什么？</h2><p className="hoho-text-caption">展开一项，找到对应的图解和操作引导。</p></div>
        {[
          { title:'记好日常', text:'喂养、排便、用药与补记时间', icon:FileText, ids:['daily','medication','change-record-time'] },
          { title:'找回和带走记录', text:'查找、修改、就诊情况单与导出', icon:Search, ids:['find','delete-record','summary','html','prompt','review'] },
          { title:'补充孩子档案', text:'孩子、生长测量与长期背景', icon:UserRound, ids:['add','profile','growth','allergy'] },
          { title:'说话或使用图片', text:'语音是可选方式，识别后先核对', icon:Mic, ids:['smart','mic','upload','recognition'] }
        ].map(group => <details key={group.title} className="help-group"><summary><group.icon size={21} aria-hidden/><span><strong>{group.title}</strong><small>{group.text}</small></span><ChevronDown size={18} aria-hidden/></summary>{rows(group.ids)}</details>)}
      </> : tab === 'product' ? <>
        <div className="help-intro"><span className="help-eyebrow">为什么使用护护</span><h2>平时记下来，需要时说清楚</h2><p>先留住实际情况，回头能找到，<br/>再把重点整理给需要了解的人。</p></div>
        {USER_MANUAL.slice(0, 3).map(item => { const entry = getArticle(item.articleId!)!; return <button key={entry.id} className="help-product-card" onClick={() => openArticle(entry.id)}><HelpIllustration article={entry} compact/><span><strong>{entry.title}</strong><small>{entry.summary}</small><b>了解更多 <ChevronRight size={15}/></b></span></button> })}
        <details className="help-group"><summary><UserRound size={21}/><span><strong>适用人群、账号与数据</strong><small>当前版本的使用范围和保存原则</small></span><ChevronDown size={18}/></summary>{rows(USER_MANUAL.slice(3).map(item => item.articleId!).filter(Boolean))}</details>
      </> : <>
        <div className="help-intro"><span className="help-eyebrow">遇到问题</span><h2>先留住内容，再继续</h2><p>从你卡住的那一步查起。</p></div>
        {rows(['save','find','mic','recognition','attachment-upload-failed','export-data'])}
        <details className="help-group"><summary><UserRound size={21}/><span><strong>账号、权限与其他问题</strong><small>登录、绑定、数据和页面异常</small></span><ChevronDown size={18}/></summary>{rows(PUBLISHED_HELP_ARTICLES.filter(item => item.kind === 'faq' && !['save','find','mic','recognition','attachment-upload-failed','export-data'].includes(item.id)).map(item => item.id))}</details>
      </>)}
      <HelpChat key={accountId || 'anonymous'} active={chat} onOpenArticle={openArticle}/>
      {!chat && <div className="help-assistant-entry"><MessageSquare aria-hidden size={20}/><div><p className="hoho-text-card-title">还有问题？问使用助手</p><p className="hoho-text-caption">AI 使用帮助，依据当前产品说明回答。</p></div><HohoButton variant="text" onClick={() => update({ ...(tab !== 'tutorials' ? { tab } : {}), view: 'chat' })}>去提问</HohoButton></div>}
      {nested && <HohoButton variant="text" onClick={home}><BookOpen aria-hidden size={16}/>返回{tabs.find(item => item.value === tab)!.label}</HohoButton>}
      <p className="hoho-text-caption help-center-boundary">护护用于记录和整理信息，不提供医疗诊断。</p>
    </div>
    {receipt && guide?.phase === 'saved' && !guide.paused && <HohoSpotlightGuide targets={['[data-help-target="saved-record-view"]']} title="保存好了，打开刚才那一条" description="这里打开的是刚刚真实保存的记录。核对孩子、时间与内容；以后也可以在健康日历找到它。" step={0} total={1} onExit={pauseResult}/>}
  </main>
}
