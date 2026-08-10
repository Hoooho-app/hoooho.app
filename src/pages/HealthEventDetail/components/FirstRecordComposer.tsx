import { useRef, useState } from 'react'
import { CalendarDays, ImagePlus, Sparkles, X } from 'lucide-react'
import { Button, Card } from '../../../components/common'
import type { CreateEventAttachmentInput, CreateHealthEventRecordInput } from '../../../types'

interface FirstRecordComposerProps {
  onSave: (input: CreateHealthEventRecordInput) => Promise<void>
}

interface LabeledAttachment extends CreateEventAttachmentInput {
  label: string
  originalName: string
}

const bodyLocations = ['头', '颈', '肩', '胸', '腹', '腰', '手', '手掌', '腿', '脚', '皮肤', '其他']

function localDateTimeValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function inferImageLabel(name: string, selectedLocations: string[]) {
  if (/药|药盒|药瓶/.test(name)) return '药物'
  if (/检查|化验|报告|血常规/.test(name)) return '检查单'
  if (/皮肤|红疹|皮疹/.test(name)) return '皮肤'
  return selectedLocations[0] || '图片'
}

export function FirstRecordComposer({ onSave }: FirstRecordComposerProps) {
  const [text, setText] = useState('')
  const [occurredAt, setOccurredAt] = useState(localDateTimeValue)
  const [selectedLocations, setSelectedLocations] = useState<string[]>([])
  const [attachments, setAttachments] = useState<LabeledAttachment[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textAreaRef = useRef<HTMLTextAreaElement>(null)

  const toggleLocation = (location: string) => {
    setSelectedLocations((current) => current.includes(location)
      ? current.filter((item) => item !== location)
      : [...current, location])
  }

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
          reader.onerror = () => reject(new Error('图片读取失败'))
          reader.readAsDataURL(file)
        })
        return {
          name: file.name,
          originalName: file.name,
          mimeType: file.type,
          dataUrl,
          label: inferImageLabel(file.name, selectedLocations)
        }
      }))
      setAttachments((current) => [...current, ...selected].slice(0, 8))
    } catch (selectError) {
      setError(selectError instanceof Error ? selectError.message : '图片读取失败')
    }
  }

  const save = async () => {
    const rawInput = text.trim()
    if (!rawInput && !attachments.length) {
      setError('请先描述发生了什么，或添加相关图片')
      return
    }

    setSaving(true)
    setError('')
    try {
      await onSave({
        type: 'symptom',
        content: rawInput,
        occurredAt: new Date(occurredAt).toISOString(),
        bodyLocations: selectedLocations,
        attachments: attachments.map(({ label, originalName, ...attachment }) => ({
          ...attachment,
          name: `[${label}] ${originalName}`
        }))
      })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存失败，请稍后重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby="first-record-title">
      <Card className="border-primary/15 p-4 shadow-calm">
        <h2 className="section-title text-heading" id="first-record-title">记录情况</h2>

        <div className="mt-5 space-y-5">
          <label className="grid grid-cols-[5.75rem_minmax(0,1fr)] items-center gap-2">
            <span className="text-sm font-medium text-heading">发生时间</span>
            <span className="relative block">
              <input className="min-h-12 w-full rounded-control border bg-surface px-3 pr-10 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" onChange={(event) => setOccurredAt(event.target.value)} type="datetime-local" value={occurredAt} />
              <CalendarDays className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary" size={18} />
            </span>
          </label>

          <div className="grid grid-cols-[5.75rem_minmax(0,1fr)] gap-2">
            <p className="pt-2 text-sm font-medium text-heading">身体部位</p>
            <div className="grid grid-cols-6 gap-2" aria-label="身体部位快速选择">
              {bodyLocations.map((location) => {
                const selected = selectedLocations.includes(location)
                return <button aria-pressed={selected} className={`min-h-9 rounded-pill border px-1 text-xs font-medium transition ${selected ? 'border-primary bg-primary text-surface' : 'border-primary/20 bg-surface text-text-secondary'}`} key={location} onClick={() => toggleLocation(location)} type="button">{location}</button>
              })}
            </div>
          </div>

          <label className="grid grid-cols-[5.75rem_minmax(0,1fr)] gap-2">
            <span className="pt-3 text-sm font-medium text-heading">描述情况</span>
            <span className="relative block">
              <textarea aria-label="描述健康情况" autoFocus className="h-36 w-full resize-none rounded-control border bg-surface px-3 py-3 pb-8 text-sm leading-6 outline-none transition placeholder:text-text-secondary/65 focus:border-primary focus:ring-2 focus:ring-primary/15" maxLength={1000} onChange={(event) => { setText(event.target.value); setError('') }} placeholder={'请直接描述发生了什么，例如：\n8月6日晚开始发烧，早上体温38.5℃，吃了一次退烧药。'} ref={textAreaRef} value={text} />
              <span className="absolute bottom-2 right-3 text-[11px] text-text-secondary">{text.length}/1000</span>
            </span>
          </label>

          <div className="grid grid-cols-[5.75rem_minmax(0,1fr)] gap-2">
            <p className="pt-2 text-sm font-medium text-heading">添加图片</p>
            <div>
              <input accept="image/jpeg,image/png,image/webp" className="hidden" multiple onChange={(event) => { void selectImages(event.target.files); event.target.value = '' }} ref={fileInputRef} type="file" />
              <button className="inline-flex min-h-10 items-center gap-2 rounded-control border border-dashed border-primary/35 bg-surface px-3 text-sm font-medium text-primary" onClick={() => fileInputRef.current?.click()} type="button"><ImagePlus size={18} />添加图片</button>
              {attachments.length > 0 && (
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {attachments.map((attachment, index) => (
                    <figure className="relative aspect-square overflow-hidden rounded-lg bg-primary-soft" key={`${attachment.originalName}-${index}`}>
                      <img alt={attachment.originalName} className="h-full w-full object-cover" src={attachment.dataUrl} />
                      <figcaption className="absolute bottom-1 left-1 max-w-[calc(100%-8px)] truncate rounded-pill bg-surface/90 px-1.5 py-0.5 text-[10px] font-medium text-primary">{attachment.label}</figcaption>
                      <button aria-label={`删除图片 ${attachment.originalName}`} className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-text-primary/75 text-surface" onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))} type="button"><X size={12} /></button>
                    </figure>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-control bg-warning/10 px-3 py-3" role="alert">
            <p className="text-sm font-semibold text-heading">{error.includes('暂未识别') ? '未识别到健康事件关键信息' : error}</p>
            {error.includes('暂未识别') && <p className="mt-1 text-xs leading-5 text-text-secondary">请重新描述哪里不舒服、什么时候开始，以及有什么变化。</p>}
            <button className="mt-2 text-sm font-semibold text-primary" onClick={() => { setError(''); textAreaRef.current?.focus() }} type="button">重新编辑</button>
          </div>
        )}

        <Button className="mt-5" disabled={saving || (!text.trim() && !attachments.length)} fullWidth onClick={() => void save()} type="button"><Sparkles size={18} strokeWidth={1.8} />{saving ? '正在整理…' : '保存，自动整理'}</Button>
      </Card>
    </section>
  )
}
