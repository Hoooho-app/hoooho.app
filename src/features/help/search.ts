import { PUBLISHED_HELP_ARTICLES } from './articles.js'
import type { HelpArticle, HelpCategory } from './types.js'

const synonymGroups = [
  ['邮箱验证码','邮件验证码','邮箱那个码','邮件码','验证码'],
  ['收不到','没收到','没来','不发','未收到'],
  ['孩子管理','孩子','儿童','记录对象'],
  ['附件','图片','照片','检查结果','检查单'],
  ['找不到','不见了','没了','消失'],
  ['修改','改','写错','填错'],
  ['删除','删掉','清空'],
  ['发生时间','记录时间','日期','时间'],
  ['加载失败','空白','没显示','没有显示','打不开'],
  ['导出','下载','拿出来','备份']
]

const substitutions = new Map<string, string>()
for (const group of synonymGroups) for (const word of group) substitutions.set(word, group[0])

export function normalizeHelpText(value: string) {
  let normalized = value.toLocaleLowerCase().normalize('NFKC').replace(/[\s\p{P}\p{S}]+/gu, '')
  for (const [word, canonical] of substitutions) normalized = normalized.replaceAll(word, canonical)
  return normalized
}

function bigrams(value: string) {
  if (value.length < 2) return value ? [value] : []
  return Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2))
}

function similarity(left: string, right: string) {
  const a = new Set(bigrams(left)); const b = new Set(bigrams(right))
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const value of a) if (b.has(value)) shared += 1
  return (2 * shared) / (a.size + b.size)
}

function articleScore(article: HelpArticle, rawQuery: string, category?: HelpCategory) {
  const query = normalizeHelpText(rawQuery)
  if (!query) return 0
  const title = normalizeHelpText(article.title)
  const summary = normalizeHelpText(article.summary)
  const keywordValues = article.keywords.map(normalizeHelpText)
  const aliasValues = article.aliases.map(normalizeHelpText)
  let score = 0
  if (title === query) score += 120
  if (title.includes(query) || query.includes(title)) score += 55
  if (summary.includes(query)) score += 28
  for (const alias of aliasValues) {
    if (alias === query) score += 105
    else if (alias.includes(query) || query.includes(alias)) score += 48
    score += similarity(query, alias) * 42
  }
  for (const keyword of keywordValues) {
    if (query.includes(keyword)) score += 22
    else score += similarity(query, keyword) * 8
  }
  score += similarity(query, title) * 44
  const queryParts = Array.from(new Set([...bigrams(query), ...article.keywords.map(normalizeHelpText)]))
  const searchable = `${title}${summary}${keywordValues.join('')}${aliasValues.join('')}`
  score += queryParts.filter((part) => part.length > 1 && searchable.includes(part)).length * 2
  if (category === article.category) score += 12
  score += (article.priority ?? 0) / 50
  return score
}

export type HelpSearchResult = { article: HelpArticle; score: number }

export function searchHelpArticles(query: string, options: { category?: HelpCategory; limit?: number } = {}): HelpSearchResult[] {
  if (!normalizeHelpText(query)) return []
  const unique = new Map<string, HelpSearchResult>()
  for (const article of PUBLISHED_HELP_ARTICLES) {
    const score = articleScore(article, query, options.category)
    if (score < 12) continue
    const previous = unique.get(article.id)
    if (!previous || previous.score < score) unique.set(article.id, { article, score })
  }
  return [...unique.values()].sort((a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title)).slice(0, options.limit ?? 8)
}

export function getArticle(id: string) {
  return PUBLISHED_HELP_ARTICLES.find((article) => article.id === id)
}
