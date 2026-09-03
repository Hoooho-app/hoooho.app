import type { HealthEventPromptContext, HealthProfilePromptSection } from '../../features/ask-ai'

export type ConsultationSummarySourceId = 'basic' | 'current' | 'profile' | 'raw' | 'history'

export interface ConsultationSummarySource {
  available: boolean
  id: ConsultationSummarySourceId
  label: string
  required: boolean
}

export interface ConsultationSummarySection {
  id: ConsultationSummarySourceId
  lines: string[]
  title: string
}

export interface ConsultationSummary {
  generatedAt: string
  memberName: string
  prompt: string
  sections: ConsultationSummarySection[]
  selectedSourceIds: ConsultationSummarySourceId[]
  text: string
}

const sourceOrder: ConsultationSummarySourceId[] = ['basic', 'current', 'profile', 'raw', 'history']
const requiredSources = new Set<ConsultationSummarySourceId>(['basic', 'current'])

const formatTime = (value: string | null | undefined) => {
  if (!value) return '时间未记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间未记录'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

const statusLabel = (status: string) => status === 'recovered' ? '已康复' : status === 'handling' ? '处理中' : '观察中'
const genderLabel = (gender: HealthEventPromptContext['member']['gender']) => gender === 'male' ? '男' : gender === 'female' ? '女' : '未填写'
const compact = (value: string | null | undefined) => value?.trim() || ''
const unique = (values: string[]) => [...new Set(values.map(compact).filter(Boolean))]

function assertCurrentMember(context: HealthEventPromptContext) {
  const currentMemberId = context.currentMemberId.trim()
  if (!currentMemberId || currentMemberId === 'self') throw new Error('当前人物无法确认，请先选择人物')
  if (context.member.id !== currentMemberId || context.event.memberId !== currentMemberId) {
    throw new Error('当前健康随记与所选人物不一致，请关闭后重试')
  }
  if (context.relatedEvents.some((event) => event.memberId !== currentMemberId)) {
    throw new Error('发现不属于当前人物的历史随记，已停止生成')
  }
}

function profileLines(profile: HealthProfilePromptSection[]) {
  return profile.flatMap((section) => section.entries.flatMap((entry) => (
    entry.lines.map((line) => `${section.title}：${line}`)
  )))
}

function currentLines(context: HealthEventPromptContext) {
  const symptoms = unique(context.event.symptoms)
  return [
    `标题：${compact(context.event.title) || '未命名健康随记'}`,
    `开始时间：${formatTime(context.event.startDate)}`,
    `当前状态：${statusLabel(context.event.status)}`,
    compact(context.event.summary) ? `当前情况：${compact(context.event.summary)}` : '',
    symptoms.length ? `已记录症状：${symptoms.join('、')}` : '',
  ].filter(Boolean)
}

function rawLines(context: HealthEventPromptContext) {
  return [...context.records]
    .sort((left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime())
    .map((record) => `${formatTime(record.occurredAt)}：${compact(record.sourceText) || compact(record.content)}`)
    .filter((line) => !line.endsWith('：'))
}

function historyLines(context: HealthEventPromptContext) {
  return context.relatedEvents
    .filter((event) => event.memberId === context.currentMemberId && event.id !== context.event.id)
    .sort((left, right) => new Date(right.startTime).getTime() - new Date(left.startTime).getTime())
    .map((event) => `${formatTime(event.startTime)}：${compact(event.title) || '未命名健康随记'}（${statusLabel(event.status)}）`)
}

export function getConsultationSummarySources(context: HealthEventPromptContext): ConsultationSummarySource[] {
  assertCurrentMember(context)
  const availability: Record<ConsultationSummarySourceId, boolean> = {
    basic: true,
    current: true,
    profile: profileLines(context.healthProfile).length > 0,
    raw: rawLines(context).length > 0,
    history: historyLines(context).length > 0,
  }
  const labels: Record<ConsultationSummarySourceId, string> = {
    basic: '基本信息',
    current: '当前健康随记',
    profile: '健康档案',
    raw: '原始记录',
    history: '相关历史随记',
  }
  return sourceOrder.map((id) => ({ available: availability[id], id, label: labels[id], required: requiredSources.has(id) }))
}

export function getDefaultConsultationSummarySelection(context: HealthEventPromptContext) {
  return getConsultationSummarySources(context)
    .filter((source) => source.required || (source.id === 'profile' && source.available))
    .map(({ id }) => id)
}

export function buildConsultationSummary(
  context: HealthEventPromptContext,
  selectedSourceIds: Iterable<ConsultationSummarySourceId>,
  now = new Date(),
): ConsultationSummary {
  assertCurrentMember(context)
  const available = new Map(getConsultationSummarySources(context).map((source) => [source.id, source]))
  const selected = new Set(selectedSourceIds)
  requiredSources.forEach((id) => selected.add(id))
  const invalid = [...selected].find((id) => !available.get(id)?.available)
  if (invalid) throw new Error(`${available.get(invalid)?.label ?? '所选资料'}暂无内容，请返回调整`)

  const sectionsById: Record<ConsultationSummarySourceId, ConsultationSummarySection> = {
    basic: {
      id: 'basic',
      title: '当前人物',
      lines: [
        `姓名：${context.member.name}`,
        `性别：${genderLabel(context.member.gender)}`,
        `年龄：${context.member.age || '未填写'}`,
        context.member.heightCm == null ? '' : `身高：${context.member.heightCm} cm`,
        context.member.weightKg == null ? '' : `体重：${context.member.weightKg} kg`,
        context.member.bloodType ? `血型：${context.member.bloodType} 型` : '',
      ].filter(Boolean),
    },
    current: { id: 'current', title: '当前健康随记', lines: currentLines(context) },
    profile: { id: 'profile', title: '健康档案', lines: profileLines(context.healthProfile) },
    raw: { id: 'raw', title: '原始记录', lines: rawLines(context) },
    history: { id: 'history', title: '相关历史随记', lines: historyLines(context) },
  }
  const selectedSourceIdsInOrder = sourceOrder.filter((id) => selected.has(id))
  const sections = selectedSourceIdsInOrder.map((id) => sectionsById[id]).filter((section) => section.lines.length > 0)
  const generatedAt = formatTime(now.toISOString())
  const text = sections.map((section) => `## ${section.title}\n${section.lines.map((line) => `- ${line}`).join('\n')}`).join('\n\n')
  const prompt = `以下是我的健康相关信息，请先帮我理解和整理这些信息。如果还缺少影响判断的重要内容，请继续向我提问。\n\n${text}\n\n请只根据以上记录进行整理：不要把推测写成事实，不要给出诊断结论或处方；如果信息不足，请明确指出还需要补充什么。`

  return {
    generatedAt,
    memberName: context.member.name,
    prompt,
    sections,
    selectedSourceIds: selectedSourceIdsInOrder,
    text,
  }
}
