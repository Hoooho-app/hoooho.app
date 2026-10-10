import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, ClipboardList, NotebookText, Route } from 'lucide-react'
import { HealthCard, HohoButton, Typography } from '../../components/design-system'
import { useCases } from '../../features/case-continuity/useCases'
import { SmartRecordWorkspace } from '../../features/ai-business/SmartRecordWorkspace'
import { useAppStore } from '../../store/useAppStore'
import './HomeFlows.css'

export function HomeFlows({ nurseVisual }: { nurseVisual: ReactNode }) {
  const navigate = useNavigate()
  const { data, error, reload, memberId, token } = useCases()
  const accountId = useAppStore(s => s.authUser?.id ?? '')
  const [open, setOpen] = useState<'record' | null>(null)
  const [notice, setNotice] = useState('')
  const previews = data?.active.slice().sort((a, b) => b.changedAt.localeCompare(a.changedAt) || b.event.id.localeCompare(a.event.id)).slice(0, 2) ?? []
  return <section className="home-flows" aria-label="首页服务入口">
    <HealthCard className="home-flow-card" aria-label="正在跟进">
      <header>
        <div className="home-followup-heading"><Route size={18} strokeWidth={1.8} aria-hidden="true" /><Typography variant="sectionTitle">正在跟进</Typography></div>
        <Typography variant="caption" className="home-followup-count" aria-label={data ? `${data.active.length} 个跟进事项` : '跟进数量暂未加载'}>{data ? `${data.active.length} 项` : '— 项'}</Typography>
      </header>
      {previews.length ? <div className="home-followup-previews">{previews.map(item => <button
        key={item.event.id}
        className="home-followup-preview"
        type="button"
        aria-label={`查看${item.followup.title}的进度`}
        onClick={() => navigate(`/cases?eventId=${encodeURIComponent(item.event.id)}`)}
      >
        <span><strong>{item.followup.title}</strong><small>{item.followup.latestOccurredAt ? new Date(item.followup.latestOccurredAt).toLocaleDateString('zh-CN', { timeZone: data?.timezone }) : '发生时间未提供'} · {item.followup.recordCount} 条过程记录</small></span>
        <ChevronRight size={17} aria-hidden="true" />
      </button>)}{data && data.active.length > 2 && <Typography variant="caption">还有 {data.active.length - 2} 项正在跟进</Typography>}</div>
        : <Typography variant="body">{data ? '还没有正在跟进的事项。记录后，可以选择继续跟进。' : error ? '跟进事项暂未加载，其他功能仍可使用。' : '正在读取跟进事项…'}</Typography>}
      {error && <HohoButton variant="text" onClick={reload}>重试加载</HohoButton>}
      <HohoButton fullWidth variant="primary" size="large" onClick={() => navigate('/cases')}>查看进度</HohoButton>
    </HealthCard>
    <HealthCard className="home-flow-card nurse-home-dialogue" aria-label="健康随记">
      <header><div className="home-followup-heading"><NotebookText size={18} strokeWidth={1.8} aria-hidden="true" /><Typography variant="sectionTitle">健康随记</Typography></div><time dateTime={new Date().toLocaleDateString('sv-SE')}>{new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date())}</time></header>
      <div className="nurse-home-dialogue__body"><div className="nurse-home-dialogue__copy"><Typography variant="caption">吃了什么、睡得怎样、有什么症状，都可以和护士说说，帮你记清楚。</Typography><Typography className="home-record-time-hint" variant="caption">现在、过去的情况都可以记。</Typography></div><div className="nurse-station-visual">{nurseVisual}</div></div>
      <HohoButton fullWidth size="large" disabled={!token || !memberId} onClick={() => setOpen('record')}>和护士说说</HohoButton>
    </HealthCard>
    <HealthCard className="home-flow-card" aria-label="准备和医生说清楚">
      <div className="home-followup-heading"><ClipboardList size={18} strokeWidth={1.8} aria-hidden="true" /><Typography variant="sectionTitle">准备和医生说清楚</Typography></div>
      <Typography variant="body">快速准备孩子的就诊情况单（既往史）</Typography>
      <HohoButton fullWidth variant="primary" size="large" onClick={() => navigate('/visit-summary')}>就诊情况单</HohoButton>
    </HealthCard>
    {notice && <p role="status">{notice}</p>}
    {open === 'record' && <SmartRecordWorkspace key={`${accountId}:${memberId}`} conversational memberId={memberId} token={token} onClose={() => setOpen(null)} onSaved={message => { setNotice(message); reload() }} />}
  </section>
}
