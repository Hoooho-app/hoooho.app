import { useEffect, useRef, useState } from 'react'
import { getSpeechRecognitionConstructor, speechErrorMessage, type SpeechRecognitionLike } from '../../features/feedback/speechInput'
import { getBrowserVoiceCapability } from '../../features/quick-record/browserVoiceCapability'

type VoiceState = 'idle' | 'requesting' | 'listening' | 'stopping'
export function useSymptomVoice(text: string, onText: (value: string) => void) {
  const [state, setState] = useState<VoiceState>('idle'), [error, setError] = useState('')
  const current = useRef<SpeechRecognitionLike | null>(null), generation = useRef(0)
  const stateRef = useRef<VoiceState>('idle'), timer = useRef<number | undefined>(undefined)
  const textRef = useRef(text), onTextRef = useRef(onText)
  textRef.current = text; onTextRef.current = onText
  const change = (value: VoiceState) => { stateRef.current = value; setState(value) }
  const dispose = () => {
    window.clearTimeout(timer.current)
    const instance = current.current; current.current = null
    if (instance) { instance.onresult = null; instance.onerror = null; instance.onend = null; try { instance.abort() } catch { /* Already-ended engines have no microphone to release. */ } }
  }
  const cancel = () => { generation.current += 1; dispose(); change('idle') }
  useEffect(() => {
    const hidden = () => { if (document.hidden) cancel() }
    document.addEventListener('visibilitychange', hidden)
    return () => { generation.current += 1; dispose(); document.removeEventListener('visibilitychange', hidden) }
  }, [])
  const stop = () => {
    if (stateRef.current === 'requesting') { cancel(); return }
    if (stateRef.current !== 'listening') return
    change('stopping')
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
    change('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => track.stop())
      if (version !== generation.current) return
      const instance = new Constructor(); current.current = instance
      instance.lang = 'zh-CN'; instance.continuous = true; instance.interimResults = true
      instance.onresult = event => {
        if (version !== generation.current) return
        let transcript = ''
        for (let index = 0; index < event.results.length; index += 1) transcript += event.results[index][0].transcript
        onTextRef.current(`${base}${base.trim() && transcript ? '\n' : ''}${transcript}`.slice(0, 1000))
      }
      instance.onerror = event => { if (version !== generation.current) return; setError(event.error === 'network' ? '语音识别暂不可用，请重试或手动输入' : speechErrorMessage(event.error)); cancel() }
      instance.onend = () => { if (version === generation.current) cancel() }
      instance.start(); change('listening')
    } catch { if (version === generation.current) { setError('无法使用麦克风，请检查浏览器权限'); cancel() } }
  }
  return { state, error, busy: state !== 'idle', start, stop }
}
