import { calculateBmi } from '../../features/health-profile/utils/healthProfileBasicInfo'
import type { VisitClinicalSection, VisitSheet } from '../../types/visitSheet'
import { formatAgeFromBirthday } from '../../utils/formatAgeFromBirthday'

export function visitIdentity(report: VisitSheet) {
  const { name, gender, birthday } = report.member
  const height = report.reading?.height?.value ?? report.member.heightCm
  const weight = report.reading?.weight?.value ?? report.member.weightKg
  const age = birthday ? formatAgeFromBirthday(birthday, new Date(report.dataAsOf), report.timezone) : ''
  return [
    { label: '姓名', value: name },
    { label: '性别', value: gender === 'female' ? '女' : gender === 'male' ? '男' : '' },
    { label: '年龄', value: age === '未填写年龄' ? '' : age },
    { label: '出生日期', value: birthday?.slice(0, 10) },
    { label: '身高', value: height && height > 0 ? `${height} cm` : '' },
    { label: '体重', value: weight && weight > 0 ? `${weight} kg` : '' },
    { label: 'BMI', value: calculateBmi(height, weight) },
  ]
}

export function clinicalAnswer(section: VisitClinicalSection, value: boolean) {
  return section === 'history' ? (value ? '有' : '无') : (value ? '是' : '否')
}

export function clinicalText(report: VisitSheet, references: (ids: string[]) => string) {
  const { clinical } = report
  if (!clinical) return []
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
    clinical.historyNote ? `家长补充：${clinical.historyNote}` : '',
    ...rows('history'),
    '\n体格情况',
    ...rows('examination'),
  ].filter(Boolean)
}
