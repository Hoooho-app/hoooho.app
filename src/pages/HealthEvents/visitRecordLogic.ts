import type { JournalVisitDetails, VisitType } from '../../types/journal'

const visitTypes: Array<[VisitType, string]> = [['outpatient', '门诊'], ['emergency', '急诊'], ['inpatient', '住院'], ['online_consultation', '线上问诊'], ['follow_up', '复诊'], ['other', '其他']]

export function visitSummary(details: JournalVisitDetails, symptomLabels: string[] = []) {
  const where = details.visitType === 'online_consultation' ? details.platformName : details.institutionName
  const label = visitTypes.find(([value]) => value === details.visitType)?.[1] ?? '就医'
  const facts = [label, where, details.departmentOtherText || details.department].filter(Boolean).join(' · ')
  const reason = details.reasonText || symptomLabels.join('、')
  return `${facts}${reason ? `｜因${reason}就医` : ''}${details.isCurrentlyHospitalized ? '｜仍在住院' : ''}`
}
