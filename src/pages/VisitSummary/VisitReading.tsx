import {
  ChevronDown,
  CircleHelp,
  Cross,
  Folder,
  History,
  Pencil,
} from '../../components/icons';
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MemberIdentity } from "../../features/organize/MemberIdentity";
import { readingCourseGroups, questionText, questionOrdinal } from "./readingPresentation";
import { useAppStore } from "../../store/useAppStore";
import type { VisitChapterId, VisitSheet } from "../../types/visitSheet";
import { FactLineChart } from "../../components/design-system/FactCharts";
import { reportTime } from "./ReportChapter";
import { CurrentSituation } from "./CurrentSituation";
import { growthReading, visitSignature } from "./reportCopy";
export const readingCards = [
  { id: "overview", title: "目前情况" },
  { id: "course", title: "相关经过与处理" },
  { id: "sources", title: "完整资料档案" },
  { id: "medication", title: "本次想问" },
] as const;
export type ReadingEditor =
  | "focus"
  | "association"
  | "question"
  | "current"
  | "symptoms"
  | "diet"
  | "course"
  | "data";
export function visibleReadingCards(report: VisitSheet) {
  return readingCards.filter(
    (card) =>
      card.id !== "course" ||
      !!readingCourseGroups(report).length ||
      !!report.notes.course,
  );
}
export function VisitReading({
  report,
  token,
  onEvidence,
  onEdit,
  onMedia,
  onChoose,
  onMedications,
  opened,
  busy = false,
  organizing = false, organizationError = '', onOrganize,
}: {
  report: VisitSheet;
  token: string;
  onEvidence: (ids: string[]) => void;
  onEdit: (kind: ReadingEditor, line?: number) => void;
  onMedia: (id: string) => void;
  onChoose: () => void;
  onMedications: () => void;
  opened: { id: VisitChapterId; serial: number };
  busy?: boolean;
  organizing?:boolean;organizationError?:string;onOrganize?:()=>void;
}) {
  const wasOrganizing = useRef(organizing)
  const [paperUpdated, setPaperUpdated] = useState(false)
  useEffect(() => {
    if (wasOrganizing.current && !organizing && !organizationError) setPaperUpdated(true)
    wasOrganizing.current = organizing
  }, [organizing, organizationError])
  useEffect(() => {
    if (!paperUpdated) return
    const timer = setTimeout(() => setPaperUpdated(false), 450)
    return () => clearTimeout(timer)
  }, [paperUpdated])
  const [folds, setFolds] = useState<Record<string, boolean>>({});
  const [lastOpened, setLastOpened] = useState(opened.serial);
  if (lastOpened !== opened.serial) {
    setLastOpened(opened.serial);
    setFolds((previous) => ({ ...previous, [opened.id]: true }));
  }
  const currentMember = useAppStore((s) =>
    s.members.find((m) => m.id === report.memberId),
  );
  const reading = report.reading,
    questions = report.question.split("\n").filter((line) => line.trim()),
    groups = readingCourseGroups(report),
    growth = growthReading(report);
  function card(
    id: VisitChapterId,
    title: string,
    icon: ReactNode,
    kind: ReadingEditor,
    summary: string,
    body: ReactNode,
  ) {
    return (
      <section
        className="visit-reading-card"
        id={`chapter-${id}`}
        data-reading-card={id}
      >
        <div className="visit-reading-card-head">
          <button
            className="visit-reading-toggle"
            aria-expanded={!!folds[id]}
            aria-controls={`reading-${id}`}
            onClick={() => setFolds({ ...folds, [id]: !folds[id] })}
          >
            <span>
              {icon}
              <span>
                <span role="heading" aria-level={2}>
                  {title}
                </span>
                {summary && <small>{summary}</small>}
              </span>
            </span>
            <ChevronDown size={16} className={folds[id] ? "is-open" : ""} />
          </button>
        </div>
        <div id={`reading-${id}`} hidden={!folds[id]}>
          {body}
          {id !== "overview" && <div className="visit-reading-actions">
            <button
              className="visit-reading-edit"
              disabled={busy}
              aria-label={`编辑${title}`}
              onClick={() => onEdit(kind)}
            >
              <Pencil size={14} />
              编辑
            </button>
          </div>}
        </div>
      </section>
    );
  }
  return (
    <div className="visit-reading" data-paper-updated={paperUpdated || undefined}>
      <MemberIdentity member={report.member} avatar={currentMember?.avatar ?? report.member.avatar} asOf={report.dataAsOf} height={reading?.height?.value} weight={reading?.weight?.value} onHeight={reading?.height ? () => onEvidence([reading.height!.sourceId]) : undefined} onWeight={reading?.weight ? () => onEvidence([reading.weight!.sourceId]) : undefined} />
      {card(
        "overview",
        "目前情况",
        <Cross size={19} />,
        "current",
        "",
        <CurrentSituation key={`${report.memberId}:${report.currentSituation?.scopeKey ?? report.photoKey}`} report={report} token={token} busy={busy} onEdit={onEdit} onChoose={onChoose} onMedia={onMedia} organizing={organizing} organizationError={organizationError} onOrganize={onOrganize}/>,

      )}

      {groups.length || report.notes.course
        ? card(
            "course",
            "相关经过与处理",
            <History size={19} />,
            "course",
            groups.map((g) => g.title).join(" · "),
            <>
              {groups.map((group) => (
                <section className="visit-reading-course-group" key={group.id}>
                  <h3>{group.title}</h3>
                  {group.lines.map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                  {group.blocks?.map((block, i) => (
                    <div key={i}>
                      {(block.points?.length ?? 0) > 1 && (
                        <FactLineChart
                          points={block.points!}
                          unit={block.unit || ""}
                          label={block.title}
                          scatter={block.chartMode === "scatter"}
                          onPoint={(id) => onEvidence([id])}
                        />
                      )}
                    </div>
                  ))}
                  {!!group.events?.length && group.events.length > 1 && (
                    <details>
                      <summary>查看相关时间线</summary>
                      <ol className="visit-reading-timeline">
                        {group.events.map((event, i) => (
                          <li key={i}>
                            <small>
                              {event.at
                                ? reportTime(event.at, report.timezone)
                                : "发生时间未知"}
                            </small>
                            <p>{event.title}</p>
                            <button
                              className="visit-text-action"
                              onClick={() => onEvidence(event.sourceIds)}
                            >
                              查看原话
                            </button>
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                  <button
                    className="visit-text-action"
                    onClick={() => onEvidence(group.sourceIds)}
                  >
                    查看来源
                  </button>
                  {group.id === "medication" && (
                    <button
                      className="visit-text-action"
                      onClick={onMedications}
                    >
                      用药计划与使用记录
                    </button>
                  )}
                </section>
              ))}
              {report.notes.course && <p>{report.notes.course}</p>}
            </>,
          )
        : null}
      {card(
        "sources",
        "完整资料档案",
        <Folder size={19} />,
        "data",
        "",
        <>
          {(reading?.archive ?? []).map((group) => (
            <section className="visit-reading-data-group" key={group.id}>
              <h3>{group.title}</h3>
              {group.id === "allergy" ? (
                <div className="visit-reading-keywords">
                  {group.items.map((item, i) => (
                    <span key={i}>
                      {item.title} · {item.detail}
                    </span>
                  ))}
                </div>
              ) : (
                group.items.map((item, i) => (
                  <p key={i}>
                    {item.title}
                    {item.detail && ` · ${item.detail}`}
                  </p>
                ))
              )}
            </section>
          ))}
          {!!growth.length && (
            <section className="visit-reading-data-group">
              <h3>成长概况</h3>
              {growth.map((item) => (
                <article key={item.title}>
                  <h4>{item.title}</h4>
                  {item.lines.map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                  <button
                    className="visit-text-action"
                    onClick={() => onEvidence(item.sourceIds)}
                  >
                    查看测量来源
                  </button>
                </article>
              ))}
            </section>
          )}
          {report.notes.history && <p>{report.notes.history}</p>}
          {report.notes.allergy && <p>{report.notes.allergy}</p>}
          {report.notes.sources && <p>{report.notes.sources}</p>}
        </>,
      )}
      {card(
        "medication",
        "本次想问",
        <CircleHelp size={19} />,
        "question",
        `${questions.length} 个问题`,
        <ol className="visit-reading-questions">
          {questions.map((question, i) => (
            <li key={i}><span className="visit-question-number">{questionOrdinal(i)}</span><p>{questionText(question)}</p></li>
          ))}
        </ol>,
      )}
      <footer className="visit-reading-footer">
        {visitSignature(report)} ·{" "}
        {reportTime(report.editedAt || report.generatedAt, report.timezone)}
      </footer>
    </div>
  );
}
