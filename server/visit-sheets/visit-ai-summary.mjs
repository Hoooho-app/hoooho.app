import { createHash } from 'node:crypto'

export function visitAISources(report) {
  return report.sources.filter(source => !['legacy', 'attachment'].includes(source.category))
}

export function visitAISummaryInput(report) {
  const clean = value => String(value ?? '')
    .split(report.member.name || '\u0000').join('[当前成员]')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[邮箱已隐藏]')
    .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, '[手机号已隐藏]')
  const sources = visitAISources(report)
  return { sections: [
    { id: 'current', title: '本次就诊目的', lines: [clean(report.complaint), clean(report.question)].filter(Boolean) },
    ...['record', 'profile'].map(group => ({
      id: group, title: group === 'record' ? '当前成员已保存健康随记' : '当前成员已保存健康档案与事实',
      lines: sources.filter(source => (['record', 'course', 'temperature', 'medication', 'visits', 'allergy', 'observation'].includes(source.category) ? 'record' : 'profile') === group)
        .map(source => clean(`${source.occurredAt ?? ''} ${source.identity}：${source.text}`))
    }))
  ] }
}

export const visitAISummaryFingerprint = report => createHash('sha256')
  .update(JSON.stringify(visitAISummaryInput(report))).digest('hex')
