import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button, WebPageHeader } from '../../components/common'
import { MainAppHeader } from '../../components/navigation'
import { appVersion, collectFeedbackDevice } from '../../features/feedback/environment'
import { revokeFeedbackImages, type PendingFeedbackImage } from '../../features/feedback/imageProcessing'
import { resolveFeedbackSource, type FeedbackSource } from '../../features/feedback/navigation'
import { addFeedbackMessage, feedbackCategories, feedbackStatusLabels, getMyFeedback, listMyFeedback, submitFeedback, type FeedbackCategory, type FeedbackRecord } from '../../services/feedback'
import { useAppStore } from '../../store/useAppStore'
import { FeedbackComposer } from './FeedbackComposer'

const sourceStorageKey = 'hoooho-feedback-source'
const categoryFromQuery = (value: string | null): FeedbackCategory | null => !value ? null : value.includes('隐私') || value.includes('数据') ? '隐私与数据' : value.includes('故障') || value.includes('错误') ? '出现错误' : value.includes('新增') ? '希望新增' : feedbackCategories.includes(value as FeedbackCategory) ? value as FeedbackCategory : '其他'
const readPersistedSource = () => { try { return JSON.parse(sessionStorage.getItem(sourceStorageKey) ?? 'null') as FeedbackSource | null } catch { return null } }
const isReload = () => (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type === 'reload'
const formatTime = (value: string) => new Date(value).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })

export function FeedbackPage() {
  const token = useAppStore((state) => state.authToken), navigate = useNavigate(), location = useLocation(), [params] = useSearchParams()
  const source = useMemo(() => resolveFeedbackSource(location.state, readPersistedSource(), isReload()), [location.state])
  const [category, setCategory] = useState<FeedbackCategory | null>(() => categoryFromQuery(params.get('category'))), [description, setDescription] = useState(''), [images, setImages] = useState<PendingFeedbackImage[]>([])
  const [error, setError] = useState(''), [submitting, setSubmitting] = useState(false), submissionKey = useRef(crypto.randomUUID()), imagesRef = useRef(images)
  imagesRef.current = images
  useEffect(() => { sessionStorage.setItem(sourceStorageKey, JSON.stringify(source)); return () => revokeFeedbackImages(imagesRef.current) }, [source])
  const processing = images.some((image) => image.status === 'processing'), failed = images.some((image) => image.status === 'failed'), canSubmit = Boolean(description.trim() || images.some((image) => image.status === 'ready')) && !processing && !failed && !submitting
  const goBack = () => { sessionStorage.removeItem(sourceStorageKey); navigate(source.path, { replace: true }); window.setTimeout(() => window.scrollTo({ top: source.scrollY ?? 0 }), 0) }
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!token || !canSubmit) return
    setSubmitting(true); setError('')
    try {
      const result = await submitFeedback(token, { category: category ?? '其他', description: description.trim(), sourcePath: source.path, sourceName: source.name, appVersion, idempotencyKey: submissionKey.current, device: collectFeedbackDevice(), attachments: images.filter((image) => image.status === 'ready' && image.dataUrl).map((image) => ({ name: image.name, type: image.type, dataUrl: image.dataUrl! })) })
      sessionStorage.removeItem(sourceStorageKey)
      navigate('/feedback/submitted', { replace: true, state: { id: result.id, createdAt: result.createdAt, source } })
    } catch (cause) { setError(cause instanceof Error ? cause.message : '提交失败，请检查网络后重试。你的文字和图片仍保留在这里。') }
    finally { setSubmitting(false) }
  }
  return <main className="app-shell feedback-page pb-0"><MainAppHeader compact title="反馈意见" action={<button className="feedback-header-action" type="button" onClick={() => navigate('/feedback/mine')}>我的反馈</button>} />
    <form onSubmit={submit} className="feedback-form"><div className="feedback-intro"><p>发现哪里不好用，直接说给我们听。</p><p>每条反馈都会进入改进清单，处理进度可以回来查看。</p></div>
      <fieldset className="feedback-categories"><legend>快捷分类（选填）</legend><div>{feedbackCategories.map((item) => <button type="button" key={item} aria-pressed={category === item} onClick={() => setCategory((value) => value === item ? null : item)}>{item}</button>)}</div></fieldset>
      <FeedbackComposer text={description} onTextChange={setDescription} images={images} onImagesChange={setImages}/>
      <p className="feedback-privacy">为了帮助定位问题，将同时提交当前页面、设备类型和版本信息，不包含你的健康记录内容。图片会在本机压缩并清除可读取的定位元数据，原始语音不会保存。</p>
      {error && <p className="feedback-error" role="alert">{error}</p>}
      <div className="feedback-submit-bar"><Button fullWidth type="submit" disabled={!canSubmit}>{submitting ? '正在提交…' : processing ? '图片处理中…' : failed ? '请处理失败的图片' : '提交反馈'}</Button><button type="button" className="feedback-cancel" onClick={goBack}>取消并返回{source.name}</button></div>
    </form></main>
}

export function FeedbackSubmittedPage() {
  const location = useLocation(), navigate = useNavigate(), data = location.state as { id?: string; createdAt?: string; source?: FeedbackSource } | null
  const source = data?.source && data.source.path ? data.source : { path: '/settings', name: '我的' }
  return <main className="app-shell feedback-page pb-0"><WebPageHeader title="反馈意见" fallback="/feedback/mine"/><section className="feedback-success"><h2>谢谢，你让 Hoooho 更好了一点</h2>{data?.id ? <><p>我们已经收到，会在这里更新处理进度。</p><small>反馈编号：{data.id}</small><Button fullWidth type="button" onClick={() => navigate(`/feedback/${data.id}`, { replace: true })}>查看处理进度</Button></> : <p>无法确认本次反馈已经保存，请返回后重新提交。</p>}<button type="button" onClick={() => navigate(source.path, { replace: true })}>继续使用 Hoooho</button></section></main>
}

export function MyFeedbackPage() {
  const token = useAppStore((state) => state.authToken)!, [items, setItems] = useState<FeedbackRecord[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState('')
  useEffect(() => { const controller = new AbortController(); listMyFeedback(token, controller.signal).then(setItems).catch((cause) => { if (cause.name !== 'AbortError') setError(cause.message) }).finally(() => setLoading(false)); return () => controller.abort() }, [token])
  const completed = items.filter((item) => item.status === 'resolved').length, improving = items.filter((item) => item.status === 'improving').length, valid = completed + improving
  return <main className="app-shell feedback-page pb-0"><WebPageHeader title="我的反馈" fallback="/settings" action={<Link className="feedback-header-action" to="/feedback">提反馈</Link>}/><div className="feedback-list-content"><section className="feedback-contribution"><h2>共建记录</h2><p>你已经帮助 Hoooho 改进了 {valid} 个问题</p><small>其中 {completed} 个已经完成，{improving} 个正在改进。只统计已确认进入改进或已处理的反馈。</small></section>{loading ? <p className="feedback-state">正在读取反馈记录…</p> : error ? <p className="feedback-error" role="alert">{error}</p> : items.length === 0 ? <section className="feedback-empty"><h2>还没有反馈记录</h2><p>发现哪里不好用，可以直接告诉我们。</p><Link to="/feedback">提交反馈</Link></section> : <div className="feedback-record-list">{items.map((item) => <Link key={item.id} to={`/feedback/${item.id}`}><div><strong>{item.summary}</strong><span>{formatTime(item.createdAt)} · {item.sourceName ?? '直接提交'}</span>{item.latestReply && <p>{item.latestReply}</p>}</div><div><em>{feedbackStatusLabels[item.status]}</em><small>{item.attachmentCount} 张图片</small></div></Link>)}</div>}</div></main>
}

export function FeedbackDetailPage() {
  const { feedbackId = '' } = useParams(), token = useAppStore((state) => state.authToken)!, [item, setItem] = useState<FeedbackRecord | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [text, setText] = useState(''), [images, setImages] = useState<PendingFeedbackImage[]>([]), [submitting, setSubmitting] = useState(false)
  const imagesRef = useRef(images); imagesRef.current = images
  useEffect(() => { const controller = new AbortController(); getMyFeedback(token, feedbackId, controller.signal).then(setItem).catch((cause) => { if (cause.name !== 'AbortError') setError(cause.message) }).finally(() => setLoading(false)); return () => { controller.abort(); revokeFeedbackImages(imagesRef.current) } }, [feedbackId, token])
  const send = async () => { if (!item || submitting || (!text.trim() && !images.some((image) => image.status === 'ready')) || images.some((image) => image.status !== 'ready')) return; setSubmitting(true); setError(''); try { const next = await addFeedbackMessage(token, item.id, { text: text.trim(), attachments: images.map((image) => ({ name: image.name, type: image.type, dataUrl: image.dataUrl! })) }); revokeFeedbackImages(images); setImages([]); setText(''); setItem(next) } catch (cause) { setError(cause instanceof Error ? cause.message : '补充失败，内容仍保留在这里。') } finally { setSubmitting(false) } }
  return <main className="app-shell feedback-page pb-0"><WebPageHeader title="反馈详情" fallback="/feedback/mine"/><div className="feedback-detail-content">{loading ? <p className="feedback-state">正在读取反馈…</p> : error && !item ? <p className="feedback-error" role="alert">{error}</p> : item && <><header className="feedback-detail-title"><span>{feedbackStatusLabels[item.status]}</span><h2>{item.summary}</h2><p>{formatTime(item.createdAt)} · {item.sourceName ?? '直接提交'}</p></header><section><h3>原始反馈</h3>{item.description ? <p>{item.description}</p> : <p className="text-text-secondary">仅提交了图片</p>}<ImageList attachments={(item.attachments ?? []).filter((attachment) => !attachment.messageId)}/></section><section><h3>处理进度</h3><ol className="feedback-timeline">{(item.statusHistory ?? []).map((entry) => <li key={entry.id}><strong>{feedbackStatusLabels[entry.status]}</strong><span>{formatTime(entry.createdAt)}</span></li>)}</ol>{item.noActionReason && <p>暂不处理原因：{item.noActionReason}</p>}{item.handledVersion && <p>这项改进已在 Hoooho {item.handledVersion} 中上线。</p>}</section><section><h3>沟通记录</h3>{(item.messages ?? []).length === 0 ? <p className="text-text-secondary">暂时没有补充或回复。</p> : <div className="feedback-messages">{item.messages?.map((message) => <article key={message.id} data-kind={message.kind}><strong>{message.kind === 'user-reply' ? 'Hoooho 回复' : '你的补充'}</strong><p>{message.text}</p><span>{formatTime(message.createdAt)}</span><ImageList attachments={(item.attachments ?? []).filter((attachment) => attachment.messageId === message.id)}/></article>)}</div>}</section><section className="feedback-supplement"><h3>继续补充</h3><FeedbackComposer text={text} onTextChange={setText} images={images} onImagesChange={setImages} maxImages={Math.max(0, 10 - item.attachmentCount)}/>{error && <p className="feedback-error">{error}</p>}<Button fullWidth type="button" disabled={submitting || (!text.trim() && images.length === 0) || images.some((image) => image.status !== 'ready')} onClick={() => void send()}>{submitting ? '正在补充…' : '提交补充'}</Button></section></>}</div></main>
}

function ImageList({ attachments }: { attachments: NonNullable<FeedbackRecord['attachments']> }) { return attachments.length ? <div className="feedback-saved-images">{attachments.map((attachment) => <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer"><img alt={attachment.name} src={attachment.url}/></a>)}</div> : null }
