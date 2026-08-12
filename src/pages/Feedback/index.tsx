import { ImagePlus } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, WebPageHeader } from '../../components/common'

export function FeedbackPage() {
  const navigate = useNavigate()
  const [content, setContent] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!content.trim()) {
      setError('请先描述你遇到的问题或建议')
      return
    }
    navigate('/feedback/submitted', { state: { title: content.trim().slice(0, 16) } })
  }

  return (
    <main className="app-shell pb-0">
      <WebPageHeader title="反馈意见" fallback="/health-events" />
      <form className="space-y-3 px-4 py-4" onSubmit={submit}>
        <section className="border-b pb-4">
          <h2 className="text-sm font-medium">我要反馈</h2>
          <p className="mt-1.5 text-xs leading-6 text-text-secondary">告诉我们你的问题或建议，帮助我们持续改进。</p>
        </section>
        <textarea className="hoho-textarea h-[150px] resize-none" placeholder="请描述你遇到的问题或建议…" value={content} onChange={(event) => { setContent(event.target.value); setError('') }} />
        <label className="flex min-h-[91px] cursor-pointer items-center gap-3 rounded-card border bg-surface p-4">
          <ImagePlus className="text-primary" size={22} strokeWidth={1.7} />
          <span className="min-w-0 flex-1"><strong className="block text-sm font-medium">上传图片</strong><span className="mt-1.5 block text-xs text-text-secondary">{files.length ? `已选择 ${files.length} 张图片` : '支持 JPG、PNG，最多 3 张'}</span></span>
          <input className="sr-only" type="file" accept="image/jpeg,image/png" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 3))} />
        </label>
        <div className="min-h-5">{error && <p className="text-xs text-danger">{error}</p>}</div>
        <Button fullWidth type="submit">提交</Button>
      </form>
    </main>
  )
}

export function FeedbackSubmittedPage() {
  const feedbacks = [
    ['无法添加附件', '提交于 2026年8月2日', '待处理', 'text-warning'],
    ['身份切换显示异常', '提交于 2026年8月2日', '处理中', 'text-primary'],
    ['隐私设置说明建议', '提交于 2026年8月2日', '已解决', 'text-success']
  ]

  return (
    <main className="app-shell pb-0">
      <WebPageHeader title="反馈意见" fallback="/feedback" />
      <div className="space-y-3 px-4 py-4">
        <section className="border-b pb-4"><h2 className="text-sm font-medium">反馈已提交</h2><p className="mt-1.5 text-xs leading-6 text-text-secondary">我们会尽快处理，你可以在“我的反馈”中查看进度。</p></section>
        <h2 className="pt-1 text-base font-medium">我的反馈</h2>
        {feedbacks.map(([title, date, status, color]) => (
          <article key={title} className="border-b p-4 last:border-b-0"><h3 className="text-sm font-medium">{title}</h3><p className="mt-1.5 text-xs text-text-secondary">{date}</p><p className={`mt-3 text-xs font-medium ${color}`}>{status}</p></article>
        ))}
      </div>
    </main>
  )
}
