import { ChangeEvent, useEffect, useMemo, useState } from 'react'
import { ImagePlus, Mic, Paperclip, PencilLine, Sparkles, X } from 'lucide-react'
import { Button, Card } from '../../../components/common'
import { usePageScrollLock } from '../../../hooks/usePageScrollLock'

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
  originalText: string
  structuredFields: Array<{ label: string; value: string }>
  attachments: string[]
}

interface HealthRecordEditorModalProps {
  open: boolean
  templateType: HealthRecordTemplateType
  titleOverride?: string
  initialValue?: string
  onClose: () => void
  onSave?: (result: HealthRecordEditorResult) => void
}

function buildPreview(template: EditorTemplate, text: string, attachments: string[]) {
  const temperature = text.match(/\d{2}(?:\.\d)?\s*℃?/)?.[0]
  return template.previewLabels.map((label, index) => ({
    label,
    value: index === 0 && text ? text : index === 1 && temperature ? temperature : attachments.length && index === 0 ? `${attachments.length} 张图片` : '待进一步确认'
  }))
}

export function HealthRecordEditorModal({ open, templateType, titleOverride, initialValue = '', onClose, onSave }: HealthRecordEditorModalProps) {
  const template = templates[templateType]
  const [text, setText] = useState(initialValue)
  const [attachments, setAttachments] = useState<string[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const [voiceHint, setVoiceHint] = useState(false)
  usePageScrollLock(open)

  useEffect(() => {
    if (!open) return
    setText(initialValue)
    setAttachments([])
    setShowPreview(false)
    setVoiceHint(false)
  }, [open, templateType, initialValue])

  const preview = useMemo(() => buildPreview(template, text.trim(), attachments), [attachments, template, text])
  const canAnalyze = Boolean(text.trim() || attachments.length)

  const addImages = (event: ChangeEvent<HTMLInputElement>) => {
    const names = Array.from(event.target.files || []).map((file) => file.name)
    setAttachments((current) => [...current, ...names])
    event.target.value = ''
  }

  const save = () => {
    onSave?.({ templateType, originalText: text.trim(), structuredFields: preview, attachments })
    onClose()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex touch-none items-end justify-center overscroll-none bg-black/35 px-6 pb-[max(16px,env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))]"
      role="presentation"
    >
      <section
        aria-modal="true"
        className={`flex w-full max-w-[354px] touch-auto flex-col overflow-hidden rounded-t-[24px] bg-background shadow-floating ${showPreview ? 'max-h-[90dvh]' : 'max-h-[80dvh]'}`}
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

          <div><p className="mb-2 text-xs text-text-secondary">示例</p><p className="text-sm leading-6 text-text-secondary">{template.example}</p></div>

          <Card className="p-0">
            <textarea className="h-48 w-full resize-none rounded-t-card bg-transparent p-4 text-sm leading-6 outline-none placeholder:text-text-secondary/65" maxLength={1000} onChange={(event) => { setText(event.target.value); setShowPreview(false) }} placeholder={template.placeholder} value={text} />
            <div className="flex items-center justify-between border-t px-3 py-2">
              <span className="text-[11px] text-text-secondary">{text.length}/1000</span>
              <div className="flex gap-2">
                <button className="flex min-h-9 items-center gap-1.5 rounded-pill px-3 text-xs text-primary hover:bg-primary-soft" onClick={() => setVoiceHint(true)} type="button"><Mic size={15} />语音输入</button>
                <label className="flex min-h-9 cursor-pointer items-center gap-1.5 rounded-pill px-3 text-xs text-primary hover:bg-primary-soft"><Paperclip size={15} />添加图片<input accept="image/*" className="sr-only" multiple onChange={addImages} type="file" /></label>
              </div>
            </div>
          </Card>

          {voiceHint && <p className="text-xs text-text-secondary">语音输入入口已预留，后续接入语音识别服务。</p>}
          {attachments.length > 0 && <Card className="space-y-2"><div className="flex items-center gap-2 text-sm font-semibold"><ImagePlus className="text-primary" size={17} />已选择图片</div>{attachments.map((name) => <p className="truncate text-xs text-text-secondary" key={name}>{name}</p>)}</Card>}

          {showPreview && (
            <Card>
              <div className="mb-4 flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="text-primary" size={16} />AI整理结果</h3><button className="flex items-center gap-1 text-xs text-primary" onClick={() => setShowPreview(false)} type="button"><PencilLine size={14} />编辑</button></div>
              <dl className="space-y-3">{preview.map(({ label, value }) => <div className="grid grid-cols-[5rem_1fr] gap-3 text-sm" key={label}><dt className="text-text-secondary">{label}</dt><dd className="leading-6">{value}</dd></div>)}</dl>
            </Card>
          )}
        </div>

        <footer className="shrink-0 border-t bg-surface p-4">
          {showPreview ? <Button fullWidth onClick={save}>确认保存</Button> : <Button disabled={!canAnalyze} fullWidth onClick={() => setShowPreview(true)}>整理并预览</Button>}
        </footer>
      </section>
    </div>
  )
}
