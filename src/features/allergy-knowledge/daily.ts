import { getLocalDateKey } from '../../utils/localCalendarDate'
import { KNOWLEDGE_ARTICLES, type KnowledgeArticle } from './articles'

export interface DailyKnowledgeChoice { day: string; articleId: string }
export type KnowledgeStorage = Pick<Storage, 'getItem' | 'setItem'>

// Use calendar arithmetic (not 24-hour subtraction) across local DST boundaries.
export function knowledgeEditionDate(now = new Date()) {
  const date = new Date(now)
  if (date.getHours() < 6) date.setDate(date.getDate() - 1)
  return getLocalDateKey(date)!
}

export function nextKnowledgeUpdate(now = new Date()) {
  const date = new Date(now)
  date.setHours(6, 0, 0, 0)
  if (date.getTime() <= now.getTime()) date.setDate(date.getDate() + 1)
  return date
}

export function publishedKnowledgeArticles(now = new Date(), articles = KNOWLEDGE_ARTICLES) {
  const today = knowledgeEditionDate(now)
  return articles.filter(article => article.status === 'published' && article.publishedAt <= today)
    .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.id.localeCompare(b.id))
}

export function chooseDailyKnowledge(now: Date, articles: readonly KnowledgeArticle[], previous?: DailyKnowledgeChoice | null): KnowledgeArticle | null {
  const available = publishedKnowledgeArticles(now, articles)
  if (!available.length) return null
  const day = knowledgeEditionDate(now)
  const retained = previous?.day === day ? available.find(article => article.id === previous.articleId) : null
  if (retained) return retained
  // Anchor rotation to the newest release: appending a scheduled article must
  // make it the next edition, regardless of the pool size or calendar ordinal.
  // A retained current edition above always wins over newly added content.
  const newestFirst = available.slice().reverse()
  const ordinal = (key: string) => {
    const [year, month, date] = key.split('-').map(Number)
    return Math.floor(Date.UTC(year, month - 1, date) / 86400000)
  }
  const offset = ordinal(day) - ordinal(newestFirst[0].publishedAt)
  return newestFirst[offset % newestFirst.length]
}

export function knowledgeChoiceKey(accountId: string) { return `hoooho:daily-knowledge:v1:${accountId}` }

export function readDailyKnowledge(accountId: string, now = new Date(), storage?: KnowledgeStorage, articles = KNOWLEDGE_ARTICLES) {
  let previous: DailyKnowledgeChoice | null = null
  try { previous = JSON.parse(storage?.getItem(knowledgeChoiceKey(accountId)) ?? 'null') as DailyKnowledgeChoice | null } catch { /* A blocked or corrupt store never blocks reading. */ }
  const article = chooseDailyKnowledge(now, articles, previous)
  if (article) {
    try { storage?.setItem(knowledgeChoiceKey(accountId), JSON.stringify({ day: knowledgeEditionDate(now), articleId: article.id })) } catch { /* Daily selection still works without persistence. */ }
  }
  return article
}

export function getKnowledgeStorage(): KnowledgeStorage | undefined {
  try { return window.localStorage } catch { return undefined }
}
