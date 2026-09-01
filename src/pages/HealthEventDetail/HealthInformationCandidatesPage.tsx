import { useMemo, useState } from 'react'
import { BookmarkCheck, ChevronRight, FileClock } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { WebPageHeader } from '../../components/common'
import { BottomSheetSurface, EmptyState, HealthCard, HealthTag, HohoButton, StatusNotice } from '../../components/design-system'
import { candidateCategoryLabel, destinationOptions, sourceRecordPath } from '../../features/health-information/candidatePresentation'
import { useHealthInformationCandidates } from '../../hooks/useHealthInformationCandidates'
import type { HealthInformationCandidateApiDto, HealthProfileDestination } from '../../types'

const statusLabel = { pending: '待确认', confirmed: '已加入健康档案', dismissed: '暂不处理' } as const
const statusTone = { pending: 'warning', confirmed: 'success', dismissed: 'neutral' } as const

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
}

export function HealthInformationCandidatesPage() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const { error, items, loading, update } = useHealthInformationCandidates(eventId)
  const [selection, setSelection] = useState<HealthInformationCandidateApiDto | null>(null)
  const [destination, setDestination] = useState<HealthProfileDestination | ''>('')
  const [note, setNote] = useState('')
  const [busyId, setBusyId] = useState('')
  const [actionError, setActionError] = useState('')
  const sorted = useMemo(() => [...items].sort((left, right) => (
    Number(left.status !== 'pending') - Number(right.status !== 'pending') || right.createdAt.localeCompare(left.createdAt)
  )), [items])

  const openConfirm = (candidate: HealthInformationCandidateApiDto) => {
    setSelection(candidate)
    setDestination(destinationOptions[candidate.category][0].value)
    setNote('')
    setActionError('')
  }

  const confirm = async () => {
    if (!selection || !destination || !eventId) return
    setBusyId(selection.id)
    setActionError('')
    try {
      await update(selection.id, { status: 'confirmed', destinationProfileSection: destination, note })
      setSelection(null)
      navigate(`/health-events/${encodeURIComponent(eventId)}`, { replace: true })
    } catch (confirmError) {
      setActionError(confirmError instanceof Error ? confirmError.message : '暂时无法加入，请稍后重试')
    } finally { setBusyId('') }
  }

  return (
    <main className="app-shell health-information-page pb-0">
      <WebPageHeader fallback={eventId ? `/health-events/${encodeURIComponent(eventId)}` : '/health-events'} title="待确认健康信息" />
      <div className="page-content health-information-page__content">
        <p className="health-information-intro">这里汇总本次事件中可能值得长期保存的信息。只有你确认后，才会加入健康档案。</p>
        {error && <StatusNotice title="健康信息暂时无法加载" tone="error">{error}</StatusNotice>}
        {actionError && !selection && <StatusNotice title="操作未完成" tone="error">{actionError}</StatusNotice>}
        {loading && <HealthCard><p className="hoho-text-body text-text-secondary">正在整理可确认的信息…</p></HealthCard>}
        {!loading && !error && !sorted.length && <EmptyState icon={<BookmarkCheck size={25} />} title="暂未发现需要确认的信息" description="症状记录仍会按原样保留；以后出现可长期保存的信息时，会在这里提醒。" />}
        <div className="health-information-list">
          {sorted.map((candidate) => <HealthCard className="health-information-candidate" key={candidate.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><h2 className="hoho-text-card-title">{candidate.title}</h2><p className="hoho-text-caption mt-1">{candidateCategoryLabel[candidate.category]}</p></div>
              <HealthTag tone={statusTone[candidate.status]}>{statusLabel[candidate.status]}</HealthTag>
            </div>
            {candidate.relatedCandidateId && <p className="health-information-related">发现已有相关健康信息，请由你决定是否继续加入。</p>}
            <dl className="health-information-source-summary">
              <div><dt>来源</dt><dd>{formatDate(candidate.firstDiscoveredAt)} {candidate.sourceEvent.title || '健康事件'}</dd></div>
              <div><dt>发现原因</dt><dd>{candidate.description}</dd></div>
            </dl>
            {candidate.sourceRecords[0] && <blockquote>“{candidate.sourceRecords[0].content}”</blockquote>}
            <div className="health-information-candidate__actions">
              <Link className="health-information-source-link" to={sourceRecordPath(candidate)}><FileClock aria-hidden="true" size={16} />查看来源<ChevronRight aria-hidden="true" size={16} /></Link>
              {candidate.status === 'pending' && <>
                <HohoButton disabled={busyId === candidate.id} onClick={() => openConfirm(candidate)} size="small">加入健康档案</HohoButton>
                <HohoButton disabled={busyId === candidate.id} onClick={async () => { setBusyId(candidate.id); setActionError(''); try { await update(candidate.id, { status: 'dismissed' }) } catch (dismissError) { setActionError(dismissError instanceof Error ? dismissError.message : '暂时无法处理，请稍后重试') } finally { setBusyId('') } }} size="small" variant="text">暂不处理</HohoButton>
              </>}
            </div>
          </HealthCard>)}
        </div>
      </div>

      <BottomSheetSurface
        footer={<HohoButton disabled={!destination} fullWidth loading={Boolean(selection && busyId === selection.id)} onClick={confirm}>确认加入</HohoButton>}
        label="加入健康档案"
        onClose={() => setSelection(null)}
        open={Boolean(selection)}
        title="加入健康档案"
      >
        {selection && <div className="health-information-confirm">
          <div><span className="hoho-text-caption">你正在添加</span><strong className="hoho-text-card-title mt-1 block">{selection.title}</strong></div>
          <fieldset><legend className="hoho-text-label">归档位置</legend><div className="mt-2 grid gap-2">{destinationOptions[selection.category].map((option) => <label className="health-information-destination" key={option.value}><input checked={destination === option.value} name="destination" onChange={() => setDestination(option.value)} type="radio" /><span>{option.label}</span></label>)}</div></fieldset>
          <div><span className="hoho-text-label">首次发现时间</span><p className="hoho-text-body mt-1">{formatDate(selection.firstDiscoveredAt)}</p></div>
          <label className="hoho-field"><span className="hoho-text-label">备注（可选）</span><textarea className="hoho-textarea" maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="补充你希望长期保留的信息" rows={3} value={note} /></label>
          {actionError && <p className="text-sm text-danger" role="alert">{actionError}</p>}
        </div>}
      </BottomSheetSurface>
    </main>
  )
}
