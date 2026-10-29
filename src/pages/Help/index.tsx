import { BookOpen, MessageSquare, Moon, SymptomIcon } from '../../components/icons'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { WebPageHeader } from '../../components/common'
import { HohoButton, HohoInput, HohoSection, HohoSegmentedControl, HohoSurfaceRow } from '../../components/design-system'
import { useAppStore } from '../../store/useAppStore'
import { getArticle, searchHelpArticles } from '../../features/help/search'
import { PUBLISHED_HELP_ARTICLES } from '../../features/help/articles'
import { clearHelpLessonReceipt, helpLessonRecordUrl, helpLessonUrl, readHelpLessonReceipt } from '../../features/help/guidedRecord'
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
  const update = (values: Record<string, string>, replace = false) => setParams(values, { replace })
  const home = () => update({ ...(tab !== 'tutorials' ? { tab } : {}), ...(query ? { q: query } : {}) })
  const openArticle = (id: string) => {
    articleOrigin.current = params.toString()
    update({ ...(tab !== 'tutorials' ? { tab } : {}), article: id })
  }
  const back = () => {
    if (article && articleOrigin.current) { setParams(new URLSearchParams(articleOrigin.current)); articleOrigin.current = '' }
    else home()
  }
  const switchTab = (next: Tab) => {
    if (next === tab) return
    savedPaths.current[tab] = params.toString()
    const nextParams = new URLSearchParams(savedPaths.current[next] ?? (next === 'tutorials' ? '' : 'tab=' + next))
    if (query) nextParams.set('q', query)
    else nextParams.delete('q')
    setParams(nextParams)
  }
  const results = query.trim() ? searchHelpArticles(query, { limit: 18 }) : []
  const receipt = article?.lesson ? readHelpLessonReceipt(accountId, memberId, article.lesson) : null
  const startLesson = () => {
    if (!article?.lesson) return
    clearHelpLessonReceipt(accountId, memberId, article.lesson)
    navigate(helpLessonUrl(article.lesson), { state: { helpTutorialReturn: true } })
  }
  useEffect(() => { if (!article && !chat) articleOrigin.current = '' }, [article, chat])
  useLayoutEffect(() => { if (content.current) content.current.scrollTop = 0 }, [tab, article?.id, module?.id, chat, query])
  const rows = (ids: string[]) => <div className="help-list">{ids.map(id => { const item = getArticle(id); return item ? <ArticleRow key={id} article={item} onOpen={openArticle}/> : null })}</div>
  const productHelp = article?.kind === 'product' ? USER_MANUAL.find(item => item.articleId === article.id)?.helpArticleId : null
  return <main className="app-shell help-center help-center-v2 pb-0">
    {nested ? <WebPageHeader title="帮助中心" onBack={back}/> : <WebPageHeader title="帮助中心" fallback="/nurse-station"/>}
    <div className="help-center-tabs"><HohoSegmentedControl label="帮助中心栏目" options={tabs} value={tab} onChange={switchTab}/></div>
    <div className="help-content" ref={content}>
      {!nested && <div className="help-search"><HohoInput label="搜索教程和问题" type="search" id="help-query" placeholder="想做什么，或卡在哪一步？" value={query} onChange={e => update({ ...(tab !== 'tutorials' ? { tab } : {}), ...(e.target.value ? { q: e.target.value } : {}) }, true)}/></div>}
      {!chat && (article ? <article className="help-detail">
        <p className="help-query-label">{article.kind === 'product' ? '产品说明' : article.kind === 'faq' ? '常见问题' : '使用教程'}</p>
        <h2 className="help-detail-title">{article.title}</h2>
        <p className="help-conclusion">{article.conclusion}</p>
        {article.lesson && <section className="help-lesson" aria-label="跟着记录">
          {receipt ? <>
            <p className="hoho-text-card-title">这次记录已保存</p>
            <p className="hoho-text-body">打开刚才的记录，核对内容。以后可以从健康日历按发生日期找回。</p>
            <HohoButton fullWidth onClick={() => navigate(helpLessonRecordUrl(memberId, receipt))}>查看刚才的记录</HohoButton>
            <HohoButton variant="text" onClick={startLesson}>再记一条</HohoButton>
          </> : <>
            <p className="hoho-text-card-title">跟着做，记下自己的实际情况</p>
            <p className="hoho-text-body">{member ? '当前孩子：' + member.name + '。' : '开始后先确认孩子。'}示例只作说明，不会自动写入档案。</p>
            <HohoButton fullWidth onClick={startLesson}>{article.lesson === 'sleep' ? '跟着记一次睡眠' : '跟着记一条'}</HohoButton>
          </>}
        </section>}
        <h3 className="hoho-text-card-title">{article.kind === 'product' ? '了解更多' : '怎么做'}</h3>
        <ol className="help-steps">{article.steps.map(step => <li key={step}>{step}</li>)}</ol>
        {article.result && <HohoSection title="完成后在哪里看"><p className="hoho-text-body">{article.result}</p></HohoSection>}
        {productHelp && <HohoButton fullWidth variant="secondary" onClick={() => openArticle(productHelp)}>看看怎么做</HohoButton>}
        {!article.lesson && article.actions?.length ? <div className="help-footer-actions">{article.actions.map(action => <Link key={action.label} to={action.to}>{action.label}</Link>)}</div> : null}
        {article.relatedArticleIds?.length ? <HohoSection title="你可能还需要">{rows(article.relatedArticleIds)}</HohoSection> : null}
      </article> : module ? <HohoSection title={module.label} description={module.description}>{rows(module.articleIds)}</HohoSection> : nested ? <HohoSection title="看看当前可以怎么用"><p className="hoho-text-body">这篇旧说明已更新，请从当前教程查找操作方法。</p><HohoButton onClick={home}>查看当前教程</HohoButton></HohoSection> : query.trim() ? <HohoSection title={'搜索结果 · ' + results.length + ' 篇'}>{rows(results.map(result => result.article.id))}{!results.length && <p className="hoho-text-body">暂时没有找到相关内容。试试“手动记录”“睡眠”或“导出”，也可以问使用助手。</p>}<HohoButton variant="text" onClick={() => update(tab === 'tutorials' ? {} : { tab }, true)}>清空搜索</HohoButton></HohoSection> : tab === 'tutorials' ? <>
        <HohoSection title="先记下一件小事" description="手动填写就能记，不必每次拍照，也不必每次说话。">
          <div className="help-first-lessons">
            {[['symptom', SymptomIcon, '手动记一件发生的事', '填情况、核对时间，保存后再找到它'], ['sleep', Moon, '记一次睡眠', '记下入睡与醒来，跨夜也能补记']].map(([id, Icon, title, description]) => {
              const Leading = Icon as typeof SymptomIcon
              return <HohoSurfaceRow className="help-center-row" key={id as string} leading={<Leading size={24}/>} title={title as string} description={description as string} onActivate={() => openArticle(id as string)}/>
            })}
          </div>
        </HohoSection>
        <HohoSection title="接着学会日常记录">{rows(['daily', 'medication', 'change-record-time'])}</HohoSection>
        <HohoSection title="找回、修改与带走资料">{rows(['find', 'delete-record', 'summary', 'html', 'prompt', 'review'])}</HohoSection>
        <HohoSection title="孩子与长期档案">{rows(['add', 'profile', 'growth', 'allergy'])}</HohoSection>
        <HohoSection title="想说话，或有图片时">{rows(['smart', 'mic', 'upload'])}</HohoSection>
      </> : tab === 'product' ? <>
        <HohoSection title="慢慢记，需要时讲清楚" description="把孩子的情况持续留下，整理后交给需要了解的人。"><p className="hoho-text-body">这里介绍当前测试版已经提供的功能与使用方式。</p></HohoSection>
        {rows(USER_MANUAL.map(item => item.articleId!).filter(Boolean))}
      </> : <>
        <HohoSection title="卡在哪一步？" description="先保留已有内容，再找到能继续的办法。">{rows(['save', 'find', 'mic', 'recognition', 'attachment-upload-failed', 'export-data'])}</HohoSection>
        <HohoSection title="账号、权限与其他问题">{rows(PUBLISHED_HELP_ARTICLES.filter(item => item.kind === 'faq' && !['save', 'find', 'mic', 'recognition', 'attachment-upload-failed', 'export-data'].includes(item.id)).map(item => item.id))}</HohoSection>
      </>)}
      <HelpChat key={accountId || 'anonymous'} active={chat} onOpenArticle={openArticle}/>
      {!chat && <div className="help-assistant-entry"><MessageSquare aria-hidden size={20}/><div><p className="hoho-text-card-title">还有问题？问使用助手</p><p className="hoho-text-caption">AI 使用帮助，依据当前产品说明回答。</p></div><HohoButton variant="text" onClick={() => update({ ...(tab !== 'tutorials' ? { tab } : {}), view: 'chat' })}>去提问</HohoButton></div>}
      {nested && <HohoButton variant="text" onClick={home}><BookOpen aria-hidden size={16}/>返回{tabs.find(item => item.value === tab)!.label}</HohoButton>}
      <p className="hoho-text-caption help-center-boundary">护护用于记录和整理信息，不提供医疗诊断。</p>
    </div>
  </main>
}
