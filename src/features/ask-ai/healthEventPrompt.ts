import type {
  EventAttachmentApiDto,
  HealthEvent,
  HealthEventApiDto,
  HealthEventRecordApiDto,
  HealthFact,
  HealthRecordOrganizationApiDto,
  Member,
} from '../../types'

export type HealthEventPromptGroupId = 'basic' | 'event' | 'timeline' | 'raw' | 'profile' | 'history' | 'attachments'

export interface HealthProfilePromptEntry {
  id: string
  lines: string[]
}

export interface HealthProfilePromptSection {
  entries: HealthProfilePromptEntry[]
  id: string
  title: string
}

export interface HealthEventPromptContext {
  attachments: EventAttachmentApiDto[]
  currentMemberId: string
  event: HealthEvent
  healthProfile: HealthProfilePromptSection[]
  member: Member
  organizations: HealthRecordOrganizationApiDto[]
  records: HealthEventRecordApiDto[]
  relatedEvents: HealthEventApiDto[]
}

export interface PromptInformationItem {
  detail: string
  id: string
  label: string
}

export interface PromptInformationGroup {
  description: string
  id: HealthEventPromptGroupId
  items: PromptInformationItem[]
  label: string
}

export interface PromptInformationSummary {
  attachmentCount: number
  groupCounts: Record<HealthEventPromptGroupId, number>
  recordCount: number
  totalCount: number
}

interface StructuredFactItem {
  fact: HealthFact
  id: string
  occurredAt: string | null
  record: HealthEventRecordApiDto | undefined
}

const validTime = (value: string | null | undefined) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const formatTime = (value: string | null | undefined) => {
  const date = validTime(value)
  if (!date) return '时间未确认'
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

const eventStatus = (status: HealthEvent['status'] | HealthEventApiDto['status']) => {
  if (status === 'recovered') return '已恢复'
  if (status === 'handling') return '处理中'
  if (status === 'observing' || status === 'ongoing') return '观察中'
  return '尚未形成有效记录'
}

const genderLabel = (gender: Member['gender']) => gender === 'male' ? '男' : gender === 'female' ? '女' : '未提供'
const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))]
const selectedOnly = <T extends { id: string }>(items: T[], selected: ReadonlySet<string>) => items.filter(({ id }) => selected.has(id))

function assertMemberScope(context: HealthEventPromptContext) {
  const memberId = context.currentMemberId.trim()
  if (!memberId || memberId === 'self') throw new Error('当前孩子无法确认，请先选择孩子')
  if (context.member.id !== memberId || context.event.memberId !== memberId) {
    throw new Error('当前健康随记与所选孩子不一致，请返回后重新选择孩子')
  }
  if (context.relatedEvents.some((event) => event.memberId !== memberId)) {
    throw new Error('发现不属于当前孩子的历史健康随记，已停止生成')
  }
}

function structuredFacts(context: HealthEventPromptContext): StructuredFactItem[] {
  const records = new Map(context.records.map((record) => [record.id, record]))
  return context.organizations.flatMap((organization) => (
    (organization.healthAIOutput?.facts ?? []).map((fact, index) => {
      const record = records.get(organization.recordId)
      return {
        id: `timeline:${organization.id}:${fact.id || index}`,
        fact,
        record,
        occurredAt: fact.time.resolvedStart ?? record?.occurredAt ?? null,
      }
    })
  )).sort((left, right) => {
    const leftTime = validTime(left.occurredAt)?.getTime() ?? Number.MAX_SAFE_INTEGER
    const rightTime = validTime(right.occurredAt)?.getTime() ?? Number.MAX_SAFE_INTEGER
    return leftTime - rightTime
  })
}

function factSemantics(fact: HealthFact) {
  return [
    fact.polarity === 'negated' ? '否定' : fact.polarity === 'uncertain' ? '不确定' : '明确提供',
    fact.temporality === 'conditional' ? '条件/假设' : fact.temporality === 'future' ? '计划或未来' : fact.temporality === 'historical' ? '历史' : '',
    fact.change === 'improved' ? '缓解' : fact.change === 'worsened' ? '加重' : fact.change === 'recurred' ? '反复' : fact.change === 'resolved' ? '恢复' : '',
  ].filter(Boolean).join('；')
}

function factLine(item: StructuredFactItem) {
  const rawTime = item.fact.time.raw?.trim()
  const source = item.fact.sourceText?.trim() || item.record?.sourceText?.trim() || item.record?.content.trim() || '未提供原始描述'
  const time = `${formatTime(item.occurredAt)}${rawTime ? `（原始时间表达：${rawTime}）` : '（原始时间表达：未提供）'}`
  return `${time}｜${item.fact.name}｜语义：${factSemantics(item.fact)}｜来源原文：${source}`
}

function attachmentText(attachment: EventAttachmentApiDto) {
  const analysis = attachment.analysis
  const lines = [`${attachment.name}（${attachment.mimeType}，${formatTime(attachment.createdAt)}）`]
  if (analysis?.summary) lines.push(`识别摘要：${analysis.summary}`)
  if (analysis?.observedText) lines.push(`识别文字：${analysis.observedText}`)
  if (analysis?.extractedFacts?.length) lines.push(`结构化识别：${analysis.extractedFacts.map((fact) => fact.name).join('；')}`)
  return lines.join('\n')
}

export function getPromptInformationGroups(context: HealthEventPromptContext): PromptInformationGroup[] {
  const facts = structuredFacts(context)
  const profileItems = context.healthProfile.flatMap((section) => section.entries.map((entry) => ({
    id: `profile:${section.id}:${entry.id}`,
    label: section.title,
    detail: entry.lines.join('；'),
  })))
  const historyItems = context.relatedEvents
    .filter((event) => event.memberId === context.currentMemberId && event.id !== context.event.id)
    .sort((left, right) => (validTime(right.startTime)?.getTime() ?? 0) - (validTime(left.startTime)?.getTime() ?? 0))
    .map((event) => ({ id: `history:${event.id}`, label: event.title || '未命名健康随记', detail: `${formatTime(event.startTime)} · ${eventStatus(event.status)}` }))

  return [
    { id: 'basic', label: '对象基本信息', description: '姓名、年龄、性别及已填写的基础资料', items: [{ id: 'basic:member', label: context.member.name, detail: [context.member.age, genderLabel(context.member.gender)].filter(Boolean).join(' · ') }] },
    { id: 'event', label: '当前健康随记', description: '随记标题、开始时间、状态和当前摘要', items: [{ id: 'event:overview', label: context.event.title || '未命名健康随记', detail: `${formatTime(context.event.startDate)} · ${eventStatus(context.event.status)}` }] },
    { id: 'timeline', label: '完整结构化时间线', description: '保留时间、否定、假设、变化和来源原文', items: facts.map((item) => ({ id: item.id, label: item.fact.name, detail: factLine(item) })) },
    { id: 'raw', label: '用户原始记录', description: '这条健康随记中的完整原话，不做截断', items: [...context.records].sort((left, right) => (validTime(left.occurredAt)?.getTime() ?? 0) - (validTime(right.occurredAt)?.getTime() ?? 0)).map((record) => ({ id: `raw:${record.id}`, label: formatTime(record.occurredAt), detail: record.sourceText?.trim() || record.content })) },
    { id: 'profile', label: '健康档案', description: '只包含当前孩子已填写的档案', items: profileItems },
    { id: 'history', label: '相关历史随记', description: '当前孩子的其他健康随记', items: historyItems },
    { id: 'attachments', label: '检查结果与附件', description: '识别文字会写入提示词，原文件仍需手动上传', items: context.attachments.map((attachment) => ({ id: `attachment:${attachment.id}`, label: attachment.name, detail: attachmentText(attachment) })) },
  ]
}

export function getAllPromptItemIds(context: HealthEventPromptContext) {
  return getPromptInformationGroups(context).flatMap((group) => group.items.map(({ id }) => id))
}

export function getPromptInformationSummary(context: HealthEventPromptContext): PromptInformationSummary {
  const groups = getPromptInformationGroups(context)
  const groupCounts = Object.fromEntries(groups.map((group) => [group.id, group.items.length])) as Record<HealthEventPromptGroupId, number>
  const profileAttachmentCount = context.healthProfile.flatMap((section) => section.entries).reduce((count, entry) => (
    count + entry.lines.filter((line) => line.includes('需要在外部 AI 中手动上传')).length
  ), 0)
  return { attachmentCount: groupCounts.attachments + profileAttachmentCount, groupCounts, recordCount: context.records.length, totalCount: groups.reduce((total, group) => total + group.items.length, 0) }
}

function basicInformation(context: HealthEventPromptContext) {
  const { member } = context
  return [
    `姓名或称呼：${member.name}`,
    `年龄：${member.age || '未提供'}`,
    `出生日期：${member.birthday || '未提供'}`,
    `性别：${genderLabel(member.gender)}`,
    `身高：${member.heightCm == null ? '未提供' : `${member.heightCm} cm`}`,
    `体重：${member.weightKg == null ? '未提供' : `${member.weightKg} kg`}`,
    `血型：${member.bloodType ? `${member.bloodType} 型` : '未提供'}`,
  ].map((line) => `- ${line}`).join('\n')
}

const heading = (title: string, body: string) => `# ${title}\n\n${body || '未提供'}`

export function buildHealthEventPrompt(context: HealthEventPromptContext, selectedItemIds: Iterable<string>, question: string) {
  assertMemberScope(context)
  const questionText = question.trim()
  if (!questionText) throw new Error('请先填写这次主要想问的问题')
  const selected = new Set(selectedItemIds)
  if (!selected.size) throw new Error('请至少保留一项健康信息')
  const facts = structuredFacts(context).filter((item) => selected.has(item.id))
  const rawRecords = context.records.filter((record) => selected.has(`raw:${record.id}`))
  const profileItems = context.healthProfile.flatMap((section) => {
    const entries = section.entries.filter((entry) => selected.has(`profile:${section.id}:${entry.id}`))
    return entries.length ? [`## ${section.title}\n\n${entries.map((entry) => entry.lines.map((line) => `- ${line}`).join('\n')).join('\n')}`] : []
  })
  const history = context.relatedEvents.filter((event) => selected.has(`history:${event.id}`))
  const attachments = context.attachments.filter((attachment) => selected.has(`attachment:${attachment.id}`))
  const measures = rawRecords.filter((record) => ['medication', 'visit', 'examination'].includes(record.type))
  const profileManualUploads = context.healthProfile.flatMap((section) => section.entries.flatMap((entry) => (
    selected.has(`profile:${section.id}:${entry.id}`)
      ? entry.lines.filter((line) => line.includes('需要在外部 AI 中手动上传')).map(() => `- ${section.title}中的已保存附件`)
      : []
  )))
  const summary = getPromptInformationSummary(context)

  const instructions = `我是一名普通用户，希望你帮助我理解和整理下面的健康情况，为下一步就医或继续观察做准备。

## 这次我主要想问

${questionText}

## 你的任务

请作为一名健康信息分析与就医准备助手，阅读我提供的全部资料。

你的作用是帮助我：

1. 理解目前发生了什么；
2. 识别是否存在需要及时处理的危险信号；
3. 了解可能需要考虑的常见方向；
4. 找出资料中的缺失、矛盾或不确定信息；
5. 准备下一步行动以及需要向医生提出的问题。

请不要把可能性表述成已经确定的诊断，也不要擅自建议开始、停止或改变处方药及其剂量。

## 回答前的检查

请先完成以下检查：

1. 确认全部资料是否属于同一个人；
2. 保留时间、否定表达和症状变化；
3. 区分用户明确提供的事实、AI 作出的推测和当前无法确定的信息；
4. 检查不同记录之间是否存在冲突；
5. 如果缺少可能明显影响判断的信息，先列出最重要的补充问题；
6. 如果出现可能需要紧急处理的情况，请首先明确说明，不要等到回答结尾。

## 请按以下结构回答

### 1. 你对目前情况的理解

用简洁、通俗的语言复述当前情况，包括主要症状、持续时间、变化过程和已经采取的措施。

### 2. 是否存在需要立即处理的危险信号

分别说明已经出现、明确没有出现、以及信息不足无法判断的危险信号。如果建议及时就医，请说明紧急程度以及理由。

### 3. 可能需要考虑的方向

列出几种常见或值得排查的可能性，并分别说明支持信息、不支持信息和仍需了解的内容。不要把可能性写成确定诊断。

### 4. 当前资料中的缺失与矛盾

列出缺失的重要信息、时间不明确的记录、前后矛盾的信息，以及需要再次确认的内容。

### 5. 下一步可以做什么

按优先级说明现在可以观察什么、需要记录哪些变化、适合在哪种医疗场景就医、可以咨询什么科室、以及就医时携带哪些资料。

### 6. 建议向医生询问的问题

生成一份简短、具体的问题清单。

### 7. 依据与不确定性

说明主要不确定性。若引用医学指南、研究或权威机构资料，请提供可核查的来源名称和链接；无法确认时请直接说明，不要编造引用。`

  const currentEvent = selected.has('event:overview') ? [
    `- 随记标题：${context.event.title || '未命名健康随记'}`,
    `- 开始时间：${formatTime(context.event.startDate)}`,
    `- 当前状态：${eventStatus(context.event.status)}`,
    `- 当前摘要：${context.event.summary || '未提供'}`,
    context.event.symptoms.length ? `- 症状：${unique(context.event.symptoms).join('；')}` : '',
    context.event.concerns.length ? `- 用户担心：${unique(context.event.concerns).join('；')}` : '',
    context.event.medications.length ? `- 用药：${unique(context.event.medications).join('；')}` : '',
    context.event.examinations.length ? `- 检查：${unique(context.event.examinations).join('；')}` : '',
    context.event.visits.length ? `- 就诊：${unique(context.event.visits).join('；')}` : '',
  ].filter(Boolean).join('\n') : '已由用户排除'
  const timeline = facts.length ? facts.map((item) => `- ${factLine(item)}`).join('\n') : '未提供或已由用户排除'
  const originals = rawRecords.length ? rawRecords.map((record) => `- ${formatTime(record.occurredAt)}\n  ${record.sourceText?.trim() || record.content}`).join('\n') : '未提供或已由用户排除'
  const structuredActions = selected.has('event:overview') ? [
    ...unique(context.event.medications).map((item) => `- 用药：${item}`),
    ...unique(context.event.examinations).map((item) => `- 检查：${item}`),
    ...unique(context.event.visits).map((item) => `- 就诊：${item}`),
  ] : []
  const actions = [...measures.map((record) => `- ${formatTime(record.occurredAt)}：${record.content}${record.note ? `；效果或备注：${record.note}` : ''}`), ...structuredActions].join('\n') || '未提供'
  const historyText = history.length ? history.map((event) => `- ${event.title || '未命名健康随记'}｜${formatTime(event.startTime)}｜${eventStatus(event.status)}`).join('\n') : '未提供或已由用户排除'
  const attachmentTextContent = attachments.length ? attachments.map((attachment) => `- ${attachmentText(attachment).replace(/\n/g, '\n  ')}`).join('\n') : '未提供或已由用户排除'
  const manualUploads = [...attachments.map((attachment) => `- ${attachment.name}（${attachment.mimeType}）`), ...profileManualUploads].join('\n') || '无'

  return [
    heading('我的健康问题', instructions),
    heading('对象基本信息', selected.has('basic:member') ? basicInformation(context) : '已由用户排除'),
    heading('当前健康随记', currentEvent),
    heading('完整时间线', timeline),
    heading('用户原始记录', `以下内容与结构化时间线分区展示，避免被误认为重复发生。\n\n${originals}`),
    heading('已采取的措施及效果', actions),
    heading('健康档案', profileItems.join('\n\n') || '未提供或已由用户排除；未填写不代表没有异常。'),
    heading('相关历史健康随记', historyText),
    heading('检查结果与附件说明', `${attachmentTextContent}\n\n以下附件无法随文字复制，需要我另外上传：\n\n${manualUploads}`),
    `---\n\n资料范围说明：以上内容仅包含「${context.member.name}」的信息；共汇集 ${summary.totalCount} 项，其中当前随记原始记录 ${summary.recordCount} 条。结构化整理结果与用户原话均已保留。`,
  ].join('\n\n')
}
