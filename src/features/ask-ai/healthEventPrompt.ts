import type { HealthEvent, Member } from '../../types'

export type HealthEventPromptSection = 'event' | 'symptoms' | 'timeline' | 'medications' | 'profile' | 'examinations' | 'visits' | 'attachments'

export interface HealthEventPromptContext {
  event: HealthEvent
  member: Member
}

export interface PromptInformationOption {
  description: string
  id: HealthEventPromptSection
  label: string
}

const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))]
const formatTime = (value: string) => new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'medium',
  timeStyle: 'short'
}).format(new Date(value))

export function getPromptInformationOptions({ event, member }: HealthEventPromptContext): PromptInformationOption[] {
  const options: Array<PromptInformationOption | false> = [
    { id: 'event', label: '这次发生了什么', description: '事件标题、开始时间与当前摘要' },
    (event.symptoms.length > 0 || event.concerns.length > 0) && { id: 'symptoms', label: '症状与变化', description: '已记录的症状、变化与担心' },
    event.timeline.length > 0 && { id: 'timeline', label: '时间线', description: `${event.timeline.length} 条关键记录` },
    event.medications.length > 0 && { id: 'medications', label: '用药情况', description: '已记录的药物与相关过程' },
    Boolean(member.age || member.gender || member.bloodType || event.medicalInfo.allergies.length || event.medicalInfo.medicalHistory.length || event.medicalInfo.chronicDiseases.length) && { id: 'profile', label: '相关健康档案', description: '年龄、性别及相关健康背景' },
    event.examinations.length > 0 && { id: 'examinations', label: '检查结果', description: '本次事件中的检查记录' },
    event.visits.length > 0 && { id: 'visits', label: '就诊记录', description: '本次事件中的就诊情况' },
    event.attachments.length > 0 && { id: 'attachments', label: '图片 / 附件', description: `${event.attachments.length} 项相关资料` }
  ]
  return options.filter((option): option is PromptInformationOption => Boolean(option))
}

function profileLines(member: Member, event: HealthEvent) {
  const gender = member.gender === 'male' ? '男' : member.gender === 'female' ? '女' : '未填写'
  const details = [`记录对象：${member.name}`, `年龄：${member.age || '未填写'}`, `性别：${gender}`]
  if (member.bloodType) details.push(`血型：${member.bloodType} 型`)
  if (event.medicalInfo.chronicDiseases.length) details.push(`慢性病：${event.medicalInfo.chronicDiseases.join('、')}`)
  if (event.medicalInfo.medicalHistory.length) details.push(`既往史：${event.medicalInfo.medicalHistory.join('、')}`)
  if (event.medicalInfo.allergies.length) details.push(`过敏史：${event.medicalInfo.allergies.join('、')}`)
  return details
}

export function buildHealthEventPrompt(context: HealthEventPromptContext, selected: Iterable<HealthEventPromptSection>, editingInstruction = '') {
  const { event, member } = context
  const enabled = new Set(selected)
  const sections: string[] = ['请基于以下健康信息，评估当前情况，并以导诊和就诊前信息整理为目的提供建议。不要替代医生诊断。']

  if (enabled.has('profile')) sections.push(`【个人信息】\n${profileLines(member, event).map((line) => `- ${line}`).join('\n')}`)
  if (enabled.has('event')) sections.push(`【当前事件】\n- 标题：${event.title || '未命名健康事件'}\n- 最早开始时间：${formatTime(event.startDate)}${event.summary ? `\n- 摘要：${event.summary}` : ''}`)
  if (enabled.has('symptoms')) {
    const lines = unique([...event.symptoms, ...event.concerns])
    if (lines.length) sections.push(`【症状与变化】\n${lines.map((line) => `- ${line}`).join('\n')}`)
  }
  if (enabled.has('timeline') && event.timeline.length) sections.push(`【时间线】\n${event.timeline.map((entry) => `- ${formatTime(entry.time)}：${entry.content}`).join('\n')}`)
  if (enabled.has('medications') && event.medications.length) sections.push(`【用药情况】\n${unique(event.medications).map((item) => `- ${item}`).join('\n')}`)
  if (enabled.has('examinations') && event.examinations.length) sections.push(`【检查结果】\n${unique(event.examinations).map((item) => `- ${item}`).join('\n')}`)
  if (enabled.has('visits') && event.visits.length) sections.push(`【就诊记录】\n${unique(event.visits).map((item) => `- ${item}`).join('\n')}`)
  if (enabled.has('attachments') && event.attachments.length) sections.push(`【图片 / 附件】\n${event.attachments.map((item) => `- ${item.analysis?.summary || item.name}`).join('\n')}`)
  if (editingInstruction.trim()) sections.push(`【本次修订要求】\n请重新审视并整理以上信息，优先遵循这条用户指令；如指令与原始记录冲突，请明确指出，不要静默编造：${editingInstruction.trim()}`)

  sections.push('【希望你回答】\n1. 当前情况有哪些值得注意的可能性？\n2. 是否存在需要及时处理的风险，是否建议就医，紧迫程度如何？\n3. 接下来应该重点观察哪些变化？\n4. 如果信息不足，请先询问真正影响判断的关键问题。')
  return sections.join('\n\n')
}
