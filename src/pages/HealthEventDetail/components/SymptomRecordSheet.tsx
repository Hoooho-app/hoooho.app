import { Pencil, Save, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BottomSheetSurface, HohoButton } from '../../../components/design-system'
import type { HealthEventRecordApiDto, HealthMeasurementMethod, TimelineEntry, UpdateHealthEventRecordInput } from '../../../types'
import { isFutureOccurredAt, localDateTimeValue } from '../../../utils/healthOccurredAt'

interface SymptomRecordSheetProps {
  entry: TimelineEntry | null
  memberName: string
  record: HealthEventRecordApiDto | null
  initialEditing?: boolean
  onClose: () => void
  onDelete: (recordId: string) => Promise<void>
  onUpdate: (recordId: string, input: UpdateHealthEventRecordInput) => Promise<unknown>
}

const measurementMethods: Array<{ label: string; value: HealthMeasurementMethod }> = [
  { label: '未说明', value: 'unspecified' },
  { label: '口腔', value: 'oral' },
  { label: '腋下', value: 'axillary' },
  { label: '耳温', value: 'ear' },
  { label: '额温', value: 'forehead' },
  { label: '其他', value: 'other' }
]

export function symptomRecordTitle(entry: TimelineEntry) {
  const location = entry.segments?.find((segment) => segment.label === '部位')?.content.trim()
  const segments = (entry.segments ?? []).filter((segment) => segment.label !== '部位' && segment.label !== '附件')
  if (segments.length === 1) {
    const segment = segments[0]
    if (segment.label === '体温') return segment.content.startsWith('体温') ? segment.content : `体温 ${segment.content}`
    if (segment.label === '用药') return /服用|使用|用药/.test(segment.content) ? segment.content : `服用${segment.content}`
    if (segment.label === '记录') return segment.content
    return [location, segment.content].filter(Boolean).join(' ')
  }
  if (segments.length > 1) return [location, ...segments.map((segment) => segment.content)].filter(Boolean).join('；')
  return entry.summary?.trim() || entry.content.trim()
}

export function symptomRecordTypeLabel(entry: TimelineEntry) {
  const label = entry.segments?.find((segment) => segment.label !== '部位' && segment.label !== '附件')?.label
  if (label === '体温') return '体温测量'
  if (label === '状态') return '症状变化'
  if (label === '用药') return '处理记录'
  if (label === '检查') return '检查记录'
  if (label === '就诊') return '就诊记录'
  if (label === '记录' && entry.source.type === 'medical_file') return '医疗文件'
  if (label === '记录') return '待确认'
  return entry.source.label
}

export function SymptomRecordSheet({ entry, memberName, record, initialEditing = false, onClose, onDelete, onUpdate }: SymptomRecordSheetProps) {
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [content, setContent] = useState('')
  const [occurredAt, setOccurredAt] = useState('')
  const [measurementMethod, setMeasurementMethod] = useState<HealthMeasurementMethod>('unspecified')
  const [measurementDevice, setMeasurementDevice] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!entry) return
    setEditing(initialEditing)
    setConfirmingDelete(false)
    setContent(record?.content ?? symptomRecordTitle(entry))
    setOccurredAt(localDateTimeValue(new Date(record?.occurredAt ?? entry.time)))
    setMeasurementMethod(record?.measurementMethod ?? entry.source.measurementMethod ?? 'unspecified')
    setMeasurementDevice(record?.measurementDevice ?? entry.source.measurementDevice ?? '')
    setNote(record?.note ?? entry.source.note ?? '')
    setBusy(false)
    setError('')
  }, [entry, initialEditing, record])

  if (!entry) return null
  const title = symptomRecordTitle(entry)
  const isMeasurement = entry.source.type === 'measurement' || entry.kind === 'temperature'
  const canEdit = Boolean(record)

  const save = async () => {
    if (!record || busy) return
    if (!content.trim()) { setError('记录内容不能为空'); return }
    if (isFutureOccurredAt(occurredAt)) { setError('发生时间不能晚于现在'); return }
    setBusy(true)
    setError('')
    try {
      await onUpdate(record.id, {
        content: content.trim(),
        occurredAt: new Date(occurredAt).toISOString(),
        measurementMethod: isMeasurement ? measurementMethod : null,
        measurementDevice: isMeasurement ? measurementDevice.trim() || null : null,
        note: note.trim() || null
      })
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!record || busy) return
    setBusy(true)
    setError('')
    try {
      await onDelete(record.id)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '删除失败，请稍后重试')
      setConfirmingDelete(false)
    } finally {
      setBusy(false)
    }
  }

  const footer = editing
    ? <div className="symptom-record-editor-actions">
        <HohoButton disabled={busy} onClick={() => setConfirmingDelete(true)} variant="danger"><Trash2 size={17} />删除这条记录</HohoButton>
        <HohoButton disabled={busy} onClick={() => void save()}><Save size={17} />{busy ? '保存中…' : '保存'}</HohoButton>
      </div>
    : <HohoButton className="w-full" disabled={!canEdit} onClick={() => setEditing(true)}><Pencil size={17} />编辑症状记录</HohoButton>

  return (
    <BottomSheetSurface
      className="symptom-record-sheet"
      footer={footer}
      label={editing ? '编辑症状记录' : '症状记录详情'}
      onClose={onClose}
      open
      size={editing ? 'workspace' : 'default'}
      title={editing ? '编辑症状记录' : '症状记录详情'}
    >
      {editing ? (
        <div className="symptom-record-editor">
          <label><span>记录内容</span><textarea className="hoho-textarea" maxLength={1000} onChange={(event) => { setContent(event.target.value); setError('') }} value={content} /></label>
          <label><span>发生时间</span><input className="hoho-input" max={localDateTimeValue()} onChange={(event) => { setOccurredAt(event.target.value); setError('') }} type="datetime-local" value={occurredAt} /></label>
          <div className="symptom-record-readonly"><span>记录来源</span><strong>{entry.source.label}</strong></div>
          {isMeasurement && <>
            <label><span>测量设备</span><input className="hoho-input" onChange={(event) => setMeasurementDevice(event.target.value)} placeholder="未说明" value={measurementDevice} /></label>
            <label><span>测量方式</span><select className="hoho-input" onChange={(event) => setMeasurementMethod(event.target.value as HealthMeasurementMethod)} value={measurementMethod}>{measurementMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label>
          </>}
          <label><span>备注（可选）</span><textarea className="hoho-textarea symptom-record-note" maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="补充这条记录的说明" value={note} /></label>
          {confirmingDelete && <div className="symptom-record-delete-confirm" role="alertdialog" aria-label="删除这条症状记录？"><strong>删除这条症状记录？</strong><p>删除后将从当前症状跟踪中移除。</p><div><HohoButton disabled={busy} onClick={() => setConfirmingDelete(false)} variant="secondary">取消</HohoButton><HohoButton disabled={busy} onClick={() => void remove()} variant="danger">删除</HohoButton></div></div>}
          {error && <p className="symptom-record-error" role="alert">{error}</p>}
        </div>
      ) : (
        <div className="symptom-record-detail">
          <strong className="symptom-record-detail__title">{title}</strong>
          <section><h3>来源信息</h3><dl>
            <div><dt>来源类型</dt><dd>{entry.source.label}</dd></div>
            <div><dt>记录时间</dt><dd>{formatRecordDateTime(entry.time)}</dd></div>
            <div><dt>记录对象</dt><dd>{memberName}</dd></div>
            {isMeasurement && <div><dt>测量设备</dt><dd>{entry.source.measurementDevice || '未说明'}</dd></div>}
            {isMeasurement && <div><dt>测量方式</dt><dd>{measurementMethodLabel(entry.source.measurementMethod)}</dd></div>}
            {entry.source.fileName && <div><dt>来源文件</dt><dd>{entry.source.fileName}</dd></div>}
          </dl></section>
          <section><h3>原始记录</h3><p className="symptom-record-original">{entry.source.originalText || '未说明'}</p></section>
          {entry.source.note && <section><h3>备注</h3><p className="symptom-record-original">{entry.source.note}</p></section>}
        </div>
      )}
    </BottomSheetSurface>
  )
}

function measurementMethodLabel(value: HealthMeasurementMethod) {
  return measurementMethods.find((method) => method.value === value)?.label ?? '未说明'
}

function formatRecordDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date(value))
}
