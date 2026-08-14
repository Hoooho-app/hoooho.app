import { ChangeEvent, FormEvent, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  FileText,
  Plus,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import { WebPageHeader } from "../../components/common";
import { HealthProfileActionBar, MemberIdentityCard } from "../../components/health";
import { HohoButton, Typography } from "../../components/design-system";
import {
  chronicSummary,
  emptyChronicRecord,
  nextChronicSequence,
  normalizeChronicRecords,
  normalizeChronicReports,
  type ChronicProfileRecord,
  type ChronicProfileReport,
} from "../../features/health-profile/utils/chronicProfile";
import type { Member } from "../../types";

const locationGroups = [
  {
    label: "头部（正面）",
    options: ["前额", "左太阳穴", "右太阳穴", "头顶", "整个头部"],
  },
  { label: "头部（背面）", options: ["后脑", "颈部", "上背部"] },
  {
    label: "腰背",
    options: ["左侧腰部", "右侧腰部", "腰部中央", "上背", "下背"],
  },
  {
    label: "足部",
    options: ["足内侧", "足外侧", "脚跟", "足底", "脚背", "脚趾"],
  },
];
const symptoms = [
  "疼痛",
  "酸胀",
  "麻木",
  "刺痛",
  "灼热",
  "僵硬",
  "无力",
  "肿胀",
];
const patterns = [
  "持续存在",
  "反复出现",
  "季节相关",
  "天冷时",
  "劳累后",
  "久坐后",
  "久站后",
  "运动后",
  "睡眠不足时",
];
const durations = ["几分钟", "几小时", "一天以内", "几天", "更久", "不确定"];

function loadJson(key: string) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as unknown;
  } catch {
    return [];
  }
}
function SequenceNumber({ sequence }: { sequence: number }) {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-surface">
      {sequence}
    </span>
  );
}

function SingleChoice({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="hoho-text-label mb-2">{label}</legend>
      <div
        className={`grid gap-2 ${options.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}
      >
        {options.map((option) => (
          <button
            aria-pressed={value === option}
            className={`min-h-11 rounded-control border px-2 text-sm ${value === option ? "border-primary bg-primary text-surface" : "bg-surface text-text-primary"}`}
            key={option}
            onClick={() => onChange(value === option ? "" : option)}
            type="button"
          >
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function MultiChoice({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: string[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const toggle = (option: string) =>
    onChange(
      values.includes(option)
        ? values.filter((item) => item !== option)
        : [...values, option],
    );
  return (
    <fieldset className="grid gap-2">
      <legend className="hoho-text-label mb-2">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = values.includes(option);
          return (
            <button
              aria-pressed={selected}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-control border px-3 text-xs ${selected ? "border-primary bg-primary-soft font-semibold text-primary" : "bg-surface text-text-secondary"}`}
              key={option}
              onClick={() => toggle(option)}
              type="button"
            >
              {selected && <Check size={14} />}
              {option}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function BodyMap({
  values,
  onChange,
}: {
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const toggle = (location: string) =>
    onChange(
      values.includes(location)
        ? values.filter((item) => item !== location)
        : [...values, location],
    );
  const hasFront = values.some((item) =>
    [
      "前额",
      "左太阳穴",
      "右太阳穴",
      "头顶",
      "整个头部",
      "左侧腰部",
      "右侧腰部",
      "腰部中央",
      "足内侧",
      "足外侧",
      "脚跟",
      "足底",
      "脚背",
      "脚趾",
    ].includes(item),
  );
  const hasBack = values.some((item) =>
    ["后脑", "颈部", "上背部", "上背", "下背"].includes(item),
  );
  return (
    <fieldset className="grid gap-3">
      <legend className="hoho-text-label mb-2">不舒服的位置（可多选）</legend>
      <div className="grid grid-cols-[104px_minmax(0,1fr)] gap-3 rounded-control border bg-background p-3">
        <div
          className="grid content-start gap-3"
          aria-label="人体正面和背面位置示意"
        >
          <div
            className={`grid min-h-28 place-items-center rounded-control border ${hasFront ? "border-primary bg-primary-soft text-primary" : "bg-surface text-text-weak"}`}
          >
            <UserRound size={52} strokeWidth={1.2} />
            <span className="text-xs">正面</span>
          </div>
          <div
            className={`grid min-h-28 place-items-center rounded-control border ${hasBack ? "border-primary bg-primary-soft text-primary" : "bg-surface text-text-weak"}`}
          >
            <UserRound className="scale-x-[-1]" size={52} strokeWidth={1.2} />
            <span className="text-xs">背面</span>
          </div>
        </div>
        <div className="min-w-0 space-y-4">
          {locationGroups.map((group) => (
            <div className="grid gap-2" key={group.label}>
              <span className="text-xs font-medium text-text-secondary">
                {group.label}
              </span>
              <div className="flex flex-wrap gap-2">
                {group.options.map((location) => {
                  const selected = values.includes(location);
                  return (
                    <button
                      aria-pressed={selected}
                      className={`inline-flex min-h-10 items-center gap-1 rounded-control border px-2.5 text-xs ${selected ? "border-primary bg-primary-soft font-semibold text-primary" : "bg-surface text-text-secondary"}`}
                      key={location}
                      onClick={() => toggle(location)}
                      type="button"
                    >
                      {location}
                      {selected && <Check size={13} />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex min-h-11 items-center justify-between gap-3 rounded-control bg-background px-3">
        <span className="min-w-0 text-xs text-text-secondary">
          已选择：{values.length ? values.join("、") : "未选择"}
        </span>
        {values.length > 0 && (
          <button
            className="shrink-0 text-xs font-medium text-primary"
            onClick={() => onChange([])}
            type="button"
          >
            清除选择
          </button>
        )}
      </div>
    </fieldset>
  );
}

function ChronicFields({
  record,
  onChange,
}: {
  record: ChronicProfileRecord;
  onChange: (changes: Partial<ChronicProfileRecord>) => void;
}) {
  const titleLabel =
    record.knowledge === "还不知道是什么"
      ? "怎么称呼这个问题"
      : "疾病 / 问题名称";
  return (
    <div className="grid gap-5">
      <SingleChoice
        label="我对这个问题的了解"
        options={["已有明确名称", "还不知道是什么"]}
        value={record.knowledge}
        onChange={(knowledge) => onChange({ knowledge })}
      />
      <label className="hoho-field">
        <span className="hoho-text-label">{titleLabel}</span>
        <input
          className="hoho-input"
          placeholder={
            record.knowledge === "还不知道是什么"
              ? "例如冬天反复头疼"
              : "例如哮喘、高血压"
          }
          value={record.name}
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </label>
      <BodyMap
        values={record.locations}
        onChange={(locations) => onChange({ locations })}
      />
      <MultiChoice
        label="主要表现（可多选）"
        options={symptoms}
        values={record.symptoms}
        onChange={(next) => onChange({ symptoms: next })}
      />
      <label className="hoho-field">
        <span className="hoho-text-label">其他表现</span>
        <input
          className="hoho-input"
          value={record.otherSymptom}
          onChange={(event) => onChange({ otherSymptom: event.target.value })}
        />
      </label>
      <label className="hoho-field">
        <span className="hoho-text-label">自己描述</span>
        <textarea
          className="hoho-textarea"
          placeholder="用自己的话描述这个长期问题"
          rows={3}
          value={record.description}
          onChange={(event) => onChange({ description: event.target.value })}
        />
      </label>
      <MultiChoice
        label="出现规律"
        options={patterns}
        values={record.patterns}
        onChange={(next) => onChange({ patterns: next })}
      />
      <label className="hoho-field">
        <span className="hoho-text-label">其他规律</span>
        <input
          className="hoho-input"
          value={record.otherPattern}
          onChange={(event) => onChange({ otherPattern: event.target.value })}
        />
      </label>
      <label className="hoho-field">
        <span className="hoho-text-label">每次通常持续</span>
        <select
          className="hoho-select"
          value={record.duration}
          onChange={(event) => onChange({ duration: event.target.value })}
        >
          <option value="">请选择</option>
          {durations.map((duration) => (
            <option key={duration}>{duration}</option>
          ))}
        </select>
      </label>
      <SingleChoice
        label="对生活的影响"
        options={["基本不影响", "有一些影响", "明显影响"]}
        value={record.lifeImpact}
        onChange={(lifeImpact) => onChange({ lifeImpact })}
      />
      <label className="hoho-field">
        <span className="hoho-text-label">平时怎么处理</span>
        <textarea
          className="hoho-textarea"
          placeholder="记录过去实际如何处理"
          rows={3}
          value={record.handling}
          onChange={(event) => onChange({ handling: event.target.value })}
        />
      </label>
    </div>
  );
}

function ReportSection({
  reports,
  onUpload,
  onDelete,
}: {
  reports: ChronicProfileReport[];
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onDelete: (id: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <section className="grid gap-3 rounded-card border bg-surface p-4">
      <Typography variant="sectionTitle">相关检查与资料</Typography>
      <button
        className="grid min-h-20 place-items-center rounded-control border border-dashed bg-background px-4 text-center"
        onClick={() => input.current?.click()}
        type="button"
      >
        <span className="grid gap-1">
          <span className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-primary">
            <Upload size={19} />
            上传检查报告 / 资料
          </span>
          <span className="text-xs text-text-secondary">
            支持拍照、相册或文件上传
          </span>
        </span>
      </button>
      <input
        ref={input}
        accept="image/*,.pdf,application/pdf"
        className="sr-only"
        multiple
        type="file"
        onChange={onUpload}
      />
      {reports.map((report) => (
        <article
          className="flex min-w-0 items-center gap-3 rounded-control border p-3"
          key={report.id}
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-primary-soft text-primary">
            <FileText size={19} />
          </span>
          <a
            className="min-w-0 flex-1"
            href={report.dataUrl}
            rel="noreferrer"
            target="_blank"
          >
            <span className="block text-xs text-text-secondary">
              {report.date}
            </span>
            <strong className="block truncate text-sm">{report.name}</strong>
            <span className="block text-xs text-text-secondary">
              {report.parsingStatus}
            </span>
          </a>
          <button
            aria-label={`删除资料 ${report.name}`}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-danger"
            onClick={() => onDelete(report.id)}
            type="button"
          >
            <Trash2 size={17} />
          </button>
        </article>
      ))}
    </section>
  );
}

export function ChronicProfilePage({
  member,
  storageKey,
}: {
  member: Member;
  storageKey: string;
}) {
  const reportKey = `${storageKey}:reports`;
  const initial = useState(() => {
    const stored = loadJson(storageKey);
    return normalizeChronicRecords(
      Array.isArray(stored) ? (stored as Record<string, unknown>[]) : [],
    );
  })[0];
  const [records, setRecords] = useState<ChronicProfileRecord[]>(() =>
    initial.length ? initial : [emptyChronicRecord(1)],
  );
  const [reports, setReports] = useState<ChronicProfileReport[]>(() =>
    normalizeChronicReports(loadJson(reportKey)),
  );
  const [expandedId, setExpandedId] = useState(() =>
    initial.length ? "" : records[0].id,
  );
  const [status, setStatus] = useState("");
  const updateRecord = (id: string, changes: Partial<ChronicProfileRecord>) =>
    setRecords((current) =>
      current.map((record) =>
        record.id === id ? { ...record, ...changes } : record,
      ),
    );
  const addRecord = () => {
    const next = emptyChronicRecord(nextChronicSequence(records));
    setRecords((current) => [...current, next]);
    setExpandedId(next.id);
    setStatus("");
  };
  const deleteRecord = (id: string) => {
    if (!window.confirm("确认删除这条长期健康问题记录吗？")) return;
    setRecords((current) => {
      const next = current.filter((record) => record.id !== id);
      if (!next.length) {
        const empty = emptyChronicRecord(1);
        setExpandedId(empty.id);
        return [empty];
      }
      setExpandedId("");
      return next;
    });
  };
  const uploadReports = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    if (files.some((file) => file.size > 1_500_000)) {
      setStatus("文件过大，请选择单个 1.5MB 以内的图片或 PDF");
      event.target.value = "";
      return;
    }
    files.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = () =>
        setReports((current) => [
          ...current,
          {
            id: `chronic-report-${Date.now()}-${index}`,
            name: file.name,
            date: new Date().toISOString().slice(0, 10).replaceAll("-", "/"),
            dataUrl: String(reader.result ?? ""),
            mimeType: file.type,
            parsingStatus: "待人工整理",
          },
        ]);
      reader.readAsDataURL(file);
    });
    setStatus("资料已添加，保存档案后持久化");
    event.target.value = "";
  };
  const deleteReport = (id: string) => {
    if (window.confirm("确认删除这份检查或资料吗？"))
      setReports((current) => current.filter((report) => report.id !== id));
  };
  const saveArchive = (event: FormEvent) => {
    event.preventDefault();
    try {
      const savedAt = new Date().toISOString();
      const next = records.map((record) => ({ ...record, _savedAt: savedAt }));
      localStorage.setItem(storageKey, JSON.stringify(next));
      localStorage.setItem(reportKey, JSON.stringify(reports));
      setRecords(next);
      setStatus("慢性病与长期健康问题档案已保存");
    } catch {
      setStatus("保存失败，请缩小资料文件后重试");
    }
  };

  return (
    <main className="app-shell min-h-dvh">
      <WebPageHeader fallback="/health-profile" title="慢性病与长期健康问题" />
      <div className="page-content health-profile-page-content">
        <MemberIdentityCard member={member} recordSubject />
        <Typography variant="caption">
          所有字段均可留空，按你了解的情况填写即可
        </Typography>
        <form
          className="grid gap-3"
          id="chronic-profile-form"
          onSubmit={saveArchive}
        >
          {records.map((record) => {
            const expanded = expandedId === record.id;
            const summary = chronicSummary(record);
            return (
              <article
                className="rounded-card border bg-surface p-4"
                key={record.id}
              >
                <div className="flex items-start gap-3">
                  <SequenceNumber sequence={record.sequence} />
                  <button
                    aria-expanded={expanded}
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setExpandedId(expanded ? "" : record.id)}
                    type="button"
                  >
                    <strong className="block truncate text-sm">
                      {record.name || `长期健康问题 ${record.sequence}`}
                    </strong>
                    {!expanded && (
                      <>
                        <span className="mt-1 block line-clamp-2 text-xs leading-5 text-text-secondary">
                          {summary.detail}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-text-secondary">
                          {summary.pattern || "规律未填"} · {summary.impact}
                        </span>
                      </>
                    )}
                  </button>
                  {expanded ? (
                    <button
                      className="min-h-11 px-1 text-sm font-medium text-danger"
                      onClick={() => deleteRecord(record.id)}
                      type="button"
                    >
                      删除
                    </button>
                  ) : (
                    <button
                      aria-label={`展开问题 ${record.sequence}`}
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-text-secondary"
                      onClick={() => setExpandedId(record.id)}
                      type="button"
                    >
                      <ChevronDown size={21} />
                    </button>
                  )}
                </div>
                {expanded && (
                  <div className="mt-5 grid gap-5">
                    <ChronicFields
                      record={record}
                      onChange={(changes) => updateRecord(record.id, changes)}
                    />
                    <HohoButton
                      onClick={() => setExpandedId("")}
                      type="button"
                      variant="secondary"
                    >
                      <Check size={17} />
                      确认并收起
                    </HohoButton>
                  </div>
                )}
              </article>
            );
          })}
          <button
            className="flex min-h-12 items-center justify-center gap-2 rounded-control border border-dashed text-sm font-semibold text-primary"
            onClick={addRecord}
            type="button"
          >
            <Plus size={19} />
            添加一个长期健康问题
          </button>
          <ReportSection
            reports={reports}
            onDelete={deleteReport}
            onUpload={uploadReports}
          />
          {status && (
            <p
              className={`text-sm ${status.includes("失败") || status.includes("过大") ? "text-danger" : "text-primary"}`}
              role="status"
            >
              {status}
            </p>
          )}
        </form>
      </div>
      <HealthProfileActionBar>
        <HohoButton fullWidth form="chronic-profile-form" type="submit">
          保存档案
        </HohoButton>
      </HealthProfileActionBar>
    </main>
  );
}
