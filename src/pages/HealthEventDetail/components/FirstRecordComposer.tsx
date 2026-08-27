import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Mic, Paperclip, X } from 'lucide-react'
import { BodyLocationPicker } from '../../../components/health'
import { bodyLocationSelectionLabels, type BodyLocationSelection } from '../../../features/body-location'
import type { CreateEventAttachmentInput, CreateHealthEventRecordInput } from '../../../types'
import { clampOccurredAtToNow, FUTURE_OCCURRED_AT_MESSAGE, isFutureOccurredAt, localDateTimeValue } from '../../../utils/healthOccurredAt'
import { appendQuickRecordTranscript } from './quickRecordPresentation'
import { QuickVoiceRecordFlow } from './QuickVoiceRecordFlow'

interface FirstRecordComposerProps {
  onAvailabilityChange?: (available: boolean, saving: boolean) => void
  onRecorded?: (message?: string) => void
  onSave: (input: CreateHealthEventRecordInput) => Promise<string | void>
}

export interface FirstRecordComposerHandle {
  submit: () => void
}

interface LabeledAttachment extends CreateEventAttachmentInput {
  label: string
  originalName: string
}

function inferImageLabel(name: string, selectedLocations: string[]) {
  if (/药|药盒|药瓶/.test(name)) return '药物'
  if (/检查|化验|报告|血常规/.test(name)) return '检查单'
  if (/皮肤|红疹|皮疹/.test(name)) return '皮肤'
  return selectedLocations[0] || '图片'
}

export const FirstRecordComposer = forwardRef<FirstRecordComposerHandle, FirstRecordComposerProps>(function FirstRecordComposer({ onAvailabilityChange, onRecorded, onSave }, ref) {
  const [text, setText] = useState('')
  const [occurredAt, setOccurredAt] = useState(localDateTimeValue)
  const [selectedLocations, setSelectedLocations] = useState<BodyLocationSelection[]>([])
  const [attachments, setAttachments] = useState<LabeledAttachment[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [voiceOpen, setVoiceOpen] = useState(false)
  const savingRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textAreaRef = useRef<HTMLTextAreaElement>(null)
  const hasContent = Boolean(text.trim() || attachments.length || selectedLocations.length)
  const canSave = hasContent && Boolean(occurredAt) && !isFutureOccurredAt(occurredAt) && !saving

  useEffect(() => { onAvailabilityChange?.(canSave, saving) }, [canSave, onAvailabilityChange, saving])

  const selectImages = async (files: FileList | null) => {
    if (!files?.length) return
    setError('')
    try {
      const selected = await Promise.all([...files].map(async (file) => {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('仅支持 JPG、PNG 或 WebP 图片')
        if (file.size > 5 * 1024 * 1024) throw new Error('单张图片不能超过 5MB')
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => reject(new Error('附件读取失败'))
          reader.readAsDataURL(file)
        })
        return { name: file.name, originalName: file.name, mimeType: file.type, dataUrl, label: inferImageLabel(file.name, bodyLocationSelectionLabels(selectedLocations)) }
      }))
      setAttachments((current) => [...current, ...selected].slice(0, 8))
    } catch (selectError) {
      setError(selectError instanceof Error ? selectError.message : '附件读取失败，请重试')
    }
  }

  const save = async () => {
    if (savingRef.current) return
    const rawInput = text.trim()
    if (!rawInput && !attachments.length && !selectedLocations.length) {
      setError('请先描述发生了什么、选择身体部位或添加相关附件')
      return
    }
    if (isFutureOccurredAt(occurredAt)) {
      setOccurredAt(localDateTimeValue())
      setError(FUTURE_OCCURRED_AT_MESSAGE)
      return
    }
    savingRef.current = true
    setSaving(true)
    setError('')
    try {
      const message = await onSave({
        type: 'symptom',
        content: rawInput,
        occurredAt: new Date(occurredAt).toISOString(),
        bodyLocations: bodyLocationSelectionLabels(selectedLocations),
        attachments: attachments.map(({ label, originalName, ...attachment }) => ({ ...attachment, name: `[${label}] ${originalName}` }))
      })
      onRecorded?.(typeof message === 'string' ? message : undefined)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存失败，请稍后重试')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  useImperativeHandle(ref, () => ({ submit: () => { void save() } }))

  return (
    <section aria-label="记录情况表单" className="first-record-composer">
      <div className="first-record-fields">
        <label className="first-record-field">
          <span className="hoho-text-label">最早开始时间</span>
          <span className="first-record-datetime">
            <input className="hoho-input" max={localDateTimeValue()} onChange={(event) => {
              const nextValue = clampOccurredAtToNow(event.target.value)
              setOccurredAt(nextValue)
              setError(nextValue === event.target.value ? '' : FUTURE_OCCURRED_AT_MESSAGE)
            }} type="datetime-local" value={occurredAt} />
          </span>
        </label>

        <div className="first-record-field"><BodyLocationPicker buttonLabel="身体部位选择器" compact label="身体部位（选填）" onChange={setSelectedLocations} value={selectedLocations} /></div>

        <label className="first-record-field">
          <span className="hoho-text-label">描述情况</span>
          <span className="relative overflow-hidden">
            <textarea aria-label="描述健康情况" className="hoho-textarea first-record-description resize-none pb-8" maxLength={1000} onChange={(event) => { setText(event.target.value); setError('') }} placeholder="请描述发生了什么…" ref={textAreaRef} value={text} />
            <span className="absolute bottom-2 right-3 text-[11px] text-text-secondary">{text.length}/1000</span>
          </span>
        </label>

        <div className="first-record-field min-w-0">
          <div className="flex min-w-0 items-baseline justify-between gap-2"><p className="hoho-text-label shrink-0">添加附件（选填）</p><p className="truncate text-[11px] text-text-weak">检查报告、处方、药品或身体部位照片</p></div>
          <input accept="image/jpeg,image/png,image/webp" className="hidden" multiple onChange={(event) => { void selectImages(event.target.files); event.target.value = '' }} ref={fileInputRef} type="file" />
          <div className="mt-2 flex min-w-0 items-center gap-2 overflow-hidden">
            <button className="inline-flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-control border border-dashed border-primary/35 bg-surface px-3 text-sm font-medium text-primary" onClick={() => fileInputRef.current?.click()} type="button"><Paperclip size={17} />添加附件</button>
            {attachments.length > 0 && <div className="first-record-attachments">{attachments.map((attachment, index) => (
              <figure className="relative h-12 w-12 shrink-0 overflow-hidden rounded-control bg-primary-soft" key={`${attachment.originalName}-${index}`}>
                <img alt={attachment.originalName} className="h-full w-full object-cover" src={attachment.dataUrl} />
                <button aria-label={`删除附件 ${attachment.originalName}`} className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-text-primary/75 text-surface" onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))} type="button"><X size={12} /></button>
              </figure>
            ))}</div>}
          </div>
        </div>
      </div>

      {error && <div className="first-record-error" role="alert"><p>{error}</p><button onClick={() => { setError(''); textAreaRef.current?.focus() }} type="button">重新编辑</button></div>}
      {!voiceOpen && <button className="quick-record-trigger first-record-quick-trigger" onClick={() => setVoiceOpen(true)} type="button"><Mic size={18} />快捷记录</button>}
      <QuickVoiceRecordFlow onClose={() => setVoiceOpen(false)} onConfirm={async (transcript) => { setText((current) => appendQuickRecordTranscript(current, transcript)); setError(''); return '已加入描述' }} open={voiceOpen} />
    </section>
  )
})
