import type { VisitSheet } from '../../types/visitSheet'
import { reportTime, SourceText } from './ReportChapter'
import { sourceChanges } from './updatePreview'

export function VisitUpdatePreview({ current, candidate }: { current: VisitSheet; candidate: VisitSheet }) {
  const changes = sourceChanges(current, candidate)
  const courseIds = new Set(candidate.reading?.courseSourceIds ?? candidate.chapters.find(chapter => chapter.id === 'course')?.blocks.filter(block => !block.secondary).flatMap(block => block.sourceIds))
  const course = candidate.sources.filter(source => courseIds.has(source.id))
    .sort((a,b) => (Date.parse(b.occurredAt ?? '') || 0) - (Date.parse(a.occurredAt ?? '') || 0) || (Date.parse(b.createdAt ?? '') || 0) - (Date.parse(a.createdAt ?? '') || 0) || b.id.localeCompare(a.id))
  const mark = (value: string, before: string) => value === before ? null : <span className="visit-update-mark">{before ? '有变化' : '新增'}</span>
  const text = (report: VisitSheet, key: 'description' | 'onset' | 'change' | 'other') => report.caseDetails?.[key] || report.reading?.[key] || ''
  const sourceDetails = (ids: string[]) => {
    const sources = candidate.sources.filter(source => ids.includes(source.id))
    return sources.length ? <details className="visit-update-evidence"><summary>核对相关原文 · {sources.length} 项</summary>{sources.map(source => <article key={source.id}><SourceText source={source}/></article>)}</details> : null
  }
  return <div className="visit-update-preview">
    <h3>待确认的情况单</h3>
    <p role="status">资料新增 {changes.added.length} 项 · 有变化 {changes.changed.length} 项 · 不再纳入 {changes.removed.length} 项</p>
    <section className="visit-update-card" aria-label="更新内容对照"><h4>本次更新</h4>
      {!changes.added.length && !changes.changed.length && !changes.removed.length && <p>原始资料没有新增或变化，请核对下方整理内容。</p>}
      {(['added','changed','removed'] as const).map(kind => changes[kind].map(source => <article key={`${kind}:${source.id}`}>
        <p><span className="visit-update-mark">{{added:'新增',changed:'有变化',removed:'不再纳入'}[kind]}</span> {source.title}</p>
        <small>{reportTime(source.occurredAt,candidate.timezone)}</small>
        {source.narrative && <p>{source.narrative}</p>}
        <details className="visit-update-evidence"><summary>{kind === 'removed' ? '核对原情况单中的原文' : '核对原文'}</summary><SourceText source={source}/>{kind === 'changed' && <><h4>更新前</h4><p className="visit-original">{current.sources.find(previous => previous.id === source.id)?.text}</p></>}</details>
      </article>))}
    </section>
    <section className="visit-update-card"><h4>本次情况 {mark(candidate.complaint,current.complaint)}</h4><p>{candidate.complaint}</p>
      {(['description','onset','change','other'] as const).map(key => text(candidate,key) ? <div key={key}><h5>{{description:'当前情况',onset:'开始时间',change:'最近变化',other:'其他表现'}[key]} {mark(text(candidate,key),text(current,key))}</h5><p>{text(candidate,key)}</p></div> : null)}
      {!candidate.focusSourceIds.length && <p>尚未关联记录</p>}
      {sourceDetails(candidate.focusSourceIds)}
    </section>
    <section className="visit-update-card"><h4>本次想问 {mark(candidate.question,current.question)}</h4><p>{candidate.questionEdited ? candidate.question || '尚未填写' : '尚未确认问题'}</p>{sourceDetails(candidate.questionSourceIds ?? [])}</section>
    <section className="visit-update-card"><h4>经过与处理</h4>{!course.length && <p>尚无明确关联经过</p>}{course.map(source => <article key={source.id}><small>{reportTime(source.occurredAt,candidate.timezone)} {changes.added.some(item => item.id === source.id) ? <span className="visit-update-mark">新增</span> : changes.changed.some(item => item.id === source.id) ? <span className="visit-update-mark">有变化</span> : null}</small><p>{source.narrative || source.title}</p>{sourceDetails([source.id])}</article>)}{candidate.notes.course && <><h5>家长补充</h5><p>{candidate.notes.course}</p></>}</section>
    <section className="visit-update-card"><h4>完整资料</h4><p>{candidate.scope}</p><p>纳入 {candidate.sources.length} 项来源 · 选择 {(candidate.selectedPhotoIds ?? []).length} 项影像</p>
      {candidate.gaps?.length ? <><h5>仍待补充</h5><ul>{candidate.gaps.map(gap => <li key={gap}>{gap}</li>)}</ul></> : null}
      {sourceDetails(candidate.sources.map(source => source.id))}
    </section>
    {candidate.aiSummary && <section className="visit-update-card"><h4>病情摘要 {mark(candidate.aiSummary.overview,current.aiSummary?.overview ?? '')}</h4><p>{candidate.aiSummary.overview}</p>{candidate.aiSummary.keyPoints.map((point,index) => <article key={index}><p>{point}</p><details className="visit-update-evidence"><summary>核对引用原话</summary><p>{candidate.aiSummary!.keyPointEvidence?.[index]?.quote || '未提供引用原话，请继续核对来源'}</p></details></article>)}</section>}
  </div>
}
