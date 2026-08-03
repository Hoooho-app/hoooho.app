import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { WebPageHeader } from '../../components/common'

const faqs = [
  ['如何创建健康事件？', '在健康事件首页点击右下角新增按钮，选择记录对象后即可开始记录。'],
  ['如何添加家庭成员？', '进入侧边栏的“切换身份”，在“我的家人”页面点击“+ 添加家人”。'],
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
        <label className="flex h-12 items-center gap-2 rounded-pill bg-surface px-4 shadow-card">
          <Search size={17} strokeWidth={1.7} className="text-text-secondary" />
          <input className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-text-secondary" placeholder="搜索问题" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <h2 className="pt-1 text-base font-medium">常见问题</h2>
        {filtered.map(([question, answer]) => {
          const open = openQuestion === question
          return (
            <button key={question} className="block w-full rounded-[16px] bg-surface p-4 text-left shadow-card" type="button" aria-expanded={open} onClick={() => setOpenQuestion(open ? '' : question)}>
              <strong className="block text-sm font-medium">{question}</strong>
              <span className="mt-1.5 block text-xs leading-6 text-text-secondary">{open ? answer : '点击查看详细说明  ›'}</span>
            </button>
          )
        })}
        <section className="rounded-[16px] bg-primary-soft p-4">
          <h2 className="text-sm font-medium">需要更多帮助？</h2>
          <p className="mt-1.5 text-xs leading-6 text-text-secondary">可以查阅使用说明，快速了解 Hoooho 的记录流程。</p>
        </section>
      </div>
    </main>
  )
}
