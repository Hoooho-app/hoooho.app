import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../../components/common'
import { revokeFeedbackImages, type PendingFeedbackImage } from '../../features/feedback/imageProcessing'
import { addFeedbackMessage, feedbackStatusLabels, type FeedbackAttachment, type FeedbackRecord } from '../../services/feedback'
import { FeedbackComposer } from './FeedbackComposer'

const compactDate = (value: string) => new Date(value).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
const fullTime = (value: string) => new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

interface Props {
  token: string
  item: FeedbackRecord
  detail?: FeedbackRecord
  expanded: boolean
  loading: boolean
  onToggle: () => void
  onUpdated: (item: FeedbackRecord) => void
}

export function MyFeedbackCard({ token, item, detail, expanded, loading, onToggle, onUpdated }: Props) {
  const [replying, setReplying] = useState(false), [text, setText] = useState(''), [images, setImages] = useState<PendingFeedbackImage[]>([]), [submitting, setSubmitting] = useState(false), [error, setError] = useState('')
  const imagesRef = useRef(images); imagesRef.current = images
  useEffect(() => () => revokeFeedbackImages(imagesRef.current), [])
  const timeline = useMemo(() => {
    if (!detail) return []
    return [
      { id: `original-${detail.id}`, at: detail.createdAt, type: 'original', title: '我的反馈', text: detail.description },
      ...(detail.statusHistory ?? []).slice(1).map((entry) => ({ id: entry.id, at: entry.createdAt, type: 'status', title: '处理状态', text: feedbackStatusLabels[entry.status] })),
      ...(detail.messages ?? []).map((message) => ({ id: message.id, at: message.createdAt, type: message.senderType, title: message.senderType === 'team' ? 'Hoooho 回复' : '我的回复', text: message.text }))
    ].sort((a, b) => a.at.localeCompare(b.at))
  }, [detail])
  const send = async () => {
    if (!detail || submitting || (!text.trim() && images.length === 0) || images.some((image) => image.status !== 'ready')) return
    setSubmitting(true); setError('')
    try {
      const next = await addFeedbackMessage(token, detail.id, { text: text.trim(), attachments: images.map((image) => ({ name: image.name, type: image.type, dataUrl: image.dataUrl! })) })
      revokeFeedbackImages(images); setImages([]); setText(''); setReplying(false); onUpdated(next)
    } catch (cause) { setError(cause instanceof Error ? cause.message : '回复失败，内容仍保留在这里。') }
    finally { setSubmitting(false) }
  }
  const meta = [item.problemPage, item.problemType, compactDate(item.createdAt)].filter(Boolean).join(' · ')
  return <article className="my-feedback-card" data-expanded={expanded}>
    <button className="my-feedback-card-summary" type="button" aria-expanded={expanded} onClick={onToggle}>
      <span className="my-feedback-card-heading"><strong>{item.summary}</strong><em data-status={item.status}>{feedbackStatusLabels[item.status]}</em></span>
      <span className="my-feedback-card-meta">{meta}</span>
      <span className="my-feedback-card-text">{item.description || '已上传图片反馈'}</span>
      <span className="my-feedback-card-latest">{item.unreadReplyCount > 0 && <i aria-label="有未读回复"/>}<span>{item.latestReply ? `Hoooho：${item.latestReply}` : `Hoooho：${feedbackStatusLabels[item.status]}`}</span><b>{loading ? '读取中…' : expanded ? '收起⌃' : '展开⌄'}</b></span>
    </button>
    {expanded && detail && <div className="my-feedback-expanded">
      <div className="my-feedback-timeline">{timeline.map((entry) => <article key={entry.id} data-kind={entry.type}><header><strong>{entry.title}</strong><time>{fullTime(entry.at)}</time></header><p>{entry.text || '图片反馈'}</p>{entry.type === 'original' && <AttachmentList attachments={(detail.attachments ?? []).filter((attachment) => !attachment.messageId)}/>}<AttachmentList attachments={(detail.attachments ?? []).filter((attachment) => attachment.messageId === entry.id)}/></article>)}</div>
      {!replying ? <button className="my-feedback-reply-trigger" type="button" onClick={() => setReplying(true)}>继续回复</button> : <section className="my-feedback-reply"><FeedbackComposer text={text} onTextChange={setText} images={images} onImagesChange={setImages} maxImages={Math.max(0, 10 - detail.attachmentCount)} showVoice={false} textLabel="回复内容" placeholder="补充情况，或者回复 Hoooho"/>{error && <p className="feedback-error" role="alert">{error}</p>}<div><button type="button" onClick={() => setReplying(false)}>取消</button><Button type="button" disabled={submitting || (!text.trim() && images.length === 0) || images.some((image) => image.status !== 'ready')} onClick={() => void send()}>{submitting ? '发送中…' : '发送回复'}</Button></div></section>}
    </div>}
  </article>
}

function AttachmentList({ attachments }: { attachments: FeedbackAttachment[] }) {
  return attachments.length ? <div className="my-feedback-attachments">{attachments.map((attachment) => <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer"><img alt={attachment.name} src={attachment.url}/></a>)}</div> : null
}
