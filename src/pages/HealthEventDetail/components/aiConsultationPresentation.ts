export const aiConsultationConcernSuggestions = [
  '是不是很严重',
  '可能是什么原因',
  '需不需要及时处理',
  '接下来要注意什么',
] as const

export const aiConsultationDraftSections = [
  { title: '基本情况', body: '记录对象的基本信息将在正式生成逻辑接入后显示。' },
  { title: '这次发生了什么', body: '这条健康随记的起因和主要经过将在这里整理。' },
  { title: '症状与变化', body: '已记录的症状、体温及变化过程将在这里整理。' },
  { title: '已经采取的处理', body: '已有的用药、检查或其他处理将在这里整理。' },
] as const
