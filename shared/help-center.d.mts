import type { HelpArticle } from '../src/features/help/types.js'
export const SUPPORT_ARTICLES: HelpArticle[]
export const EXTRA_ARTICLES: HelpArticle[]
export interface ManualEntry { id: string; title: string; brief: string; purpose: string; scene: string; example: string; output: string; module: string; category: string; helpArticleId: string }
export const USER_MANUAL: ManualEntry[]
export interface HelpModule { id: string; label: string; description: string; articleIds: string[] }
export const HELP_MODULES: HelpModule[]
