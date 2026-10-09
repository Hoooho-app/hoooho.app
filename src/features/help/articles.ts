import { SUPPORT_ARTICLES, EXTRA_ARTICLES } from '../../../shared/help-center.mjs'
import type { HelpArticle } from './types.js'

export const HELP_ARTICLES: HelpArticle[] = [...SUPPORT_ARTICLES, ...EXTRA_ARTICLES]
export const PUBLISHED_HELP_ARTICLES = HELP_ARTICLES.filter(article => article.status === 'published')
