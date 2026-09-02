import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, ImagePlus, Mic, Plus, RotateCcw, X } from 'lucide-react'
import { getBrowserVoiceCapability } from '../../features/quick-record/browserVoiceCapability'
import { processFeedbackImage, type PendingFeedbackImage } from '../../features/feedback/imageProcessing'
import { getSpeechRecognitionConstructor, speechErrorMessage, type SpeechRecognitionLike } from '../../features/feedback/speechInput'

interface Props { text: string; onTextChange: (value: string) => void; images: PendingFeedbackImage[]; onImagesChange: (value: PendingFeedbackImage[]) => void; maxImages?: number; showVoice?: boolean; textLabel?: string; placeholder?: string; submitAction?: ReactNode }
type VoiceState = 'idle' | 'requesting' | 'listening' | 'processing'

export function FeedbackComposer({ text, onTextChange, images, onImagesChange, maxImages = 10, showVoice = true, textLabel = '反馈内容', placeholder = '哪里不好用，或者你希望怎么改？', submitAction }: Props) {
  const recognition = useRef<SpeechRecognitionLike | null>(null), permissionStream = useRef<MediaStream | null>(null), timer = useRef<number | null>(null)
  const voiceStateRef = useRef<VoiceState>('idle'), transcriptRef = useRef(''), textRef = useRef(text), imagesRef = useRef(images)
  const [voiceState, setVoiceStateValue] = useState<VoiceState>('idle'), [voiceMessage, setVoiceMessage] = useState(''), [transcribed, setTranscribed] = useState(false)
  imagesRef.current = images; textRef.current = text
  const setVoiceState = (state: VoiceState) => { voiceStateRef.current = state; setVoiceStateValue(state) }
  const releasePermissionStream = () => { permissionStream.current?.getTracks().forEach((track) => track.stop()); permissionStream.current = null }
  const clearTimer = () => { if (timer.current !== null) window.clearTimeout(timer.current); timer.current = null }
  const resetVoice = () => { clearTimer(); releasePermissionStream(); recognition.current = null; setVoiceState('idle') }
  useEffect(() => () => { clearTimer(); releasePermissionStream(); recognition.current?.abort(); recognition.current = null }, [])

  const updateImage = (id: string, patch: Partial<PendingFeedbackImage>) => { const next = imagesRef.current.map((image) => image.id === id ? { ...image, ...patch } : image); imagesRef.current = next; onImagesChange(next) }
  const process = async (entry: PendingFeedbackImage) => {
    updateImage(entry.id, { status: 'processing', error: null })
    try { updateImage(entry.id, { ...(await processFeedbackImage(entry.file)), status: 'ready', error: null }) }
    catch (error) { updateImage(entry.id, { status: 'failed', error: error instanceof Error ? error.message : '图片处理失败' }) }
  }
  const addFiles = (files: FileList | null) => {
    if (!files?.length) return
    const fingerprints = new Set(imagesRef.current.map((image) => `${image.file.name}:${image.file.size}:${image.file.lastModified}`))
    const available = Math.max(0, maxImages - imagesRef.current.length), selected = Array.from(files).filter((file) => !fingerprints.has(`${file.name}:${file.size}:${file.lastModified}`)).slice(0, available)
    const added = selected.map((file): PendingFeedbackImage => ({ id: crypto.randomUUID(), file, name: file.name, type: file.type, previewUrl: URL.createObjectURL(file), dataUrl: null, size: file.size, status: 'processing', error: null }))
    const next = [...imagesRef.current, ...added]; imagesRef.current = next; onImagesChange(next); added.forEach((entry) => void process(entry))
    if (files.length > available) setVoiceMessage(`最多上传 ${maxImages} 张图片`)
  }
  const remove = (id: string) => { const item = imagesRef.current.find((image) => image.id === id); if (item) URL.revokeObjectURL(item.previewUrl); const next = imagesRef.current.filter((image) => image.id !== id); imagesRef.current = next; onImagesChange(next) }
  const finishVoice = () => { if (voiceStateRef.current !== 'listening') return; setVoiceState('processing'); clearTimer(); recognition.current?.stop() }
  const startVoice = async () => {
    if (voiceStateRef.current !== 'idle') return
    const capability = getBrowserVoiceCapability(), Constructor = getSpeechRecognitionConstructor()
    if (!capability.canAttemptMicrophone || !Constructor) { setVoiceMessage('当前浏览器不支持录音'); return }
    setVoiceMessage(''); setVoiceState('requesting'); transcriptRef.current = ''
    try {
      permissionStream.current = await navigator.mediaDevices.getUserMedia({ audio: true }); releasePermissionStream()
      if ((voiceStateRef.current as VoiceState) !== 'requesting') return
      const instance = new Constructor(); recognition.current = instance; instance.lang = 'zh-CN'; instance.continuous = true; instance.interimResults = true
      instance.onresult = (event) => { let value = ''; for (let index = 0; index < event.results.length; index += 1) value += event.results[index][0].transcript; transcriptRef.current = value.trim() }
      instance.onerror = (event) => { setVoiceMessage(speechErrorMessage(event.error)); instance.abort(); resetVoice() }
      instance.onend = () => {
        if (voiceStateRef.current !== 'processing') { if (voiceStateRef.current !== 'idle') setVoiceMessage('没有听清，请再试一次'); resetVoice(); return }
        const addition = transcriptRef.current.trim()
        if (addition) { onTextChange(`${textRef.current}${textRef.current.trim() ? '\n' : ''}${addition}`); setTranscribed(true) } else setVoiceMessage('没有听清，请再试一次')
        resetVoice()
      }
      instance.start(); setVoiceState('listening'); timer.current = window.setTimeout(finishVoice, 120_000)
    } catch { setVoiceMessage('无法使用麦克风，请检查浏览器权限'); resetVoice() }
  }
  const voiceLabel = voiceState === 'listening' ? '正在聆听 · 点击结束' : voiceState === 'processing' ? '正在转成文字…' : voiceState === 'requesting' ? '正在请求麦克风…' : transcribed ? '已转成文字，可以继续修改' : '快捷反馈'
  return <>
    <label className="hoho-field feedback-content-field"><span className="hoho-text-label">{textLabel}</span><textarea className="hoho-textarea feedback-textarea" maxLength={5000} value={text} onChange={(event) => onTextChange(event.target.value)} placeholder={placeholder} /></label>
    {showVoice && <div className="feedback-action-row"><button className="feedback-voice-button" type="button" data-state={voiceState} disabled={voiceState === 'requesting' || voiceState === 'processing'} onClick={voiceState === 'listening' ? finishVoice : () => { setTranscribed(false); void startVoice() }}><Mic aria-hidden="true"/><span>{voiceLabel}</span>{transcribed && <b><RotateCcw aria-hidden="true"/>重新说</b>}</button>{submitAction ?? <span className="feedback-submit-placeholder"><Check/></span>}</div>}
    <section className="feedback-images" aria-label="上传图片"><label className="feedback-file-button" data-has-images={images.length > 0}>{images.length === 0 ? <><ImagePlus aria-hidden="true"/><strong>上传图片</strong></> : <ol className="feedback-image-grid">{images.map((image, index) => <li key={image.id}><img alt={`反馈图片 ${index + 1}`} src={image.previewUrl}/><span>{image.status === 'processing' ? '压缩中…' : image.status === 'failed' ? image.error : ''}</span>{image.status === 'failed' && <button type="button" onClick={(event) => { event.preventDefault(); void process(image) }}>重试</button>}<button type="button" aria-label={`删除反馈图片 ${index + 1}`} onClick={(event) => { event.preventDefault(); remove(image.id) }}><X/></button></li>)}{images.length < maxImages && <li className="feedback-image-add"><Plus aria-hidden="true"/></li>}</ol>}<small>支持 JPG、PNG、WebP、HEIC，可上传多张</small><input accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" multiple type="file" disabled={images.length >= maxImages} onChange={(event) => { addFiles(event.target.files); event.target.value = '' }} /></label>
    </section>
    <div className="feedback-inline-message" aria-live="polite">{voiceMessage && <p>{voiceMessage}</p>}</div>
  </>
}
