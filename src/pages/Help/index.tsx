import { ChevronDown, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { WebPageHeader } from '../../components/common'

const faqs = [
  ['如何创建健康事件？', '在健康事件首页点击右下角新增按钮，选择记录对象后即可开始记录。'],
  ['如何添加家庭成员？', '进入侧边栏的“切换角色”，在“我的家人”页面点击“+ 添加家人”。'],
  ['如何记录健康数据？', '进入健康事件详情，点击症状、时间线、体温或附件模块进行补充。'],
  ['数据安全吗？', '当前版本数据仅保存在本设备 Mock 存储中，不会用于医疗诊断。'],
  ['如何导出我的健康数据？', '进入设置—隐私设置，点击“导出健康数据”。']
]

export function HelpCenterPage() {
  const [query, setQuery] = useState('')
  const [openQuestion, setOpenQuestion] = useState('')
  const filtered = useMemo(() => faqs.filter(([question]) => question.includes(query.trim())), [query])

  return (
    <main className="app-shell pb-0">
      <WebPageHeader title="帮助中心" fallback="/health-events" />
      <div className="space-y-3 px-4 py-4">
        <label className="flex h-12 items-center gap-2 rounded-control border bg-surface px-4">
          <Search size={17} strokeWidth={1.7} className="text-text-secondary" />
          <input className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-text-secondary" placeholder="搜索问题" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <h2 className="pt-1 text-base font-medium">常见问题</h2>
        {filtered.map(([question, answer]) => {
          const open = openQuestion === question
          return (
            <button key={question} className="block w-full border-b bg-transparent p-4 text-left last:border-b-0" type="button" aria-expanded={open} onClick={() => setOpenQuestion(open ? '' : question)}>
              <span className="flex items-center gap-3"><strong className="block min-w-0 flex-1 text-sm font-medium">{question}</strong><ChevronDown aria-hidden="true" className={`shrink-0 text-text-secondary transition-transform ${open ? 'rotate-180' : ''}`} size={18} /></span>
              <span className="help-answer" data-open={open}><span className="mt-1.5 block text-xs leading-6 text-text-secondary">{answer}</span></span>
            </button>
          )
        })}
        <section className="border-t border-border p-4">
          <h2 className="text-sm font-medium">需要更多帮助？</h2>
          <p className="mt-1.5 text-xs leading-6 text-text-secondary">可以查阅使用说明，快速了解 Hoooho 的记录流程。</p>
        </section>
      </div>
    </main>
  )
}
