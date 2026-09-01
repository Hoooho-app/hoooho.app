import { ChevronRight, FileHeart, Link2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { WebPageHeader } from '../../components/common'
import { MemberIdentityCard } from '../../components/health'
import { HohoButton, StatusNotice, Typography } from '../../components/design-system'
import { useCurrentMember } from '../../hooks/useCurrentMember'
import { useHealthProfileFacts } from '../../features/health-profile/hooks/useHealthProfileFacts'
import { formatHealthFactDate, healthProfileFactCategoryLabels, healthProfileFactStatusLabels } from './healthProfileFactPresentation'

export function ImportantHealthFactsPage() {
  const member = useCurrentMember()
  const navigate = useNavigate()
  const { candidates, facts, load, message, status } = useHealthProfileFacts(member.id)
  const activeFacts = facts.filter((fact) => fact.status !== 'removed')
  const removedFacts = facts.filter((fact) => fact.status === 'removed')

  return <main className="app-shell health-profile-detail-shell">
    <WebPageHeader fallback="/health-profile" title="重要健康事实" />
    <div className="page-content health-profile-page-content">
      <MemberIdentityCard member={member} />
      <Typography className="mt-5" variant="caption">保存已经确认要长期保留的信息，并随时回看它来自哪一次健康事件。</Typography>

      {status === 'loading' && <section className="health-fact-empty mt-6"><Typography variant="caption">正在加载重要健康事实…</Typography></section>}
      {status === 'error' && <StatusNotice action={<HohoButton onClick={() => void load()} size="small" variant="secondary">重试</HohoButton>} title="加载失败" tone="error">{message}</StatusNotice>}
      {status === 'success' && <>
        {candidates.length > 0 && <section className="health-fact-inbox mt-6" aria-label="待处理健康信息">
          <div className="flex items-start gap-3"><span className="health-fact-inbox__icon"><FileHeart size={20} /></span><div className="min-w-0 flex-1"><Typography variant="cardTitle">发现可长期保留的信息</Typography><Typography className="mt-1" variant="caption">{candidates.length} 条来自健康事件，需你确认后才会加入档案</Typography></div></div>
          <div className="mt-3 grid gap-1">{candidates.map((candidate) => <button className="health-fact-candidate-row" key={candidate.id} onClick={() => navigate(`/health-profile/facts/candidates/${encodeURIComponent(candidate.id)}`)} type="button"><span className="min-w-0"><strong>{candidate.title}</strong><small>{formatHealthFactDate(candidate.source.recordOccurredAt)} · {candidate.source.eventTitle}</small></span><ChevronRight size={18} /></button>)}</div>
        </section>}

        <section className="mt-6 grid gap-3">
          <div className="flex items-center justify-between"><Typography variant="sectionTitle">已加入档案</Typography><Typography variant="caption">{activeFacts.length} 条</Typography></div>
          {activeFacts.length === 0 ? <div className="health-fact-empty"><FileHeart className="text-primary" size={24} /><Typography className="mt-3" variant="cardTitle">暂无重要健康事实</Typography><Typography className="mt-1" variant="caption">健康事件中的重要信息确认后会显示在这里</Typography></div> : <div className="health-fact-list">{activeFacts.map((fact) => <button className="health-fact-row" key={fact.id} onClick={() => navigate(`/health-profile/facts/${fact.id}`)} type="button"><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><strong>{fact.title}</strong><span className="health-fact-status" data-status={fact.status}>{healthProfileFactStatusLabels[fact.status]}</span></span><small>{healthProfileFactCategoryLabels[fact.category]} · 更新于 {formatHealthFactDate(fact.updatedAt)}</small><small className="health-fact-source-count"><Link2 size={13} />{fact.sources.length} 条来源</small></span><ChevronRight size={18} /></button>)}</div>}
        </section>

        {removedFacts.length > 0 && <section className="mt-7 grid gap-3"><Typography variant="sectionTitle">历史记录</Typography><div className="health-fact-list" data-muted="true">{removedFacts.map((fact) => <button className="health-fact-row" key={fact.id} onClick={() => navigate(`/health-profile/facts/${fact.id}`)} type="button"><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong>{fact.title}</strong><span className="health-fact-status" data-status="removed">已移除</span></span><small>来源关系仍保留</small></span><ChevronRight size={18} /></button>)}</div></section>}
      </>}
    </div>
  </main>
}
