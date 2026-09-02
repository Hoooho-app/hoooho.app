import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  addOpsFeedbackMessage,
  getOpsFeedback,
  listOpsFeedback,
  opsFeedbackCategories,
  opsFeedbackCategoryLabel,
  updateOpsFeedback,
  type FeedbackMessage,
  type FeedbackPriority,
  type FeedbackStatus,
  type OpsFeedbackOverview,
  type OpsFeedbackRecord,
} from '../../services/feedback'
import { useAppStore } from '../../store/useAppStore'
import { OpsAccount } from '../../components/auth/OpsAccount'
import './ops.css'
import './ops-feedback.css'

type QueueStatus = '' | 'received' | 'unread' | 'reviewing' | 'planned' | 'in_progress' | 'improved' | 'not_planned'
type Filters = {
  search: string
  status: QueueStatus
  category: string
  sourcePath: string
  appVersion: string
  deviceType: string
  from: string
  to: string
  hasAttachments: string
  hasSupplements: string
  duplicate: string
}

const initialFilters: Filters = { search: '', status: '', category: '', sourcePath: '', appVersion: '', deviceType: '', from: '', to: '', hasAttachments: '', hasSupplements: '', duplicate: '' }
const queueStatuses: { value: QueueStatus; label: string }[] = [
  { value: '', label: '全部' }, { value: 'received', label: '新反馈' }, { value: 'unread', label: '新回复' }, { value: 'reviewing', label: '待处理' },
  { value: 'planned', label: '评估中' }, { value: 'in_progress', label: '改进中' }, { value: 'improved', label: '已采纳' }, { value: 'not_planned', label: '不采纳' },
]
const opsStatusLabels: Record<FeedbackStatus, string> = { received: '新反馈', reviewing: '待处理', needs_more_info: '待用户补充', planned: '评估中', in_progress: '改进中', improved: '已采纳', not_planned: '不采纳', merged: '已合并' }
const processingStatuses: [FeedbackStatus, string][] = [['reviewing', '待处理'], ['planned', '评估中'], ['in_progress', '改进中'], ['improved', '已采纳'], ['not_planned', '不采纳'], ['merged', '已合并']]
const priorityLabels: Record<FeedbackPriority, string> = { low: '低', normal: '普通', high: '高', urgent: '紧急' }
const advancedKeys: (keyof Filters)[] = ['sourcePath', 'appVersion', 'deviceType', 'from', 'to', 'hasAttachments', 'hasSupplements', 'duplicate']
const time = (value: string | null | undefined) => value ? new Date(value).toLocaleString('zh-CN') : '—'
const compactTime = (value: string) => new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
const messageLabel = (kind: FeedbackMessage['kind']) => kind === 'internal-note' ? '内部备注 · 仅内部可见' : kind === 'user-reply' ? '管理员回复 · 用户可见' : '用户补充'
const latestSupplementAt = (item: OpsFeedbackRecord) => [...(item.messages ?? [])].reverse().find((message) => message.kind === 'user-supplement')?.createdAt ?? null

export function OpsFeedbackPage() {
  const token = useAppStore((state) => state.opsAuthToken)!
  const [records, setRecords] = useState<OpsFeedbackRecord[]>([])
  const [overview, setOverview] = useState<OpsFeedbackOverview | null>(null)
  const [selected, setSelected] = useState<OpsFeedbackRecord | null>(null)
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [dataError, setDataError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [processingOpen, setProcessingOpen] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const query = useMemo(() => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (!value || key === 'status') return
      params.set(key, value)
    })
    if (filters.status === 'unread') params.set('unreadSupplement', 'true')
    else if (filters.status) params.set('status', filters.status)
    return params.toString()
  }, [filters])
  const advancedCount = advancedKeys.filter((key) => filters[key]).length
  const hasAnyFilter = Object.values(filters).some(Boolean)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setDataError('')
    listOpsFeedback(token, new URLSearchParams(query), controller.signal)
      .then((data) => { setRecords(data.feedback); setOverview(data.overview) })
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === 'AbortError') return
        setRecords([])
        setOverview(null)
        setSelected(null)
        setDataError(cause instanceof Error ? cause.message : '反馈数据读取失败')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [query, reloadKey, token])

  const refreshList = async () => {
    try {
      const data = await listOpsFeedback(token, new URLSearchParams(query))
      setRecords(data.feedback)
      setOverview(data.overview)
      setDataError('')
    } catch (cause) {
      setRecords([])
      setOverview(null)
      setSelected(null)
      setDataError(cause instanceof Error ? cause.message : '反馈列表刷新失败')
    }
  }

  const openFeedback = async (id: string) => {
    setDetailLoading(true)
    setDetailError('')
    setProcessingOpen(false)
    try {
      const detail = await getOpsFeedback(token, id)
      const next = detail.status === 'received' ? await updateOpsFeedback(token, id, { status: 'reviewing' }) : detail
      setSelected(next)
      await refreshList()
    } catch (cause) {
      setDetailError(cause instanceof Error ? cause.message : '反馈详情读取失败')
    } finally {
      setDetailLoading(false)
    }
  }

  const handleRecordChange = (item: OpsFeedbackRecord) => {
    setSelected(item)
    void refreshList()
  }

  const applySummaryFilter = (status: QueueStatus) => setFilters((current) => ({ ...current, status }))

  return <main className="ops-page ops-feedback-page">
    <header className="ops-topbar ops-feedback-topbar">
      <div><Link to="/ops">← Operations &amp; Billing</Link><h1>Feedback（反馈管理）</h1><p>在一个工作台里查看反馈、回复用户并记录处理结论</p></div>
      <div className="ops-feedback-header-actions"><button className="ops-feedback-reload" type="button" onClick={() => setReloadKey((value) => value + 1)}>重新加载</button><OpsAccount /></div>
    </header>

    {dataError && <div className="ops-error" role="alert"><span>{dataError}</span><button type="button" onClick={() => setReloadKey((value) => value + 1)}>重新加载</button></div>}

    <section className="ops-feedback-summary" aria-label="反馈概览">
      <Summary label="新反馈" value={overview?.new} active={filters.status === 'received'} onClick={() => applySummaryFilter('received')} />
      <Summary label="新回复" value={overview?.unreadSupplements} active={filters.status === 'unread'} onClick={() => applySummaryFilter('unread')} />
      <Summary label="评估中" value={overview?.evaluating} active={filters.status === 'planned'} onClick={() => applySummaryFilter('planned')} />
      <Summary label="改进中" value={overview?.improving} active={filters.status === 'in_progress'} onClick={() => applySummaryFilter('in_progress')} />
      <Summary label="已采纳" value={overview?.resolved} active={filters.status === 'improved'} onClick={() => applySummaryFilter('improved')} />
      <span className="ops-feedback-summary-more">历史补充 {overview?.withSupplements ?? '—'} · 重复反馈 {overview?.duplicates ?? '—'}</span>
    </section>

    {dataError ? <section className="ops-feedback-unavailable">
      <h2>暂时无法读取反馈</h2><p>登录可能已过期，或反馈服务暂时不可用。重新加载后再试。</p><button type="button" onClick={() => setReloadKey((value) => value + 1)}>重新加载</button>
    </section> : <section className="ops-feedback-workbench">
      <aside className="ops-feedback-queue" aria-label="反馈队列">
        <div className="ops-feedback-queue-controls">
          <label className="ops-feedback-search"><span className="sr-only">搜索反馈</span><input type="search" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="搜索摘要、正文、用户 ID、来源页面" /></label>
          <div className="ops-feedback-status-filter" aria-label="状态筛选">{queueStatuses.map((option) => <button type="button" key={option.value || 'all'} aria-pressed={filters.status === option.value} onClick={() => setFilters((current) => ({ ...current, status: option.value }))}>{option.label}</button>)}</div>
          <label className="ops-feedback-field"><span>类型</span><select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}><option value="">全部类型</option>{opsFeedbackCategories.map((category) => <option value={category} key={category}>{category}</option>)}</select></label>
          <div className="ops-feedback-filter-actions"><button type="button" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((value) => !value)}>更多筛选{advancedCount ? ` · ${advancedCount}` : ''}</button>{hasAnyFilter && <button type="button" onClick={() => setFilters(initialFilters)}>清除筛选</button>}</div>
          {advancedOpen && <div className="ops-feedback-advanced">
            <label className="ops-feedback-field"><span>来源页面</span><input value={filters.sourcePath} onChange={(event) => setFilters((current) => ({ ...current, sourcePath: event.target.value }))} /></label>
            <label className="ops-feedback-field"><span>产品版本</span><input value={filters.appVersion} onChange={(event) => setFilters((current) => ({ ...current, appVersion: event.target.value }))} /></label>
            <label className="ops-feedback-field"><span>设备</span><select value={filters.deviceType} onChange={(event) => setFilters((current) => ({ ...current, deviceType: event.target.value }))}><option value="">全部设备</option><option value="mobile">手机</option><option value="desktop">电脑</option><option value="tablet">平板</option></select></label>
            <label className="ops-feedback-field"><span>开始日期</span><input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} /></label>
            <label className="ops-feedback-field"><span>结束日期</span><input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} /></label>
            <label className="ops-feedback-check"><input type="checkbox" checked={filters.hasAttachments === 'true'} onChange={(event) => setFilters((current) => ({ ...current, hasAttachments: event.target.checked ? 'true' : '' }))} />包含图片</label>
            <label className="ops-feedback-check"><input type="checkbox" checked={filters.hasSupplements === 'true'} onChange={(event) => setFilters((current) => ({ ...current, hasSupplements: event.target.checked ? 'true' : '' }))} />有用户补充</label>
            <label className="ops-feedback-check"><input type="checkbox" checked={filters.duplicate === 'true'} onChange={(event) => setFilters((current) => ({ ...current, duplicate: event.target.checked ? 'true' : '' }))} />重复反馈</label>
          </div>}
        </div>
        <div className="ops-feedback-queue-list" aria-busy={loading}>
          {loading ? <QueueSkeleton /> : records.length === 0 ? <div className="ops-feedback-empty"><h2>{hasAnyFilter ? '没有符合条件的反馈' : '还没有用户反馈'}</h2><p>{hasAnyFilter ? '尝试清除部分筛选条件。' : '用户提交的反馈会出现在这里。'}</p></div> : records.map((item) => <FeedbackQueueItem key={item.id} item={item} selected={selected?.id === item.id} onClick={() => void openFeedback(item.id)} />)}
        </div>
      </aside>

      <section className="ops-feedback-conversation" aria-label="反馈内容与对话">
        {detailLoading ? <div className="ops-feedback-detail-state">正在读取反馈详情…</div> : detailError ? <div className="ops-feedback-detail-state" role="alert"><strong>反馈详情读取失败</strong><span>{detailError}</span></div> : selected ? <ConversationPane item={selected} token={token} onChange={handleRecordChange} onOpenProcessing={() => setProcessingOpen(true)} /> : <div className="ops-feedback-detail-state"><strong>选择一条反馈开始处理</strong><span>反馈正文、附件和完整沟通记录会显示在这里。</span></div>}
      </section>

      {selected && <><button className="ops-feedback-processing-backdrop" data-open={processingOpen} type="button" aria-label="关闭处理面板" onClick={() => setProcessingOpen(false)} /><ProcessingPanel key={selected.id} item={selected} token={token} open={processingOpen} onClose={() => setProcessingOpen(false)} onChange={handleRecordChange} /></>}
      {!selected && <aside className="ops-feedback-processing ops-feedback-processing-empty" aria-label="处理面板"><strong>处理面板</strong><p>选择反馈后可设置处理结论、优先级与版本信息。</p></aside>}
    </section>}
  </main>
}

function Summary({ label, value, active, onClick }: { label: string; value: number | undefined; active: boolean; onClick: () => void }) {
  return <button type="button" aria-pressed={active} onClick={onClick}><span>{label}</span><strong>{value ?? '—'}</strong></button>
}

function FeedbackQueueItem({ item, selected, onClick }: { item: OpsFeedbackRecord; selected: boolean; onClick: () => void }) {
  return <button className="ops-feedback-queue-item" type="button" data-selected={selected} onClick={onClick}>
    <span className="ops-feedback-queue-meta"><span>{opsFeedbackCategoryLabel(item.problemType ?? item.category)}</span><time>{compactTime(item.updatedAt)}</time></span>
    <strong>{item.summary}</strong>
    <span className="ops-feedback-preview">{item.description || '仅提交了图片附件'}</span>
    <span className="ops-feedback-queue-footer"><span>{item.accountId}</span><span>{opsStatusLabels[item.status]} · 优先级{priorityLabels[item.priority]}</span></span>
    <span className="ops-feedback-queue-signals">{item.attachmentCount > 0 && <span>附件 {item.attachmentCount}</span>}{item.hasUnreadSupplement && <b>用户新回复</b>}</span>
  </button>
}

function QueueSkeleton() {
  return <div className="ops-feedback-skeleton" aria-label="正在加载反馈">{[0, 1, 2, 3].map((item) => <span key={item}><i /><i /><i /></span>)}</div>
}

function ConversationPane({ item, token, onChange, onOpenProcessing }: { item: OpsFeedbackRecord; token: string; onChange: (item: OpsFeedbackRecord) => void; onOpenProcessing: () => void }) {
  const [messageKind, setMessageKind] = useState<'user-reply' | 'internal-note'>('user-reply')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const messages = useMemo(() => [...(item.messages ?? [])].sort((left, right) => left.createdAt.localeCompare(right.createdAt)), [item.messages])
  const initialAttachments = (item.attachments ?? []).filter((attachment) => !attachment.messageId)

  const send = async () => {
    if (!message.trim() || sending) return
    setSending(true)
    setError('')
    try {
      const next = await addOpsFeedbackMessage(token, item.id, { kind: messageKind, text: message.trim() })
      onChange(next)
      setMessage('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '发送失败')
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void send() }
  }

  return <div className="ops-feedback-conversation-inner">
    <header className="ops-feedback-detail-header"><div><span>{item.id}</span><h2>{item.summary}</h2><p>{opsStatusLabels[item.status]} · {opsFeedbackCategoryLabel(item.problemType ?? item.category)} · 提交于 {time(item.createdAt)}</p></div><button type="button" onClick={onOpenProcessing}>处理信息</button></header>
    <div className="ops-feedback-thread">
      <article className="ops-feedback-message" data-kind="original"><header><strong>用户最初反馈</strong><time>{time(item.createdAt)}</time></header><p>{item.description || '用户仅提交了图片附件。'}</p><AttachmentGrid attachments={initialAttachments} /></article>
      {messages.length === 0 ? <p className="ops-feedback-no-messages">暂无后续沟通</p> : messages.map((entry) => <article className="ops-feedback-message" data-kind={entry.kind} key={entry.id}><header><strong>{messageLabel(entry.kind)}</strong><time>{time(entry.createdAt)}</time></header><p>{entry.text || '补充了图片附件'}</p><AttachmentGrid attachments={(item.attachments ?? []).filter((attachment) => attachment.messageId === entry.id)} /></article>)}
    </div>
    <div className="ops-feedback-composer">
      <div className="ops-feedback-composer-tabs" role="tablist" aria-label="内容可见范围"><button type="button" role="tab" aria-selected={messageKind === 'user-reply'} onClick={() => setMessageKind('user-reply')}>回复用户</button><button type="button" role="tab" aria-selected={messageKind === 'internal-note'} onClick={() => setMessageKind('internal-note')}>内部备注</button></div>
      <p>{messageKind === 'user-reply' ? '发送后用户可以看到这段内容。' : '仅 Operations 管理员可见，用户不会看到。'}</p>
      <textarea value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={handleKeyDown} placeholder={messageKind === 'user-reply' ? '写下给用户的回复…' : '记录内部判断、排查线索或后续安排…'} />
      <div><span>Ctrl / ⌘ + Enter 发送</span><button type="button" disabled={sending || !message.trim()} onClick={() => void send()}>{sending ? '发送中…' : messageKind === 'user-reply' ? '发送回复' : '添加备注'}</button></div>
      {error && <p className="ops-feedback-inline-error" role="alert">{error}</p>}
    </div>
  </div>
}

function AttachmentGrid({ attachments }: { attachments: NonNullable<OpsFeedbackRecord['attachments']> }) {
  if (!attachments.length) return null
  return <div className="ops-feedback-images">{attachments.map((attachment) => <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer"><img src={attachment.url} alt={attachment.name} /><span>{attachment.name}</span></a>)}</div>
}

function ProcessingPanel({ item, token, open, onClose, onChange }: { item: OpsFeedbackRecord; token: string; open: boolean; onClose: () => void; onChange: (item: OpsFeedbackRecord) => void }) {
  const [status, setStatus] = useState<FeedbackStatus>(item.status === 'received' ? 'reviewing' : item.status)
  const [priority, setPriority] = useState(item.priority)
  const [handledVersion, setHandledVersion] = useState(item.handledVersion ?? '')
  const [noActionReason, setNoActionReason] = useState(item.noActionReason ?? '')
  const [mergedIntoId, setMergedIntoId] = useState(item.mergedIntoId ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const availableStatuses = item.status === 'needs_more_info' ? ([['needs_more_info', '待用户补充（当前）'], ...processingStatuses] as [FeedbackStatus, string][]) : processingStatuses

  const save = async (event: FormEvent) => {
    event.preventDefault()
    const reason = noActionReason.trim(), mergeTarget = mergedIntoId.trim()
    if (status === 'not_planned' && !reason) { setError('选择“不采纳”时必须填写用户可见的不采纳原因。'); return }
    if (status === 'merged' && !mergeTarget) { setError('选择“已合并”时必须填写目标反馈 ID。'); return }
    setSaving(true)
    setError('')
    try {
      const next = await updateOpsFeedback(token, item.id, { status, priority, handledVersion: handledVersion.trim(), noActionReason: reason, mergedIntoId: mergeTarget })
      onChange(next)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return <aside className="ops-feedback-processing" data-open={open} aria-label="处理面板">
    <header><div><strong>处理面板</strong><span>结论不会自动保存</span></div><button type="button" onClick={onClose}>关闭</button></header>
    <form onSubmit={save}>
      <section><h3>处理结论</h3><div className="ops-feedback-quick-actions"><button type="button" aria-pressed={status === 'improved'} onClick={() => setStatus('improved')}>采纳</button><button type="button" aria-pressed={status === 'not_planned'} onClick={() => setStatus('not_planned')}>不采纳</button></div><label className="ops-feedback-field"><span>状态</span><select value={status} onChange={(event) => setStatus(event.target.value as FeedbackStatus)}>{availableStatuses.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></section>
      <section><h3>处理信息</h3><label className="ops-feedback-field"><span>内部优先级</span><select value={priority} onChange={(event) => setPriority(event.target.value as FeedbackPriority)}>{Object.entries(priorityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="ops-feedback-field"><span>关联上线版本</span><input value={handledVersion} onChange={(event) => setHandledVersion(event.target.value)} placeholder="例如 1.8.0" /></label>{status === 'merged' && <label className="ops-feedback-field"><span>合并到反馈 ID</span><input value={mergedIntoId} onChange={(event) => setMergedIntoId(event.target.value)} /></label>}{status === 'not_planned' && <label className="ops-feedback-field"><span>不采纳原因 · 仅内部</span><textarea value={noActionReason} onChange={(event) => setNoActionReason(event.target.value)} placeholder="记录内部处理原因" /></label>}</section>
      <section className="ops-feedback-context"><h3>用户和环境信息</h3><dl><dt>用户 ID</dt><dd>{item.accountId}</dd><dt>来源页面</dt><dd>{item.sourcePath ?? '—'}</dd><dt>来源名称</dt><dd>{item.sourceName ?? '—'}</dd><dt>产品版本</dt><dd>{item.appVersion ?? '—'}</dd><dt>设备类型</dt><dd>{item.device.type || '—'}</dd><dt>操作系统</dt><dd>{item.device.os ?? '—'}</dd><dt>浏览器</dt><dd>{item.device.browser ?? '—'}</dd><dt>屏幕尺寸</dt><dd>{item.device.screen ?? '—'}</dd><dt>提交时间</dt><dd>{time(item.createdAt)}</dd><dt>最后补充</dt><dd>{time(latestSupplementAt(item))}</dd></dl></section>
      {error && <p className="ops-feedback-inline-error" role="alert">{error}</p>}
      <footer><button type="submit" disabled={saving}>{saving ? '保存中…' : '保存处理结果'}</button></footer>
    </form>
  </aside>
}
