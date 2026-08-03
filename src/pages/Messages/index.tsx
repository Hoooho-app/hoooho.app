import { useState } from 'react'
import { WebPageHeader } from '../../components/common'

const healthMessages = [
  ['体温异常提醒', '小明最近2次体温超过37.5℃，请持续关注体温变化。', '10:30'],
  ['用药提醒', '爸爸的降压药该服用了，请及时提醒。', '昨天 18:00'],
  ['复查提醒', '复查时间临近，建议准备检查资料。', '昨天 08:00'],
  ['报告识别完成', '小明的血常规报告已整理完成。', '6月7日']
]
const systemMessages = [['隐私政策更新', '我们更新了健康数据使用说明。', '7月30日']]

export function MessageCenterPage() {
  const [tab, setTab] = useState<'health' | 'system'>('health')
  const messages = tab === 'health' ? healthMessages : systemMessages

  return (
    <main className="app-shell pb-0">
      <WebPageHeader title="消息中心" fallback="/settings" />
      <div className="space-y-3 px-4 py-4">
        <div className="flex h-10 gap-2 rounded-pill bg-surface p-1 shadow-card">
          <button className={`w-24 rounded-pill text-[13px] font-medium ${tab === 'health' ? 'bg-primary-soft text-primary' : 'text-text-secondary'}`} type="button" onClick={() => setTab('health')}>健康提醒</button>
          <button className={`w-24 rounded-pill text-[13px] font-medium ${tab === 'system' ? 'bg-primary-soft text-primary' : 'text-text-secondary'}`} type="button" onClick={() => setTab('system')}>系统消息</button>
        </div>
        {messages.map(([title, description, time]) => (
          <article key={title} className="rounded-[16px] bg-surface p-4 shadow-card">
            <h2 className="text-sm font-medium">{title}</h2>
            <p className="mt-1.5 text-xs leading-6 text-text-secondary">{description}</p>
            <time className="mt-1.5 block text-[11px] text-text-secondary">{time}</time>
          </article>
        ))}
      </div>
    </main>
  )
}
