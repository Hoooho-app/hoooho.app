import { type FormEvent, useEffect, useState } from 'react'
import { PencilLine } from 'lucide-react'
import { Button, Card } from '../../../components/common'

interface EventTitleSectionProps {
  title: string
  onSave: (title: string) => Promise<unknown>
}

export function EventTitleSection({ title, onSave }: EventTitleSectionProps) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(title)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => setValue(title), [title])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const nextTitle = value.trim()
    if (!nextTitle) {
      setError('请写下这次发生了什么')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave(nextTitle)
      setEditing(false)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存失败，请稍后重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="section-title">发生了什么？</h2>
      {!editing ? (
        <button className="block w-full text-left" onClick={() => setEditing(true)} type="button">
          <Card interactive className="flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <strong className={`block text-sm ${title ? 'text-text-primary' : 'text-text-secondary'}`}>
                {title || '还没有填写'}
              </strong>
              <span className="mt-1 block text-xs text-text-secondary">
                {title ? '点击可以修改' : '例如：发烧、咳嗽、腹痛'}
              </span>
            </span>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
              <PencilLine size={17} />
            </span>
          </Card>
        </button>
      ) : (
        <Card>
          <form className="space-y-3" onSubmit={(event) => void submit(event)}>
            <input
              autoFocus
              className="min-h-11 w-full rounded-control border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              maxLength={120}
              onChange={(event) => { setValue(event.target.value); setError('') }}
              placeholder="例如：发烧、咳嗽、腹痛"
              value={value}
            />
            {error && <p className="text-xs text-danger">{error}</p>}
            <div className="grid grid-cols-2 gap-2">
              <Button disabled={saving} onClick={() => { setEditing(false); setValue(title); setError('') }} type="button" variant="secondary">取消</Button>
              <Button disabled={saving || !value.trim()} type="submit">{saving ? '保存中…' : '保存'}</Button>
            </div>
          </form>
        </Card>
      )}
    </section>
  )
}
