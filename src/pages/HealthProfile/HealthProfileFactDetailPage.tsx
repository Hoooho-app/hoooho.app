import { useEffect, useState } from 'react'
import { ExternalLink, Link2, Pencil } from 'lucide-react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { WebPageHeader } from '../../components/common'
import { HealthProfileActionBar } from '../../components/health'
import { HohoButton, StatusNotice, Typography } from '../../components/design-system'
import { healthProfileFactService } from '../../services/healthProfileFacts'
import { useAppStore } from '../../store/useAppStore'
import { useCurrentMember } from '../../hooks/useCurrentMember'
import type { HealthProfileFactApiDto, HealthProfileFactCategory, HealthProfileFactStatus } from '../../types'
import { formatHealthFactDate, healthProfileFactCategoryLabels, healthProfileFactStatusLabels, toDateInputValue } from './healthProfileFactPresentation'

export function HealthProfileFactDetailPage() {
  const { factId } = useParams()
  const token = useAppStore((state) => state.authToken)
  const member = useCurrentMember()
  const navigate = useNavigate()
  const [fact, setFact] = useState<HealthProfileFactApiDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<HealthProfileFactCategory>('important')
  const [status, setStatus] = useState<HealthProfileFactStatus>('pending')
  const [firstObservedAt, setFirstObservedAt] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!factId || !token) return
    const controller = new AbortController()
    setLoading(true)
    healthProfileFactService.get(factId, token, controller.signal).then((loaded) => {
      if (loaded.memberId !== member.id) { setError('这条健康事实不属于当前人物'); return }
      setFact(loaded); setTitle(loaded.title); setCategory(loaded.category); setStatus(loaded.status); setFirstObservedAt(toDateInputValue(loaded.firstObservedAt)); setNotes(loaded.notes); setError('')
    }).catch((caught) => { if (!(caught instanceof DOMException && caught.name === 'AbortError')) setError(caught instanceof Error ? caught.message : '事实详情加载失败') }).finally(() => setLoading(false))
    return () => controller.abort()
  }, [factId, member.id, token])

  if (!factId || !token) return <Navigate replace to="/health-profile/facts" />
  const save = async () => {
    setSaving(true); setError('')
    try {
      const updated = await healthProfileFactService.update(factId, { title, category, status, firstObservedAt, notes }, token)
      setFact(updated); setEditing(false)
    } catch (caught) { setError(caught instanceof Error ? caught.message : '保存失败') } finally { setSaving(false) }
  }
  const cancel = () => {
    if (!fact) return
    setTitle(fact.title); setCategory(fact.category); setStatus(fact.status); setFirstObservedAt(toDateInputValue(fact.firstObservedAt)); setNotes(fact.notes); setEditing(false); setError('')
  }

  return <main className="app-shell health-profile-detail-shell">
    <WebPageHeader action={fact && !editing ? <HohoButton aria-label="编辑健康事实" onClick={() => setEditing(true)} size="icon" variant="ghost"><Pencil size={19} /></HohoButton> : undefined} fallback="/health-profile/facts" title="健康事实详情" />
    <div className="page-content health-profile-page-content">
      {loading && <Typography variant="caption">正在加载健康事实…</Typography>}
      {!loading && error && !fact && <StatusNotice title="加载失败" tone="error">{error}</StatusNotice>}
      {fact && !editing && <>
        <section className="health-fact-detail-heading"><span className="health-fact-status" data-status={fact.status}>{healthProfileFactStatusLabels[fact.status]}</span><Typography className="mt-3" variant="pageTitle">{fact.title}</Typography>{fact.description && <Typography className="mt-2" variant="caption">{fact.description}</Typography>}</section>
        <dl className="health-fact-meta mt-6"><div><dt>分类</dt><dd>{healthProfileFactCategoryLabels[fact.category]}</dd></div><div><dt>首次发现</dt><dd>{formatHealthFactDate(fact.firstObservedAt)}</dd></div><div><dt>最近更新</dt><dd>{formatHealthFactDate(fact.updatedAt)}</dd></div><div><dt>当前状态</dt><dd>{healthProfileFactStatusLabels[fact.status]}</dd></div>{fact.notes && <div><dt>备注</dt><dd>{fact.notes}</dd></div>}</dl>
        <section className="mt-7 grid gap-3"><div className="flex items-center justify-between"><Typography variant="sectionTitle">相关来源</Typography><Typography variant="caption">{fact.sources.length} 次健康事件记录</Typography></div><div className="health-fact-source-list">{fact.sources.map((source) => <button className="health-fact-source-row" key={`${source.organizationId}:${source.sourceFactId}`} onClick={() => navigate(`/health-events/${source.eventId}?recordId=${encodeURIComponent(source.recordId)}`)} type="button"><Link2 size={18} /><span className="min-w-0 flex-1"><strong>{formatHealthFactDate(source.recordOccurredAt)} · {source.eventTitle}</strong><small>“{source.originalText}”</small></span><ExternalLink size={17} /></button>)}</div><Typography variant="caption">来源由原始健康事件保留，不能在这里修改或删除。</Typography></section>
      </>}
      {fact && editing && <form className="health-fact-form" id="health-fact-edit-form" onSubmit={(event) => { event.preventDefault(); void save() }}>
        <Typography variant="sectionTitle">编辑长期健康事实</Typography>
        <label><span>名称</span><input className="hoho-input" maxLength={120} onChange={(event) => setTitle(event.target.value)} value={title} /></label>
        <label><span>分类</span><select className="hoho-select" onChange={(event) => setCategory(event.target.value as HealthProfileFactCategory)} value={category}>{Object.entries(healthProfileFactCategoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>状态</span><select className="hoho-select" onChange={(event) => setStatus(event.target.value as HealthProfileFactStatus)} value={status}>{Object.entries(healthProfileFactStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>首次发现时间</span><input className="hoho-input" onChange={(event) => setFirstObservedAt(event.target.value)} type="date" value={firstObservedAt} /></label>
        <label><span>备注</span><textarea className="hoho-input min-h-28 resize-none" maxLength={1000} onChange={(event) => setNotes(event.target.value)} value={notes} /></label>
        <section className="health-fact-provenance"><Link2 size={18} /><div><strong>来源不可修改</strong><p>已永久保留 {fact.sources.length} 条原始健康事件记录。</p></div></section>
        {error && <StatusNotice title="保存失败" tone="error">{error}</StatusNotice>}
      </form>}
    </div>
    {fact && editing && <HealthProfileActionBar split><HohoButton fullWidth onClick={cancel} variant="secondary">取消</HohoButton><HohoButton fullWidth form="health-fact-edit-form" loading={saving} type="submit">保存修改</HohoButton></HealthProfileActionBar>}
  </main>
}
