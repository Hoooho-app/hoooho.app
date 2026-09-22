import { BottomSheetSurface, HohoButton, StatusNotice } from '../../components/design-system'
import { useHealthEventDetail } from '../../hooks/useHealthEventDetail'
import { SymptomRecordSheet } from '../HealthEventDetail/components'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { FileText, Moon, Pencil, Save, Trash2 } from 'lucide-react'
import type { JournalVisitRecognitionField } from '../../types/journal'
import type { HealthEventRecordApiDto } from '../../types'
import { useJournal } from './useJournal'
import { useAppStore } from '../../store/useAppStore'

export function JournalRecordDetail({ eventId, recordId, onChanged, onClose }: {
  eventId: string
  recordId: string
  onChanged: () => void
  onClose: () => void
}) {
  const { state, retry, updateRecord, deleteRecord } = useHealthEventDetail(eventId)
  const memberId = useAppStore((value) => value.currentMemberId)
  const token = useAppStore((value) => value.authToken ?? '')
  const relatedJournal = useJournal(memberId, token, 0)
  const [now, setNow] = useState(() => Date.now())
  const [ending, setEnding] = useState(false)
  const [endError, setEndError] = useState('')
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer) }, [])

  if (state.status === 'loading') return <StatusSheet onClose={onClose}><StatusNotice title="正在读取记录详情" /></StatusSheet>
  if (state.status === 'error') return <StatusSheet onClose={onClose}><StatusNotice action={<HohoButton variant="secondary" onClick={retry}>重新加载</HohoButton>} tone="error" title={state.message} /></StatusSheet>
  if (state.status === 'not-found') return <StatusSheet onClose={onClose}><StatusNotice tone="error" title="未找到这条健康随记" /></StatusSheet>

  const entry = state.data.viewModel.event.timeline.find((item) => item.sourceRecordId === recordId) ?? null
  const record = state.data.records.find((item) => item.id === recordId) ?? null
  if (!entry) return <StatusSheet onClose={onClose}><StatusNotice tone="error" title="未找到这条记录" /></StatusSheet>
  if (record?.journal?.sleep?.status === 'ongoing') {
    const sleep = record.journal.sleep
    const elapsed = Math.max(0, Math.floor((now - Date.parse(sleep.sleepAt)) / 60_000))
    const endSleep = async () => {
      if (ending) return
      setEnding(true); setEndError('')
      const wakeAt = new Date()
      const durationMinutes = Math.max(1, Math.round((wakeAt.getTime() - Date.parse(sleep.sleepAt)) / 60_000))
      try {
        await updateRecord(record.id, { journal: { ...record.journal, sleep: { ...sleep, wakeAt: wakeAt.toISOString(), durationMinutes, status: 'completed' } } })
        onChanged(); onClose()
      } catch (error) { setEndError(error instanceof Error ? error.message : '结束睡眠失败，请重试') }
      finally { setEnding(false) }
    }
    return <BottomSheetSurface label="正在记录睡眠" onClose={onClose} open title="正在记录睡眠"><div className="sleep-active-detail"><span><Moon aria-hidden="true" size={30} /></span><strong>{`${Math.floor(elapsed / 60)}小时${elapsed % 60}分钟`}</strong><h2>{`${state.data.member.name}开始睡觉了`}</h2><HohoButton fullWidth loading={ending} onClick={() => void endSleep()} size="large">结束睡眠</HohoButton><p>离开页面也会继续记录</p>{endError && <p role="alert">{endError}</p>}</div></BottomSheetSurface>
  }
  if (record?.journal?.visit?.sourceDocuments?.length) return <VisitDocumentRecordSheet
    onClose={onClose}
    onDelete={async () => { await deleteRecord(record.id); onChanged(); onClose() }}
    onUpdate={async (fields) => { await updateRecord(record.id, { journal: { ...record.journal!, visit: { ...record.journal!.visit!, recognitionFields: fields, recognitionStatus: fields.some((field) => field.status === 'user_edited') ? 'user_edited' : record.journal!.visit!.recognitionStatus }, occurredAt: record.occurredAt } }); onChanged() }}
    record={record}
  />

  return <SymptomRecordSheet
    entry={entry}
    memberName={state.data.member.name}
    onClose={onClose}
    onDelete={async (id) => { await deleteRecord(id); onChanged() }}
    onUpdate={async (id, input) => { const updated = await updateRecord(id, input); onChanged(); return updated }}
    record={record}
    relatedEntries={relatedJournal.entries}
    relatedError={relatedJournal.error}
    relatedLoading={relatedJournal.loading}
    onRelatedRetry={relatedJournal.retry}
  />
}

const visitFieldLabels: Record<JournalVisitRecognitionField['kind'], string> = { visit_time: '就医时间', institution: '机构', department: '科室', diagnosis: '资料中的诊断原文', examination_result: '检查结果', prescription: '处方信息', medical_instruction: '医嘱原文' }

function VisitDocumentRecordSheet({ record, onClose, onDelete, onUpdate }: { record: HealthEventRecordApiDto; onClose: () => void; onDelete: () => Promise<void>; onUpdate: (fields: JournalVisitRecognitionField[]) => Promise<void> }) {
  const visit = record.journal!.visit!
  const [editing, setEditing] = useState(false)
  const [fields, setFields] = useState(visit.recognitionFields ?? [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async () => { setBusy(true); setError(''); try { await onUpdate(fields); setEditing(false) } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，请重试') } finally { setBusy(false) } }
  const remove = async () => { if (!window.confirm('删除这条就医记录？原始资料也会从这条记录中移除。')) return; setBusy(true); try { await onDelete() } catch (reason) { setError(reason instanceof Error ? reason.message : '删除失败，请重试'); setBusy(false) } }
  return <BottomSheetSurface label="就医记录详情" onClose={onClose} open size="workspace" title="就医记录详情" footer={editing ? <div className="symptom-record-editor-actions"><HohoButton disabled={busy} onClick={() => setEditing(false)} variant="secondary">取消</HohoButton><HohoButton disabled={busy} loading={busy} onClick={() => void save()}><Save size={17} />保存修改</HohoButton></div> : <HohoButton fullWidth onClick={() => setEditing(true)}><Pencil size={17} />核对并修改</HohoButton>}>
    <div className="visit-detail-sheet"><section><h3>原始资料</h3><div className="visit-detail-sources">{visit.sourceDocuments!.map((source) => <article key={source.id}><FileText /><span><strong>{source.name}</strong><small>{source.mimeType === 'application/pdf' ? 'PDF 文件' : '图片'} · {source.recognitionStatus === 'completed' ? '已整理' : source.recognitionStatus === 'partial' ? '部分待核对' : source.recognitionStatus === 'unavailable' ? '未自动整理' : source.recognitionStatus === 'failed' ? '整理失败' : '处理中'}</small></span></article>)}</div></section>
      <section><h3>整理结果</h3>{fields.length ? <div className="visit-detail-fields">{fields.map((field) => editing ? <label key={field.id}><span>{visitFieldLabels[field.kind]}<small>{field.sourceName}{field.sourcePage ? ` · 第${field.sourcePage}页` : ''}</small></span><textarea onChange={(event) => setFields((current) => current.map((item) => item.id === field.id ? { ...item, value: event.target.value, status: 'user_edited', originalValue: item.originalValue ?? item.value } : item))} value={field.value} /><button onClick={() => setFields((current) => current.filter((item) => item.id !== field.id))} type="button"><Trash2 size={15} />删除这一项</button></label> : <article key={field.id}><strong>{visitFieldLabels[field.kind]}</strong><p>{field.value}</p><small>来源：{field.sourceName}{field.sourcePage ? `，第${field.sourcePage}页` : ''}{field.status === 'uncertain' ? ' · 待核对' : field.status === 'user_edited' ? ' · 已修改' : ''}</small></article>)}</div> : <p className="visit-detail-empty">没有可确认的结构化字段，原始资料已保留。</p>}</section>
      <section><h3>记录信息</h3><p>{new Date(record.occurredAt).toLocaleString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</p></section>
      {editing && <button className="visit-detail-delete" disabled={busy} onClick={() => void remove()} type="button"><Trash2 size={16} />删除这条记录</button>}{error && <p className="medication-save-error" role="alert">{error}</p>}
    </div>
  </BottomSheetSurface>
}

function StatusSheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return <BottomSheetSurface label="记录详情" onClose={onClose} open title="记录详情">{children}</BottomSheetSurface>
}
