import { useMemo, useState } from 'react'
import { Link2 } from 'lucide-react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { WebPageHeader } from '../../components/common'
import { HealthProfileActionBar } from '../../components/health'
import { HohoButton, StatusNotice, Typography } from '../../components/design-system'
import { useCurrentMember } from '../../hooks/useCurrentMember'
import { useHealthProfileFacts } from '../../features/health-profile/hooks/useHealthProfileFacts'
import { healthProfileFactService } from '../../services/healthProfileFacts'
import type { HealthProfileFactCategory, HealthProfileFactStatus } from '../../types'
import { formatHealthFactDate, healthProfileFactCategoryLabels, healthProfileFactStatusLabels, toDateInputValue } from './healthProfileFactPresentation'

export function HealthProfileFactCandidatePage() {
  const { candidateId } = useParams()
  const member = useCurrentMember()
  const navigate = useNavigate()
  const { candidates, facts, message, status, token } = useHealthProfileFacts(member.id)
  const candidate = candidates.find((item) => item.id === candidateId)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<HealthProfileFactCategory | ''>('')
  const [factStatus, setFactStatus] = useState<HealthProfileFactStatus>('pending')
  const [firstObservedAt, setFirstObservedAt] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const similarFacts = useMemo(() => candidate ? facts.filter((fact) => fact.status !== 'removed' && (fact.category === candidate.suggestedCategory || fact.title.includes(candidate.title) || candidate.title.includes(fact.title))) : [], [candidate, facts])

  if (status === 'error') return <main className="app-shell"><WebPageHeader fallback="/health-profile/facts" title="加入健康档案" /><div className="page-content"><StatusNotice title="加载失败" tone="error">{message}</StatusNotice></div></main>
  if (status === 'loading') return <main className="app-shell"><WebPageHeader fallback="/health-profile/facts" title="加入健康档案" /><div className="page-content"><Typography variant="caption">正在核对来源…</Typography></div></main>
  if (!candidate || !token) return <Navigate replace to="/health-profile/facts" />

  const resolvedTitle = title || candidate.title
  const resolvedCategory = category || candidate.suggestedCategory
  const resolvedDate = firstObservedAt || toDateInputValue(candidate.firstObservedAt)
  const save = async () => {
    setSaving(true); setError('')
    try {
      const saved = await healthProfileFactService.create({ memberId: member.id, title: resolvedTitle, category: resolvedCategory, status: factStatus, firstObservedAt: resolvedDate, notes, source: { organizationId: candidate.source.organizationId, sourceFactId: candidate.source.sourceFactId } }, token)
      navigate(`/health-profile/facts/${saved.id}`, { replace: true })
    } catch (caught) { setError(caught instanceof Error ? caught.message : '加入健康档案失败') } finally { setSaving(false) }
  }
  const linkTo = async (factId: string) => {
    setSaving(true); setError('')
    try {
      await healthProfileFactService.addSource(factId, { organizationId: candidate.source.organizationId, sourceFactId: candidate.source.sourceFactId }, token)
      navigate(`/health-profile/facts/${factId}`, { replace: true })
    } catch (caught) { setError(caught instanceof Error ? caught.message : '关联来源失败') } finally { setSaving(false) }
  }

  return <main className="app-shell health-profile-detail-shell">
    <WebPageHeader fallback="/health-profile/facts" title="加入健康档案" />
    <div className="page-content health-profile-page-content">
      <section className="health-fact-source-card"><Typography variant="label">候选健康信息</Typography><Typography className="mt-2" variant="sectionTitle">{candidate.title}</Typography><Typography className="mt-2" variant="caption">系统只发现了可长期保留的记录；由你决定是否加入以及保存到哪里。</Typography></section>
      <section className="mt-6 grid gap-4" aria-label="来源说明"><Typography variant="sectionTitle">来源说明</Typography><div className="health-fact-provenance"><Link2 size={18} /><div><strong>{formatHealthFactDate(candidate.source.recordOccurredAt)} · {candidate.source.eventTitle}</strong><p>原始记录：“{candidate.source.originalText}”</p></div></div></section>
      {similarFacts.length > 0 && <section className="mt-6"><StatusNotice title="发现相关记录" tone="warning">已有类似健康信息。你可以关联为同一事实，也可以继续单独保存。</StatusNotice><div className="health-fact-list mt-2">{similarFacts.map((fact) => <button className="health-fact-related-row" disabled={saving} key={fact.id} onClick={() => void linkTo(fact.id)} type="button"><span><strong>{fact.title}</strong><small>{healthProfileFactCategoryLabels[fact.category]}</small></span><span>关联来源</span></button>)}</div></section>}
      <form className="health-fact-form mt-6" id="health-fact-candidate-form" onSubmit={(event) => { event.preventDefault(); void save() }}>
        <Typography variant="sectionTitle">填写信息</Typography>
        <label><span>名称</span><input className="hoho-input" maxLength={120} onChange={(event) => setTitle(event.target.value)} value={resolvedTitle} /></label>
        <label><span>保存到</span><select className="hoho-select" onChange={(event) => setCategory(event.target.value as HealthProfileFactCategory)} value={resolvedCategory}>{Object.entries(healthProfileFactCategoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>当前状态</span><select className="hoho-select" onChange={(event) => setFactStatus(event.target.value as HealthProfileFactStatus)} value={factStatus}>{Object.entries(healthProfileFactStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>首次发现时间</span><input className="hoho-input" onChange={(event) => setFirstObservedAt(event.target.value)} type="date" value={resolvedDate} /></label>
        <label><span>备注（可选）</span><textarea className="hoho-input min-h-24 resize-none" maxLength={1000} onChange={(event) => setNotes(event.target.value)} placeholder="如：诱因、表现、处理经过等" value={notes} /></label>
        {error && <StatusNotice title="暂时无法加入" tone="error">{error}</StatusNotice>}
      </form>
    </div>
    <HealthProfileActionBar><HohoButton fullWidth form="health-fact-candidate-form" loading={saving} type="submit">确认加入</HohoButton></HealthProfileActionBar>
  </main>
}
