import { MapPin } from 'lucide-react'
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
        {source.identity} · 发生：{reportTime(source.occurredAt)}
        <br />
        录入：{reportTime(source.createdAt)}
      </p>
      <p className="visit-original">{source.text}</p>
      <small>来源 ID：{source.id}</small>
    </>
  )
}
export function ReportChapter({
  chapter,
  report,
  onEvidence,
  readOnly = false,
}: {
  chapter: VisitChapter
  report: VisitSheet
  onEvidence?: (ids: string[]) => void
  readOnly?: boolean
}) {
  return (
    <section
      id={`chapter-${chapter.id}`}
      className={`visit-chapter visit-chapter--${chapter.id}`}
    >
      <p className="visit-eyebrow">
        {String(
          report.chapters.findIndex((s) => s.id === chapter.id) + 1,
        ).padStart(2, '0')}{' '}
        / 就诊情况单
      </p>
      <h1>{chapter.title}</h1>
      <p className="visit-intro">{chapter.summary}</p>
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
      {chapter.blocks.map((block, index) => (
        <section className="visit-fact-block" key={`${block.title}-${index}`}>
          <h2>{block.title}</h2>
          {block.lines.map((line, i) => (
            <p key={i}>
              <Emphasized text={line} />
            </p>
          ))}
          {block.distribution && (
            <FactDistribution values={block.distribution} />
          )}
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
                    [{id}]{' '}
                  </a>
                ))}
              </p>
            ) : (
              <button
                className="visit-text-action"
                onClick={() => onEvidence?.(block.sourceIds)}
              >
                查看 {block.sourceIds.length} 条依据 ›
              </button>
            ))}
        </section>
      ))}
      {chapter.id === 'overview' && (
        <section className="visit-fact-block">
          <h2>本次想问</h2>
          <p>{report.question || '尚未填写，可以用自己的话补充。'}</p>
          {report.question && (
            <small>家长填写；更改主诉后请确认是否仍适用。</small>
          )}
        </section>
      )}
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
