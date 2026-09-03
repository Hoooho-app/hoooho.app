import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ImagePlus, Info, Mic, Paperclip, Sparkles, X } from 'lucide-react'
import { Button, Card } from '../../../components/common'
import { BodyLocationPicker } from '../../../components/health'
import { bodyLocationSelectionLabels, type BodyLocationSelection } from '../../../features/body-location'
import { prepareHealthImage } from '../../../features/health-attachments/prepareHealthImage'
import { usePageScrollLock } from '../../../hooks/usePageScrollLock'
import { useDialogFocus } from '../../../hooks/useDialogFocus'
import type { CreateEventAttachmentInput, HealthEventRecordType } from '../../../types'
import { clampOccurredAtToNow, FUTURE_OCCURRED_AT_MESSAGE, isFutureOccurredAt, localDateTimeValue } from '../../../utils/healthOccurredAt'

export type HealthRecordTemplateType =
  | 'symptom'
  | 'timeline'
  | 'temperature'
  | 'attachment'
  | 'concern'
  | 'sleep'
  | 'feeding'
  | 'growth'
  | 'exercise'
  | 'female-health'
  | 'lifestyle'
  | 'emotion'
  | 'medication-change'
  | 'mobility'
  | 'blood-glucose'

interface EditorTemplate {
  title: string
  guidance: string
  example: string
  placeholder: string
  previewLabels: string[]
}

const templates: Record<HealthRecordTemplateType, EditorTemplate> = {
  symptom: {
    title: '记录症状',
    guidance: '描述这次不舒服，包括开始时间、主要症状、严重程度、伴随症状、处理措施和当前状态。',
    example: '昨天晚上开始喉咙疼，今天出现低烧37.8℃，有轻微咳嗽，已经服用感冒药。',
    placeholder: '请描述这次不舒服……',
    previewLabels: ['发生时间', '主要症状', '严重程度', '伴随症状', '处理措施', '当前状态']
  },
  timeline: {
    title: '新增健康情况',
    guidance: '按时间顺序描述事情发生的过程，包括症状变化、体温变化、用药或就医等重要节点。',
    example: '7月20日20:00开始发热，22:00体温38.5℃并服用退烧药，第二天08:00体温37.2℃。',
    placeholder: '请按时间顺序描述这段健康情况……',
    previewLabels: ['第一个节点', '第二个节点', '第三个节点']
  },
  temperature: {
    title: '记录体温变化',
    guidance: '描述体温变化情况，包括测量时间和具体体温数值。',
    example: '7月20日20:00 38.5℃，7月21日08:00 37.8℃，20:00 37.2℃。',
    placeholder: '请描述体温变化情况……',
    previewLabels: ['测量记录', '最高体温', '变化趋势']
  },
  attachment: {
    title: '添加附件',
    guidance: '上传与这条健康随记相关的图片，例如检查报告、化验单、药品包装或医生记录。',
    example: '当前仅支持 JPG、PNG 等图片格式，暂不支持 PDF。',
    placeholder: '可以补充说明图片内容……',
    previewLabels: ['图片数量', '图片内容', '识别状态']
  },
  concern: {
    title: '记录担心的问题',
    guidance: '描述你目前最担心的问题或顾虑，我们会帮你整理并在摘要中重点关注。',
    example: '担心是不是肺炎，需要不需要马上去医院，夜间咳嗽比较严重。',
    placeholder: '请描述你的担心……',
    previewLabels: ['主要担心', '关注重点', '希望了解']
  },
  sleep: { title: '记录睡眠情况', guidance: '描述入睡时间、夜间醒来、睡眠时长和醒来后的状态。', example: '晚上11点入睡，夜间醒来2次，睡眠约7小时。', placeholder: '请描述睡眠情况……', previewLabels: ['入睡时间', '夜间醒来', '睡眠时长', '睡眠质量'] },
  feeding: { title: '记录喂养情况', guidance: '描述饮食或喂养类型、摄入量、食欲和特殊情况。', example: '今天辅食正常，奶量约600ml，食欲比平时稍差。', placeholder: '请描述喂养情况……', previewLabels: ['饮食类型', '摄入情况', '食欲状况', '特殊情况'] },
  growth: { title: '记录成长变化', guidance: '描述近期身高、体重和生长变化。', example: '本月身高增加1cm，体重保持稳定。', placeholder: '请描述成长变化……', previewLabels: ['身高变化', '体重变化', '整体趋势'] },
  exercise: { title: '记录运动情况', guidance: '描述近期运动类型、频率、时长和身体反应。', example: '每周快走3次，每次30分钟，运动后没有不适。', placeholder: '请描述运动情况……', previewLabels: ['运动类型', '运动频率', '单次时长', '身体反应'] },
  'female-health': { title: '记录女性健康', guidance: '描述与这条健康随记相关的女性健康情况，内容仅用于本次记录。', example: '可以描述周期变化、经期异常或其他相关情况。', placeholder: '请描述相关情况……', previewLabels: ['当前情况', '发生时间', '伴随变化'] },
  lifestyle: { title: '记录生活方式', guidance: '描述近期饮酒、吸烟、作息等生活方式变化。', example: '最近一周睡眠较晚，没有饮酒，运动次数减少。', placeholder: '请描述生活方式变化……', previewLabels: ['作息', '饮酒', '吸烟', '其他变化'] },
  emotion: { title: '记录情绪状态', guidance: '描述近期情绪、压力和日常状态变化。', example: '最近两天情绪有些低落，学习压力较大，睡眠一般。', placeholder: '请描述情绪变化……', previewLabels: ['主要情绪', '持续时间', '可能原因', '日常影响'] },
  'medication-change': { title: '记录用药变化', guidance: '描述近期药品、剂量、服用时间和变化。', example: '今天早上开始服用新药，每次一片，暂时没有不适。', placeholder: '请描述用药变化……', previewLabels: ['药品', '剂量', '服用时间', '变化或反应'] },
  mobility: { title: '记录活动情况', guidance: '描述近期活动能力、步行、跌倒或日常行动变化。', example: '今天步行比平时慢，活动后容易疲劳，没有跌倒。', placeholder: '请描述活动情况……', previewLabels: ['活动能力', '行走变化', '跌倒情况', '身体反应'] },
  'blood-glucose': { title: '记录血糖变化', guidance: '描述血糖测量时间、数值、饮食和用药变化。', example: '早餐后2小时血糖8.6，早餐正常，按时服药。', placeholder: '请描述血糖变化……', previewLabels: ['测量时间', '血糖数值', '饮食变化', '用药情况'] }
}

export interface HealthRecordEditorResult {
  templateType: HealthRecordTemplateType
  recordType: SelectableRecordType
  originalText: string
  occurredAt: string
  structuredFields: Array<{ label: string; value: string }>
  attachments: CreateEventAttachmentInput[]
  bodyLocations?: string[]
}

export type SelectableRecordType = Exclude<HealthEventRecordType, 'other'>

const recordTypeOptions: Array<{ value: SelectableRecordType; label: string }> = [
  { value: 'symptom', label: '症状' },
  { value: 'medication', label: '用药' },
  { value: 'visit', label: '就诊' },
  { value: 'examination', label: '检查' },
  { value: 'note', label: '备注' }
]

const recordTypeLabels = new Map(recordTypeOptions.map((option) => [option.value, option.label]))

interface HealthRecordEditorModalProps {
  open: boolean
  templateType: HealthRecordTemplateType
  defaultRecordType?: SelectableRecordType
  lockRecordType?: boolean
  titleOverride?: string
  initialValue?: string
  minOccurredAt?: string
  onClose: () => void
  onSave?: (result: HealthRecordEditorResult) => void | Promise<void>
}

function inferImageLabel(name: string, selectedLocations: string[]) {
  if (/药|药盒|药瓶/.test(name)) return '药物'
  if (/检查|化验|报告|血常规/.test(name)) return '检查单'
  if (/皮肤|红疹|皮疹/.test(name)) return '皮肤'
  return selectedLocations[0] || '图片'
}

function formatConstraintTime(value?: string) {
  if (!value) return ''
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

export function HealthRecordEditorModal({ open, templateType, defaultRecordType = 'note', lockRecordType = false, titleOverride, initialValue = '', minOccurredAt, onClose, onSave }: HealthRecordEditorModalProps) {
  const template = templates[templateType]
  const [text, setText] = useState(initialValue)
  const [recordType, setRecordType] = useState<SelectableRecordType>(defaultRecordType)
  const [occurredAt, setOccurredAt] = useState(localDateTimeValue)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [attachments, setAttachments] = useState<CreateEventAttachmentInput[]>([])
  const [selectedLocations, setSelectedLocations] = useState<BodyLocationSelection[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textAreaRef = useRef<HTMLTextAreaElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  usePageScrollLock(open)
  useDialogFocus(open, dialogRef)

  useEffect(() => {
    if (!open || isSaving) return
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [isSaving, onClose, open])

  useEffect(() => {
    if (!open) return
    setText(initialValue)
    setRecordType(defaultRecordType)
    const minimumTime = minOccurredAt ? new Date(minOccurredAt).getTime() : 0
    setOccurredAt(localDateTimeValue(new Date(Math.max(Date.now(), minimumTime))))
    setIsSaving(false)
    setSaveError('')
    setAttachments([])
    setSelectedLocations([])
  }, [defaultRecordType, open, templateType, initialValue, minOccurredAt])

  const preview = useMemo(() => [
    { label: '记录类型', value: recordTypeLabels.get(recordType) ?? '备注' },
    { label: '发生时间', value: new Date(occurredAt).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }) },
    { label: '记录内容', value: text.trim() }
  ], [occurredAt, recordType, text])
  const isBeforeFirstRecord = Boolean(minOccurredAt && new Date(occurredAt).getTime() < new Date(minOccurredAt).getTime())
  const isFutureTime = isFutureOccurredAt(occurredAt)
  const canSave = Boolean((text.trim() || attachments.length || selectedLocations.length) && occurredAt && !isBeforeFirstRecord && !isFutureTime)

  const changeOccurredAt = (value: string) => {
    const nextValue = clampOccurredAtToNow(value)
    setOccurredAt(nextValue)
    setSaveError(nextValue === value ? '' : FUTURE_OCCURRED_AT_MESSAGE)
  }

  const selectImages = async (files: FileList | null) => {
    if (!files?.length) return
    setSaveError('')
    try {
      const selected = await Promise.all([...files].map(async (file) => {
        const prepared = await prepareHealthImage(file)
        const label = inferImageLabel(file.name, bodyLocationSelectionLabels(selectedLocations))
        return { ...prepared, name: `[${label}] ${prepared.name}` }
      }))
      setAttachments((current) => [...current, ...selected].slice(0, 8))
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '图片读取失败')
    }
  }

  const save = async () => {
    setSaveError('')
    if (isFutureOccurredAt(occurredAt)) {
      setOccurredAt(localDateTimeValue())
      setSaveError(FUTURE_OCCURRED_AT_MESSAGE)
      return
    }
    if (isBeforeFirstRecord) {
      setSaveError('该时间早于本次健康情况开始时间，无法作为新增情况记录。')
      return
    }
    setIsSaving(true)
    try {
      if (!onSave) return
      await onSave({ templateType, recordType, originalText: text.trim(), occurredAt: new Date(occurredAt).toISOString(), structuredFields: preview, attachments, bodyLocations: bodyLocationSelectionLabels(selectedLocations) })
      onClose()
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '保存失败，请稍后重试')
    } finally {
      setIsSaving(false)
    }
  }

  if (!open) return null

  if (templateType === 'timeline') {
    return (
      <div className="fixed inset-0 z-50 flex touch-none items-end justify-center overscroll-none bg-black/35 px-6 pb-[max(16px,env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))]" role="presentation">
        <section aria-label="新增健康情况" aria-modal="true" className="hoho-modal-surface flex touch-auto flex-col" ref={dialogRef} role="dialog" tabIndex={-1}>
          <header className="grid min-h-16 grid-cols-[2.75rem_1fr_2.75rem] items-center px-3">
            <button aria-label="关闭" className="grid h-11 w-11 place-items-center rounded-full hover:bg-primary-soft" onClick={onClose} type="button"><X size={21} /></button>
            <h2 className="text-center text-base font-semibold text-heading">新增健康情况</h2>
            <span aria-hidden="true" />
          </header>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 pb-4">
            <div>
              <label className="mb-2 block text-xs font-semibold text-heading" htmlFor="continuation-occurred-at">发生时间</label>
              <span className="relative block">
                <input
                  className="hoho-input pr-10"
                  id="continuation-occurred-at"
                  max={localDateTimeValue()}
                  min={minOccurredAt ? localDateTimeValue(new Date(minOccurredAt)) : undefined}
                  onChange={(event) => changeOccurredAt(event.target.value)}
                  type="datetime-local"
                  value={occurredAt}
                />
                <CalendarDays className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary" size={18} />
              </span>
              {minOccurredAt && (
                <div className="mt-2 flex items-start gap-2 rounded-control bg-background px-3 py-2 text-[11px] leading-4 text-text-secondary">
                  <Info className="mt-0.5 shrink-0 text-primary" size={13} />
                  <span>时间不可早于这条健康随记的首次记录时间：<br />{formatConstraintTime(minOccurredAt)}</span>
                </div>
              )}
            </div>

            <BodyLocationPicker label="身体部位" onChange={setSelectedLocations} value={selectedLocations} />

            <div>
              <label className="mb-2 block text-xs font-semibold text-heading" htmlFor="continuation-description">描述情况</label>
              <div className="relative">
                <textarea
                  className="hoho-textarea h-40 resize-none pb-8"
                  id="continuation-description"
                  maxLength={1000}
                  onChange={(event) => { setText(event.target.value); setSaveError('') }}
                  placeholder={'请直接描述发生了什么，例如：\n8月10日22:05体温38.8℃，比之前更高，头有些痛，已服用退烧药。'}
                  ref={textAreaRef}
                  value={text}
                />
                <span className="absolute bottom-2 right-3 text-[11px] text-text-secondary">{text.length}/1000</span>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-heading">添加图片</p>
              <input accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" className="hidden" multiple onChange={(event) => { void selectImages(event.target.files); event.target.value = '' }} ref={fileInputRef} type="file" />
              <button className="inline-flex min-h-11 items-center gap-2 rounded-control border border-primary/25 px-3 text-sm font-medium text-primary" onClick={() => fileInputRef.current?.click()} type="button"><ImagePlus size={17} />添加图片</button>
              {attachments.length > 0 && (
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {attachments.map((attachment, index) => (
                    <figure className="relative aspect-square overflow-hidden rounded-lg bg-primary-soft" key={`${attachment.name}-${index}`}>
                      <img alt={attachment.name} className="h-full w-full object-cover" src={attachment.dataUrl} />
                      <figcaption className="absolute bottom-1 left-1 max-w-[calc(100%-8px)] truncate rounded-pill bg-surface/90 px-1.5 py-0.5 text-[10px] font-medium text-primary">{attachment.name.match(/^\[([^\]]+)\]/)?.[1] ?? '图片'}</figcaption>
                      <button aria-label={`删除图片 ${attachment.name}`} className="absolute -right-2 -top-2 grid h-11 w-11 place-items-center rounded-full text-surface [background:radial-gradient(circle,rgb(var(--hoho-color-text-primary)/.78)_0_26%,transparent_28%)]" onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))} type="button"><X size={12} /></button>
                    </figure>
                  ))}
                </div>
              )}
            </div>

            {saveError && <p className="rounded-control bg-warning/10 px-3 py-2 text-xs leading-5 text-danger" role="alert">{saveError}</p>}
          </div>

          <footer className="shrink-0 px-4 pb-4 pt-2">
            <Button disabled={!canSave || isSaving} fullWidth onClick={() => void save()}><Sparkles size={17} />{isSaving ? '正在整理…' : '保存，自动整理'}</Button>
          </footer>
        </section>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex touch-none items-end justify-center overscroll-none bg-black/35 px-6 pb-[max(16px,env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))]"
      role="presentation"
    >
      <section
        aria-label={titleOverride || template.title}
        aria-modal="true"
        className="hoho-modal-surface flex max-h-[80dvh] touch-auto flex-col rounded-t-[var(--hoho-radius-large)] bg-background"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="grid min-h-16 grid-cols-[2.75rem_1fr_2.75rem] items-center border-b bg-surface px-3">
          <button aria-label="关闭" className="grid h-11 w-11 place-items-center rounded-full hover:bg-primary-soft" onClick={onClose} type="button"><X size={21} /></button>
          <h2 className="text-center text-base font-semibold">{titleOverride || template.title}</h2>
          <span aria-hidden="true" />
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
          <Card className="border-primary/20 bg-primary-soft/55 shadow-none">
            <div className="flex gap-2"><Sparkles className="mt-0.5 shrink-0 text-primary" size={17} /><div><h3 className="text-sm font-semibold">怎么写？</h3><p className="mt-1 text-xs leading-5 text-text-secondary">{template.guidance}</p></div></div>
          </Card>

          {onSave && (
            <div className="space-y-3">
              {!lockRecordType && <div>
                <p className="mb-2 text-xs font-medium text-text-secondary">记录类型</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {recordTypeOptions.map((option) => (
                    <button
                      className={`min-h-11 rounded-control px-2 text-xs font-medium transition ${recordType === option.value ? 'bg-primary text-surface' : 'bg-primary-soft text-text-secondary'}`}
                      key={option.value}
                      onClick={() => setRecordType(option.value)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>}
              <label className="block space-y-2">
                <span className="text-xs font-medium text-text-secondary">发生时间</span>
                <input
                  className="hoho-input"
                  max={localDateTimeValue()}
                  onChange={(event) => changeOccurredAt(event.target.value)}
                  type="datetime-local"
                  value={occurredAt}
                />
              </label>
            </div>
          )}

          <Card className="p-0">
            <textarea
              className="h-40 w-full resize-none rounded-t-card bg-transparent p-4 text-sm leading-6 outline-none placeholder:text-text-secondary/65"
              maxLength={1000}
              onChange={(event) => setText(event.target.value)}
              placeholder={`${template.placeholder}\n\n例如：${template.example}`}
              ref={textAreaRef}
              value={text}
            />
            <div className="flex items-center justify-between border-t px-3 py-2">
              <span className="text-[11px] text-text-secondary">{text.length}/1000</span>
              <div className="flex gap-2">
                <button className="flex min-h-11 cursor-not-allowed items-center gap-1.5 rounded-control px-3 text-xs text-text-secondary opacity-70" disabled title="语音功能准备中" type="button"><Mic size={15} />语音准备中</button>
                <input accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" className="hidden" multiple onChange={(event) => void selectImages(event.target.files)} ref={fileInputRef} type="file" />
                <button className="flex min-h-11 items-center gap-1.5 rounded-control px-3 text-xs text-text-secondary" onClick={() => fileInputRef.current?.click()} type="button"><Paperclip size={15} />添加图片{attachments.length ? ` (${attachments.length})` : ''}</button>
              </div>
            </div>
          </Card>

        </div>

        <footer className="shrink-0 border-t bg-surface p-4">
          {saveError && (
            <div className="mb-3 text-center">
              <p className="text-xs leading-5 text-red-600">{saveError}</p>
              <button
                className="mt-2 text-sm font-semibold text-primary"
                onClick={() => {
                  setSaveError('')
                  textAreaRef.current?.focus()
                }}
                type="button"
              >
                重新编辑
              </button>
            </div>
          )}
          {!onSave
            ? <Button disabled fullWidth>功能准备中</Button>
            : <Button disabled={!canSave || isSaving} fullWidth onClick={() => void save()}>{isSaving ? '保存中…' : '保存记录'}</Button>}
        </footer>
      </section>
    </div>
  )
}
