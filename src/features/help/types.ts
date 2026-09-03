export const HELP_CATEGORIES = [
  '账号与登录', '家庭成员', '健康随记', '记录与时间线',
  '健康档案', '图片与附件', '数据与隐私', '故障排查'
] as const

export type HelpCategory = typeof HELP_CATEGORIES[number]

export type HelpAction = { label: string; to: string }

export type HelpArticle = {
  id: string
  title: string
  summary: string
  category: HelpCategory
  keywords: string[]
  aliases: string[]
  conclusion: string
  steps: string[]
  commonCauses?: string[]
  relatedArticleIds?: string[]
  actions?: HelpAction[]
  platforms?: string[]
  updatedAt: string
  status: 'published' | 'draft' | 'archived'
  priority?: number
}
