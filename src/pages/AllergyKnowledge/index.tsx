import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowUpRight, Bookmark } from 'lucide-react'
import { WebPageHeader } from '../../components/common'
import { EmptyState, HohoButton, HohoSurfaceRow, Typography } from '../../components/design-system'
import { publishedKnowledgeArticles, getKnowledgeStorage } from '../../features/allergy-knowledge/daily'
import { useAppStore } from '../../store/useAppStore'
import './allergyKnowledge.css'

function bookmarkKey(accountId: string, articleId: string) { return `hoooho:knowledge-bookmark:v1:${accountId}:${articleId}` }

export function AllergyKnowledgePage() {
  const { articleId = '' } = useParams()
  const accountId = useAppStore(state => state.authUser?.id ?? '')
  const article = publishedKnowledgeArticles().find(item => item.id === articleId)
  const navigate = useNavigate()
  const location = useLocation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [saved, setSaved] = useState(false)
  const isBookmarked = (id: string) => {
    try { return getKnowledgeStorage()?.getItem(bookmarkKey(accountId, id)) === '1' } catch { return false }
  }
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0)
    try { setSaved(getKnowledgeStorage()?.getItem(bookmarkKey(accountId, articleId)) === '1') } catch { setSaved(false) }
    const previousTitle = document.title
    document.title = article ? `${article.title} · Hoooho` : '过敏小知 · Hoooho'
    return () => { document.title = previousTitle }
  }, [accountId, articleId, article])
  const toggleBookmark = () => {
    const next = !saved
    setSaved(next)
    try { getKnowledgeStorage()?.setItem(bookmarkKey(accountId, articleId), next ? '1' : '0') } catch { /* This reading session remains usable. */ }
  }
  const back = () => {
    if ((location.state as { fromNurseStation?: boolean } | null)?.fromNurseStation) navigate(-1)
    else navigate('/nurse-station', { replace: true })
  }
  return <main className="app-shell allergy-knowledge-page">
    <WebPageHeader title="过敏小知" onBack={back} action={article && <HohoButton variant="text" size="small" aria-pressed={saved} onClick={toggleBookmark}><Bookmark size={16} aria-hidden="true" fill={saved ? 'currentColor' : 'none'} /><span aria-live="polite">{saved ? '已收藏' : '收藏'}</span></HohoButton>} />
    <div className="allergy-knowledge-scroll" ref={scrollRef}>
      {!articleId ? <section className="allergy-knowledge-archive" aria-label="往期内容">
        <Typography variant="sectionTitle">往期内容</Typography>
        {publishedKnowledgeArticles().slice().reverse().map(item => <HohoSurfaceRow key={item.id} title={item.title} description={`${item.publishedAt} · 阅读约 ${item.readingMinutes} 分钟${isBookmarked(item.id) ? ' · 已收藏' : ''}`} onActivate={() => navigate(`/allergy-knowledge/${item.id}`)} />)}
      </section> : article ? <article className="allergy-knowledge-article" aria-labelledby="knowledge-article-title">
        <Typography variant="caption" className="allergy-knowledge-meta">阅读约 {article.readingMinutes} 分钟</Typography>
        <Typography variant="pageTitle" id="knowledge-article-title">{article.title}</Typography>
        <div className="allergy-knowledge-body">{article.sections.map((section, index) => <section key={index}>
          {section.title && <Typography variant="sectionTitle">{section.title}</Typography>}
          {section.paragraphs.map(paragraph => <Typography key={paragraph}>{paragraph}</Typography>)}
          {section.items && <ul>{section.items.map(item => <li className="hoho-text-body" key={item}>{item}</li>)}</ul>}
        </section>)}</div>
        <details className="allergy-knowledge-sources"><summary>参考依据</summary><ul>{article.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer"><span>{source.organization}<small>{source.title}</small></span><ArrowUpRight size={16} aria-hidden="true" /></a><Typography variant="caption">资料核对：{source.checkedAt}</Typography></li>)}</ul></details>
        <HohoButton variant="text" className="allergy-knowledge-history" onClick={() => navigate('/allergy-knowledge')}>往期内容</HohoButton>
      </article> : <EmptyState title="这篇内容暂不可用" description="可以返回护士站阅读当前的过敏小知。" action={<HohoButton onClick={() => navigate('/nurse-station', { replace: true })}>返回护士站</HohoButton>} />}
    </div>
  </main>
}
