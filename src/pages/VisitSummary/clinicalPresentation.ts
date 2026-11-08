import { calculateBmi } from '../../features/health-profile/utils/healthProfileBasicInfo'
import type { VisitClinicalSection, VisitSheet } from '../../types/visitSheet'
import { formatAgeFromBirthday } from '../../utils/formatAgeFromBirthday'

export function visitIdentity(report: VisitSheet) {
  const { name, gender, birthday, bloodType } = report.member
  const height = report.reading?.height?.value ?? report.member.heightCm
  const weight = report.reading?.weight?.value ?? report.member.weightKg
  const age = birthday ? formatAgeFromBirthday(birthday, new Date(report.dataAsOf), report.timezone) : ''
  const abo = typeof bloodType === 'string' ? bloodType.trim().replace(/型$/, '') : ''
  return [
    { label: '姓名', value: name },
    { label: '性别', value: gender === 'female' ? '女' : gender === 'male' ? '男' : '' },
    { label: '年龄', value: age === '未填写年龄' ? '' : age },
    { label: '出生日期', value: birthday?.slice(0, 10) },
    { label: '身高', value: height && height > 0 ? `${height} cm` : '' },
    { label: '体重', value: weight && weight > 0 ? `${weight} kg` : '' },
    { label: 'BMI', value: calculateBmi(height, weight) },
    { label: '血型', value: /^(?:A|B|AB|O)$/.test(abo) ? `${abo}型` : '' },
  ]
}

// A display excerpt. Keep the selected record and its qualifiers in the history.
export function compactVisitComplaint(text: string) {
  const original = text.trim().replace(/^(?:本次)?主诉\s*[：:]\s*/, '').replace(/^(?:(?:嗯+|呃+|就是)[，,]\s*)+/, '')
  const sentence = original.split(/[。；;！？!?\n\r]/).find(part => part.trim()) ?? original
  const parts = sentence.split(/[，,]/).map(part => part.trim().replace(/\s+/g, ' ')).filter(Boolean)
  const first = parts[0] ?? ''
  const onsetOnly = /^(?:从|近|过去)?(?:[一二两三四五六七八九十半\d]+(?:天|周|小时|分钟|个月)(?:前|内)?|这几天|最近|今早|今天(?:早上|上午|下午|晚上)?|昨天(?:早上|上午|下午|晚上)?|昨晚)(?:开始|起)?$/
  const count = parts.length > 1 && onsetOnly.test(first) ? 2 : 1
  const excerpt = parts.slice(0, count)
  const correction = parts.slice(count).find(part => /^(?:但|不过|其实)?(?:并非|并没有|不是|不确定|说不清|只是怀疑|更正)/.test(part))
  if (correction) excerpt.push(correction)
  return excerpt.join('，')
}

export function customComplaintDetails(report: VisitSheet) {
  if (report.focus?.mode !== 'custom') return ''
  const original = report.complaint.trim()
  const brief = compactVisitComplaint(original)
  return original.replace(/[。；;！？!?]+$/, '') === brief ? '' : original
}

export function clinicalAnswer(section: VisitClinicalSection, value: boolean) {
  return section === 'history' ? (value ? '有' : '无') : (value ? '是' : '否')
}

export function clinicalText(report: VisitSheet, references: (ids: string[]) => string) {
  const { clinical } = report
  if (!clinical) return []
  const customDetails = customComplaintDetails(report)
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: report.timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const rows = (section: VisitClinicalSection) => clinical[section].flatMap(item => {
    if (item.value === null) return []
    const origin = item.manual ? '（家长补充）' : item.sourceIds.length ? ` [${references(item.sourceIds)}]` : ''
    return [`${item.label}：${clinicalAnswer(section, item.value)}${origin}`]
  })
  return [
    '\n现病史',
    clinical.range ? `${clinical.range.from} 至 ${clinical.range.to}` : '',
    clinical.onset,
    ...clinical.timeline.map(entry => `${entry.at ? date.format(new Date(entry.at)) : '时间未填写'}　${entry.text} [${references([entry.sourceId])}]`),
    customDetails ? `家长自填：${customDetails}` : '',
    clinical.historyNote ? `家长补充：${clinical.historyNote}` : '',
    ...rows('history'),
    '\n体格情况',
    ...rows('examination'),
    ...(clinical.assessment?.length ? [
      '\n基本判断',
      ...clinical.assessment.map(item => `${item.text}（${item.origin}） [${references([item.sourceId])}]`),
    ] : []),
  ].filter(Boolean)
}
