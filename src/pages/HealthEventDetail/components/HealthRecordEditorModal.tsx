import { useEffect, useMemo, useRef, useState } from 'react'
import { Mic, Paperclip, Sparkles, X } from 'lucide-react'
import { Button, Card } from '../../../components/common'
import { usePageScrollLock } from '../../../hooks/usePageScrollLock'
import type { CreateEventAttachmentInput, HealthEventRecordType } from '../../../types'

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
    title: '补充时间线',
    guidance: '按时间顺序描述事情发生的过程，包括症状变化、体温变化、用药或就医等重要节点。',
    example: '7月20日20:00开始发热，22:00体温38.5℃并服用退烧药，第二天08:00体温37.2℃。',
    placeholder: '请按时间顺序描述事件过程……',
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
    guidance: '上传与此次健康事件相关的图片，例如检查报告、化验单、药品包装或医生记录。',
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
  'female-health': { title: '记录女性健康', guidance: '描述与当前事件相关的女性健康情况，内容仅用于本次健康记录。', example: '可以描述周期变化、经期异常或其他相关情况。', placeholder: '请描述相关情况……', previewLabels: ['当前情况', '发生时间', '伴随变化'] },
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
  onClose: () => void
  onSave?: (result: HealthRecordEditorResult) => void | Promise<void>
}

function localDateTimeValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export function HealthRecordEditorModal({ open, templateType, defaultRecordType = 'note', lockRecordType = false, titleOverride, initialValue = '', onClose, onSave }: HealthRecordEditorModalProps) {
  const template = templates[templateType]
  const [text, setText] = useState(initialValue)
  const [recordType, setRecordType] = useState<SelectableRecordType>(defaultRecordType)
  const [occurredAt, setOccurredAt] = useState(localDateTimeValue)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [attachments, setAttachments] = useState<CreateEventAttachmentInput[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  usePageScrollLock(open)

  useEffect(() => {
    if (!open) return
    setText(initialValue)
    setRecordType(defaultRecordType)
    setOccurredAt(localDateTimeValue())
    setIsSaving(false)
    setSaveError('')
    setAttachments([])
  }, [defaultRecordType, open, templateType, initialValue])

  const preview = useMemo(() => [
    { label: '记录类型', value: recordTypeLabels.get(recordType) ?? '备注' },
    { label: '发生时间', value: new Date(occurredAt).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }) },
    { label: '记录内容', value: text.trim() }
  ], [occurredAt, recordType, text])
  const canSave = Boolean((text.trim() || attachments.length) && occurredAt)

  const selectImages = async (files: FileList | null) => {
    if (!files?.length) return
    setSaveError('')
    try {
      const selected = await Promise.all([...files].map(async (file) => {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('仅支持 JPG、PNG 或 WebP 图片')
        if (file.size > 5 * 1024 * 1024) throw new Error('单张图片不能超过 5MB')
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => reject(new Error('图片读取失败'))
          reader.readAsDataURL(file)
        })
        return { name: file.name, mimeType: file.type, dataUrl }
      }))
      setAttachments((current) => [...current, ...selected].slice(0, 5))
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '图片读取失败')
    }
  }

  const save = async () => {
    setSaveError('')
    setIsSaving(true)
    try {
      if (!onSave) return
      await onSave({ templateType, recordType, originalText: text.trim(), occurredAt: new Date(occurredAt).toISOString(), structuredFields: preview, attachments })
      onClose()
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '保存失败，请稍后重试')
    } finally {
      setIsSaving(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex touch-none items-end justify-center overscroll-none bg-black/35 px-6 pb-[max(16px,env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))]"
      role="presentation"
    >
      <section
        aria-modal="true"
        className="flex max-h-[80dvh] w-full max-w-[354px] touch-auto flex-col overflow-hidden rounded-t-[24px] bg-background shadow-floating"
        role="dialog"
      >
        <header className="grid min-h-16 grid-cols-[2.75rem_1fr_2.75rem] items-center border-b bg-surface px-3">
          <button aria-label="关闭" className="grid h-11 w-11 place-items-center rounded-full hover:bg-primary-soft" onClick={onClose} type="button"><X size={21} /></button>
          <h2 className="text-center text-base font-semibold">{titleOverride || template.title}</h2>
          <span aria-hidden="true" />
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
          <Card className="border-l-4 border-l-primary bg-primary-soft/55 shadow-none">
            <div className="flex gap-2"><Sparkles className="mt-0.5 shrink-0 text-primary" size={17} /><div><h3 className="text-sm font-semibold">怎么写？</h3><p className="mt-1 text-xs leading-5 text-text-secondary">{template.guidance}</p></div></div>
          </Card>

          {onSave && (
            <div className="space-y-3">
              {!lockRecordType && <div>
                <p className="mb-2 text-xs font-medium text-text-secondary">记录类型</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {recordTypeOptions.map((option) => (
                    <button
                      className={`min-h-9 rounded-pill px-2 text-xs font-medium transition ${recordType === option.value ? 'bg-primary text-surface' : 'bg-primary-soft text-text-secondary'}`}
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
                  className="min-h-11 w-full rounded-control border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  onChange={(event) => setOccurredAt(event.target.value)}
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
              value={text}
            />
            <div className="flex items-center justify-between border-t px-3 py-2">
              <span className="text-[11px] text-text-secondary">{text.length}/1000</span>
              <div className="flex gap-2">
                <button className="flex min-h-9 cursor-not-allowed items-center gap-1.5 rounded-pill px-3 text-xs text-text-secondary opacity-70" disabled title="语音功能准备中" type="button"><Mic size={15} />语音准备中</button>
                <input accept="image/jpeg,image/png,image/webp" className="hidden" multiple onChange={(event) => void selectImages(event.target.files)} ref={fileInputRef} type="file" />
                <button className="flex min-h-9 items-center gap-1.5 rounded-pill px-3 text-xs text-text-secondary" onClick={() => fileInputRef.current?.click()} type="button"><Paperclip size={15} />添加图片{attachments.length ? ` (${attachments.length})` : ''}</button>
              </div>
            </div>
          </Card>

        </div>

        <footer className="shrink-0 border-t bg-surface p-4">
          {saveError && <p className="mb-3 text-center text-xs text-red-600">{saveError}</p>}
          {!onSave
            ? <Button disabled fullWidth>功能准备中</Button>
            : <Button disabled={!canSave || isSaving} fullWidth onClick={() => void save()}>{isSaving ? '保存中…' : '保存记录'}</Button>}
        </footer>
      </section>
    </div>
  )
}
