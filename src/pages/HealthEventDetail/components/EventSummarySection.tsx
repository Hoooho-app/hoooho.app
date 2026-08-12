import { FileText, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { HealthCard, HealthTag, HohoButton, HohoInput, Typography } from '../../../components/design-system'
import type { HealthEventSummaryApiDto } from '../../../types'

interface EventSummarySectionProps {
  summary: HealthEventSummaryApiDto
  onSave: (input: { title: string; summary: string }) => Promise<unknown>
}

export function EventSummarySection({ summary, onSave }: EventSummarySectionProps) {
  const displayed = summary.displayedResult
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(displayed.title)
  const [content, setContent] = useState(displayed.summary)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setTitle(displayed.title)
    setContent(displayed.summary)
  }, [displayed.summary, displayed.title])

  const save = async () => {
    if (!title.trim() || !content.trim() || saving) return
    setSaving(true)
    setError('')
    try {
      await onSave({ title: title.trim(), summary: content.trim() })
      setEditing(false)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '保存校对失败，请稍后重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby="event-summary-title" className="mb-6">
      <HealthCard className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Typography id="event-summary-title" variant="sectionTitle">事件摘要</Typography>
          {!editing && <HohoButton variant="text" onClick={() => setEditing(true)}>手动校对</HohoButton>}
        </div>
        <HealthTag tone="primary"><Sparkles size={14} />自动整理</HealthTag>

        {editing ? (
          <div className="space-y-3">
            <HohoInput label="事件名称" maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} />
            <label className="hoho-field">
              <span className="hoho-text-label">摘要</span>
              <textarea className="hoho-textarea" maxLength={1000} value={content} onChange={(event) => setContent(event.target.value)} />
            </label>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <HohoButton variant="text" onClick={() => { setEditing(false); setTitle(displayed.title); setContent(displayed.summary) }}>取消</HohoButton>
              <HohoButton disabled={saving || !title.trim() || !content.trim()} onClick={() => void save()}>{saving ? '保存中…' : '保存校对'}</HohoButton>
            </div>
          </div>
        ) : (
          <>
            <Typography className="break-words" variant="pageTitle">{displayed.title}</Typography>
            <Typography className="whitespace-pre-wrap break-words" variant="body">{displayed.summary}</Typography>
            <div className="flex items-start gap-2 text-text-secondary">
              <FileText className="mt-0.5 shrink-0" size={17} />
              <Typography variant="caption">依据：{displayed.evidence.join(' · ')}</Typography>
            </div>
            <div className="border-t border-dashed border-border pt-3">
              <Typography variant="caption">
                {summary.hasNewEvidenceAfterCorrection
                  ? '新的关键记录已纳入系统摘要；当前仍保留你的校对表达。'
                  : '系统会根据后续记录自动更新，你也可以手动校对。'}
              </Typography>
            </div>
          </>
        )}
      </HealthCard>
    </section>
  )
}
