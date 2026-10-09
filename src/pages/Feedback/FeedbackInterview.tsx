import { useEffect, useRef, useState } from 'react'
import { Keyboard, MessageSquare, Send } from 'lucide-react'
import { Button } from '../../components/common'
import { collectFeedbackDevice, appVersion } from '../../features/feedback/environment'
import { revokeFeedbackImages, type PendingFeedbackImage } from '../../features/feedback/imageProcessing'
import type { FeedbackSource } from '../../features/feedback/navigation'
import { feedbackCategoryOptions, interviewFeedback, submitFeedback, type FeedbackTurn, type FeedbackProblemType } from '../../services/feedback'
import { FeedbackComposer } from './FeedbackComposer'

const greeting = '你好，我是 Hoooho 的 AI 产品经理。最近使用时，哪个地方让你觉得不好用，或者希望我们改进？可以直接说，我会帮你整理。'
interface Draft { turns: FeedbackTurn[]; text: string; description: string; problemType: FeedbackProblemType | null; review: boolean; submissionKey: string }
const freshDraft = (): Draft => ({ turns: [], text: '', description: '', problemType: null, review: false, submissionKey: crypto.randomUUID() })
const readDraft = (key: string): Draft => {
  try {
    const draft = JSON.parse(sessionStorage.getItem(key) ?? 'null') as Draft | null
    if (draft && Array.isArray(draft.turns) && draft.turns.length <= 24 && draft.turns.every(turn => ['user', 'assistant'].includes(turn.role) && typeof turn.text === 'string') && typeof draft.text === 'string' && typeof draft.description === 'string' && typeof draft.submissionKey === 'string') return draft
  } catch { /* Storage availability does not block feedback. */ }
  return freshDraft()
}
const appendInput = (turns: FeedbackTurn[], text: string): FeedbackTurn[] => {
  if (!text.trim()) return turns
  if (turns.at(-1)?.role === 'user') return [...turns.slice(0, -1), { role: 'user', text: `${turns.at(-1)!.text}\n${text.trim()}` }]
  return [...turns, { role: 'user', text: text.trim() }]
}

export function FeedbackInterview({ token, accountId, source, initialCategory, onSubmitted }: { token: string | null; accountId: string; source: FeedbackSource; initialCategory: FeedbackProblemType | null; onSubmitted: () => void }) {
  const storageKey = `hoooho-feedback-interview:${accountId}`
  const [draft, setDraft] = useState<Draft>(() => ({ ...readDraft(storageKey), ...(initialCategory ? { problemType: initialCategory } : {}) }))
  const [keyboard, setKeyboard] = useState(false)
  const [voiceBusy, setVoiceBusy] = useState(false)
  const [images, setImages] = useState<PendingFeedbackImage[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [retry, setRetry] = useState<{ turns: FeedbackTurn[]; mode: 'chat' | 'organize' } | null>(null)
  const lock = useRef(false), controller = useRef<AbortController | null>(null), imagesRef = useRef(images), submitted = useRef(false), end = useRef<HTMLDivElement>(null), reviewInput = useRef<HTMLTextAreaElement>(null)
  imagesRef.current = images
  const patch = (value: Partial<Draft>) => setDraft(previous => ({ ...previous, ...value }))
  useEffect(() => { if (!submitted.current) { try { sessionStorage.setItem(storageKey, JSON.stringify(draft)) } catch { /* Keep the in-memory draft. */ } } }, [draft, storageKey])
  useEffect(() => () => { controller.current?.abort(); revokeFeedbackImages(imagesRef.current) }, [])
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [draft.turns.length, busy])
  useEffect(() => { if (draft.review) reviewInput.current?.focus() }, [draft.review])

  const request = async (turns: FeedbackTurn[], mode: 'chat' | 'organize') => {
    if (!token || lock.current || !turns.length) return
    lock.current = true; setBusy(true); setError(''); setRetry(null)
    controller.current = new AbortController()
    try {
      const result = await interviewFeedback(token, turns, mode, controller.current.signal)
      if (controller.current.signal.aborted) return
      setKeyboard(false)
      patch(mode === 'organize' ? { description: result.description, problemType: result.problemType, review: true } : { turns: [...turns, { role: 'assistant', text: result.reply }], problemType: result.problemType })
    } catch (cause) {
      if (controller.current.signal.aborted) return
      setError('对话暂时未完成，文字和图片仍保留。可以重试，或手动整理反馈。')
      setRetry({ turns, mode })
    } finally { lock.current = false; setBusy(false) }
  }
  const send = (mode: 'chat' | 'organize') => {
    if (lock.current || voiceBusy) return
    const turns = appendInput(draft.turns, draft.text)
    if (!turns.length) { setError('请先说说你希望改进的地方。'); return }
    if (turns.length > 24 || turns.some(turn => turn.text.length > 1500)) { setError('这次内容较长，可以手动整理并提交，或分成两次反馈。'); return }
    patch({ turns, text: '' }); void request(turns, mode)
  }
  const manualReview = () => {
    const turns = appendInput(draft.turns, draft.text)
    const description = `问题或改进建议：\n${turns.filter(turn => turn.role === 'user').map(turn => turn.text).join('\n')}\n\n涉及页面或功能：未补充\n\n希望如何改进：未补充\n\n使用影响：未补充\n\n发生经过与频率：未补充`
    patch({ turns, text: '', description, review: true }); setError(''); setRetry(null)
  }
  const submit = async () => {
    if (!token || lock.current || !draft.description.trim() || draft.description.length > 5000 || images.some(image => image.status !== 'ready')) return
    lock.current = true; setBusy(true); setError('')
    try {
      await submitFeedback(token, { category: draft.problemType, problemType: draft.problemType, problemPage: null, description: draft.description.trim(), sourcePath: source.path, sourceName: source.name, appVersion, idempotencyKey: draft.submissionKey, device: collectFeedbackDevice(), attachments: images.filter(image => image.dataUrl).map(image => ({ name: image.name, type: image.type, dataUrl: image.dataUrl! })) })
      submitted.current = true
      try { sessionStorage.removeItem(storageKey) } catch { /* Feedback has already been saved. */ }
      onSubmitted()
    } catch (cause) { setError(cause instanceof Error ? cause.message : '提交失败，反馈文字和图片仍保留，可以重试。') }
    finally { lock.current = false; setBusy(false) }
  }

  return <div className="feedback-interview">
    {draft.review ? <section className="feedback-review" aria-label="确认反馈文字">
      <h2 className="hoho-text-section-title">确认反馈文字</h2><p className="hoho-text-caption">核对或修改下面的文字，确认后再提交。</p>
      <label className="hoho-field"><span className="hoho-text-label">反馈意见</span><textarea aria-label="反馈意见" ref={reviewInput} className="hoho-textarea" rows={13} value={draft.description} maxLength={5000} onChange={event => patch({ description: event.target.value })} disabled={busy}/></label>
      {draft.description.length > 5000 && <p className="feedback-error" role="alert">内容超过 5000 字，请缩短后提交。</p>}
      <label className="hoho-field"><span className="hoho-text-label">问题类型</span><select className="hoho-input" value={draft.problemType ?? ''} onChange={event => patch({ problemType: event.target.value as FeedbackProblemType || null })} disabled={busy}><option value="">未分类</option>{feedbackCategoryOptions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <fieldset className="feedback-review-images" disabled={busy}><FeedbackComposer showText={false} text={draft.description} onTextChange={value => patch({ description: value })} images={images} onImagesChange={setImages} showVoice={false}/></fieldset>
      {error && <p className="feedback-error" role="alert">{error}</p>}
      <Button fullWidth disabled={!token || busy || !draft.description.trim() || draft.description.length > 5000 || images.some(image => image.status !== 'ready')} onClick={() => void submit()}>{busy ? '正在提交…' : '确认并提交'}</Button>
      <Button fullWidth variant="ghost" disabled={busy} onClick={() => { patch({ review: false }); setError('') }}>返回继续补充</Button>
    </section> : <>
      <div className="feedback-conversation" role="log" aria-label="与 Hoooho 产品经理的对话" aria-live="polite">
        <article className="feedback-interview-turn" data-role="assistant"><span className="feedback-interview-avatar" aria-hidden="true"><MessageSquare size={18}/></span><div><strong>Hoooho 产品经理 · AI</strong><p>{greeting}</p></div></article>
        {draft.turns.map((turn, index) => <article className="feedback-interview-turn" data-role={turn.role} key={index}><span className="feedback-interview-avatar" aria-hidden="true">{turn.role === 'user' ? '我' : <MessageSquare size={18}/>}</span><div><strong>{turn.role === 'user' ? '你' : 'Hoooho 产品经理 · AI'}</strong><p>{turn.text}</p></div></article>)}
        {busy && <p className="feedback-state" role="status">正在整理你的反馈…</p>}<div ref={end}/>
      </div>
      {error && <div className="feedback-interview-error"><p className="feedback-error" role="alert">{error}</p>{retry && <Button variant="secondary" disabled={busy} onClick={() => void request(retry.turns, retry.mode)}>重试</Button>}<Button variant="ghost" disabled={busy || voiceBusy} onClick={manualReview}>手动整理</Button></div>}
      <form className="feedback-interview-composer" onSubmit={event => { event.preventDefault(); send('chat') }}>
        <fieldset disabled={busy}>
          <Button variant="ghost" aria-expanded={keyboard} disabled={voiceBusy} onClick={() => setKeyboard(!keyboard)}><Keyboard size={20}/>{keyboard ? '收起文字输入' : '文字输入'}</Button>
          <FeedbackComposer showText={keyboard} onVoiceBusyChange={setVoiceBusy} compact text={draft.text} onTextChange={value => patch({ text: value })} images={images} onImagesChange={setImages} textLabel="你的回答" placeholder="说说遇到的问题或想改进的地方…" maxTextLength={1500} submitAction={<button className="feedback-check-submit" type="submit" aria-label="发送回答" disabled={!token || busy || voiceBusy || !draft.text.trim()}><Send/></button>}/>
        </fieldset>
        <Button fullWidth variant="secondary" disabled={!token || busy || voiceBusy || (!draft.turns.length && !draft.text.trim())} onClick={() => send('organize')}>整理反馈，下一步</Button>
      </form>
    </>}
  </div>
}
