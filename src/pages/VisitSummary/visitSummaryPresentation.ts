import type { MedicalPreparationApiDto } from '../../types'

export type VisitSectionId = 'overview' | 'course' | 'trends' | 'medication' | 'examinations' | 'background'
export interface VisitEvidence { id: string; label: string; lines: string[] }
export interface VisitProblem { id: string; title: string; meta: string; summary: string; evidence: VisitEvidence }
export interface VisitSection { id: VisitSectionId; label: string; lines: string[] }
export interface VisitSummaryPresentation { overview: string[]; problems: VisitProblem[]; sections: VisitSection[] }

const labels: Record<VisitSectionId, string> = { overview: '概览', course: '病程', trends: '趋势', medication: '用药', examinations: '检查', background: '背景' }
const patterns = {
  medication: /用药|药物|服用|剂量|规格|治疗|处理/,
  examinations: /检查|检验|报告|医生|就诊|医院|门诊/,
  trends: /体温|身高|体重|生长|摄入|℃|kg|cm/i,
}
const clean = (line: string) => line.replace(/^(标题|当前情况|已记录症状|开始时间|当前状态)：/, '').trim()
const unique = (lines: string[]) => [...new Set(lines.map(clean).filter(Boolean))]

export function createVisitSummaryPresentation(preparation: MedicalPreparationApiDto): VisitSummaryPresentation {
  const source = new Map(preparation.summary.sections.map((section) => [section.id, section]))
  const current = unique(source.get('current')?.lines ?? [])
  const history = unique(source.get('history')?.lines ?? [])
  const raw = unique(source.get('raw')?.lines ?? [])
  const profile = unique(source.get('profile')?.lines ?? [])
  const allClinical = unique([...current, ...raw, ...history])
  const medication = allClinical.filter((line) => patterns.medication.test(line))
  const examinations = allClinical.filter((line) => patterns.examinations.test(line))
  const trendCandidates = allClinical.filter((line) => patterns.trends.test(line))
  const course = unique([...raw, ...history]).filter((line) => !patterns.medication.test(line) && !patterns.examinations.test(line))
  const overview = current.slice(0, 4)
  const problems = buildProblems(current, course.length ? course : history)
  const sections: VisitSection[] = [
    { id: 'overview', label: labels.overview, lines: overview },
    { id: 'course', label: labels.course, lines: course },
  ]
  if (trendCandidates.length) sections.push({ id: 'trends', label: labels.trends, lines: trendCandidates })
  if (medication.length) sections.push({ id: 'medication', label: labels.medication, lines: medication })
  if (examinations.length) sections.push({ id: 'examinations', label: labels.examinations, lines: examinations })
  if (profile.length) sections.push({ id: 'background', label: labels.background, lines: profile })
  return { overview, problems, sections: sections.filter((section) => section.lines.length || section.id === 'overview') }
}

function buildProblems(current: string[], course: string[]): VisitProblem[] {
  const titles = current.filter((line) => !/时间|状态/.test(line)).slice(0, 3)
  return titles.map((title, index) => {
    const related = unique(course.filter((line) => line.includes(title) || index === 0)).slice(0, 8)
    const lines = related.length ? related : [title]
    return { id: `problem-${index + 1}`, title: title.slice(0, 30), meta: course[0]?.split('：')[0] ?? '近期记录', summary: lines[0], evidence: { id: `evidence-${index + 1}`, label: `${title.slice(0, 18)}的原始依据`, lines } }
  })
}
