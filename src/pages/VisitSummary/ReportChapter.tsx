import { MapPin } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  FactDistribution,
  FactLineChart,
} from '../../components/design-system/FactCharts'
import type {
  VisitChapter,
  VisitSheet,
  VisitSource,
} from '../../types/visitSheet'

export const reportTime = (value: string | null, timeZone = 'Asia/Shanghai') =>
  !value || Number.isNaN(Date.parse(value))
    ? '未提供'
    : new Intl.DateTimeFormat('zh-CN', {
        timeZone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        ...(value.length > 10 ? { hour: '2-digit', minute: '2-digit' } : {}),
      }).format(new Date(value))
export function Emphasized({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\d+(?:\.\d+)?)/g).map((part, i) =>
        /^\d/.test(part) ? (
          <strong className="visit-number" key={i}>
            {part}
          </strong>
        ) : (
          part
        ),
      )}
    </>
  )
}
export function SourceText({ source }: { source: VisitSource }) {
  return (
    <>
      <h3>{source.title}</h3>
      <p className="visit-muted">
        {source.identity} · 发生：{reportTime(source.timePrecision==='unknown'?null:source.timePrecision==='day'||source.timePrecision==='period'?source.occurredAt?.slice(0,10)??null:source.occurredAt)}{source.timePrecision && source.timePrecision!=='exact' ? `（原记录精度：${source.timePrecision==='day'?'日期':source.timePrecision==='period'?'时段，详见原文':'未知'}）` : ''}
        <br />
        录入：{reportTime(source.createdAt)}
      </p>
      <p className="visit-original">{source.text}</p>
      <small>来源编号：{source.code ?? '原始记录'}</small>
    </>
  )
}
export function ReportChapter({
  chapter,
  report,
  onEvidence,
  readOnly = false,
  leading,
  trailing,
  action,
}: {
  chapter: VisitChapter
  report: VisitSheet
  onEvidence?: (ids: string[]) => void
  readOnly?: boolean
  leading?: ReactNode
  trailing?: ReactNode
  action?: ReactNode
}) {
  return (
    <section
      id={chapter.title ? `chapter-${chapter.id}` : undefined}
      className={`visit-chapter visit-chapter--${chapter.id}`}
    >
      {chapter.title && <div className="visit-section-actions"><h2 className="visit-chapter-title"><span aria-hidden="true" className="visit-chapter-ordinal">
        {String(
          report.chapters.findIndex((s) => s.id === chapter.id) + 1,
        ).padStart(2, '0')}{' '}
        / </span>{chapter.title}</h2>{action}</div>}
      {leading}
      {chapter.summary && <p className="visit-intro">{chapter.summary}</p>}
      {chapter.id === 'overview' && (
        <>
          <div className="visit-focus-meta">
            {report.focus.mode === 'auto'
              ? '根据最近一次有效症状预选'
              : report.focus.mode === 'custom'
                ? '家长本次陈述'
                : '家长选择的已有症状'}
            {report.complaintSourceId && (
              <span>
                {' '}
                ·{' '}
                {reportTime(
                  report.candidates.find(
                    (c) => c.sourceId === report.complaintSourceId,
                  )?.at ?? null,
                  report.timezone,
                )}
              </span>
            )}
          </div>
        </>
      )}
      {chapter.blocks.map((block, index) => {
        const content = <>
          <h3>{block.title}</h3>
          {typeof block.related==='boolean'&&<p className="visit-muted" data-copy-related>{block.related?'与本次有明确记录关联':'与本次关系尚未建立，保留供核对'}</p>}
          {block.lines.map((line, i) => (
            <p key={i}>
              <Emphasized text={line} />
            </p>
          ))}
          {block.entries?.map((entry,i)=><article className="visit-observation-entry" key={i}><h3>{entry.title}</h3>{entry.lines.map((line,j)=><p key={j}>{line}</p>)}{readOnly ? entry.sourceIds.map(id=><a key={id} href={`#${id}`}>{report.sources.find(s=>s.id===id)?.code} 查看依据</a>) : <button className="visit-text-action" onClick={()=>onEvidence?.(entry.sourceIds)}>查看当次依据</button>}</article>)}
          {block.distribution && <details open={readOnly} className="visit-statistics"><summary>展开记录构成明细</summary><FactDistribution values={block.distribution}/>{block.distributionNote&&<p>{block.distributionNote}</p>}</details>}
          {block.locations?.length ? (
            <ul className="visit-locations">
              {block.locations.map((l) => (
                <li key={l}>
                  <MapPin size={16} />
                  {l}
                </li>
              ))}
            </ul>
          ) : null}
          {block.points && (
            <>
              <FactLineChart
                points={block.points}
                unit={block.unit ?? ''}
                label={block.title}
                onPoint={onEvidence ? (id) => onEvidence([id]) : undefined}
                scatter={block.chartMode === 'scatter'}
                domain={block.unit === '℃' ? [36,40] : undefined}
              />
              <ul className="visit-point-list">
                {[...block.points].reverse().map((p, i) => (
                  <li key={`${p.sourceId}:${i}`}>
                    {readOnly ? (
                      <a href={`#${p.sourceId}`}>
                        <strong>
                          {p.value} {block.unit}
                        </strong>{' '}
                        · {reportTime(p.at, report.timezone)}
                      </a>
                    ) : (
                      <button onClick={() => onEvidence?.([p.sourceId])}>
                        <strong>
                          {p.value} {block.unit}
                        </strong>
                        <span>{reportTime(p.at, report.timezone)}</span>
                      </button>
                    )}
                    {p.detail && <small>{p.detail}</small>}
                  </li>
                ))}
              </ul>
            </>
          )}
          {block.sourceIds.length > 0 &&
            (readOnly ? (
              <p className="visit-source-links">
                依据：
                {block.sourceIds.map((id) => (
                  <a key={id} href={`#${id}`}>
                    [{report.sources.find(s=>s.id===id)?.code ?? '来源'}]{' '}
                  </a>
                ))}
              </p>
            ) : (
              <button
                className="visit-text-action"
                onClick={() => onEvidence?.(block.sourceIds)}
              >
                查看依据 · {block.sourceIds.length} 项
              </button>
            ))}
        </>
        return block.secondary && !readOnly ? <details className="visit-fact-block" key={index}><summary>{block.title} · 展开明细</summary>{content}</details> : <section className="visit-fact-block" data-report-source-ids={readOnly?JSON.stringify(block.sourceIds):undefined} key={index}>{content}</section>
      })}
      {chapter.id === 'overview' && (
        <section className="visit-fact-block">
          <h2>本次想问</h2>
          <p>{report.question || '尚未填写，可以用自己的话补充。'}</p>
          {report.question && (
            <small>{report.questionOrigin || '家长填写'}；更改主诉后请确认是否仍适用。</small>
          )}
          {!!report.questionSourceIds?.length && <button className="visit-text-action" onClick={()=>onEvidence?.(report.questionSourceIds!)}>查看问题原话</button>}
        </section>
      )}
      {trailing}
      {report.notes[chapter.id] && (
        <section className="visit-parent-note">
          <h2>家长补充</h2>
          <p>{report.notes[chapter.id]}</p>
          <small>报告说明，不替代原始记录；主诉变化后请确认是否仍适用。</small>
        </section>
      )}
    </section>
  )
}
