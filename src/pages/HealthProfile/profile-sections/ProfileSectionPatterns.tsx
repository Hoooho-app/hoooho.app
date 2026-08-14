import { useState, type KeyboardEvent, type ReactNode } from "react";
import {
  ChevronDown,
  FileText,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import {
  EmptyState,
  HealthCard,
  HohoButton,
  Typography,
} from "../../../components/design-system";
import type {
  ProfileExperienceField,
  ProfileValues,
  ProfileValue,
} from "../../../features/health-profile/config/profileSectionExperiences";
import { profileValueIsFilled } from "../../../features/health-profile/utils/profileSectionExperience";

export function ProfileChoiceGroup({
  label,
  multiple = false,
  onChange,
  options,
  value,
}: {
  label: string;
  multiple?: boolean;
  onChange: (value: string | string[]) => void;
  options: string[];
  value: ProfileValue | undefined;
}) {
  const selected = Array.isArray(value) ? value : value ? [String(value)] : [];
  const toggle = (option: string) => {
    if (!multiple) {
      onChange(selected.includes(option) ? "" : option);
      return;
    }
    onChange(
      selected.includes(option)
        ? selected.filter((item) => item !== option)
        : [...selected, option],
    );
  };
  return (
    <fieldset className="grid min-w-0 gap-2.5">
      <legend className="hoho-text-label">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            aria-pressed={selected.includes(option)}
            className="min-h-11 rounded-full border px-3.5 py-2 text-sm transition-colors aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:font-medium aria-pressed:text-primary"
            key={option}
            onClick={() => toggle(option)}
            type="button"
          >
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function ProfileTagsField({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string[]) => void;
  placeholder?: string;
  value: ProfileValue | undefined;
}) {
  const [draft, setDraft] = useState("");
  const tags = Array.isArray(value) ? value : value ? [String(value)] : [];
  const add = () => {
    const next = draft.trim();
    if (!next || tags.includes(next)) return;
    onChange([...tags, next]);
    setDraft("");
  };
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      add();
    }
  };
  return (
    <div className="hoho-field">
      <span className="hoho-text-label">{label}</span>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <button
              className="rounded-full border border-primary/30 bg-primary-soft px-3 py-1.5 text-sm text-primary"
              key={tag}
              onClick={() => onChange(tags.filter((item) => item !== tag))}
              type="button"
            >
              {tag} ×
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          className="hoho-input min-w-0 flex-1"
          onBlur={add}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={keyDown}
          placeholder={placeholder}
          value={draft}
        />
        <HohoButton className="shrink-0" onClick={add} variant="secondary">
          添加
        </HohoButton>
      </div>
    </div>
  );
}

export function ProfileAttachmentRecord({
  label,
  onUnavailable,
}: {
  label: string;
  onUnavailable: () => void;
}) {
  return (
    <button
      className="flex min-h-20 w-full items-center justify-center gap-3 rounded-control border border-dashed bg-background px-4 text-left text-primary"
      onClick={onUnavailable}
      type="button"
    >
      <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-soft">
        <Upload size={19} />
      </span>
      <span>
        <strong className="block text-sm">{label}</strong>
        <span className="mt-1 block text-xs text-text-secondary">
          支持拍照、相册或文件上传
        </span>
      </span>
    </button>
  );
}

export function ProfileStatusMatrix({
  fields,
  onChange,
  values,
}: {
  fields: ProfileExperienceField[];
  onChange: (id: string, value: string) => void;
  values: ProfileValues;
}) {
  return (
    <div className="grid gap-3">
      {fields.map((field) => (
        <div
          className="grid gap-2 border-b pb-3 last:border-b-0 last:pb-0"
          key={field.id}
        >
          <strong className="text-sm">{field.label}</strong>
          <div className="grid grid-cols-3 gap-1.5">
            {field.options?.map((option) => (
              <button
                aria-pressed={values[field.id] === option}
                className="min-h-11 rounded-control border px-2 py-2 text-xs leading-4 text-text-secondary aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:font-medium aria-pressed:text-primary"
                key={option}
                onClick={() =>
                  onChange(field.id, values[field.id] === option ? "" : option)
                }
                type="button"
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function summaryValue(record: ProfileValues, keys: string[]) {
  return keys
    .flatMap((key) => {
      const value = record[key];
      if (!profileValueIsFilled(value)) return [];
      return [Array.isArray(value) ? value.join("、") : String(value)];
    })
    .slice(0, 3)
    .join(" · ");
}

export function ProfileRecordList({
  emptyDescription,
  emptyTitle,
  mode,
  onDelete,
  onEdit,
  records,
  title,
}: {
  emptyDescription: string;
  emptyTitle: string;
  mode: string;
  onDelete: (index: number) => void;
  onEdit: (record: ProfileValues, index: number) => void;
  records: ProfileValues[];
  title: string;
}) {
  if (records.length === 0)
    return <EmptyState description={emptyDescription} title={emptyTitle} />;
  const keysByMode: Record<string, string[]> = {
    relationship: ["relationship", "conditions", "disease"],
    timeline: ["date", "name", "dose", "height", "weight"],
    library: ["name", "date", "organization", "summary"],
    history: ["type", "result", "date", "reason", "hospital", "location"],
  };
  const sectionTitle =
    mode === "library"
      ? "报告资料"
      : mode === "timeline"
        ? "时间记录"
        : mode === "relationship"
          ? "家族健康情况"
          : "";
  return (
    <section className="grid gap-3">
      {sectionTitle && <Typography variant="sectionTitle">{sectionTitle}</Typography>}
      <div className="grid gap-2.5">
        {records.map((record, index) => (
          <HealthCard
            className="p-0"
            key={`${String(record._savedAt ?? record.date ?? index)}-${index}`}
          >
            <article className="flex min-w-0 items-center gap-3 px-4 py-3.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                {mode === "library" ? <FileText size={18} /> : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <strong className="block truncate text-sm">
                  {String(
                    record.name ||
                      record.relationship ||
                      record.type ||
                      record.result ||
                      record.reason ||
                      title,
                  )}
                </strong>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-secondary">
                  {summaryValue(record, keysByMode[mode] ?? []) ||
                    "已保存，可继续补充"}
                </p>
              </div>
              <button
                aria-label="编辑记录"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-primary"
                onClick={() => onEdit(record, index)}
                type="button"
              >
                <Pencil size={17} />
              </button>
              <button
                aria-label="删除记录"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-danger"
                onClick={() => onDelete(index)}
                type="button"
              >
                <Trash2 size={17} />
              </button>
            </article>
          </HealthCard>
        ))}
      </div>
    </section>
  );
}

export function ProfileTimeline({ records }: { records: ProfileValues[] }) {
  if (records.length === 0) return null;
  return (
    <div className="relative ml-2 grid gap-4 border-l border-primary/30 pl-5">
      {records.map((record, index) => (
        <article className="relative" key={`${String(record.date)}-${index}`}>
          <span className="absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full border-2 border-primary bg-background" />
          <strong className="text-sm">
            {String(record.date || "时间未填写")}
          </strong>
          <p className="mt-1 text-sm text-text-secondary">
            {summaryValue(record, [
              "name",
              "dose",
              "height",
              "weight",
              "headCircumference",
            ]) || "已保存一条记录"}
          </p>
        </article>
      ))}
    </div>
  );
}

export function ProfileSectionLead({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="grid gap-3">
      <Typography variant="sectionTitle">{title}</Typography>
      {children}
    </section>
  );
}

export function AddRecordButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-control border border-dashed border-primary/60 bg-surface text-sm font-medium text-primary"
      onClick={onClick}
      type="button"
    >
      <Plus size={18} />
      {children}
    </button>
  );
}

export function EditorHeader({
  onClose,
  title,
}: {
  onClose?: () => void;
  title: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Typography variant="sectionTitle">{title}</Typography>
      {onClose && (
        <button
          className="flex min-h-10 items-center gap-1 text-sm text-text-secondary"
          onClick={onClose}
          type="button"
        >
          收起
          <ChevronDown size={17} />
        </button>
      )}
    </div>
  );
}

export function UploadReportAction({
  onUnavailable,
}: {
  onUnavailable: () => void;
}) {
  return (
    <button
      className="flex min-h-14 w-full items-center justify-center gap-2 rounded-control bg-primary text-sm font-semibold text-white"
      onClick={onUnavailable}
      type="button"
    >
      <Upload size={19} />
      上传检查报告
    </button>
  );
}

export function FileField({
  field,
  onUnavailable,
}: {
  field: ProfileExperienceField;
  onUnavailable: () => void;
}) {
  return (
    <ProfileAttachmentRecord
      label={field.label}
      onUnavailable={onUnavailable}
    />
  );
}

export function PaperclipHint() {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
      <Paperclip size={14} />
      附件能力暂未开放
    </span>
  );
}
