import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Mic, RotateCcw } from 'lucide-react'
import { HohoButton } from '../../../components/design-system'
import { formatRecordingDuration, recognitionErrorMessage } from './quickRecordPresentation'

type FlowState = 'starting' | 'listening' | 'error' | 'saving' | 'saved'
interface RecognitionEvent { results: ArrayLike<{ 0: { transcript: string } }> }
interface RecognitionErrorEvent { error?: string }
interface Recognition {
  continuous: boolean
  interimResults: boolean
  lang: string
  onend: null | (() => void)
  onerror: null | ((event: RecognitionErrorEvent) => void)
  onresult: null | ((event: RecognitionEvent) => void)
  abort: () => void
  start: () => void
  stop: () => void
}
type RecognitionConstructor = new () => Recognition

interface QuickVoiceRecordFlowProps {
  onClose: () => void
  onConfirm: (transcript: string, occurredAt: string) => Promise<void>
  open: boolean
}

const recognitionConstructor = () => {
  const speechWindow = window as typeof window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor }
  return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
}

export function QuickVoiceRecordFlow({ onClose, onConfirm, open }: QuickVoiceRecordFlowProps) {
  const RecognitionApi = useMemo(recognitionConstructor, [])
  const [state, setState] = useState<FlowState>('starting')
  const [transcript, setTranscriptState] = useState('')
  const [error, setError] = useState('')
  const [seconds, setSeconds] = useState(0)
  const recognitionRef = useRef<Recognition | null>(null)
  const transcriptRef = useRef('')
  const confirmRequestedRef = useRef(false)
  const submittingRef = useRef(false)
  const sessionRef = useRef(0)
  const onCloseRef = useRef(onClose)
  const onConfirmRef = useRef(onConfirm)
  onCloseRef.current = onClose
  onConfirmRef.current = onConfirm

  const setTranscript = (value: string) => { transcriptRef.current = value; setTranscriptState(value) }

  const save = useCallback(async () => {
    const value = transcriptRef.current.trim()
    if (!value) { setState('error'); setError('没有听清，请再说一次'); return }
    if (submittingRef.current) return
    submittingRef.current = true
    setState('saving')
    setError('')
    try {
      await onConfirmRef.current(value, new Date().toISOString())
      setState('saved')
      window.setTimeout(() => onCloseRef.current(), 560)
    } catch (reason) {
      setState('error')
      setError(reason instanceof Error ? reason.message : '保存失败，请重试')
      submittingRef.current = false
    }
  }, [])

  const stopSession = useCallback((discard = false) => {
    const recognition = recognitionRef.current
    recognitionRef.current = null
    if (recognition) discard ? recognition.abort() : recognition.stop()
  }, [])

  const startListening = useCallback(() => {
    if (!RecognitionApi || recognitionRef.current || submittingRef.current) return
    const currentSession = sessionRef.current + 1
    sessionRef.current = currentSession
    confirmRequestedRef.current = false
    setError('')
    setSeconds(0)
    setTranscript('')
    setState('starting')
    const recognition = new RecognitionApi()
    recognition.lang = 'zh-CN'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (event) => {
      if (sessionRef.current !== currentSession) return
      let next = ''
      for (let index = 0; index < event.results.length; index += 1) next += event.results[index][0].transcript
      setTranscript(next)
      setState('listening')
    }
    recognition.onerror = (event) => {
      if (sessionRef.current !== currentSession || confirmRequestedRef.current) return
      recognitionRef.current = null
      setState('error')
      setError(recognitionErrorMessage(event.error))
    }
    recognition.onend = () => {
      if (sessionRef.current !== currentSession) return
      recognitionRef.current = null
      if (confirmRequestedRef.current) void save()
    }
    recognitionRef.current = recognition
    try {
      recognition.start()
      setState('listening')
    } catch {
      recognitionRef.current = null
      setState('error')
      setError('无法启动麦克风，请稍后重试')
    }
  }, [RecognitionApi, save])

  useEffect(() => {
    if (!open) return
    submittingRef.current = false
    if (RecognitionApi) startListening()
    else { setState('error'); setError('当前浏览器不支持语音识别，可改用文字记录') }
    return () => {
      sessionRef.current += 1
      stopSession(true)
    }
  }, [RecognitionApi, open, startListening, stopSession])

  useEffect(() => {
    if (!open || state !== 'listening') return
    const timer = window.setInterval(() => setSeconds((current) => current + 1), 1000)
    return () => window.clearInterval(timer)
  }, [open, state])

  if (!open) return null

  const cancel = () => {
    sessionRef.current += 1
    stopSession(true)
    setTranscript('')
    onClose()
  }
  const confirm = () => {
    if (submittingRef.current) return
    confirmRequestedRef.current = true
    if (recognitionRef.current) stopSession()
    else void save()
  }

  return (
    <section aria-label="快捷记录" aria-live="polite" className={`quick-record-panel ${state === 'saved' ? 'is-saved' : ''}`}>
      <div aria-hidden="true" className={`quick-record-pulse ${state === 'listening' ? 'is-listening' : ''}`}><Mic size={19} /></div>
      <div className={`quick-record-wave ${state === 'listening' ? 'is-listening' : ''}`} aria-hidden="true">{Array.from({ length: 13 }, (_, index) => <span key={index} />)}</div>
      <span className="quick-record-duration" aria-label={`录音时长 ${formatRecordingDuration(seconds)}`}>{formatRecordingDuration(seconds)}</span>
      <div className="quick-record-transcript">
        {RecognitionApi
          ? <p>{transcript || (state === 'starting' ? '正在启动麦克风…' : error || '请开始说话')}</p>
          : <textarea aria-label="快捷记录文字" className="hoho-textarea" onChange={(event) => { setTranscript(event.target.value); setError('') }} placeholder="输入要记录的内容" value={transcript} />}
        {error && RecognitionApi && <p className="quick-record-error" role="alert">{error}</p>}
      </div>
      <div className="quick-record-actions">
        <button className="quick-record-cancel" disabled={state === 'saving' || state === 'saved'} onClick={cancel} type="button">取消</button>
        {state === 'error' && RecognitionApi && <button aria-label="重新录音" className="quick-record-retry" onClick={startListening} type="button"><RotateCcw size={18} /></button>}
        <HohoButton aria-label="确认快捷记录" className="quick-record-confirm" disabled={!transcript.trim() || state === 'saving' || state === 'saved'} onClick={confirm}><Check size={21} /></HohoButton>
      </div>
    </section>
  )
}
