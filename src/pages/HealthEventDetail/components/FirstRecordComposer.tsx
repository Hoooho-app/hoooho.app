import { useState } from 'react'
import { Activity, LockKeyhole, Mic, Sparkles } from 'lucide-react'
import { Button, Card } from '../../../components/common'
import type { CreateHealthEventRecordInput } from '../../../types'

interface FirstRecordComposerProps {
  onSave: (input: CreateHealthEventRecordInput) => Promise<void>
}

export function FirstRecordComposer({ onSave }: FirstRecordComposerProps) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [voiceNotice, setVoiceNotice] = useState('')

  const save = async () => {
    const rawInput = text.trim()
    if (!rawInput) {
      setError('请先描述当前不舒服的情况')
      return
    }

    setSaving(true)
    setError('')
    try {
      await onSave({
        type: 'symptom',
        content: rawInput,
        occurredAt: new Date().toISOString()
      })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存失败，请稍后重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="section-title">症状记录</h2>
      <Card className="border-primary/25 bg-gradient-to-br from-primary-soft/80 via-surface to-success-soft/65 p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-surface shadow-card">
            <Activity size={21} strokeWidth={1.8} />
          </span>
          <div>
            <h3 className="font-semibold text-primary">记录一个新情况</h3>
            <p className="mt-1 text-xs text-text-secondary">直接告诉 Hoho 发生了什么</p>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-card border bg-surface shadow-sm">
          <textarea
            aria-label="描述当前健康情况"
            autoFocus
            className="h-44 w-full resize-none bg-transparent px-4 py-4 text-sm leading-7 outline-none placeholder:text-text-secondary/65"
            maxLength={1000}
            onChange={(event) => {
              setText(event.target.value)
              setError('')
            }}
            placeholder="例如：昨晚开始咳嗽，今天有点发烧，精神一般。"
            value={text}
          />
          <div className="flex items-center justify-between border-t px-3 py-2.5">
            <span className="text-[11px] text-text-secondary">{text.length}/1000</span>
            <button
              className="flex min-h-9 items-center gap-1.5 rounded-pill bg-primary-soft px-3 text-xs font-medium text-primary transition active:scale-95"
              onClick={() => setVoiceNotice('语音输入功能准备中，请先使用文字直接描述')}
              type="button"
            >
              <Mic size={16} strokeWidth={1.8} />
              直接描述
            </button>
          </div>
        </div>

        {voiceNotice && <p className="mt-2 text-xs text-text-secondary" role="status">{voiceNotice}</p>}
        {error && <p className="mt-2 text-xs text-danger" role="alert">{error}</p>}

        <Button className="mt-4" disabled={saving || !text.trim()} fullWidth onClick={() => void save()} type="button">
          <Sparkles size={18} strokeWidth={1.8} />
          {saving ? '正在保存…' : '保存，自动整理'}
        </Button>

        <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-text-secondary">
          <LockKeyhole className="mt-0.5 shrink-0 text-primary/70" size={14} strokeWidth={1.8} />
          保存原始描述后，系统将预留整理任务，不会覆盖你输入的内容。
        </p>
      </Card>
    </section>
  )
}
