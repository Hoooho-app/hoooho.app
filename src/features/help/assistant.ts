import { searchHelpArticles, type HelpSearchResult } from './search.js'
import type { HelpCategory } from './types.js'

export type Clarification = { question: string; options: { label: string; query: string }[] }
export type HelpAssistantResult =
  | { kind: 'answer'; query: string; results: HelpSearchResult[] }
  | { kind: 'clarify'; query: string; clarification: Clarification; results: HelpSearchResult[] }
  | { kind: 'medical-boundary'; query: string }
  | { kind: 'fallback'; query: string; results: HelpSearchResult[] }

const medicalPattern = /(发烧|脚疼|头疼|检查结果).*(什么病|严重吗|吃什么药|用什么药)|停(止)?服|剂量|诊断|处方/
const missingRecordPattern = /(记录|东西|内容).*(不见|没了|找不到)|找不到.*(记录|内容)/

export class LocalHelpAssistantProvider {
  async resolve(input: { query: string; category?: HelpCategory }): Promise<HelpAssistantResult> {
    const query = input.query.trim()
    if (medicalPattern.test(query)) return { kind: 'medical-boundary', query }
    const results = searchHelpArticles(query, { category: input.category })
    if (missingRecordPattern.test(query) && !input.category) {
      return { kind:'clarify', query, results, clarification:{ question:'你找不到的是哪类内容？', options:[
        {label:'健康事件',query:`${query} 健康事件`},{label:'时间线记录',query:`${query} 时间线记录`},
        {label:'健康档案',query:`${query} 健康档案`},{label:'图片或检查结果',query:`${query} 图片附件`}
      ] } }
    }
    if (results[0]?.score >= 52 && (results.length === 1 || results[0].score - (results[1]?.score ?? 0) >= 8)) return { kind:'answer', query, results }
    if (results[0]?.score >= 24) return { kind:'clarify', query, results, clarification:{ question:'下面哪一项最接近你遇到的问题？', options: results.slice(0,4).map(({article}) => ({label:article.title,query:article.title})) } }
    return { kind:'fallback', query, results }
  }
}

export interface HelpAssistantProvider { resolve(input: { query: string; category?: HelpCategory }): Promise<HelpAssistantResult> }

export class HelpAssistant {
  private primary?: HelpAssistantProvider
  private fallback: HelpAssistantProvider
  constructor(primary?: HelpAssistantProvider, fallback: HelpAssistantProvider = new LocalHelpAssistantProvider()) {
    this.primary = primary
    this.fallback = fallback
  }
  async resolve(input: { query: string; category?: HelpCategory }) {
    if (this.primary) {
      try { return await this.primary.resolve(input) } catch { /* local knowledge base remains available */ }
    }
    return this.fallback.resolve(input)
  }
}

export const helpAssistant = new HelpAssistant()
