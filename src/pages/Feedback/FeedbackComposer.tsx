import { useEffect, useRef, useState } from 'react'
import { getBrowserVoiceCapability } from '../../features/quick-record/browserVoiceCapability'
import { processFeedbackImage, type PendingFeedbackImage } from '../../features/feedback/imageProcessing'
import { getSpeechRecognitionConstructor, speechErrorMessage, type SpeechRecognitionLike } from '../../features/feedback/speechInput'

interface Props {
  text: string
  onTextChange: (value: string) => void
  images: PendingFeedbackImage[]
  onImagesChange: (value: PendingFeedbackImage[]) => void
  maxImages?: number
}

export function FeedbackComposer({ text, onTextChange, images, onImagesChange, maxImages = 10 }: Props) {
  const recognition = useRef<SpeechRecognitionLike | null>(null)
  const timer = useRef<number | null>(null)
  const [listening, setListening] = useState(false), [seconds, setSeconds] = useState(0), [voiceMessage, setVoiceMessage] = useState('')
  const imagesRef = useRef(images)
  imagesRef.current = images
  const textRef = useRef(text)
  textRef.current = text

  useEffect(() => () => { recognition.current?.abort(); if (timer.current) window.clearInterval(timer.current) }, [])

  const updateImage = (id: string, patch: Partial<PendingFeedbackImage>) => onImagesChange(imagesRef.current.map((image) => image.id === id ? { ...image, ...patch } : image))
  const process = async (entry: PendingFeedbackImage) => {
    updateImage(entry.id, { status: 'processing', error: null })
    try { updateImage(entry.id, { ...(await processFeedbackImage(entry.file)), status: 'ready', error: null }) }
    catch (error) { updateImage(entry.id, { status: 'failed', error: error instanceof Error ? error.message : '图片处理失败' }) }
  }
  const addFiles = (files: FileList | null) => {
    if (!files?.length) return
    const available = Math.max(0, maxImages - imagesRef.current.length), selected = Array.from(files).slice(0, available)
    const added = selected.map((file): PendingFeedbackImage => ({ id: crypto.randomUUID(), file, name: file.name, type: file.type, previewUrl: URL.createObjectURL(file), dataUrl: null, size: file.size, status: 'processing', error: null }))
    onImagesChange([...imagesRef.current, ...added])
    imagesRef.current = [...imagesRef.current, ...added]
    added.forEach((entry) => void process(entry))
    if (files.length > available) setVoiceMessage(`最多添加 ${maxImages} 张图片，第 ${maxImages + 1} 张及之后未添加。`)
  }
  const remove = (id: string) => { const item = imagesRef.current.find((image) => image.id === id); if (item) URL.revokeObjectURL(item.previewUrl); onImagesChange(imagesRef.current.filter((image) => image.id !== id)) }
  const move = (index: number, offset: number) => { const next = [...imagesRef.current], target = index + offset; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; onImagesChange(next) }

  const stopVoice = () => { recognition.current?.stop(); if (timer.current) window.clearInterval(timer.current); timer.current = null; setListening(false) }
  const startVoice = async () => {
    const capability = getBrowserVoiceCapability(), Constructor = getSpeechRecognitionConstructor()
    if (!capability.canAttemptMicrophone || !Constructor) { setVoiceMessage(capability.availability === 'insecure_context' ? '语音输入需要 HTTPS。你仍可以直接输入文字。' : '当前浏览器不支持语音转文字，你仍可以直接输入文字。'); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.getTracks().forEach((track) => track.stop())
      const instance = new Constructor(); recognition.current = instance; instance.lang = 'zh-CN'; instance.continuous = true; instance.interimResults = false
      instance.onresult = (event) => { const additions: string[] = []; for (let index = event.resultIndex; index < event.results.length; index += 1) if (event.results[index].isFinal) additions.push(event.results[index][0].transcript.trim()); if (additions.length) { const next = `${textRef.current}${textRef.current.trim() ? '\n' : ''}${additions.join('')}`; textRef.current = next; onTextChange(next) } }
      instance.onerror = (event) => { setVoiceMessage(speechErrorMessage(event.error)); stopVoice() }
      instance.onend = () => { setListening(false); if (timer.current) window.clearInterval(timer.current); timer.current = null }
      instance.start(); setVoiceMessage(''); setSeconds(0); setListening(true)
      timer.current = window.setInterval(() => setSeconds((value) => { if (value >= 119) { stopVoice(); setVoiceMessage('本次连续语音已到 2 分钟，可再次按住继续追加。'); return 120 } return value + 1 }), 1_000)
    } catch (error) { setVoiceMessage(error instanceof DOMException && error.name === 'NotAllowedError' ? speechErrorMessage('not-allowed') : '无法启动麦克风，已有内容不会丢失。') }
  }

  return <>
    <label className="hoho-field"><span className="hoho-text-label">想告诉我们什么</span><textarea className="hoho-textarea feedback-textarea" maxLength={5000} value={text} onChange={(event) => onTextChange(event.target.value)} placeholder="说明哪里不好用，或你希望发生什么" /></label>
    <div className="feedback-voice"><button type="button" data-listening={listening} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); void startVoice() }} onPointerUp={stopVoice} onPointerCancel={stopVoice}>{listening ? `正在聆听 ${seconds} 秒，松开结束` : '按住说话'}</button><p>松开后自动转成文字，也可以直接输入。转写文字可继续修改。</p></div>
    <section className="feedback-images" aria-labelledby="feedback-images-title"><div className="feedback-images-heading"><div><h2 id="feedback-images-title">添加图片 {images.length}/{maxImages}</h2><p>支持 JPG、PNG、WebP、HEIC，最多 {maxImages} 张</p></div><div className="feedback-image-actions"><label className="feedback-file-button">选择图片<input accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple type="file" disabled={images.length >= maxImages} onChange={(event) => { addFiles(event.target.files); event.target.value = '' }} /></label><label className="feedback-file-button">拍照<input accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" type="file" disabled={images.length >= maxImages} onChange={(event) => { addFiles(event.target.files); event.target.value = '' }} /></label></div></div>
      {images.length > 0 && <ol className="feedback-image-grid">{images.map((image, index) => <li key={image.id}><img alt={`反馈图片 ${index + 1}`} src={image.previewUrl}/><div><span>{image.status === 'processing' ? '正在压缩…' : image.status === 'failed' ? image.error : `${Math.ceil(image.size / 1024)}KB · 已处理定位信息`}</span>{image.status === 'failed' && <button type="button" onClick={() => void process(image)}>重试</button>}<button type="button" onClick={() => move(index, -1)} disabled={index === 0}>前移</button><button type="button" onClick={() => move(index, 1)} disabled={index === images.length - 1}>后移</button><button type="button" onClick={() => remove(image.id)}>删除</button></div></li>)}</ol>}
    </section>
    <div className="min-h-5" aria-live="polite">{voiceMessage && <p className="text-xs leading-5 text-text-secondary">{voiceMessage}</p>}</div>
  </>
}
