import type { HealthEventPromptContext, HealthProfilePromptSection } from '../../features/ask-ai'

export type ConsultationSummarySourceId = 'basic' | 'current' | 'profile' | 'raw' | 'history'

export interface ConsultationSummarySource {
  available: boolean
  id: ConsultationSummarySourceId
  label: string
  required: boolean
}

export interface ConsultationSummarySection {
  id: string
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
  if (!currentMemberId || currentMemberId === 'self') throw new Error('当前孩子无法确认，请先选择孩子')
  if (context.member.id !== currentMemberId || context.event.memberId !== currentMemberId) {
    throw new Error('当前健康随记与所选孩子不一致，请关闭后重试')
  }
  if (context.relatedEvents.some((event) => event.memberId !== currentMemberId)) {
    throw new Error('发现不属于当前孩子的历史随记，已停止生成')
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

  const selectedSourceIdsInOrder = sourceOrder.filter((id) => selected.has(id))
  const raw = selected.has('raw') ? rawLines(context) : []
  const profile = selected.has('profile') ? profileLines(context.healthProfile) : []
  const history = selected.has('history') ? historyLines(context) : []
  const matching = (pattern: RegExp) => unique([...raw, ...profile].filter((line) => pattern.test(line)))
  const firstTime = [...context.records].sort((a,b) => a.occurredAt.localeCompare(b.occurredAt))[0]?.occurredAt ?? context.event.startDate
  const sections: ConsultationSummarySection[] = [
    { id:'child', title:'1. 孩子基础信息', lines:[`姓名：${context.member.name}`,`性别：${genderLabel(context.member.gender)}`,`年龄：${context.member.age || '未填写'}`,context.member.birthday ? `出生日期：${context.member.birthday}` : ''].filter(Boolean) },
    { id:'concern', title:'2. 家长主要担心的问题', lines:[compact(context.event.summary) || compact(context.event.title) || '请家长补充主要担心的问题'] },
    { id:'duration', title:'3. 首次出现和持续时间', lines:[`首次记录：${formatTime(firstTime)}`,`当前状态：${statusLabel(context.event.status)}`] },
    { id:'changes', title:'4. 发生次数及变化', lines:[`已记录 ${context.records.length} 次`,...matching(/加重|减轻|缓解|消失|反复|再次|持续/)] },
    { id:'exposure', title:'5. 可能相关的饮食或接触', lines:matching(/吃|食物|饮食|接触|牛奶|鸡蛋|花生|配料|过敏/) },
    { id:'handling', title:'6. 已采取的处理', lines:matching(/处理|冷敷|清洗|观察|休息|补液|停用/) },
    { id:'medication', title:'7. 用药及效果', lines:matching(/药|剂量|服用|外用|缓解|效果|不良反应/) },
    { id:'growth', title:'8. 生长趋势', lines:matching(/身高|体重|头围|BMI|进食|营养/) },
    { id:'visits', title:'9. 就诊和检查结果', lines:matching(/就诊|医院|医生|检查|化验|报告|体检/) },
    { id:'questions', title:'10. 希望医生重点判断的问题', lines:['请结合以上事实判断还需要哪些检查或观察。','请说明哪些变化需要及时再次就医。'] },
    ...(history.length ? [{ id:'history', title:'相关历史随记', lines:history }] : [])
  ].map((section) => ({ ...section, lines: section.lines.length ? section.lines : ['暂无记录'] }))
  const generatedAt = formatTime(now.toISOString())
  const text = sections.map((section) => `## ${section.title}\n${section.lines.map((line) => `- ${line}`).join('\n')}`).join('\n\n')
  const prompt = `以下是孩子的健康记录，请帮助照护者准备与医生沟通。如果还缺少影响判断的重要内容，请继续提问。\n\n${text}\n\n只根据以上记录整理：不要把推测写成事实，不要给出诊断、处方或儿童用药剂量；信息不足时请明确标为待确认。`

  return {
    generatedAt,
    memberName: context.member.name,
    prompt,
    sections,
    selectedSourceIds: selectedSourceIdsInOrder,
    text,
  }
}
