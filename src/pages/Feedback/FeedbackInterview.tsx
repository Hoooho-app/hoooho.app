import { useEffect, useRef, useState } from 'react'
import { MessageSquare, X } from 'lucide-react'
import { DialogueComposer, HohoButton } from '../../components/design-system'
import { NurseMessage } from '../../features/ai-nurse/NurseMessage'
import { useDialogueVoice } from '../../features/ai-business/useDialogueVoice'
import { Button } from '../../components/common'
import { collectFeedbackDevice, appVersion } from '../../features/feedback/environment'
import { revokeFeedbackImages, processFeedbackImage, type PendingFeedbackImage } from '../../features/feedback/imageProcessing'
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
  return [...turns, { role: 'user', text: text.trim() }]
}

export function FeedbackInterview({ token, accountId, source, initialCategory, onSubmitted }: { token: string | null; accountId: string; source: FeedbackSource; initialCategory: FeedbackProblemType | null; onSubmitted: () => void }) {
  const storageKey = `hoooho-feedback-interview:${accountId}`
  const [draft, setDraft] = useState<Draft>(() => ({ ...readDraft(storageKey), ...(initialCategory ? { problemType: initialCategory } : {}) }))
  const camera=useRef<HTMLInputElement>(null),album=useRef<HTMLInputElement>(null)
  const voice=useDialogueVoice(`feedback-voice:${accountId}`,token??'',async text=>{if(text.length>1500)throw new Error('这段话较长，请分成两次反馈；录音还在。');send('chat',text)})
  const voiceBusy=voice.busy
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
      const result = await interviewFeedback(token, turns, mode, controller.current.signal, imagesRef.current.filter(image=>image.status==='ready').at(-1)?.dataUrl??undefined)
      if (controller.current.signal.aborted) return
      patch(mode === 'organize' ? { description: result.description, problemType: result.problemType, review: true } : { turns: [...turns, { role: 'assistant', text: result.reply }], problemType: result.problemType })
    } catch (cause) {
      if (controller.current.signal.aborted) return
      setError('对话暂时未完成，文字和图片仍保留。可以重试，或手动整理反馈。')
      setRetry({ turns, mode })
    } finally { lock.current = false; setBusy(false) }
  }
  const send = (mode: 'chat' | 'organize', spoken?:string) => {
    if (lock.current || (!spoken && voiceBusy)) return
    const turns = appendInput(draft.turns, spoken??draft.text)
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
      <div className="nurse-conversation" role="log" aria-label="与 Hoooho 产品经理的对话" aria-live="polite">
        <NurseMessage role="assistant" assistantName="Hoooho 产品经理" assistantAvatar={<MessageSquare size={18}/>}><p>{greeting}</p></NurseMessage>
        {draft.turns.map((turn,index)=><NurseMessage role={turn.role} key={index} assistantName="Hoooho 产品经理" assistantAvatar={<MessageSquare size={18}/>}><p>{turn.text}</p></NurseMessage>)}
        {images.length>0&&<NurseMessage role="user">{images.map((image,index)=><div key={image.id}><img className="dialogue-image" src={image.previewUrl} alt={`反馈图片${index+1}`}/><HohoButton variant="text" disabled={busy} aria-label={`移除图片${index+1}`} onClick={()=>{URL.revokeObjectURL(image.previewUrl);setImages(items=>items.filter(item=>item.id!==image.id))}}><X size={16}/></HohoButton>{image.error&&<p>{image.error}</p>}</div>)}</NurseMessage>}
        {(busy||voiceBusy)&&<NurseMessage role="assistant" assistantName="Hoooho 产品经理" assistantAvatar={<MessageSquare size={18}/>}><p role="status">{voice.state==='listening'?'我在听，松手后就能发送。':voiceBusy?'我在听这段录音，请稍等。':'让我看看你刚才说的问题。'}</p></NurseMessage>}
        {(error||voice.error)&&<NurseMessage role="assistant" assistantName="Hoooho 产品经理" assistantAvatar={<MessageSquare size={18}/>}><p role="alert">{error||voice.error}</p>{voice.pendingVoice&&<HohoButton variant="text" disabled={busy||voiceBusy} onClick={voice.retry}>再听一次</HohoButton>}{retry&&<HohoButton variant="text" disabled={busy} onClick={()=>void request(retry.turns,retry.mode)}>再试一次</HohoButton>}<HohoButton variant="text" disabled={busy||voiceBusy} onClick={manualReview}>我来整理反馈</HohoButton></NurseMessage>}
        {voice.pendingVoice&&!voice.error&&<NurseMessage role="assistant" assistantName="Hoooho 产品经理" assistantAvatar={<MessageSquare size={18}/>}><p>这段录音还在，要我再听一次吗？</p><HohoButton variant="text" disabled={busy||voiceBusy} onClick={voice.retry}>再试一次</HohoButton></NurseMessage>}
        {!busy&&!voiceBusy&&(draft.turns.length>0||draft.text.trim())&&<NurseMessage role="assistant" assistantName="Hoooho 产品经理" assistantAvatar={<MessageSquare size={18}/>}><p>要我把刚才说的整理成反馈意见吗？你核对文字后再提交。</p><HohoButton variant="text" disabled={!token} onClick={()=>send('organize')}>帮我整理</HohoButton></NurseMessage>}
        {voice.pendingVoice&&voice.unreadable&&<NurseMessage role="assistant" assistantName="Hoooho 产品经理" assistantAvatar={<MessageSquare size={18}/>}><p>这份录音无法读取，移除后可以重新录音，已有对话仍然保留。</p><HohoButton variant="text" disabled={busy||voice.busy} onClick={()=>void voice.discardPending()}>移除无法读取的录音</HohoButton></NurseMessage>}
      <div ref={end}/>
      </div>
      <div className="dialogue-page-footer"><DialogueComposer text={draft.text} onTextChange={text=>patch({text})} onSend={()=>send('chat')} disabled={busy||!token||images.some(image=>image.status==='processing')} voiceDisabled={!!voice.pendingVoice} maxLength={1500} placeholder="说说哪里需要改进…" listening={voice.state==='listening'} processing={voice.state==='transcribing'} onStart={()=>void voice.start()} onStop={voice.stop} onDiscard={voice.discard} onPhoto={source=>(source==='camera'?camera:album).current?.click()}/></div>
      <input type="file" ref={camera} accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" hidden onChange={e=>{const file=e.target.files?.[0];e.currentTarget.value='';if(!file)return;if(imagesRef.current.length>=10){setError('这次最多添加10张图片');return}const entry:PendingFeedbackImage={id:crypto.randomUUID(),file,name:file.name,type:file.type,previewUrl:URL.createObjectURL(file),dataUrl:null,size:file.size,status:'processing',error:null};setImages(items=>[...items,entry]);void processFeedbackImage(file).then(value=>setImages(items=>items.map(item=>item.id===entry.id?{...item,...value,status:'ready'}:item))).catch(e=>setImages(items=>items.map(item=>item.id===entry.id?{...item,status:'failed',error:e.message}:item)))}}/>
      <input type="file" ref={album} accept="image/jpeg,image/png,image/webp,image/heic,image/heif" aria-label="从相册选择" hidden onChange={e=>{const file=e.target.files?.[0];e.currentTarget.value='';if(!file)return;if(imagesRef.current.length>=10){setError('这次最多添加10张图片');return}const entry:PendingFeedbackImage={id:crypto.randomUUID(),file,name:file.name,type:file.type,previewUrl:URL.createObjectURL(file),dataUrl:null,size:file.size,status:'processing',error:null};setImages(items=>[...items,entry]);void processFeedbackImage(file).then(value=>setImages(items=>items.map(item=>item.id===entry.id?{...item,...value,status:'ready'}:item))).catch(e=>setImages(items=>items.map(item=>item.id===entry.id?{...item,status:'failed',error:e.message}:item)))}}/>
    </>}
  </div>
}
