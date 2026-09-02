import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Check, LoaderCircle } from 'lucide-react'
import { Button, WebPageHeader } from '../../components/common'
import { MainAppHeader } from '../../components/navigation'
import { appVersion, collectFeedbackDevice } from '../../features/feedback/environment'
import { revokeFeedbackImages, type PendingFeedbackImage } from '../../features/feedback/imageProcessing'
import { resolveFeedbackSource, type FeedbackSource } from '../../features/feedback/navigation'
import { addFeedbackMessage, feedbackCategoryOptions, feedbackStatusLabels, getMyFeedback, listMyFeedback, markFeedbackRead, submitFeedback, type FeedbackProblemType, type FeedbackRecord } from '../../services/feedback'
import { useAppStore } from '../../store/useAppStore'
import { FeedbackComposer } from './FeedbackComposer'
import { MyFeedbackCard } from './MyFeedbackCard'

const sourceStorageKey = 'hoooho-feedback-source'
const categoryFromQuery = (value: string | null): FeedbackProblemType | null => feedbackCategoryOptions.find((item) => item.value === value || item.label === value)?.value ?? null
const readPersistedSource = () => { try { return JSON.parse(sessionStorage.getItem(sourceStorageKey) ?? 'null') as FeedbackSource | null } catch { return null } }
const isReload = () => (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type === 'reload'
const formatTime = (value: string) => new Date(value).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })

export function FeedbackPage() {
  const token = useAppStore((state) => state.authToken), navigate = useNavigate(), location = useLocation(), [params] = useSearchParams()
  const source = useMemo(() => resolveFeedbackSource(location.state, readPersistedSource(), isReload()), [location.state])
  const [problemType, setProblemType] = useState<FeedbackProblemType | null>(() => categoryFromQuery(params.get('category'))), [description, setDescription] = useState(''), [images, setImages] = useState<PendingFeedbackImage[]>([])
  const [error, setError] = useState(''), [submitting, setSubmitting] = useState(false), submissionKey = useRef(crypto.randomUUID()), imagesRef = useRef(images)
  imagesRef.current = images
  useEffect(() => { sessionStorage.setItem(sourceStorageKey, JSON.stringify(source)); return () => revokeFeedbackImages(imagesRef.current) }, [source])
  const processing = images.some((image) => image.status === 'processing'), failed = images.some((image) => image.status === 'failed'), canSubmit = Boolean(description.trim() || images.some((image) => image.status === 'ready')) && !processing && !failed && !submitting
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!token || !canSubmit) return
    setSubmitting(true); setError('')
    try {
      await submitFeedback(token, { category: problemType, problemPage: null, problemType, description: description.trim(), sourcePath: source.path, sourceName: source.name, appVersion, idempotencyKey: submissionKey.current, device: collectFeedbackDevice(), attachments: images.filter((image) => image.status === 'ready' && image.dataUrl).map((image) => ({ name: image.name, type: image.type, dataUrl: image.dataUrl! })) })
      sessionStorage.removeItem(sourceStorageKey)
      navigate('/feedback/mine', { replace: true, state: { feedbackReceived: true } })
    } catch (cause) { setError(cause instanceof Error ? cause.message : '提交失败，请检查网络后重试。你的文字和图片仍保留在这里。') }
    finally { setSubmitting(false) }
  }
  return <main className="app-shell feedback-page pb-0"><MainAppHeader compact title="反馈意见" action={<button className="feedback-header-action" type="button" onClick={() => navigate('/feedback/mine')}>我的反馈</button>} />
    <form onSubmit={submit} className="feedback-form">
      <fieldset className="feedback-categories"><legend>问题类型</legend><div>{feedbackCategoryOptions.map((item) => <button type="button" key={item.value} aria-pressed={problemType === item.value} onClick={() => setProblemType((value) => value === item.value ? null : item.value)}>{item.label}</button>)}</div></fieldset>
      <FeedbackComposer text={description} onTextChange={setDescription} images={images} onImagesChange={setImages} submitAction={<button className="feedback-check-submit" type="submit" aria-label="确认提交反馈" disabled={!canSubmit}>{submitting ? <LoaderCircle className="animate-spin"/> : <Check/>}</button>}/>
      {error && <p className="feedback-error" role="alert">{error}</p>}
    </form></main>
}

export function FeedbackSubmittedPage() {
  const location = useLocation(), navigate = useNavigate(), data = location.state as { id?: string; createdAt?: string; source?: FeedbackSource } | null
  const source = data?.source && data.source.path ? data.source : { path: '/settings', name: '我的' }
  return <main className="app-shell feedback-page pb-0"><WebPageHeader title="反馈意见" fallback="/feedback/mine"/><section className="feedback-success"><h2>谢谢，你让 Hoooho 更好了一点</h2>{data?.id ? <><p>我们已经收到，会在这里更新处理进度。</p><small>反馈编号：{data.id}</small><Button fullWidth type="button" onClick={() => navigate(`/feedback/${data.id}`, { replace: true })}>查看处理进度</Button></> : <p>无法确认本次反馈已经保存，请返回后重新提交。</p>}<button type="button" onClick={() => navigate(source.path, { replace: true })}>继续使用 Hoooho</button></section></main>
}

export function MyFeedbackPage() {
  const token = useAppStore((state) => state.authToken)!, location = useLocation(), [items, setItems] = useState<FeedbackRecord[]>([]), [details, setDetails] = useState<Record<string, FeedbackRecord>>({}), [expandedId, setExpandedId] = useState<string | null>(null), [loadingId, setLoadingId] = useState<string | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('')
  const feedbackReceived = Boolean((location.state as { feedbackReceived?: boolean } | null)?.feedbackReceived)
  useEffect(() => { const controller = new AbortController(); listMyFeedback(token, controller.signal).then(setItems).catch((cause) => { if (cause.name !== 'AbortError') setError(cause.message) }).finally(() => setLoading(false)); return () => controller.abort() }, [token])
  const improved = items.filter((item) => item.status === 'improved').length
  const updateRecord = (next: FeedbackRecord) => { setDetails((value) => ({ ...value, [next.id]: next })); setItems((value) => value.map((item) => item.id === next.id ? { ...item, ...next } : item)) }
  const toggle = async (item: FeedbackRecord) => {
    if (expandedId === item.id) { setExpandedId(null); return }
    setExpandedId(item.id); if (details[item.id]) return
    setLoadingId(item.id); setError('')
    try { const detail = await getMyFeedback(token, item.id); updateRecord(item.unreadReplyCount > 0 ? await markFeedbackRead(token, item.id) : detail) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '反馈详情读取失败'); setExpandedId(null) }
    finally { setLoadingId(null) }
  }
  return <main className="app-shell feedback-page my-feedback-page pb-0"><WebPageHeader title="我的反馈" fallback="/feedback" action={<Link className="feedback-header-action" to="/feedback">提反馈</Link>}/><div className="feedback-list-content">{feedbackReceived && <p className="feedback-received" role="status">反馈已收到</p>}<section className="my-feedback-stats"><p>你已帮助 Hoooho 提交了 <strong>{items.length}</strong> 个问题</p><p>其中 <strong>{improved}</strong> 个已经完成改进</p></section>{loading ? <p className="feedback-state">正在读取反馈记录…</p> : error && items.length === 0 ? <p className="feedback-error" role="alert">{error}</p> : items.length === 0 ? <section className="feedback-empty"><h2>还没有反馈记录</h2><p>发现哪里不好用，可以直接告诉我们。</p><Link to="/feedback">提交反馈</Link></section> : <div className="my-feedback-list">{error && <p className="feedback-error" role="alert">{error}</p>}{items.map((item) => <MyFeedbackCard key={item.id} token={token} item={item} detail={details[item.id]} expanded={expandedId === item.id} loading={loadingId === item.id} onToggle={() => void toggle(item)} onUpdated={updateRecord}/>)}</div>}</div></main>
}

export function FeedbackDetailPage() {
  const { feedbackId = '' } = useParams(), token = useAppStore((state) => state.authToken)!, [item, setItem] = useState<FeedbackRecord | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [text, setText] = useState(''), [images, setImages] = useState<PendingFeedbackImage[]>([]), [submitting, setSubmitting] = useState(false)
  const imagesRef = useRef(images); imagesRef.current = images
  useEffect(() => { const controller = new AbortController(); getMyFeedback(token, feedbackId, controller.signal).then(setItem).catch((cause) => { if (cause.name !== 'AbortError') setError(cause.message) }).finally(() => setLoading(false)); return () => { controller.abort(); revokeFeedbackImages(imagesRef.current) } }, [feedbackId, token])
  const send = async () => { if (!item || submitting || (!text.trim() && !images.some((image) => image.status === 'ready')) || images.some((image) => image.status !== 'ready')) return; setSubmitting(true); setError(''); try { const next = await addFeedbackMessage(token, item.id, { text: text.trim(), attachments: images.map((image) => ({ name: image.name, type: image.type, dataUrl: image.dataUrl! })) }); revokeFeedbackImages(images); setImages([]); setText(''); setItem(next) } catch (cause) { setError(cause instanceof Error ? cause.message : '补充失败，内容仍保留在这里。') } finally { setSubmitting(false) } }
  return <main className="app-shell feedback-page pb-0"><WebPageHeader title="反馈详情" fallback="/feedback/mine"/><div className="feedback-detail-content">{loading ? <p className="feedback-state">正在读取反馈…</p> : error && !item ? <p className="feedback-error" role="alert">{error}</p> : item && <><header className="feedback-detail-title"><span>{feedbackStatusLabels[item.status]}</span><h2>{item.summary}</h2><p>{formatTime(item.createdAt)} · {item.sourceName ?? '直接提交'}</p></header><section><h3>原始反馈</h3>{item.description ? <p>{item.description}</p> : <p className="text-text-secondary">仅提交了图片</p>}<ImageList attachments={(item.attachments ?? []).filter((attachment) => !attachment.messageId)}/></section><section><h3>处理进度</h3><ol className="feedback-timeline">{(item.statusHistory ?? []).map((entry) => <li key={entry.id}><strong>{feedbackStatusLabels[entry.status]}</strong><span>{formatTime(entry.createdAt)}</span></li>)}</ol>{item.noActionReason && <p>暂不处理原因：{item.noActionReason}</p>}{item.handledVersion && <p>这项改进已在 Hoooho {item.handledVersion} 中上线。</p>}</section><section><h3>沟通记录</h3>{(item.messages ?? []).length === 0 ? <p className="text-text-secondary">暂时没有补充或回复。</p> : <div className="feedback-messages">{item.messages?.map((message) => <article key={message.id} data-kind={message.kind}><strong>{message.kind === 'user-reply' ? 'Hoooho 回复' : '你的补充'}</strong><p>{message.text}</p><span>{formatTime(message.createdAt)}</span><ImageList attachments={(item.attachments ?? []).filter((attachment) => attachment.messageId === message.id)}/></article>)}</div>}</section><section className="feedback-supplement"><h3>继续补充</h3><FeedbackComposer text={text} onTextChange={setText} images={images} onImagesChange={setImages} maxImages={Math.max(0, 10 - item.attachmentCount)}/>{error && <p className="feedback-error">{error}</p>}<Button fullWidth type="button" disabled={submitting || (!text.trim() && images.length === 0) || images.some((image) => image.status !== 'ready')} onClick={() => void send()}>{submitting ? '正在补充…' : '提交补充'}</Button></section></>}</div></main>
}

function ImageList({ attachments }: { attachments: NonNullable<FeedbackRecord['attachments']> }) { return attachments.length ? <div className="feedback-saved-images">{attachments.map((attachment) => <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer"><img alt={attachment.name} src={attachment.url}/></a>)}</div> : null }
