import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { normalizeHealthEventTitle } from '../../services/healthEventFacts'
import { quickRecordService, type QuickRecordCreateInput, type QuickRecordDuplicate } from '../../services/quickRecords'
import { BottomSheetSurface, HohoButton, HohoInput } from '../../components/design-system'
import { OccurrenceTimeField, useOccurrenceTime } from '../HealthEvents/OccurrenceTimeField'
import { journalCategoryLabels } from '../HealthEvents/timeViewModel'
import { calendarCategories } from './model'
import { DuplicateRecordPrompt } from '../HealthEvents/DuplicateRecordPrompt'
import type { JournalCategory, JournalMetadata } from '../../types/journal'
import type { DailyExtras } from '../../services/dailyRecords'
import type { QuickRecordInputChannel } from '../HealthEventDetail/components'
import type { QuickRecordPhotoPayload } from '../HealthEventDetail/components/QuickRecordPhotos'
import '../HealthEvents/RecordForm.css'

interface PendingDuplicate { duplicate: QuickRecordDuplicate; input: QuickRecordCreateInput; resolve: (message: string) => void; reject: (reason: unknown) => void }

// Use the standard record API and time field for simple calendar notes.
export function CalendarRecorder({ memberId, token, day, today, initialCategory, onClose, onRecorded }: { memberId: string; token: string; day: string; today: string; initialCategory?: JournalCategory; onClose: () => void; onRecorded: (at: string) => void }) {
  const submissionKey = useRef('')
  const [content, setContent] = useState(''), [category, setCategory] = useState<JournalCategory>(initialCategory ?? 'other')
  const [saving, setSaving] = useState(false), [error, setError] = useState('')
  const occurrence = useOccurrenceTime(day, today)
  const [pending, setPending] = useState<PendingDuplicate | null>(null)
  const pendingRef = useRef(pending); pendingRef.current = pending
  useEffect(() => () => { pendingRef.current?.reject(new Error('记录已关闭')) }, [])
  const assertSubject = () => {
    const state = useAppStore.getState()
    if (!token || state.currentMemberId !== memberId || state.authToken !== token) throw new Error('记录对象已切换，请重新打开记录')
  }
  const finish = (at: string) => { submissionKey.current = ''; onRecorded(at) }
  const save = async (content: string, occurredAt: string, inputChannel: QuickRecordInputChannel, photos: QuickRecordPhotoPayload, journal: JournalMetadata, daily?: DailyExtras) => {
    assertSubject()
    if (!submissionKey.current) submissionKey.current = crypto.randomUUID().replaceAll('-', '')
    const input: QuickRecordCreateInput = { memberId, content, occurredAt, inputChannel, title: normalizeHealthEventTitle('', content), idempotencyKey: submissionKey.current, journal, ...daily, ...(photos.photoIds.length ? { photoDraftId: photos.draftId, photoIds: photos.photoIds } : {}) }
    const { duplicate } = journal.sleep?.status === 'ongoing' || journal.diet?.status === 'ongoing' ? { duplicate: null } : await quickRecordService.checkDuplicate(input, token)
    assertSubject()
    if (duplicate) return new Promise<string>((resolve, reject) => setPending({ duplicate, input, resolve, reject }))
    await quickRecordService.create(input, token)
    finish(occurredAt); return '已记录'
  }
  const resolveDuplicate = async (action: 'update' | 'create', changeSummary?: string) => {
    if (!pending) return
    const current = pending; setPending(null)
    try {
      assertSubject()
      await quickRecordService.create({ ...current.input, rawText: current.input.content, content: action === 'update' && changeSummary ? changeSummary : current.input.content, duplicateAction: action, duplicateEventId: current.duplicate.eventId }, token)
      finish(current.input.occurredAt); current.resolve('已记录')
    } catch (error) { current.reject(error) }
  }
  const discardDuplicate = () => { if (!pending) return; pending.resolve('已保留原来的记录'); setPending(null); submissionKey.current = '' }
  const submit = async () => {
    if (saving || !content.trim()) return
    const at = occurrence.capture()
    if (!at) return
    setSaving(true); setError('')
    try {
      await save(content.trim(), at, 'text', { draftId: '', photoIds: [] }, { categories: [category], timePrecision: 'exact' })
      onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，请重试') }
    finally { setSaving(false) }
  }
  return <><BottomSheetSurface open title="新增记录" label="新增记录" onClose={() => { if (!saving) onClose() }} footer={<HohoButton fullWidth disabled={saving || !content.trim()} loading={saving} onClick={() => void submit()}>保存记录</HohoButton>}>
    <div className="health-calendar__new-record"><HohoInput label="记录内容" placeholder="例如：上午皮肤发痒" maxLength={500} value={content} disabled={saving} onChange={e => setContent(e.target.value)}/>
      <label className="hoho-field"><span className="hoho-text-label">记录类型</span><select className="hoho-input" aria-label="记录类型" value={category} disabled={saving} onChange={e => setCategory(e.target.value as JournalCategory)}>{calendarCategories.map(c => <option key={c} value={c}>{c === 'care' ? '身体涂抹' : c === 'diet' ? '喂养 / 饮食' : journalCategoryLabels[c]}</option>)}</select></label>
      <OccurrenceTimeField model={occurrence}/>{error && <p className="hoho-field__message" role="alert" data-error="true">{error}</p>}
    </div>
  </BottomSheetSurface>{pending && <DuplicateRecordPrompt duplicate={pending.duplicate} onCancel={discardDuplicate} onDiscard={discardDuplicate} onUpdate={summary => resolveDuplicate('update', summary)} onCreate={() => resolveDuplicate('create')}/>}</>
}
