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
        <div aria-label="消息类型" className="hoho-segmented-control" role="tablist">
          <button aria-selected={tab === 'health'} data-selected={tab === 'health'} role="tab" type="button" onClick={() => setTab('health')}>健康提醒</button>
          <button aria-selected={tab === 'system'} data-selected={tab === 'system'} role="tab" type="button" onClick={() => setTab('system')}>系统消息</button>
        </div>
        {messages.map(([title, description, time]) => (
          <article key={title} className="border-b px-1 py-4 last:border-b-0">
            <h2 className="text-sm font-medium">{title}</h2>
            <p className="mt-1.5 text-xs leading-6 text-text-secondary">{description}</p>
            <time className="mt-1.5 block text-[11px] text-text-secondary">{time}</time>
          </article>
        ))}
      </div>
    </main>
  )
}
