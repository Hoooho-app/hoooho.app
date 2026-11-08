import {
  ChevronDown,
  CircleHelp,
  SymptomIcon,
  FileText,
  Stethoscope,
  History,
  Pencil,
} from '../../components/icons';
import { useState, type ReactNode } from "react";
import { readingCourseGroups, questionText, questionOrdinal } from "./readingPresentation";
import type { VisitChapterId, VisitClinicalPatch, VisitSheet } from "../../types/visitSheet";
import { FactLineChart } from "../../components/design-system/FactCharts";
import { reportTime } from "./ReportChapter";
import { VisitComplaint, VisitTemperature } from "./CurrentSituation";
import { ClinicalChoices } from "./ClinicalChoices";
import { visitIdentity } from "./clinicalPresentation";
import { visitSignature } from "./reportCopy";
export const readingCards = [
  { id: "overview", title: "主诉" },
  { id: "sources", title: "现病史" },
  { id: "visits", title: "体格情况" },
  { id: "medication", title: "本次想问" },
  { id: "course", title: "相关经过与处理" },
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
  onClinicalSave,
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
  onClinicalSave: (patch: VisitClinicalPatch) => Promise<boolean>;
}) {
  const [folds, setFolds] = useState<Record<string, boolean>>({ overview: true, sources: true, visits: true });
  const [lastOpened, setLastOpened] = useState(opened.serial);
  if (lastOpened !== opened.serial) {
    setLastOpened(opened.serial);
    setFolds((previous) => ({ ...previous, [opened.id]: true }));
  }
  const { clinical } = report;
  const questions = report.question.split("\n").filter((line) => line.trim());
  const groups = readingCourseGroups(report);
  function card(
    id: VisitChapterId,
    title: string,
    icon: ReactNode,
    kind: ReadingEditor | null,
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
          {kind && <div className="visit-reading-actions">
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
    <div className="visit-reading">
      <dl className="visit-clinical-identity" aria-label="孩子基本信息">
        {visitIdentity(report).map(field => <div key={field.label}><dt>{field.label}</dt><dd>{field.value || '—'}</dd></div>)}
      </dl>
      {card("overview", "主诉", <SymptomIcon size={19} />, null, "",
        <VisitComplaint report={report} token={token} busy={busy} onChange={() => onEdit("focus")} onChoose={onChoose} onMedia={onMedia} />
      )}
      {card("sources", "现病史", <FileText size={19} />, null, "",
        <>
          {clinical?.range && <p className="visit-clinical-hint">本次整理范围 {clinical.range.from} 至 {clinical.range.to}</p>}
          {clinical?.onset && <p className="visit-clinical-note">{clinical.onset}</p>}
          {!!clinical?.timeline.length && <ol className="visit-clinical-timeline">
            {clinical.timeline.map(entry => <li key={entry.sourceId}>
              <button className="visit-clinical-source" onClick={() => onEvidence([entry.sourceId])}>{entry.at ? reportTime(entry.at, report.timezone) : '时间未填写'}</button>
              <p>{entry.text}</p>
            </li>)}
          </ol>}
          {clinical?.historyNote && <p className="visit-clinical-note">家长补充　{clinical.historyNote}</p>}
          {clinical && <ClinicalChoices key={`history:${clinical.scopeKey}`} section="history" rows={clinical.history} scopeKey={clinical.scopeKey} timezone={report.timezone} busy={busy} onSave={onClinicalSave} onEvidence={onEvidence} />}
          <VisitTemperature memberId={report.memberId} token={token} />
          <div className="visit-clinical-links">
            {clinical?.scopeKey && <button className="visit-text-action" disabled={busy} onClick={() => onEdit("current")}>编辑情况描述</button>}
            <button className="visit-text-action" disabled={busy} onClick={() => onEdit("data")}>资料范围与附件</button>
          </div>
        </>
      )}
      {card("visits", "体格情况", <Stethoscope size={19} />, null, "",
        clinical && <ClinicalChoices key={`exam:${clinical.scopeKey}`} section="examination" rows={clinical.examination} scopeKey={clinical.scopeKey} timezone={report.timezone} busy={busy} onSave={onClinicalSave} onEvidence={onEvidence} />
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
                              查看来源
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
      <footer className="visit-reading-footer">
        {visitSignature(report)} ·{" "}
        {reportTime(report.editedAt || report.generatedAt, report.timezone)}
      </footer>
    </div>
  );
}
