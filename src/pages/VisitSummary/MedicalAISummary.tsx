import type { VisitSheet } from '../../types/visitSheet'
import { reportTime } from './ReportChapter'

export function MedicalAISummary({ report, snapshot = false }: { report: VisitSheet; snapshot?: boolean }) {
  const summary = report.aiSummary
  if (!summary || !['openai', 'bailian'].includes(summary.provider)) return null
  return <section aria-label="AI 病情摘要" className="visit-question">
    <h2>AI 病情摘要</h2>
    <p className="visit-muted">AI 生成 · {reportTime(summary.generatedAt, report.timezone)}{snapshot ? ' · 固定快照，编辑不会自动重新生成 AI 摘要' : ''}</p>
    {report.aiSummaryStale && <p role="status" className="visit-muted">这是此前生成的摘要，资料已变化，请重新生成。</p>}
    <p>{summary.overview}</p>
    {!!summary.keyPoints.length && <><h3>关键事实</h3><ul>{summary.keyPoints.map((point, i) => <li key={i}>{point}{summary.keyPointEvidence?.[i]&&<details><summary>查看这条事实的依据</summary><p>{summary.keyPointEvidence[i].quote}</p><small>{report.sources.find(s=>s.id===summary.keyPointEvidence?.[i]?.sourceId)?.code??'本次就诊目的'} · 原始依据</small></details>}</li>)}</ul></>}
    {!!summary.missingInformation.length && <><h3>待核对信息</h3><ul>{summary.missingInformation.map((point, i) => <li key={i}>{point}</li>)}</ul></>}
    <small>依据已保存资料生成，不替代诊断或治疗建议。</small>
  </section>
}
