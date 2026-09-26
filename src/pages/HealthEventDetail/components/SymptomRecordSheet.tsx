import { Pencil, Save, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BottomSheetSurface, HohoButton } from '../../../components/design-system'
import { ChildBodyLocationPicker } from '../../../components/health/body-location/ChildBodyLocationPicker'
import type { BodyLocationSelection } from '../../../features/body-location'
import type { HealthEventRecordApiDto, HealthMeasurementMethod, TimelineEntry, UpdateHealthEventRecordInput } from '../../../types'
import { isFutureOccurredAt, localDateTimeValue } from '../../../utils/healthOccurredAt'
import { extractSymptomNarrative, inferSymptomCategory, symptomLocationDisplay, visibleSymptomKeywords, fromSymptomLocations, toSymptomLocations } from '../../HealthEvents/symptomRecordLogic'
import { RelatedRecordsSheet, type SymptomLinkedRecordIds } from '../../HealthEvents/SymptomRecordFlow'
import { journalCategoryLabels, journalListSummary, type JournalEntry } from '../../HealthEvents/timeViewModel'
import type { JournalSymptomDetails } from '../../../types/journal'

interface SymptomRecordSheetProps {
  memberId: string
  refreshError?: string
  entry: TimelineEntry | null
  memberName: string
  record: HealthEventRecordApiDto | null
  initialEditing?: boolean
  onClose: () => void
  onDelete: (recordId: string) => Promise<void>
  onUpdate: (recordId: string, input: UpdateHealthEventRecordInput) => Promise<unknown>
  relatedEntries?: JournalEntry[]
  relatedLoading?: boolean
  relatedError?: string
  onRelatedRetry?: () => void
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

export function SymptomRecordSheet({ entry, memberId, memberName, record, refreshError, initialEditing = false, onClose, onDelete, onUpdate, relatedEntries = [], relatedLoading = false, relatedError = '', onRelatedRetry = () => undefined }: SymptomRecordSheetProps) {
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [confirmExit, setConfirmExit] = useState(false)
  const [temperature, setTemperature] = useState('')
  const [content, setContent] = useState('')
  const [occurredAt, setOccurredAt] = useState('')
  const [measurementMethod, setMeasurementMethod] = useState<HealthMeasurementMethod>('unspecified')
  const [measurementDevice, setMeasurementDevice] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [linkedRecordIds, setLinkedRecordIds] = useState<SymptomLinkedRecordIds>({})
  const [relatedOpen, setRelatedOpen] = useState(false)
  const [locationText, setLocationText] = useState('')
  const [locations, setLocations] = useState<BodyLocationSelection[]>([])
  const [locationError, setLocationError] = useState('')
  const [impactLevel, setImpactLevel] = useState<JournalSymptomDetails['impactLevel'] | ''>('')
  const [triggerText, setTriggerText] = useState('')
  const [trend, setTrend] = useState<JournalSymptomDetails['trend'] | ''>('')
  const [recurrent, setRecurrent] = useState(false)
  const [generatedSummary, setGeneratedSummary] = useState('')
  const [shortNote, setShortNote] = useState('')

  const initializeEditor = (nextEditing: boolean) => {
    if (!entry) return
    setEditing(nextEditing)
    setConfirmExit(false)
    setRelatedOpen(false)
    setConfirmingDelete(false)
    setContent(record?.journal?.symptom?.narrative ?? record?.content ?? symptomRecordTitle(entry))
    setOccurredAt(localDateTimeValue(new Date(record?.occurredAt ?? entry.time)))
    setMeasurementMethod(record?.measurementMethod ?? entry.source.measurementMethod ?? 'unspecified')
    setMeasurementDevice(record?.measurementDevice ?? entry.source.measurementDevice ?? '')
    setNote(record?.note ?? entry.source.note ?? '')
    setLinkedRecordIds(record?.journal?.symptom?.linkedRecordIds ?? {})
    setLocationText(record?.journal?.symptom?.locationText ?? '')
    setLocations(fromSymptomLocations(record?.journal?.symptom?.locations ?? []))
    setLocationError('')
    setImpactLevel(record?.journal?.symptom?.impactLevel ?? '')
    setTriggerText(record?.journal?.symptom?.triggerText ?? '')
    setTrend(record?.journal?.symptom?.trend === 'recurrent' ? '' : record?.journal?.symptom?.trend ?? '')
    setRecurrent(Boolean(record?.journal?.symptom?.recurrent || record?.journal?.symptom?.trend === 'recurrent'))
    setGeneratedSummary(record?.journal?.symptom?.generatedSummary ?? '')
    setShortNote(record?.journal?.symptom?.shortNote ?? '')
    setTemperature(String(record?.journal?.symptom?.symptomSpecificData?.currentTemperature ?? ''))
    setBusy(false)
    setError('')
  }
  // Same-record session refreshes preserve active edits; entering edit always reads the latest record.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { initializeEditor(initialEditing) }, [entry?.id, initialEditing, memberId, record?.id])

  if (!entry) return null
  const title = symptomRecordTitle(entry)
  const originalNarrative = record?.journal?.symptom?.narrative ?? entry.source.originalText ?? record?.content ?? title
  const detailKeywords = visibleSymptomKeywords(originalNarrative, record?.journal?.symptom?.keywords ?? [])
  const detailLocation = symptomLocationDisplay(record?.journal?.symptom)
  const hasStructuredTemperature = typeof record?.journal?.symptom?.symptomSpecificData?.currentTemperature === 'number'
  const isMeasurement = entry.source.type === 'measurement' || entry.kind === 'temperature' || hasStructuredTemperature
  const canEdit = Boolean(record)

  const save = async () => {
    if (!record || busy) return
    if (!content.trim()) { setError('记录内容不能为空'); return }
    if (hasStructuredTemperature && (!temperature.trim() || !Number.isFinite(Number(temperature)))) { setError('请填写有效的体温数值'); return }
    if (isFutureOccurredAt(occurredAt)) { setError('发生时间不能晚于现在'); return }
    setBusy(true)
    setError('')
    try {
      const extraction = extractSymptomNarrative(content)
      const symptom = record.journal?.symptom
      await onUpdate(record.id, {
        content: content.trim(),
        occurredAt: new Date(occurredAt).toISOString(),
        measurementMethod: isMeasurement ? measurementMethod : null,
        measurementDevice: isMeasurement ? measurementDevice.trim() || null : null,
        note: note.trim() || null,
        ...(symptom ? { journal: { ...record.journal, symptom: { ...symptom, locations: toSymptomLocations(locations), ...(hasStructuredTemperature ? { symptomSpecificData: { ...symptom.symptomSpecificData, currentTemperature: Number(temperature) } } : {}), narrative: content, keywords: extraction.keywords, symptomCategory: inferSymptomCategory(extraction.keywords), linkedRecordIds, ...(generatedSummary.trim() ? { generatedSummary: generatedSummary.trim() } : { generatedSummary: undefined }), ...(locationText.trim() ? { locationText: locationText.trim() } : { locationText: undefined }), ...(impactLevel ? { impactLevel } : { impactLevel: undefined }), ...(triggerText.trim() ? { triggerText: triggerText.trim() } : { triggerText: undefined }), ...(trend ? { trend } : { trend: undefined }), ...(recurrent ? { recurrent: true } : { recurrent: undefined }), ...(shortNote.trim() ? { shortNote: shortNote.trim() } : { shortNote: undefined }) }, occurredAt: new Date(occurredAt).toISOString(), timePrecision: 'exact' } } : {})
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

  const footer = confirmingDelete
    ? <div className="symptom-record-delete-confirm" role="alertdialog" aria-label="删除这条症状记录？"><strong>删除这条症状记录？</strong><p>删除后将从当前症状跟踪中移除。</p><div><HohoButton disabled={busy} onClick={() => setConfirmingDelete(false)} variant="secondary">取消</HohoButton><HohoButton disabled={busy} onClick={() => void remove()} variant="danger">删除</HohoButton></div></div>
    : editing
    ? <div className="symptom-record-editor-actions">
        <HohoButton disabled={busy} onClick={() => setConfirmingDelete(true)} variant="danger"><Trash2 size={17} />删除这条记录</HohoButton>
        <HohoButton disabled={busy} onClick={() => void save()}><Save size={17} />{busy ? '保存中…' : '保存'}</HohoButton>
      </div>
    : <div className="symptom-record-detail-actions">
        <HohoButton disabled={!canEdit || busy} onClick={() => setConfirmingDelete(true)} variant="danger"><Trash2 size={17} />删除这条记录</HohoButton>
        <HohoButton disabled={!canEdit || busy} onClick={() => initializeEditor(true)}><Pencil size={17} />编辑症状记录</HohoButton>
      </div>

  const originalSymptom = record?.journal?.symptom
  const dirty = editing && Boolean(record) && (
    content !== (originalSymptom?.narrative ?? record?.content ?? title)
    || occurredAt !== localDateTimeValue(new Date(record?.occurredAt ?? entry.time))
    || generatedSummary !== (originalSymptom?.generatedSummary ?? '')
    || locationText !== (originalSymptom?.locationText ?? '')
    || JSON.stringify(locations) !== JSON.stringify(fromSymptomLocations(originalSymptom?.locations ?? []))
    || impactLevel !== (originalSymptom?.impactLevel ?? '')
    || triggerText !== (originalSymptom?.triggerText ?? '')
    || trend !== (originalSymptom?.trend === 'recurrent' ? '' : originalSymptom?.trend ?? '')
    || recurrent !== Boolean(originalSymptom?.recurrent || originalSymptom?.trend === 'recurrent')
    || shortNote !== (originalSymptom?.shortNote ?? '')
    || JSON.stringify(linkedRecordIds) !== JSON.stringify(originalSymptom?.linkedRecordIds ?? {})
  )
  const detailDirty = dirty || (editing && (measurementMethod !== (record?.measurementMethod ?? entry.source.measurementMethod ?? 'unspecified') || measurementDevice !== (record?.measurementDevice ?? entry.source.measurementDevice ?? '') || note !== (record?.note ?? entry.source.note ?? '') || temperature !== String(record?.journal?.symptom?.symptomSpecificData?.currentTemperature ?? '')))
  const close = () => { if (busy) return; if (detailDirty) setConfirmExit(true); else onClose() }

  return (
    <BottomSheetSurface
      className="symptom-record-sheet"
      footer={footer}
      label={editing ? '编辑症状记录' : '症状记录详情'}
      onClose={close}
      open
      size={editing ? 'workspace' : 'default'}
      title={editing ? '编辑症状记录' : '症状记录详情'}
    >
      {refreshError && <p role="alert">{refreshError}</p>}
      {confirmExit && <div role="alert"><p>还有未保存的修改</p><HohoButton loading={busy} onClick={()=>void save()}>保存</HohoButton><HohoButton variant="secondary" onClick={onClose}>放弃修改</HohoButton><HohoButton variant="text" onClick={()=>setConfirmExit(false)}>继续编辑</HohoButton></div>}
      {editing ? (
        <div className="symptom-record-editor">
          <label><span>记录内容</span><textarea className="hoho-textarea" maxLength={1000} onChange={(event) => { setContent(event.target.value); setError('') }} value={content} /></label>
          {record?.journal?.symptom && <div className="symptom-record-editor-optional"><label><span>症状摘要（选填）</span><input className="hoho-input" maxLength={180} onChange={(event) => setGeneratedSummary(event.target.value)} value={generatedSummary} /></label><ChildBodyLocationPicker key={record.id} memberId={memberId} value={locations} onChange={setLocations} /><label><span>症状部位（选填）</span><input aria-describedby={locationError ? 'symptom-editor-location-error' : undefined} aria-invalid={Boolean(locationError)} className="hoho-input" maxLength={120} onChange={(event) => { setLocationText(event.target.value); setLocationError('') }} value={locationText} />{locationError && <small className="symptom-field-error" id="symptom-editor-location-error" role="alert">{locationError}</small>}</label><label><span>影响程度</span><small>观察吃饭、睡眠、活动或情绪；不确定可不填</small><select className="hoho-input" aria-label="影响程度" onChange={(event) => setImpactLevel(event.target.value as typeof impactLevel)} value={impactLevel}><option value="">未填写</option><option value="little">轻微影响</option><option value="some">有些影响</option><option value="clear">明显影响</option></select></label><label><span>触发或诱因</span><input className="hoho-input" maxLength={160} onChange={(event) => setTriggerText(event.target.value)} value={triggerText} /></label><label><span>变化趋势</span><select className="hoho-input" aria-label="变化趋势" onChange={(event) => setTrend(event.target.value as typeof trend)} value={trend}><option value="">未填写</option><option value="more_noticeable">加重了</option><option value="improving">减轻了</option><option value="same">没有明显变化</option></select></label><label className="symptom-recurrent"><input checked={recurrent} onChange={(event) => setRecurrent(event.target.checked)} type="checkbox" /><span>反复出现</span></label><label><span>症状备注</span><textarea className="hoho-textarea" maxLength={160} onChange={(event) => setShortNote(event.target.value)} value={shortNote} /></label></div>}
          {record?.journal?.symptom && <><button className="symptom-record-related-editor" onClick={() => setRelatedOpen(true)} type="button"><span>关联其他记录</span><strong>{Object.values(linkedRecordIds).reduce((sum, ids) => sum + (ids?.length ?? 0), 0) ? `已关联 ${Object.values(linkedRecordIds).reduce((sum, ids) => sum + (ids?.length ?? 0), 0)} 条` : '选填'}</strong></button><LinkedRecordDetails entries={relatedEntries} linked={linkedRecordIds} /></>}
          <label><span>发生时间</span><input className="hoho-input" max={localDateTimeValue()} onChange={(event) => { setOccurredAt(event.target.value); setError('') }} type="datetime-local" value={occurredAt} /></label>
          <div className="symptom-record-readonly"><span>记录来源</span><strong>{entry.source.label}</strong></div>
          {isMeasurement && <>
            {hasStructuredTemperature && <label><span>本次体温 ℃</span><input type="number" step="any" className="hoho-input" value={temperature} onChange={event=>setTemperature(event.target.value)}/></label>}
            <label><span>测量设备</span><input className="hoho-input" onChange={(event) => setMeasurementDevice(event.target.value)} placeholder="未说明" value={measurementDevice} /></label>
            <label><span>测量方式</span><select className="hoho-input" onChange={(event) => setMeasurementMethod(event.target.value as HealthMeasurementMethod)} value={measurementMethod}>{measurementMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label>
          </>}
          <label><span>备注（可选）</span><textarea className="hoho-textarea symptom-record-note" maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="补充这条记录的说明" value={note} /></label>
          {error && <p className="symptom-record-error" role="alert">{error}</p>}
          <RelatedRecordsSheet entries={relatedEntries} error={relatedError} linked={linkedRecordIds} loading={relatedLoading} onChange={setLinkedRecordIds} onClose={() => setRelatedOpen(false)} onRetry={onRelatedRetry} open={relatedOpen} />
        </div>
      ) : (
        <div className="symptom-record-detail">
          <section><h3>主要症状</h3><p className="symptom-record-original">{originalNarrative}</p>{detailKeywords.length > 0 && <div className="symptom-detail-tags">{detailKeywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div>}</section>
          {detailLocation && <section><h3>症状部位</h3><p className="symptom-record-original">{detailLocation}</p></section>}
          {record?.journal?.symptom && <SymptomOptionalDetails symptom={record.journal.symptom} />}
          {record?.journal?.symptom?.linkedRecordIds && <LinkedRecordDetails entries={relatedEntries} linked={record.journal.symptom.linkedRecordIds} />}
          <section><h3>记录信息</h3><dl><div><dt>发生时间</dt><dd>{formatRecordDateTime(record?.occurredAt ?? entry.time)}</dd></div>{record?.createdAt && <div><dt>创建时间</dt><dd>{formatRecordDateTime(record.createdAt)}</dd></div>}<div><dt>记录对象</dt><dd>{memberName}</dd></div></dl></section>
          <section><h3>来源信息</h3><dl><div><dt>来源类型</dt><dd>{entry.source.label}</dd></div>{isMeasurement && <div><dt>测量设备</dt><dd>{entry.source.measurementDevice || '未说明'}</dd></div>}{isMeasurement && <div><dt>测量方式</dt><dd>{measurementMethodLabel(entry.source.measurementMethod)}</dd></div>}{entry.source.fileName && <div><dt>来源文件</dt><dd>{entry.source.fileName}</dd></div>}</dl></section>
          {entry.source.note && <section><h3>备注</h3><p className="symptom-record-original">{entry.source.note}</p></section>}
          {error && <p className="symptom-record-error" role="alert">{error}</p>}
        </div>
      )}
    </BottomSheetSurface>
  )
}

function SymptomOptionalDetails({ symptom }: { symptom: NonNullable<NonNullable<HealthEventRecordApiDto['journal']>['symptom']> }) {
  const severity = { little: '轻微影响', some: '有些影响', clear: '明显影响' } as const
  const trend = { same: '没有明显变化', more_noticeable: '加重了', improving: '减轻了', returned: '消失后又出现', recurrent: '反复出现', unclear: '暂时不明确' } as const
  const recurrent = Boolean(symptom.recurrent || symptom.trend === 'recurrent')
  const rows = [symptom.impactLevel && ['影响程度', severity[symptom.impactLevel]], symptom.triggerText && ['触发或诱因', symptom.triggerText], symptom.trend && symptom.trend !== 'recurrent' && ['变化趋势', trend[symptom.trend]], recurrent && ['反复出现', '是'], symptom.shortNote && ['补充备注', symptom.shortNote]].filter(Boolean) as string[][]
  return rows.length ? <section><h3>补充症状信息</h3><dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section> : null
}

function LinkedRecordDetails({ entries, linked }: { entries: JournalEntry[]; linked: SymptomLinkedRecordIds }) {
  const ids = new Set(Object.values(linked).flat())
  const selected = entries.filter((entry) => ids.has(entry.id))
  return selected.length ? <section><h3>已关联记录</h3><div className="symptom-detail-related">{selected.map((entry) => <div key={entry.id}><strong>{journalCategoryLabels[entry.categories?.[0] ?? 'other']}</strong><span>{formatRecordDateTime(entry.occurredAt)}</span><p>{journalListSummary(entry)}</p></div>)}</div></section> : null
}

function measurementMethodLabel(value: HealthMeasurementMethod) {
  return measurementMethods.find((method) => method.value === value)?.label ?? '未说明'
}

function formatRecordDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date(value))
}
