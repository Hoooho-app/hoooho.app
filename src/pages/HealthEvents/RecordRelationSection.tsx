import { Check, ChevronDown, ChevronRight, Plus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { HohoButton, StatusNotice } from '../../components/design-system'
import { journalCategoryLabels, journalListSummary, type JournalEntry } from './timeViewModel'
import { relatedCandidates } from './recordRelations'
import { useJournal } from './useJournal'

export type RecordBackfillTarget = 'daily' | 'visit' | 'medication' | 'symptom'

export function RecordRelationSection({
  title, hint, memberId, token, occurredAt, categories, selectedIds, onChange, onBackfill, target, nearbyDays,
}: {
  title: string; hint: string; memberId: string; token: string; occurredAt: string; categories: string[]
  selectedIds: string[]; onChange: (ids: string[]) => void; onBackfill: (target: RecordBackfillTarget) => void
  target: RecordBackfillTarget; nearbyDays?: number
}) {
  const [open, setOpen] = useState(false)
  const [viewing, setViewing] = useState<string | null>(null)
  const journal = useJournal(memberId, token, 0)
  const candidates = useMemo(() => relatedCandidates(journal.entries, categories, occurredAt, nearbyDays), [categories, journal.entries, nearbyDays, occurredAt])
  const toggle = (id: string) => onChange(selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id])
  const allSelected = candidates.length > 0 && candidates.every((entry) => selectedIds.includes(entry.id))
  return <section className={`record-relation-section${open ? ' is-open' : ''}`}>
    <button aria-expanded={open} className="record-relation-toggle" onClick={() => setOpen((value) => !value)} type="button">
      <span><strong>{title}</strong><small>{selectedIds.length ? `已带入 ${selectedIds.length} 条` : hint}</small></span><ChevronDown aria-hidden="true" size={18} />
    </button>
    {open && <div className="record-relation-body">
      {journal.loading ? <StatusNotice title="正在读取已有记录" /> : journal.error ? <StatusNotice action={<HohoButton onClick={journal.retry} variant="secondary">重新加载</HohoButton>} title={journal.error} tone="error" /> : candidates.length ? <>
        <div className="record-relation-heading"><span>已有记录，直接带入</span><button onClick={() => onChange(allSelected ? selectedIds.filter((id) => !candidates.some((entry) => entry.id === id)) : [...new Set([...selectedIds, ...candidates.map((entry) => entry.id)])])} type="button">{allSelected ? '取消带入' : '全部带入'}</button></div>
        <div className="record-relation-list">{candidates.map((entry) => <RelationRow entry={entry} checked={selectedIds.includes(entry.id)} key={entry.id} onToggle={() => toggle(entry.id)} onView={() => setViewing(viewing === entry.id ? null : entry.id)} viewing={viewing === entry.id} />)}</div>
      </> : <p className="record-relation-empty">当前人物还没有可带入的记录</p>}
      <button className="record-relation-new" onClick={() => onBackfill(target)} type="button"><Plus aria-hidden="true" size={18} />补充没记过的内容<ChevronRight aria-hidden="true" size={17} /></button>
    </div>}
  </section>
}

function RelationRow({ entry, checked, onToggle, onView, viewing }: { entry: JournalEntry; checked: boolean; onToggle: () => void; onView: () => void; viewing: boolean }) {
  return <article className="record-relation-row">
    <button aria-pressed={checked} className="record-relation-select" onClick={onToggle} type="button"><span aria-hidden="true" className="record-relation-check">{checked && <Check size={14} />}</span><span><small>{new Date(entry.occurredAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })} · {journalCategoryLabels[entry.categories?.[0] ?? 'other']}</small><strong>{journalListSummary(entry)}</strong></span></button>
    <button aria-expanded={viewing} className="record-relation-view" onClick={onView} type="button">{viewing ? <X size={16} /> : '查看'}</button>
    {viewing && <p>{entry.content}</p>}
  </article>
}
