import { useEffect, useRef, useState } from 'react'
import { getSpeechRecognitionConstructor, speechErrorMessage, type SpeechRecognitionLike } from '../../features/feedback/speechInput'
import { getBrowserVoiceCapability } from '../../features/quick-record/browserVoiceCapability'

type VoiceState = 'idle' | 'requesting' | 'listening' | 'stopping'
export function useSymptomVoice(text: string, onText: (value: string) => void, maxLength = 1000, onAudio?: (file: File) => void) {
  const [state, setState] = useState<VoiceState>('idle'), [error, setError] = useState('')
  const [audioPending,setAudioPending] = useState(false), [partial,setPartial] = useState(false)
  const current = useRef<SpeechRecognitionLike | null>(null), generation = useRef(0)
  const stateRef = useRef<VoiceState>('idle'), timer = useRef<number | undefined>(undefined)
  const textRef = useRef(text), onTextRef = useRef(onText)
  const baseRef = useRef('')
  const audioRef = useRef(onAudio), recorder = useRef<MediaRecorder | null>(null), audioStream = useRef<MediaStream | null>(null), audioSegment = useRef<{ keep: boolean } | null>(null)
  audioRef.current = onAudio
  textRef.current = text; onTextRef.current = onText
  const change = (value: VoiceState) => { stateRef.current = value; setState(value) }
  const dispose = () => {
    window.clearTimeout(timer.current)
    const instance = current.current; current.current = null
    if (instance) { instance.onresult = null; instance.onerror = null; instance.onend = null; try { instance.abort() } catch { /* Already-ended engines have no microphone to release. */ } }
    if (recorder.current?.state === 'recording') recorder.current.stop()
    audioStream.current?.getTracks().forEach(t => t.stop()); audioStream.current = null
  }
  const cancel = () => { generation.current += 1; dispose(); change('idle') }
  const discardSegment = () => { const base = baseRef.current; if (audioSegment.current) audioSegment.current.keep = false; cancel(); onTextRef.current(base) }
  useEffect(() => {
    const hidden = () => { if (document.hidden) cancel() }
    document.addEventListener('visibilitychange', hidden)
    return () => { if (audioSegment.current) audioSegment.current.keep = false; generation.current += 1; dispose(); document.removeEventListener('visibilitychange', hidden) }
  }, [])
  const stop = () => {
    if (stateRef.current === 'requesting') { cancel(); return }
    if (stateRef.current !== 'listening') return
    change('stopping')
    if (recorder.current?.state === 'recording') { setAudioPending(true); recorder.current.stop() }
    audioStream.current?.getTracks().forEach(t => t.stop()); audioStream.current = null
    // Some engines omit onend after stop; retain the last visible transcript.
    timer.current = window.setTimeout(cancel, 2000)
    try { current.current?.stop() } catch { cancel() }
  }
  const start = async () => {
    if (stateRef.current !== 'idle') return
    setError('')
    const Constructor = getSpeechRecognitionConstructor(), capability = getBrowserVoiceCapability()
    if (!Constructor || !capability.canAttemptMicrophone) { setError(capability.isWechat ? '请在支持语音的系统浏览器中打开，或手动输入' : '当前浏览器不支持语音记录，请手动输入'); return }
    const version = ++generation.current, base = textRef.current
    baseRef.current = base
    change('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (version !== generation.current) { stream.getTracks().forEach(track => track.stop()); return }
      if (audioRef.current && typeof MediaRecorder !== 'undefined') {
        audioStream.current = stream; const segment = { keep: true }, callback = audioRef.current; audioSegment.current = segment
        const mime = ['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(value => MediaRecorder.isTypeSupported(value))
        const recording = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined), chunks: Blob[] = []
        recorder.current = recording
        recording.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
        recording.onstop = () => { if (segment.keep && chunks.length) { const blob = new Blob(chunks, { type: recording.mimeType }); if (blob.size > 800) callback?.(new File([blob], `语音原件-${Date.now()}.${recording.mimeType.includes('mp4') ? 'm4a' : 'webm'}`, { type: recording.mimeType })) } setAudioPending(false) }
        recording.start()
      } else stream.getTracks().forEach(track => track.stop())
      const instance = new Constructor(); current.current = instance
      instance.lang = 'zh-CN'; instance.continuous = true; instance.interimResults = true
      instance.onresult = event => {
        if (version !== generation.current) return
        let transcript = ''
        setPartial(Array.from(event.results).some(result => !result.isFinal))
        for (let index = 0; index < event.results.length; index += 1) transcript += event.results[index][0].transcript
        onTextRef.current(`${base}${base.trim() && transcript ? '\n' : ''}${transcript}`.slice(0, maxLength))
      }
      instance.onerror = event => { if (version !== generation.current) return; setError(event.error === 'network' ? '语音识别暂不可用，已收音的原件可先保存或手动输入' : speechErrorMessage(event.error)); cancel() }
      instance.onend = () => { if (version === generation.current) cancel() }
      instance.start(); change('listening')
    } catch { if (version === generation.current) { setError('无法使用麦克风，请检查浏览器权限'); cancel() } }
  }
  return { state, error, partial, audioPending, busy: state !== 'idle', start, stop, cancel, discardSegment }
}
