import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList } from 'lucide-react'
import { HealthCard, HealthTag, HohoButton, Typography } from '../../components/design-system'
import { useCases } from '../../features/case-continuity/useCases'
import { SmartRecordWorkspace } from '../../features/ai-business/SmartRecordWorkspace'
import { useAppStore } from '../../store/useAppStore'
import { RecordFinder } from './RecordFinder'
import './HomeFlows.css'

export function HomeFlows({ nurseVisual }: { nurseVisual: ReactNode }) {
  const navigate = useNavigate()
  const { data, error, reload, memberId, token } = useCases()
  const accountId = useAppStore(s => s.authUser?.id ?? '')
  const [open, setOpen] = useState<'record' | 'search' | null>(null)
  const [notice, setNotice] = useState('')
  const latest = data?.active.slice().sort((a, b) => b.changedAt.localeCompare(a.changedAt) || b.event.id.localeCompare(a.event.id))[0]
  return <section className="home-flows" aria-label="首页服务入口">
    <HealthCard className="home-flow-card nurse-home-dialogue" aria-label="健康随记">
      <header><Typography variant="sectionTitle">健康随记</Typography><time dateTime={new Date().toLocaleDateString('sv-SE')}>{new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date())}</time></header>
      <div className="nurse-home-dialogue__body"><div className="nurse-home-dialogue__copy"><Typography variant="body">吃了什么、睡得怎样、有什么症状，都可以和护士说说，帮你记清楚。</Typography><Typography variant="caption">现在的事、过去的情况，都可以记。</Typography></div><div className="nurse-station-visual">{nurseVisual}</div></div>
      <HohoButton fullWidth size="large" disabled={!token || !memberId} onClick={() => setOpen('record')}>和护士说说</HohoButton>
    </HealthCard>
    <HealthCard className="home-flow-card" aria-label="正在跟进">
      <header>
        <div className="home-followup-heading"><ClipboardList size={20} aria-hidden="true" /><Typography variant="sectionTitle">正在跟进</Typography></div>
        <Typography variant="caption" className="home-followup-count" aria-label={data ? `${data.active.length} 个跟进事项` : '跟进数量暂未加载'}>{data ? `${data.active.length} 项` : '— 项'}</Typography>
      </header>
      {latest ? <>
        <div className="home-followup-tags"><HealthTag>{latest.followup.title.length > 12 ? `${latest.followup.title.slice(0, 12)}…` : latest.followup.title}</HealthTag></div>
        <Typography variant="caption">最近更新：{new Date(latest.changedAt).toLocaleDateString('zh-CN')} · {latest.followup.recordCount} 条记录</Typography>
      </> : <Typography variant="body">{data ? '还没有正在跟进的事项。记录后，可以选择继续跟进。' : error ? '跟进事项暂未加载，其他功能仍可使用。' : '正在读取跟进事项…'}</Typography>}
      {error && <HohoButton variant="text" onClick={reload}>重试加载</HohoButton>}
      <HohoButton variant="secondary" onClick={() => navigate(latest ? `/cases?eventId=${encodeURIComponent(latest.event.id)}` : '/cases')}>查看进度 / 补充进展</HohoButton>
    </HealthCard>
    <HealthCard className="home-flow-card" aria-label="准备和医生说清楚">
      <Typography variant="sectionTitle" className="flex items-center gap-2"><ClipboardList size={24} strokeWidth={1.8} className="shrink-0" aria-hidden="true" />准备和医生说清楚</Typography>
      <Typography variant="body">准备孩子的就诊情况单，一张内容，把所有的事情说清楚、整理清楚。</Typography>
      <HohoButton fullWidth variant="secondary" size="large" onClick={() => navigate('/visit-summary')}>就诊情况单</HohoButton>
    </HealthCard>
    <HealthCard className="home-flow-card" aria-label="想查什么，问一问"><Typography variant="sectionTitle">想查什么，问一问</Typography><Typography variant="body">最近两个月有没有吃新东西？第一次红屁股是什么时候？那次红疹后来有什么变化？</Typography><Typography variant="caption">直接问，帮你找到已有记录和原文。</Typography><HohoButton fullWidth variant="secondary" size="large" disabled={!token || !memberId} onClick={() => setOpen('search')}>查找记录</HohoButton></HealthCard>
    {notice && <p role="status">{notice}</p>}
    {open === 'record' && <SmartRecordWorkspace key={`${accountId}:${memberId}`} conversational memberId={memberId} token={token} onClose={() => setOpen(null)} onSaved={message => { setNotice(message); reload() }} />}
    {open === 'search' && <RecordFinder key={`${accountId}:${memberId}`} memberId={memberId} token={token} onClose={() => setOpen(null)} />}
  </section>
}
