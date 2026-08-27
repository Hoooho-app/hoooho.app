import type { HealthEvent, Member } from '../../types'
import type { StoredHealthProfileSnapshot } from '../health-profile/utils/healthProfileHomeLogic'
import { healthProfileSectionMap } from '../health-profile/config/healthProfileSections'

export type ConsultationSectionId = 'condition' | 'actions' | 'medications' | 'examinations' | 'history' | 'concerns'
export interface ConsultationSection { id: ConsultationSectionId; title: string; content: string }
export interface ConsultationContext { event: HealthEvent; member: Member; profiles: StoredHealthProfileSnapshot[] }
export interface PreparedDoctorReply { reply: string; missing: string[]; sources: string[] }

const unique = (values: readonly string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))]
const dateTime = (value: string) => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
const dateOnly = (value: string) => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value))

function profileSummary(profiles: StoredHealthProfileSnapshot[]) {
  const relevant = new Set(['allergy', 'medication', 'chronic', 'surgery', 'hospitalization'])
  return profiles.filter(({ id }) => relevant.has(id)).flatMap(({ id, records }) => {
    const section = healthProfileSectionMap[id as keyof typeof healthProfileSectionMap]
    if (!section) return []
    const fields = new Map(section.fields.map((field) => [field.id, field.label]))
    const lines = records.flatMap((record) => {
      const details = Object.entries(record).flatMap(([key, value]) => {
        if (key.startsWith('_') || key === 'id' || key === 'sequence' || !value) return []
        const label = fields.get(key)
        if (!label) return []
        const display = Array.isArray(value) ? value.map(String).filter(Boolean).join('、') : String(value)
        return display ? [`${label}：${display}`] : []
      })
      return details.length ? [`${section.title}：${details.join('；')}`] : []
    })
    return lines
  })
}

function actionLines(event: HealthEvent) {
  const pattern = /休息|补水|喝水|降温|冷敷|热敷|雾化|处理|护理|观察/
  return unique([
    ...event.visits.map((item) => `就诊：${item}`),
    ...event.timeline.filter((item) => pattern.test(item.content)).map((item) => `${dateTime(item.time)}：${item.content}`)
  ])
}

export function buildConsultationSections({ event, member, profiles }: ConsultationContext): ConsultationSection[] {
  const symptoms = unique(event.symptoms)
  const condition = [
    `${member.name}，${member.gender === 'male' ? '男' : member.gender === 'female' ? '女' : '性别未填写'}${member.age ? `，${member.age}` : ''}。`,
    `这次情况开始于${dateOnly(event.startDate)}。`,
    event.summary || (symptoms.length ? `目前记录的主要情况有：${symptoms.join('、')}。` : `${event.title || '本次健康情况'}。`)
  ].filter(Boolean).join('')
  const medications = unique(event.medications)
  const examinations = unique([
    ...event.examinations,
    ...event.attachments.map((item) => item.analysis?.summary ?? '').filter(Boolean)
  ])
  const history = profileSummary(profiles)
  return [
    { id: 'condition', title: '病情描述', content: condition },
    { id: 'actions', title: '已经做过什么', content: actionLines(event).join('\n') },
    { id: 'medications', title: '用药情况', content: medications.join('\n') },
    { id: 'examinations', title: '检查结果', content: examinations.join('\n') },
    { id: 'history', title: '相关病史', content: history.join('\n') },
    { id: 'concerns', title: '我想问医生', content: unique(event.concerns).join('\n') }
  ]
}

export function consultationCopyAll(sections: readonly ConsultationSection[]) {
  return sections.filter(({ content }) => content.trim()).map(({ title, content }) => `【${title}】\n${content}`).join('\n\n')
}

export function splitDoctorQuestions(value: string) {
  return unique(value.split(/\n+|(?<=[？?。；;])/u).map((item) => item.replace(/^[\s\d.、]+/, '').trim()).filter(Boolean))
}

const sourceLine = (event: HealthEvent, pattern: RegExp) => event.timeline
  .filter((item) => pattern.test(item.content))
  .slice(0, 3)
  .map((item) => `${dateOnly(item.time)}：${item.content}`)

function missingLabel(question: string) {
  if (/痰/.test(question)) return '痰的情况还没有记录'
  if (/血常规|化验|检查|影像|CT|核磁|B超|X光/i.test(question)) return '相关检查情况还没有记录'
  if (/药|服用|吃过/.test(question)) return '相关用药情况还没有记录'
  if (/体温|多少度|发烧|发热/.test(question)) return '相关体温情况还没有记录'
  if (/咳嗽|症状|哪里不舒服/.test(question)) return '相关症状还没有记录'
  if (/过敏|病史|慢性病/.test(question)) return '相关病史还没有记录'
  return `“${question.replace(/[？?。]$/u, '')}”对应的信息还没有记录`
}

export function prepareDoctorReply(context: ConsultationContext, questionText: string, supplement = ''): PreparedDoctorReply {
  const { event } = context
  const questions = splitDoctorQuestions(questionText)
  const sections = new Map(buildConsultationSections(context).map((section) => [section.id, section.content]))
  const answers: string[] = []
  const missing: string[] = []
  const sources: string[] = []

  for (const question of questions) {
    let answer = ''
    let matchedSources: string[] = []
    if (/血常规|化验|检查|影像|CT|核磁|B超|X光/i.test(question)) {
      answer = sections.get('examinations') ?? ''
      matchedSources = sourceLine(event, /检查|化验|CT|核磁|B超|X光/i)
    } else if (/药|服用|吃过/.test(question)) {
      answer = sections.get('medications') ?? ''
      matchedSources = sourceLine(event, /药|服用/)
    } else if (/体温|多少度|发烧|发热/.test(question)) {
      const values = event.temperatureRecords.map(({ value }) => value)
      if (values.length) answer = `记录中的最高体温为 ${Math.max(...values)}℃，最近一次为 ${values[0]}℃。`
      matchedSources = sourceLine(event, /体温|℃|发烧|发热/)
    } else if (/咳嗽|症状|哪里不舒服/.test(question)) {
      answer = unique(event.symptoms).join('、')
      matchedSources = sourceLine(event, /症状|咳嗽|疼|痛|发热|发烧/)
    } else if (/之前|处理|做过什么|怎么办/.test(question)) {
      answer = sections.get('actions') ?? ''
      matchedSources = sourceLine(event, /休息|补水|喝水|降温|处理|就诊/)
    } else if (/多久|什么时候|开始/.test(question)) {
      answer = `这次情况开始于${dateTime(event.startDate)}。`
      matchedSources = event.timeline.slice(-1).map((item) => `${dateOnly(item.time)}：${item.content}`)
    } else if (/过敏|病史|慢性病/.test(question)) {
      answer = sections.get('history') ?? ''
    }

    if (answer.trim()) {
      answers.push(answer.trim())
      sources.push(...matchedSources)
    } else if (supplement.trim()) {
      answers.push(supplement.trim())
    } else {
      const label = missingLabel(question)
      missing.push(label)
      answers.push(`${label}。`)
    }
  }

  return { reply: unique(answers).join('\n\n'), missing: unique(missing), sources: unique(sources) }
}
